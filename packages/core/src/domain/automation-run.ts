import type { JsonValue } from "./json.js";

export type AutomationRun = {
  id: string;
  type: string;
  status: string;
  opportunityId?: string | null;
  proposalId?: string | null;
  jobId?: string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata: JsonValue;
  createdAt: string;
};

