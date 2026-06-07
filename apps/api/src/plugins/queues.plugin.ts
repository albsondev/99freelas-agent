import type { FastifyInstance } from "fastify";

import {
  QueueNames,
  type EmailPollJobPayload,
  type NotificationSendJobPayload,
  type OpportunityFetchJobPayload,
  type OpportunityFetchSweepJobPayload,
  type ProposalGenerateJobPayload,
  type ProposalSubmitJobPayload,
} from "@99freelas/core";
import { QueueProducer } from "@99freelas/integrations";

import type { ApiEnv } from "../env.js";

export async function registerQueuesPlugin(
  app: FastifyInstance,
  env: ApiEnv,
): Promise<void> {
  const producer = new QueueProducer(env.REDIS_URL);

  app.addHook("onClose", async () => {
    await producer.close();
  });

  app.decorate("queueBridge", {
    enqueueOpportunityProcessing: async ({
      opportunityId,
      reason,
    }: {
      opportunityId: string;
      reason: "IMPORT_URL" | "PROCESS" | "REPROCESS";
    }) => {
      const run = await app.repositories.automationRuns.create({
        type: QueueNames.OPPORTUNITY_FETCH,
        status: "QUEUED",
        opportunity_id: opportunityId,
        metadata: {
          source: "api.queue-bridge",
          reason,
        },
      });

      const payload: OpportunityFetchJobPayload = {
        runId: run.id,
        opportunityId,
        reason,
      };

      const job = await producer.enqueue(QueueNames.OPPORTUNITY_FETCH, payload);
      await app.repositories.automationRuns.update(run.id, {
        job_id: job.jobId,
      });

      return {
        runId: run.id,
        status: "QUEUED" as const,
      };
    },
    enqueueEmailPoll: async (
      input: Omit<EmailPollJobPayload, "runId">,
    ) => {
      const run = await app.repositories.automationRuns.create({
        type: QueueNames.EMAIL_POLL,
        status: "QUEUED",
        metadata: {
          source: "api.email-poll",
          ...input,
        },
      });

      const job = await producer.enqueue(QueueNames.EMAIL_POLL, {
        runId: run.id,
        ...input,
      });

      await app.repositories.automationRuns.update(run.id, {
        job_id: job.jobId,
      });

      return {
        runId: run.id,
        status: "QUEUED" as const,
      };
    },
    enqueueProposalGeneration: async (
      input: Omit<ProposalGenerateJobPayload, "runId">,
    ) => {
      const run = await app.repositories.automationRuns.create({
        type: QueueNames.PROPOSAL_GENERATE,
        status: "QUEUED",
        opportunity_id: input.opportunityId,
        metadata: {
          source: "api.proposal-generate",
        },
      });

      const job = await producer.enqueue(QueueNames.PROPOSAL_GENERATE, {
        runId: run.id,
        ...input,
      });

      await app.repositories.automationRuns.update(run.id, {
        job_id: job.jobId,
      });

      return {
        runId: run.id,
        status: "QUEUED" as const,
      };
    },
    enqueueProposalSubmit: async (
      input: Omit<ProposalSubmitJobPayload, "runId">,
    ) => {
      const run = await app.repositories.automationRuns.create({
        type: QueueNames.PROPOSAL_SUBMIT,
        status: "QUEUED",
        proposal_id: input.proposalId,
        metadata: {
          source: "api.proposal-submit",
        },
      });

      const job = await producer.enqueue(QueueNames.PROPOSAL_SUBMIT, {
        runId: run.id,
        ...input,
      });

      await app.repositories.automationRuns.update(run.id, {
        job_id: job.jobId,
      });

      return {
        runId: run.id,
        status: "QUEUED" as const,
      };
    },
    enqueueNotification: async (
      input: Omit<NotificationSendJobPayload, "runId">,
    ) => {
      const run = await app.repositories.automationRuns.create({
        type: QueueNames.NOTIFICATION_SEND,
        status: "QUEUED",
        metadata: {
          source: "api.notification",
          ...input,
        },
      });

      const job = await producer.enqueue(QueueNames.NOTIFICATION_SEND, {
        runId: run.id,
        ...input,
      });

      await app.repositories.automationRuns.update(run.id, {
        job_id: job.jobId,
      });

      return {
        runId: run.id,
        status: "QUEUED" as const,
      };
    },
    enqueueSweep: async (
      input: Omit<OpportunityFetchSweepJobPayload, "runId">,
    ) => {
      const run = await app.repositories.automationRuns.create({
        type: QueueNames.OPPORTUNITY_FETCH,
        status: "QUEUED",
        metadata: {
          source: "api.sweep",
          ...input,
        },
      });

      const job = await producer.enqueue(QueueNames.OPPORTUNITY_FETCH, {
        runId: run.id,
        ...input,
      } satisfies OpportunityFetchJobPayload);

      await app.repositories.automationRuns.update(run.id, {
        job_id: job.jobId,
      });

      return {
        runId: run.id,
        status: "QUEUED" as const,
      };
    },
  });
}
