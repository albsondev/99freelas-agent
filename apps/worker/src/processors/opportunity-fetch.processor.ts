import {
  extractProjectIdFromUrl,
  normalizeProjectUrl,
  OpportunitySourcingService,
  QueueNames,
  type JsonValue,
  type OpportunityFetchJobPayload,
} from "@99freelas/core";
import type { WorkerEnv } from "../env.js";
import {
  AutomationRunRepository,
  collect99FreelasProjectListingsViaPython as collectProjectListingsViaPython,
  OpportunityRepository,
  ProposalLlmProvider,
  ProposalRepository,
  PROJECT_LIST_URL,
  PROJECT_NOTIFICATIONS_URL,
  SettingsRepository,
  UserProfileRepository,
} from "@99freelas/integrations";

import { createInlineOpportunityPipelineProducer } from "./inline-opportunity-pipeline.js";
import type { ProcessorProducer } from "./processor-producer.js";

type ProcessOpportunityFetchContext = {
  env: WorkerEnv;
  opportunities: OpportunityRepository;
  proposals: ProposalRepository;
  runs: AutomationRunRepository;
  settings: SettingsRepository;
  userProfiles: UserProfileRepository;
  llm: ProposalLlmProvider;
  producer: ProcessorProducer;
};

function asJsonObject(value: JsonValue): Record<string, JsonValue> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, JsonValue>;
  }

  return {};
}

export async function processOpportunityFetchJob(
  payload: OpportunityFetchJobPayload,
  context: ProcessOpportunityFetchContext,
): Promise<void> {
  await context.runs.update(payload.runId, {
    status: "PROCESSING",
  });

  if ("action" in payload) {
    const sourcing = new OpportunitySourcingService();
    const plan =
      payload.action === "PROCESS_PENDING_SWEEP"
        ? sourcing.buildPlan()
        : payload.action === "RETRY_FAILED_SWEEP"
          ? sourcing.buildPlan({ retryFailed: true })
          : {
              strategy: "RECOMMENDED_NOTIFICATIONS_FIRST" as const,
              steps: [sourcing.describeAction(payload.action)],
            };

    const imported = await runSourcingPlan(plan.steps, context);

    await context.runs.update(payload.runId, {
      status: "COMPLETED",
      finished_at: new Date().toISOString(),
      metadata: {
        action: payload.action,
        result: "SWEEP_EXECUTED",
        importedCount: imported.importedCount,
        duplicatedCount: imported.duplicatedCount,
        enqueuedCount: imported.enqueuedCount,
        sourcingStrategy: plan.strategy,
        sourcingSteps: plan.steps.map((step) => ({
          action: step.action,
          label: step.label,
          description: step.description,
          priority: step.priority,
          ...(step.targetUrl ? { targetUrl: step.targetUrl } : {}),
        })),
      },
    });
    return;
  }

  const opportunity = await context.opportunities.getById(payload.opportunityId);

  if (!opportunity) {
    await context.runs.update(payload.runId, {
      status: "FAILED",
      finished_at: new Date().toISOString(),
      error_code: "OPPORTUNITY_NOT_FOUND",
      error_message: `Opportunity ${payload.opportunityId} was not found`,
    });
    return;
  }

  await context.opportunities.update(payload.opportunityId, {
    status: "FETCHED",
    last_seen_at: new Date().toISOString(),
    raw_payload: {
      ...asJsonObject(opportunity.rawPayload),
      fetch: {
        reason: payload.reason,
        fetchedAt: new Date().toISOString(),
        status: "MOCK_FETCH_COMPLETE",
      },
    },
  });

  await context.runs.update(payload.runId, {
    status: "COMPLETED",
    finished_at: new Date().toISOString(),
    metadata: {
      opportunityId: payload.opportunityId,
      reason: payload.reason,
      result: "FETCHED",
    },
  });

  const parseRun = await context.runs.create({
    type: QueueNames.OPPORTUNITY_PARSE,
    status: "QUEUED",
    opportunity_id: payload.opportunityId,
    metadata: {
      source: "worker.fetch-processor",
      parentRunId: payload.runId,
    },
  });

  const parseJob = await context.producer.enqueue(QueueNames.OPPORTUNITY_PARSE, {
    runId: parseRun.id,
    opportunityId: payload.opportunityId,
  });

  await context.runs.update(parseRun.id, {
    job_id: parseJob.jobId,
  });
}

async function runSourcingPlan(
  steps: Array<{
    action: string;
    targetUrl?: string;
  }>,
  context: ProcessOpportunityFetchContext,
): Promise<{
  duplicatedCount: number;
  enqueuedCount: number;
  importedCount: number;
}> {
  let importedCount = 0;
  let duplicatedCount = 0;
  let enqueuedCount = 0;

  for (const step of steps) {
    if (
      step.action !== "PROCESS_RECOMMENDED_NOTIFICATIONS" &&
      step.action !== "HUNT_PROJECT_LIST"
    ) {
      continue;
    }

    const listingUrl =
      step.targetUrl ??
      (step.action === "PROCESS_RECOMMENDED_NOTIFICATIONS"
        ? PROJECT_NOTIFICATIONS_URL
        : PROJECT_LIST_URL);

    const collected = await collectProjectListingsViaPython({
      browserName: context.env.PYTHON_BROWSER_NAME,
      headless: false,
      listingUrl,
      limit: 20,
      profileDir: context.env.PYTHON_BROWSER_PROFILE_DIR,
      pythonExecutable: context.env.PYTHON_EXECUTABLE,
      screenshotDir: context.env.BROWSER_SCREENSHOT_DIR,
      sourceKind:
        step.action === "PROCESS_RECOMMENDED_NOTIFICATIONS"
          ? "recommended-notifications"
          : "public-project-list",
      storageStatePath: context.env.PYTHON_BROWSER_STORAGE_STATE_PATH,
      timeoutMs: 60_000,
    });

    for (const item of collected.items) {
      const canonicalUrl = normalizeProjectUrl(item.url);
      const duplicated = await context.opportunities.findByCanonicalUrl(canonicalUrl);

      if (duplicated) {
        duplicatedCount += 1;
        await context.opportunities.update(duplicated.id, {
          last_seen_at: new Date().toISOString(),
        });
        continue;
      }

      const opportunity = await context.opportunities.create({
        source:
          step.action === "PROCESS_RECOMMENDED_NOTIFICATIONS"
            ? "RECOMMENDED_NOTIFICATION"
            : "PROJECT_LISTING",
        url: item.url,
        canonical_url: canonicalUrl,
        external_id: extractProjectIdFromUrl(canonicalUrl),
        title: item.title,
        raw_payload: {
          importedFrom: "worker.sourcing",
          listingAction: step.action,
          listingUrl,
        },
        status: "NEW",
      });
      importedCount += 1;

      const run = await context.runs.create({
        type: QueueNames.OPPORTUNITY_FETCH,
        status: "QUEUED",
        opportunity_id: opportunity.id,
        metadata: {
          source: "worker.sourcing",
          reason: "PROCESS",
        },
      });

      const inlineProducer = createInlineOpportunityPipelineProducer({
        env: context.env,
        opportunities: context.opportunities,
        proposals: context.proposals,
        runs: context.runs,
        settings: context.settings,
        userProfiles: context.userProfiles,
        llm: context.llm,
      });

      await processOpportunityFetchJob(
        {
          runId: run.id,
          opportunityId: opportunity.id,
          reason: "PROCESS",
        },
        {
          ...context,
          producer: inlineProducer,
        },
      );

      await context.runs.update(run.id, {
        job_id: `inline:${QueueNames.OPPORTUNITY_FETCH}:${opportunity.id}`,
      });
      enqueuedCount += 1;
    }

    if (importedCount > 0) {
      break;
    }
  }

  return {
    duplicatedCount,
    enqueuedCount,
    importedCount,
  };
}
