import {
  QueueNames,
  type JsonValue,
  type OpportunityFetchJobPayload,
} from "@99freelas/core";
import type {
  AutomationRunRepository,
  OpportunityRepository,
  QueueProducer,
} from "@99freelas/integrations";

type ProcessOpportunityFetchContext = {
  opportunities: OpportunityRepository;
  runs: AutomationRunRepository;
  producer: QueueProducer;
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
    await context.runs.update(payload.runId, {
      status: "COMPLETED",
      finished_at: new Date().toISOString(),
      metadata: {
        action: payload.action,
        result: "SWEEP_PLACEHOLDER",
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
