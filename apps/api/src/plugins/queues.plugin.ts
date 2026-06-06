import type { FastifyInstance } from "fastify";

import type { JsonValue } from "@99freelas/core";

export async function registerQueuesPlugin(
  app: FastifyInstance,
): Promise<void> {
  app.decorate("queueBridge", {
    enqueueOpportunityProcessing: async ({
      opportunityId,
      reason,
    }: {
      opportunityId: string;
      reason: "IMPORT_URL" | "PROCESS" | "REPROCESS";
    }) => {
      const run = await app.repositories.automationRuns.create({
        type: "opportunity.fetch",
        status: "QUEUED",
        opportunity_id: opportunityId,
        metadata: {
          source: "api.queue-bridge",
          reason,
        },
      });

      return {
        runId: run.id,
        status: "QUEUED" as const,
      };
    },
    enqueueJob: async ({
      type,
      metadata,
    }: {
      type: string;
      metadata?: Record<string, JsonValue>;
    }) => {
      const run = await app.repositories.automationRuns.create({
        type,
        status: "QUEUED",
        metadata: {
          source: "api.manual-job",
          ...(metadata ?? {}),
        },
      });

      return {
        runId: run.id,
        status: "QUEUED" as const,
      };
    },
  });
}
