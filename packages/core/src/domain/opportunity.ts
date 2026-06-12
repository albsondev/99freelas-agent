import type { OpportunityDecision, OpportunityStatus } from "./decision.js";
import type { JsonValue } from "./json.js";

export type OpportunitySource =
  | "EMAIL"
  | "MANUAL_URL"
  | "POLLING"
  | "RECOMMENDED_NOTIFICATION"
  | "PROJECT_LISTING";

export type Opportunity = {
  id: string;
  externalId?: string;
  source: OpportunitySource;
  sourceMessageId?: string;
  url: string;
  canonicalUrl?: string;
  title?: string;
  description?: string;
  category?: string;
  skills: string[];
  budgetText?: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  averageBidAmount?: number | null;
  averageDeadlineDays?: number | null;
  proposalCount?: number | null;
  interestedCount?: number | null;
  clientName?: string;
  clientHistoryText?: string;
  clientRating?: number | null;
  rawPayload: JsonValue;
  status: OpportunityStatus;
  decision?: OpportunityDecision;
  decisionReasons: string[];
  riskFlags: string[];
  score?: number;
  matchedSkills: string[];
  missingSkills: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};
