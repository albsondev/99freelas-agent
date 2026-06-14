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

export type SourcingStepReport = {
  action: "PROCESS_RECOMMENDED_NOTIFICATIONS" | "HUNT_PROJECT_LIST";
  listingUrl: string;
  pagesVisited: number;
  linksCollected: number;
  importedCount: number;
  duplicatedCount: number;
  enqueuedCount: number;
  autoSubmitCount: number;
  reviewCount: number;
  rejectedCount: number;
  topDecisionReasons: Array<{
    label: string;
    count: number;
  }>;
  topRiskFlags: Array<{
    label: string;
    count: number;
  }>;
};

export type SourcingPlanReport = {
  duplicatedCount: number;
  enqueuedCount: number;
  importedCount: number;
  steps: SourcingStepReport[];
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
): Promise<SourcingPlanReport | null> {
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
    return imported;
  }

  const opportunity = await context.opportunities.getById(payload.opportunityId);

  if (!opportunity) {
    await context.runs.update(payload.runId, {
      status: "FAILED",
      finished_at: new Date().toISOString(),
      error_code: "OPPORTUNITY_NOT_FOUND",
      error_message: `Opportunity ${payload.opportunityId} was not found`,
    });
    return null;
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

  return null;
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
  steps: SourcingStepReport[];
}> {
  let importedCount = 0;
  let duplicatedCount = 0;
  let enqueuedCount = 0;
  const stepsReport: SourcingStepReport[] = [];

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

    const huntMaxPages = context.env.MAX_HUNT_PAGES;
    // Limit proportional to pages (approx. 20 projects per page) with a minimum of 20.
    const huntLimit = step.action === "HUNT_PROJECT_LIST"
      ? Math.max(20, huntMaxPages * 20)
      : 20;
    const stepLabel =
      step.action === "PROCESS_RECOMMENDED_NOTIFICATIONS" ? "notificacoes" : "projetos";
    const stepStartedAt = Date.now();

    console.log(
      `[Triagem ${stepLabel}] Coletando links em ${listingUrl}` +
        (step.action === "HUNT_PROJECT_LIST" ? ` (ate ${huntMaxPages} pagina(s))...` : "..."),
    );

    const collected = await collectProjectListingsViaPython({
      browserName: context.env.PYTHON_BROWSER_NAME,
      headless: false,
      listingUrl,
      limit: huntLimit,
      maxPages: step.action === "HUNT_PROJECT_LIST" ? huntMaxPages : 1,
      profileDir: context.env.PYTHON_BROWSER_PROFILE_DIR,
      pythonExecutable: context.env.PYTHON_EXECUTABLE,
      screenshotDir: context.env.BROWSER_SCREENSHOT_DIR,
      sourceKind:
        step.action === "PROCESS_RECOMMENDED_NOTIFICATIONS"
          ? "recommended-notifications"
          : "public-project-list",
      storageStatePath: context.env.PYTHON_BROWSER_STORAGE_STATE_PATH,
      timeoutMs: step.action === "HUNT_PROJECT_LIST" ? 90_000 : 60_000,
    });

    const stepElapsedSeconds = ((Date.now() - stepStartedAt) / 1000).toFixed(1);

    console.log(
      `[Triagem ${stepLabel}] Coleta concluida em ${stepElapsedSeconds}s: ` +
        `${collected.pagesVisited} pagina(s), ${collected.items.length} link(s).`,
    );

    const decisionReasonCounts = new Map<string, number>();
    const riskFlagCounts = new Map<string, number>();
    let stepImportedCount = 0;
    let stepDuplicatedCount = 0;
    let stepEnqueuedCount = 0;
    let stepAutoSubmitCount = 0;
    let stepReviewCount = 0;
    let stepRejectedCount = 0;

    for (const item of collected.items) {
      const canonicalUrl = normalizeProjectUrl(item.url);
      const duplicated = await context.opportunities.findByCanonicalUrl(canonicalUrl);

      if (duplicated) {
        duplicatedCount += 1;
        stepDuplicatedCount += 1;
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
      stepImportedCount += 1;

      const run = await context.runs.create({
        type: QueueNames.OPPORTUNITY_FETCH,
        status: "QUEUED",
        opportunity_id: opportunity.id,
        metadata: {
          source: "worker.sourcing",
          reason: "PROCESS",
        },
      });

      console.log(
        `[Triagem ${step.action === "PROCESS_RECOMMENDED_NOTIFICATIONS" ? "notificacoes" : "projetos"}] ` +
          `${stepImportedCount}/${Math.max(1, collected.items.length - stepDuplicatedCount)} ` +
          `novo(s) em analise: ${item.title || item.url}`,
      );
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
      stepEnqueuedCount += 1;

      const processedOpportunity = await context.opportunities.getById(opportunity.id);

      if (!processedOpportunity) {
        continue;
      }

      if (processedOpportunity.decision === "AUTO_SUBMIT") {
        stepAutoSubmitCount += 1;
      } else if (processedOpportunity.decision === "REVIEW_REQUIRED") {
        stepReviewCount += 1;
      } else if (processedOpportunity.decision === "REJECTED") {
        stepRejectedCount += 1;
      }

      const primaryReason =
        processedOpportunity.decisionReasons.find((reason) => reason.trim().length > 0) ??
        "Sem motivo registrado";
      decisionReasonCounts.set(
        primaryReason,
        (decisionReasonCounts.get(primaryReason) ?? 0) + 1,
      );

      for (const flag of processedOpportunity.riskFlags) {
        riskFlagCounts.set(flag, (riskFlagCounts.get(flag) ?? 0) + 1);
      }
    }

    stepsReport.push({
      action: step.action,
      listingUrl,
      pagesVisited: collected.pagesVisited ?? 1,
      linksCollected: collected.items.length,
      importedCount: stepImportedCount,
      duplicatedCount: stepDuplicatedCount,
      enqueuedCount: stepEnqueuedCount,
      autoSubmitCount: stepAutoSubmitCount,
      reviewCount: stepReviewCount,
      rejectedCount: stepRejectedCount,
      topDecisionReasons: topEntries(decisionReasonCounts),
      topRiskFlags: topEntries(riskFlagCounts),
    });
  }

  return {
    duplicatedCount,
    enqueuedCount,
    importedCount,
    steps: stepsReport,
  };
}

function topEntries(source: Map<string, number>, limit = 3): Array<{ label: string; count: number }> {
  return [...source.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}
