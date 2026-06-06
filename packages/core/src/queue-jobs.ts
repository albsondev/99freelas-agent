import type { JsonValue } from "./domain/json.js";
import type { QueueName } from "./queue-names.js";

export type OpportunityProcessingReason = "IMPORT_URL" | "PROCESS" | "REPROCESS";

export type JobLifecyclePayload = {
  runId: string;
};

export type OpportunityFetchSweepJobPayload = JobLifecyclePayload & {
  action: "PROCESS_PENDING_SWEEP" | "RETRY_FAILED_SWEEP";
};

export type OpportunityFetchJobPayload = JobLifecyclePayload &
  (
    | {
        opportunityId: string;
        reason: OpportunityProcessingReason;
      }
    | OpportunityFetchSweepJobPayload
  );

export type OpportunityParseJobPayload = JobLifecyclePayload & {
  opportunityId: string;
};

export type OpportunityScoreJobPayload = JobLifecyclePayload & {
  opportunityId: string;
};

export type EmailPollJobPayload = JobLifecyclePayload & {
  triggeredBy: "API" | "SCHEDULE";
};

export type ProposalSubmitJobPayload = JobLifecyclePayload & {
  proposalId: string;
};

export type NotificationSendJobPayload = JobLifecyclePayload & {
  channel: "console";
  event: string;
  metadata?: Record<string, JsonValue>;
};

export type QueuePayloadByName = {
  "email.poll": EmailPollJobPayload;
  "opportunity.fetch": OpportunityFetchJobPayload;
  "opportunity.parse": OpportunityParseJobPayload;
  "opportunity.score": OpportunityScoreJobPayload;
  "proposal.submit": ProposalSubmitJobPayload;
  "notification.send": NotificationSendJobPayload;
};

export type QueuePayload<TQueueName extends QueueName> =
  TQueueName extends keyof QueuePayloadByName
    ? QueuePayloadByName[TQueueName]
    : Record<string, JsonValue>;
