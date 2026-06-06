import type { OpportunityScoreJobPayload } from "@99freelas/core";
import type {
  AutomationRunRepository,
  OpportunityRepository,
} from "@99freelas/integrations";

type ProcessOpportunityScoreContext = {
  opportunities: OpportunityRepository;
  runs: AutomationRunRepository;
};

export async function processOpportunityScoreJob(
  payload: OpportunityScoreJobPayload,
  context: ProcessOpportunityScoreContext,
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

  const score =
    opportunity.title || opportunity.description ? 68 : 40;

  await context.opportunities.update(payload.opportunityId, {
    status: score >= 60 ? "QUALIFIED" : "REJECTED",
    score,
    decision: score >= 60 ? "REVIEW_REQUIRED" : "REJECTED",
    decision_reasons:
      score >= 60
        ? ["MOCK_SCORE_PIPELINE_READY_FOR_PHASE_4"]
        : ["INSUFFICIENT_CONTEXT_IN_MOCK_PIPELINE"],
    risk_flags: score >= 60 ? ["SCORING_RULES_PENDING"] : ["LOW_SIGNAL_INPUT"],
    matched_skills: [],
    missing_skills: [],
  });

  await context.runs.update(payload.runId, {
    status: "COMPLETED",
    finished_at: new Date().toISOString(),
    metadata: {
      opportunityId: payload.opportunityId,
      score,
      result: score >= 60 ? "QUALIFIED" : "REJECTED",
    },
  });
}

