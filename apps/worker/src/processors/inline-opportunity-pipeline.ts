import {
  QueueNames,
  type OpportunityParseJobPayload,
  type OpportunityScoreJobPayload,
  type ProposalGenerateJobPayload,
} from "@99freelas/core";
import type {
  AutomationRunRepository,
  OpportunityRepository,
  ProposalLlmProvider,
  ProposalRepository,
  SettingsRepository,
  UserProfileRepository,
} from "@99freelas/integrations";

import type { WorkerEnv } from "../env.js";
import { processOpportunityParseJob } from "./opportunity-parse.processor.js";
import { processOpportunityScoreJob } from "./opportunity-score.processor.js";
import { processProposalGenerateJob } from "./proposal-generate.processor.js";

type InlineOpportunityPipelineContext = {
  env: WorkerEnv;
  opportunities: OpportunityRepository;
  proposals: ProposalRepository;
  runs: AutomationRunRepository;
  settings: SettingsRepository;
  userProfiles: UserProfileRepository;
  llm: ProposalLlmProvider;
};

export function createInlineOpportunityPipelineProducer(
  context: InlineOpportunityPipelineContext,
): {
  enqueue: (
    queueName: string,
    payload:
      | OpportunityParseJobPayload
      | OpportunityScoreJobPayload
      | ProposalGenerateJobPayload,
  ) => Promise<{ jobId: string }>;
} {
  return {
    enqueue: async (queueName, payload) => {
      const jobId = `inline:${queueName}:${Date.now()}`;

      if (queueName === QueueNames.OPPORTUNITY_PARSE) {
        await processOpportunityParseJob(payload as OpportunityParseJobPayload, {
          env: context.env,
          opportunities: context.opportunities,
          runs: context.runs,
          producer: createInlineOpportunityPipelineProducer(context),
        });

        return { jobId };
      }

      if (queueName === QueueNames.OPPORTUNITY_SCORE) {
        await processOpportunityScoreJob(payload as OpportunityScoreJobPayload, {
          opportunities: context.opportunities,
          runs: context.runs,
          producer: createInlineOpportunityPipelineProducer(context),
        });

        return { jobId };
      }

      if (queueName === QueueNames.PROPOSAL_GENERATE) {
        await processProposalGenerateJob(payload as ProposalGenerateJobPayload, {
          env: context.env,
          opportunities: context.opportunities,
          proposals: context.proposals,
          runs: context.runs,
          settings: context.settings,
          userProfiles: context.userProfiles,
          llm: context.llm,
        });

        return { jobId };
      }

      throw new Error(`Unsupported inline queue name: ${queueName}`);
    },
  };
}
