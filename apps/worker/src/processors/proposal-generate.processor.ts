import {
  ComplianceValidatorService,
  DeadlineService,
  DecisionEngineService,
  PricingService,
  sanitizeProposalText,
  type JsonValue,
  type ProposalGenerateJobPayload,
  type ScoreResult,
} from "@99freelas/core";
import type {
  AutomationRunRepository,
  OpportunityRepository,
  ProposalLlmProvider,
  ProposalRepository,
  SettingsRepository,
  UserProfileRepository,
} from "@99freelas/integrations";

import type { WorkerEnv } from "../env.js";

type ProcessProposalGenerateContext = {
  env: WorkerEnv;
  opportunities: OpportunityRepository;
  proposals: ProposalRepository;
  runs: AutomationRunRepository;
  settings: SettingsRepository;
  userProfiles: UserProfileRepository;
  llm: ProposalLlmProvider | null;
};

export async function processProposalGenerateJob(
  payload: ProposalGenerateJobPayload,
  context: ProcessProposalGenerateContext,
): Promise<void> {
  await context.runs.update(payload.runId, {
    status: "PROCESSING",
  });

  if (!context.llm) {
    await context.runs.update(payload.runId, {
      status: "FAILED",
      finished_at: new Date().toISOString(),
      error_code: "LLM_PROVIDER_NOT_CONFIGURED",
      error_message: "No LLM provider is configured for proposal generation.",
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

  if (opportunity.status === "REJECTED" || opportunity.decision === "REJECTED") {
    await context.runs.update(payload.runId, {
      status: "COMPLETED",
      finished_at: new Date().toISOString(),
      metadata: {
        opportunityId: payload.opportunityId,
        result: "SKIPPED_REJECTED",
      },
    });
    return;
  }

  const existingProposal = await context.proposals.getByOpportunityId(opportunity.id);

  if (existingProposal?.submissionStatus === "SUBMITTED") {
    await context.runs.update(payload.runId, {
      status: "COMPLETED",
      finished_at: new Date().toISOString(),
      metadata: {
        opportunityId: opportunity.id,
        proposalId: existingProposal.id,
        result: "SKIPPED_ALREADY_SUBMITTED",
      },
    });
    return;
  }

  const [pricingSetting, deadlineSetting, freelancerProfile] = await Promise.all([
    context.settings.getByKey("pricing.defaults"),
    context.settings.getByKey("deadline.defaults"),
    context.userProfiles.getPrimaryProfile(),
  ]);

  const pricingDefaults = asJsonObject(pricingSetting?.value);
  const deadlineDefaults = asJsonObject(deadlineSetting?.value);

  const minimumProposalAmountBrl =
    freelancerProfile?.minimumAmountBrl ??
    readNumberSetting(
      pricingDefaults,
      "minimumProposalAmountBrl",
      context.env.MIN_PROPOSAL_AMOUNT_BRL,
    );
  const minimumDailyRateBrl =
    freelancerProfile?.minimumDailyRateBrl ??
    readNumberSetting(
      pricingDefaults,
      "minimumDailyRateBrl",
      context.env.MIN_DAILY_RATE_BRL,
    );
  const defaultHourlyRateBrl =
    freelancerProfile?.defaultHourlyRateBrl ??
    readNumberSetting(
      pricingDefaults,
      "defaultHourlyRateBrl",
      context.env.DEFAULT_HOURLY_RATE_BRL,
    );

  const deadline = new DeadlineService().calculate({
    title: opportunity.title ?? "",
    description: opportunity.description ?? "",
    category: opportunity.category ?? "",
    skills: opportunity.skills,
    averageDeadlineDays: opportunity.averageDeadlineDays ?? null,
    deadlineReductionFactor: readNumberSetting(
      deadlineDefaults,
      "reductionFactor",
      context.env.DEADLINE_REDUCTION_FACTOR,
    ),
    minDeadlineDays: readIntegerSetting(
      deadlineDefaults,
      "minDeadlineDays",
      context.env.MIN_DEADLINE_DAYS,
    ),
    maxDeadlineDays: readIntegerSetting(
      deadlineDefaults,
      "maxDeadlineDays",
      context.env.MAX_DEADLINE_DAYS,
    ),
  });

  const pricing = new PricingService().calculate({
    title: opportunity.title ?? "",
    description: opportunity.description ?? "",
    category: opportunity.category ?? "",
    skills: opportunity.skills,
    deadlineDays: deadline.deadlineDays,
    averageBidAmount: opportunity.averageBidAmount ?? null,
    budgetMin: opportunity.budgetMin ?? null,
    budgetMax: opportunity.budgetMax ?? null,
    minimumProposalAmountBrl,
    minimumDailyRateBrl,
    defaultHourlyRateBrl,
    priceDiscountFactor: readNumberSetting(
      pricingDefaults,
      "discountFactor",
      context.env.PRICE_DISCOUNT_FACTOR,
    ),
  });

  const generated = await context.llm.generate({
    opportunity,
    amount: pricing.amount,
    deadlineDays: deadline.deadlineDays,
    pricingExplanation: pricing.explanation,
    deadlineExplanation: deadline.explanation,
    matchedSkills: opportunity.matchedSkills,
    missingSkills: opportunity.missingSkills,
    decisionReasons: opportunity.decisionReasons,
    riskFlags: opportunity.riskFlags,
    freelancerProfile,
  });

  const compliance = new ComplianceValidatorService().validate({
    detailsText: sanitizeProposalText(generated.detailsText),
    title: opportunity.title,
    description: opportunity.description,
    skills: opportunity.skills,
  });

  const score: ScoreResult = {
    score: opportunity.score ?? 0,
    decisionHint:
      opportunity.decision === "AUTO_SUBMIT"
        ? "AUTO_SUBMIT"
        : opportunity.decision === "REJECTED"
          ? "REJECTED"
          : "REVIEW_REQUIRED",
    reasons: opportunity.decisionReasons,
    matchedSkills: opportunity.matchedSkills,
    missingSkills: opportunity.missingSkills,
    riskFlags: opportunity.riskFlags,
  };

  const decision = new DecisionEngineService().decide({
    mode: context.env.AUTOMATION_MODE,
    score,
    pricing,
    deadline,
    compliance,
    minimumProposalAmountBrl,
    minDeadlineDays: readIntegerSetting(
      deadlineDefaults,
      "minDeadlineDays",
      context.env.MIN_DEADLINE_DAYS,
    ),
    hasAverageBid:
      typeof opportunity.averageBidAmount === "number" &&
      opportunity.averageBidAmount > 0,
    clearScope: !opportunity.riskFlags.includes("UNCLEAR_SCOPE"),
    duplicateDetected: false,
    alreadySubmitted: false,
    sessionValid: true,
    formDetected: true,
    captchaDetected: false,
    dailyLimitReached: false,
    hourlyLimitReached: false,
    autoSubmitOnlyWithClearScope: context.env.AUTO_SUBMIT_ONLY_WITH_CLEAR_SCOPE,
    autoSubmitOnlyWithAverageBid: context.env.AUTO_SUBMIT_ONLY_WITH_AVERAGE_BID,
    rejectUnclearScopeWhenAutopilot:
      context.env.REJECT_UNCLEAR_SCOPE_WHEN_AUTOPILOT,
  });

  const proposalPayload = {
    mode: context.env.AUTOMATION_MODE,
    amount: pricing.amount,
    deadline_days: deadline.deadlineDays,
    details_text: sanitizeProposalText(generated.detailsText),
    technical_summary: generated.technicalSummary,
    assumptions: generated.assumptions,
    questions: generated.questions,
    risks: generated.risks,
    llm_provider: generated.llmProvider,
    llm_model: generated.llmModel,
    llm_prompt_version: generated.llmPromptVersion,
    quality_score: generated.qualityScore,
    compliance_status: compliance.status,
    compliance_flags: compliance.flags,
    pricing_strategy: pricing.strategy,
    pricing_explanation: pricing.explanation,
    deadline_strategy: deadline.strategy,
    deadline_explanation: deadline.explanation,
    submission_status: "NOT_SUBMITTED" as const,
  };

  const proposal = existingProposal
    ? await context.proposals.update(existingProposal.id, proposalPayload)
    : await context.proposals.create({
        opportunity_id: opportunity.id,
        ...proposalPayload,
      });

  const opportunityStatus =
    decision.decision === "REJECTED"
      ? "REJECTED"
      : decision.canSubmitAutomatically
        ? "PROPOSAL_GENERATED"
        : "WAITING_REVIEW";

  await context.opportunities.update(opportunity.id, {
    status: opportunityStatus,
    decision: decision.decision,
    decision_reasons: mergeStrings(
      opportunity.decisionReasons,
      decision.reasons,
      decision.blockingReasons,
      pricing.warnings,
      deadline.warnings,
    ),
    risk_flags: mergeStrings(
      opportunity.riskFlags,
      decision.riskFlags,
      compliance.flags,
    ),
  });

  await context.runs.update(payload.runId, {
    status: "COMPLETED",
    proposal_id: proposal.id,
    finished_at: new Date().toISOString(),
    metadata: {
      opportunityId: opportunity.id,
      proposalId: proposal.id,
      complianceStatus: compliance.status,
      generatedBy: generated.llmProvider,
      llmModel: generated.llmModel,
      promptVersion: generated.llmPromptVersion,
      qualityScore: generated.qualityScore,
      decision: decision.decision,
      canSubmitAutomatically: decision.canSubmitAutomatically,
      nextAction: decision.canSubmitAutomatically
        ? "READY_FOR_SUBMIT"
        : "AWAIT_REVIEW",
      usage: generated.usage ?? null,
    },
  });
}

function asJsonObject(value: JsonValue | null | undefined): Record<string, JsonValue> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, JsonValue>;
  }

  return {};
}

function readNumberSetting(
  source: Record<string, JsonValue>,
  key: string,
  fallback: number,
): number {
  const value = source[key];

  return typeof value === "number" ? value : fallback;
}

function readIntegerSetting(
  source: Record<string, JsonValue>,
  key: string,
  fallback: number,
): number {
  return Math.round(readNumberSetting(source, key, fallback));
}

function mergeStrings(...groups: string[][]): string[] {
  return [...new Set(groups.flat().filter(Boolean))];
}
