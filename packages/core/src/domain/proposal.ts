import type { AutomationMode, SubmissionStatus } from "./decision.js";

export type Proposal = {
  id: string;
  opportunityId: string;
  mode: AutomationMode;
  amount: number;
  deadlineDays: number;
  detailsText: string;
  technicalSummary?: string;
  assumptions: string[];
  questions: string[];
  risks: string[];
  complianceFlags: string[];
  complianceStatus: "PENDING" | "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED";
  submissionStatus: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
};

