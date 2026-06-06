export type OpportunityStatus =
  | "NEW"
  | "FETCHED"
  | "PARSED"
  | "QUALIFIED"
  | "REJECTED"
  | "PROPOSAL_GENERATED"
  | "WAITING_REVIEW"
  | "APPROVED"
  | "SUBMITTED"
  | "FAILED"
  | "DUPLICATED";

export type AutomationMode = "DRY_RUN" | "REVIEW_REQUIRED" | "AUTOPILOT";

export type OpportunityDecision =
  | "AUTO_SUBMIT"
  | "REVIEW_REQUIRED"
  | "REJECTED"
  | "FAILED";

export type SubmissionStatus =
  | "NOT_SUBMITTED"
  | "PENDING"
  | "SUBMITTED"
  | "FAILED"
  | "FAILED_REQUIRES_MANUAL_ACTION"
  | "DUPLICATED";

