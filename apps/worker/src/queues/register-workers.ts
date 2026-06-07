import { Worker } from "bullmq";

import { QueueNames, type QueuePayloadByName } from "@99freelas/core";
import {
  AutomationRunRepository,
  OpportunityRepository,
  ProposalRepository,
  QueueProducer,
  SettingsRepository,
  UserProfileRepository,
  createProposalLlmProvider,
  createRedisConnection,
  createSupabaseAdminClient,
} from "@99freelas/integrations";

import type { WorkerEnv } from "../env.js";
import { processEmailPollJob } from "../processors/email-poll.processor.js";
import { processNotificationSendJob } from "../processors/notification-send.processor.js";
import { processOpportunityFetchJob } from "../processors/opportunity-fetch.processor.js";
import { processOpportunityParseJob } from "../processors/opportunity-parse.processor.js";
import { processOpportunityScoreJob } from "../processors/opportunity-score.processor.js";
import { processProposalGenerateJob } from "../processors/proposal-generate.processor.js";
import { processProposalSubmitJob } from "../processors/proposal-submit.processor.js";

type WorkerHandle = {
  close: () => Promise<void>;
};

export async function registerWorkers(env: WorkerEnv): Promise<WorkerHandle> {
  const connection = createRedisConnection(env.REDIS_URL);
  const producer = new QueueProducer(env.REDIS_URL);
  const client = createSupabaseAdminClient({
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const runs = new AutomationRunRepository(client);
  const opportunities = new OpportunityRepository(client);
  const proposals = new ProposalRepository(client);
  const settings = new SettingsRepository(client);
  const userProfiles = new UserProfileRepository(client);
  const llm =
    env.LLM_PROVIDER === "openai" && env.OPENAI_API_KEY
      ? createProposalLlmProvider({
          provider: "openai",
          openAiApiKey: env.OPENAI_API_KEY,
          openAiModel: env.OPENAI_MODEL,
          temperature: env.LLM_TEMPERATURE,
          maxOutputTokens: env.LLM_MAX_TOKENS,
        })
      : null;

  const workers = [
    new Worker<QueuePayloadByName["email.poll"]>(
      QueueNames.EMAIL_POLL,
      async (job) => {
        await processEmailPollJob(job.data, runs);
      },
      { connection },
    ),
    new Worker<QueuePayloadByName["opportunity.fetch"]>(
      QueueNames.OPPORTUNITY_FETCH,
      async (job) => {
        await processOpportunityFetchJob(job.data, {
          opportunities,
          runs,
          producer,
        });
      },
      { connection },
    ),
    new Worker<QueuePayloadByName["opportunity.parse"]>(
      QueueNames.OPPORTUNITY_PARSE,
      async (job) => {
        await processOpportunityParseJob(job.data, {
          opportunities,
          runs,
          producer,
        });
      },
      { connection },
    ),
    new Worker<QueuePayloadByName["opportunity.score"]>(
      QueueNames.OPPORTUNITY_SCORE,
      async (job) => {
        await processOpportunityScoreJob(job.data, {
          opportunities,
          runs,
          producer,
        });
      },
      { connection },
    ),
    new Worker<QueuePayloadByName["proposal.generate"]>(
      QueueNames.PROPOSAL_GENERATE,
      async (job) => {
        await processProposalGenerateJob(job.data, {
          env,
          opportunities,
          proposals,
          runs,
          settings,
          userProfiles,
          llm,
        });
      },
      { connection },
    ),
    new Worker<QueuePayloadByName["proposal.submit"]>(
      QueueNames.PROPOSAL_SUBMIT,
      async (job) => {
        await processProposalSubmitJob(job.data, {
          env,
          proposals,
          runs,
        });
      },
      { connection },
    ),
    new Worker<QueuePayloadByName["notification.send"]>(
      QueueNames.NOTIFICATION_SEND,
      async (job) => {
        await processNotificationSendJob(job.data, runs);
      },
      { connection },
    ),
  ];

  for (const worker of workers) {
    worker.on("failed", async (job, error) => {
      const runId = job?.data?.runId;

      if (!runId) {
        return;
      }

      await runs.update(runId, {
        status: "FAILED",
        finished_at: new Date().toISOString(),
        error_code: "WORKER_JOB_FAILED",
        error_message: error.message,
      });
    });
  }

  return {
    close: async () => {
      await Promise.all(workers.map((worker) => worker.close()));
      await producer.close();
      await connection.quit();
    },
  };
}
