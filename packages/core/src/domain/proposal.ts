import type {
  AutomationMode,
  ComplianceStatus,
  SubmissionStatus,
} from "./decision.js";

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
  llmProvider?: string;
  llmModel?: string;
  llmPromptVersion?: string;
  qualityScore?: number | null;
  complianceFlags: string[];
  complianceStatus: ComplianceStatus;
  pricingStrategy?: string;
  pricingExplanation?: string;
  deadlineStrategy?: string;
  deadlineExplanation?: string;
  submissionStatus: SubmissionStatus;
  submittedAt?: string;
  submissionError?: string;
  beforeScreenshotPath?: string;
  afterScreenshotPath?: string;
  htmlSnapshotPath?: string;
  createdAt: string;
  updatedAt: string;
};
