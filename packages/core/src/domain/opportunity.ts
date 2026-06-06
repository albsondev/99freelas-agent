import type { OpportunityDecision, OpportunityStatus } from "./decision.js";

export type Opportunity = {
  id: string;
  source: "EMAIL" | "MANUAL_URL" | "POLLING";
  url: string;
  canonicalUrl?: string;
  externalId?: string;
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
  clientName?: string;
  clientRating?: number | null;
  status: OpportunityStatus;
  decision?: OpportunityDecision;
  decisionReasons: string[];
  riskFlags: string[];
  score?: number;
  matchedSkills: string[];
  missingSkills: string[];
  createdAt: string;
  updatedAt: string;
};

