import {
  QueueNames,
  type JsonValue,
  type OpportunityParseJobPayload,
} from "@99freelas/core";
import type {
  AutomationRunRepository,
  OpportunityRepository,
  QueueProducer,
} from "@99freelas/integrations";

type ProcessOpportunityParseContext = {
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

export async function processOpportunityParseJob(
  payload: OpportunityParseJobPayload,
  context: ProcessOpportunityParseContext,
): Promise<void> {
  await context.runs.update(payload.runId, {
    status: "PROCESSING",
  });

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

  const fallbackTitle =
    opportunity.title ??
    `Projeto ${opportunity.externalId ?? opportunity.id.slice(0, 8)}`;
  const fallbackDescription =
    opportunity.description ??
    "Descricao ainda nao extraida do HTML real. Pipeline em modo mockado na Fase 3.";

  await context.opportunities.update(payload.opportunityId, {
    title: fallbackTitle,
    description: fallbackDescription,
    status: "PARSED",
    raw_payload: {
      ...asJsonObject(opportunity.rawPayload),
      parse: {
        parsedAt: new Date().toISOString(),
        parser: "mock-phase-3",
      },
    },
  });

  await context.runs.update(payload.runId, {
    status: "COMPLETED",
    finished_at: new Date().toISOString(),
    metadata: {
      opportunityId: payload.opportunityId,
      result: "PARSED",
    },
  });

  const scoreRun = await context.runs.create({
    type: QueueNames.OPPORTUNITY_SCORE,
    status: "QUEUED",
    opportunity_id: payload.opportunityId,
    metadata: {
      source: "worker.parse-processor",
      parentRunId: payload.runId,
    },
  });

  const scoreJob = await context.producer.enqueue(QueueNames.OPPORTUNITY_SCORE, {
    runId: scoreRun.id,
    opportunityId: payload.opportunityId,
  });

  await context.runs.update(scoreRun.id, {
    job_id: scoreJob.jobId,
  });
}
