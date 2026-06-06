import type {
  AutomationRun,
  DailyCounter,
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
    headline: row.headline ?? undefined,
    seniority: row.seniority,
    mainSkills: row.main_skills,
    secondarySkills: row.secondary_skills,
    preferredProjectTypes: row.preferred_project_types,
    blockedProjectTypes: row.blocked_project_types,
    minimumAmountBrl: row.minimum_amount_brl,
    minimumDailyRateBrl: row.minimum_daily_rate_brl,
    defaultHourlyRateBrl: row.default_hourly_rate_brl,
    proposalTone: row.proposal_tone,
    portfolioSummary: row.portfolio_summary ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOpportunityRow(row: TableRow<"opportunities">): Opportunity {
  return {
    id: row.id,
    externalId: row.external_id ?? undefined,
    source: row.source as Opportunity["source"],
    sourceMessageId: row.source_message_id ?? undefined,
    url: row.url,
    canonicalUrl: row.canonical_url ?? undefined,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    category: row.category ?? undefined,
    skills: row.skills,
    budgetText: row.budget_text ?? undefined,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    averageBidAmount: row.average_bid_amount,
    averageDeadlineDays: row.average_deadline_days,
    proposalCount: row.proposal_count,
    interestedCount: row.interested_count,
    clientName: row.client_name ?? undefined,
    clientRating: row.client_rating,
    clientHistoryText: row.client_history_text ?? undefined,
    rawPayload: row.raw_payload,
    status: row.status,
    decision: row.decision ?? undefined,
    decisionReasons: row.decision_reasons,
    riskFlags: row.risk_flags,
    score: row.score ?? undefined,
    matchedSkills: row.matched_skills,
    missingSkills: row.missing_skills,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    technicalSummary: row.technical_summary ?? undefined,
    assumptions: row.assumptions,
    questions: row.questions,
    risks: row.risks,
    llmProvider: row.llm_provider ?? undefined,
    llmModel: row.llm_model ?? undefined,
    llmPromptVersion: row.llm_prompt_version ?? undefined,
    qualityScore: row.quality_score,
    complianceStatus: row.compliance_status,
    complianceFlags: row.compliance_flags,
    pricingStrategy: row.pricing_strategy ?? undefined,
    pricingExplanation: row.pricing_explanation ?? undefined,
    deadlineStrategy: row.deadline_strategy ?? undefined,
    deadlineExplanation: row.deadline_explanation ?? undefined,
    submissionStatus: row.submission_status,
    submittedAt: row.submitted_at ?? undefined,
    submissionError: row.submission_error ?? undefined,
    beforeScreenshotPath: row.before_screenshot_path ?? undefined,
    afterScreenshotPath: row.after_screenshot_path ?? undefined,
    htmlSnapshotPath: row.html_snapshot_path ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    jobId: row.job_id ?? undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export function mapSettingRow(row: TableRow<"settings">): SettingRecord {
  return {
    id: row.id,
    key: row.key,
    value: row.value,
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

