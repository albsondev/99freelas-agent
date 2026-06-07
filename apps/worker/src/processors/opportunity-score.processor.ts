import {
  OpportunityScoringService,
  QueueNames,
  type OpportunityScoreJobPayload,
} from "@99freelas/core";
import type {
  AutomationRunRepository,
  OpportunityRepository,
  QueueProducer,
} from "@99freelas/integrations";

type ProcessOpportunityScoreContext = {
  opportunities: OpportunityRepository;
  runs: AutomationRunRepository;
  producer: QueueProducer;
};

export async function processOpportunityScoreJob(
  payload: OpportunityScoreJobPayload,
  context: ProcessOpportunityScoreContext,
): Promise<void> {
  const scoringService = new OpportunityScoringService();

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

  const result = scoringService.score({
    title: opportunity.title ?? "",
    description: opportunity.description ?? "",
    category: opportunity.category ?? "",
    skills: opportunity.skills,
    budgetMin: opportunity.budgetMin ?? null,
    budgetMax: opportunity.budgetMax ?? null,
    averageBidAmount: opportunity.averageBidAmount ?? null,
    averageDeadlineDays: opportunity.averageDeadlineDays ?? null,
    proposalCount: opportunity.proposalCount ?? null,
    clientRating: opportunity.clientRating ?? null,
  });

  await context.opportunities.update(payload.opportunityId, {
    status: result.decisionHint === "REJECTED" ? "REJECTED" : "QUALIFIED",
    score: result.score,
    decision: result.decisionHint,
    decision_reasons: result.reasons,
    risk_flags: result.riskFlags,
    matched_skills: result.matchedSkills,
    missing_skills: result.missingSkills,
  });

  await context.runs.update(payload.runId, {
    status: "COMPLETED",
    finished_at: new Date().toISOString(),
    metadata: {
      opportunityId: payload.opportunityId,
      score: result.score,
      decisionHint: result.decisionHint,
      result: result.decisionHint === "REJECTED" ? "REJECTED" : "QUALIFIED",
    },
  });

  if (result.decisionHint === "REJECTED") {
    return;
  }

  const proposalRun = await context.runs.create({
    type: QueueNames.PROPOSAL_GENERATE,
    status: "QUEUED",
    opportunity_id: payload.opportunityId,
    metadata: {
      source: "worker.score-processor",
      parentRunId: payload.runId,
      score: result.score,
    },
  });

  const proposalJob = await context.producer.enqueue(QueueNames.PROPOSAL_GENERATE, {
    runId: proposalRun.id,
    opportunityId: payload.opportunityId,
  });

  await context.runs.update(proposalRun.id, {
    job_id: proposalJob.jobId,
  });
}
