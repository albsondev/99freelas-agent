import type {
  AutomationRunRepository,
  OpportunityRepository,
  ProposalRepository,
  SettingsRepository,
  UserProfileRepository,
} from "@99freelas/integrations";
import type { JsonValue } from "@99freelas/core";

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
      enqueueJob: (input: {
        type: string;
        metadata?: Record<string, JsonValue>;
      }) => Promise<{ runId: string; status: "QUEUED" }>;
    };
  }
}

export {};
