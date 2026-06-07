import type {
  AutomationRunRepository,
  OpportunityRepository,
  ProposalRepository,
  SettingsRepository,
  UserProfileRepository,
} from "@99freelas/integrations";
import type {
  EmailPollJobPayload,
  NotificationSendJobPayload,
  OpportunityFetchSweepJobPayload,
  ProposalGenerateJobPayload,
  ProposalSubmitJobPayload,
} from "@99freelas/core";

declare module "fastify" {
  interface FastifyInstance {
    repositories: {
      automationRuns: AutomationRunRepository;
      opportunities: OpportunityRepository;
      proposals: ProposalRepository;
      settings: SettingsRepository;
      userProfiles: UserProfileRepository;
    };
    queueBridge: {
      enqueueOpportunityProcessing: (input: {
        opportunityId: string;
        reason: "IMPORT_URL" | "PROCESS" | "REPROCESS";
      }) => Promise<{ runId: string; status: "QUEUED" }>;
      enqueueEmailPoll: (input: Omit<EmailPollJobPayload, "runId">) => Promise<{
        runId: string;
        status: "QUEUED";
      }>;
      enqueueProposalGeneration: (
        input: Omit<ProposalGenerateJobPayload, "runId">,
      ) => Promise<{ runId: string; status: "QUEUED" }>;
      enqueueProposalSubmit: (
        input: Omit<ProposalSubmitJobPayload, "runId">,
      ) => Promise<{ runId: string; status: "QUEUED" }>;
      enqueueNotification: (
        input: Omit<NotificationSendJobPayload, "runId">,
      ) => Promise<{ runId: string; status: "QUEUED" }>;
      enqueueSweep: (
        input: Omit<OpportunityFetchSweepJobPayload, "runId">,
      ) => Promise<{ runId: string; status: "QUEUED" }>;
    };
  }
}

export {};
