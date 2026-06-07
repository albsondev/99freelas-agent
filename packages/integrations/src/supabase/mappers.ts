import type {
  AutomationRun,
  DailyCounter,
  JsonValue,
  Opportunity,
  Proposal,
  SettingRecord,
  UserProfile,
} from "@99freelas/core";

import type { TableRow } from "./database.types.js";

export function mapUserProfileRow(row: TableRow<"user_profiles">): UserProfile {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    seniority: row.seniority,
    mainSkills: row.main_skills,
    secondarySkills: row.secondary_skills,
    preferredProjectTypes: row.preferred_project_types,
    blockedProjectTypes: row.blocked_project_types,
    minimumAmountBrl: row.minimum_amount_brl,
    minimumDailyRateBrl: row.minimum_daily_rate_brl,
    defaultHourlyRateBrl: row.default_hourly_rate_brl,
    proposalTone: row.proposal_tone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(withOptional("headline", row.headline)),
    ...(withOptional("portfolioSummary", row.portfolio_summary)),
  };
}

export function mapOpportunityRow(row: TableRow<"opportunities">): Opportunity {
  return {
    id: row.id,
    source: row.source as Opportunity["source"],
    url: row.url,
    skills: row.skills,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    averageBidAmount: row.average_bid_amount,
    averageDeadlineDays: row.average_deadline_days,
    proposalCount: row.proposal_count,
    interestedCount: row.interested_count,
    clientRating: row.client_rating,
    rawPayload: asJsonValue(row.raw_payload),
    status: row.status,
    decisionReasons: row.decision_reasons,
    riskFlags: row.risk_flags,
    matchedSkills: row.matched_skills,
    missingSkills: row.missing_skills,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(withOptional("externalId", row.external_id)),
    ...(withOptional("sourceMessageId", row.source_message_id)),
    ...(withOptional("canonicalUrl", row.canonical_url)),
    ...(withOptional("title", row.title)),
    ...(withOptional("description", row.description)),
    ...(withOptional("category", row.category)),
    ...(withOptional("budgetText", row.budget_text)),
    ...(withOptional("clientName", row.client_name)),
    ...(withOptional("clientHistoryText", row.client_history_text)),
    ...(withOptional("decision", row.decision)),
    ...(withOptional("score", row.score)),
  };
}

export function mapProposalRow(row: TableRow<"proposals">): Proposal {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    mode: row.mode,
    amount: row.amount,
    deadlineDays: row.deadline_days,
    detailsText: row.details_text,
    assumptions: row.assumptions,
    questions: row.questions,
    risks: row.risks,
    qualityScore: row.quality_score,
    complianceStatus: row.compliance_status,
    complianceFlags: row.compliance_flags,
    submissionStatus: row.submission_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(withOptional("technicalSummary", row.technical_summary)),
    ...(withOptional("llmProvider", row.llm_provider)),
    ...(withOptional("llmModel", row.llm_model)),
    ...(withOptional("llmPromptVersion", row.llm_prompt_version)),
    ...(withOptional("pricingStrategy", row.pricing_strategy)),
    ...(withOptional("pricingExplanation", row.pricing_explanation)),
    ...(withOptional("deadlineStrategy", row.deadline_strategy)),
    ...(withOptional("deadlineExplanation", row.deadline_explanation)),
    ...(withOptional("submittedAt", row.submitted_at)),
    ...(withOptional("submissionError", row.submission_error)),
    ...(withOptional("beforeScreenshotPath", row.before_screenshot_path)),
    ...(withOptional("afterScreenshotPath", row.after_screenshot_path)),
    ...(withOptional("htmlSnapshotPath", row.html_snapshot_path)),
  };
}

export function mapAutomationRunRow(
  row: TableRow<"automation_runs">,
): AutomationRun {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    opportunityId: row.opportunity_id,
    proposalId: row.proposal_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    metadata: asJsonValue(row.metadata),
    createdAt: row.created_at,
    ...(withOptional("jobId", row.job_id)),
  };
}

export function mapSettingRow(row: TableRow<"settings">): SettingRecord {
  return {
    id: row.id,
    key: row.key,
    value: asJsonValue(row.value),
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDailyCounterRow(
  row: TableRow<"daily_counters">,
): DailyCounter {
  return {
    id: row.id,
    counterDate: row.counter_date,
    name: row.name,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function withOptional<TKey extends string, TValue>(
  key: TKey,
  value: TValue | null | undefined,
): Partial<Record<TKey, TValue>> {
  if (value === null || value === undefined) {
    return {};
  }

  return {
    [key]: value,
  } as Partial<Record<TKey, TValue>>;
}

function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}
