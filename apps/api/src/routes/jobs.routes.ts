import type { FastifyInstance } from "fastify";

export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  app.post("/jobs/email-poll", async (_request, reply) => {
    const processing = await app.queueBridge.enqueueEmailPoll({
      triggeredBy: "API",
    });

    return reply.code(202).send({
      processing,
    });
  });

  app.post("/jobs/process-pending", async (_request, reply) => {
    const processing = await app.queueBridge.enqueueSweep({
      action: "PROCESS_PENDING_SWEEP",
    });

    return reply.code(202).send({
      processing,
    });
  });

  app.post("/jobs/retry-failed", async (_request, reply) => {
    const processing = await app.queueBridge.enqueueSweep({
      action: "RETRY_FAILED_SWEEP",
    });

    return reply.code(202).send({
      processing,
    });
  });

  app.post("/jobs/source-recommended", async (_request, reply) => {
    const processing = await app.queueBridge.enqueueSweep({
      action: "PROCESS_RECOMMENDED_NOTIFICATIONS",
    });

    return reply.code(202).send({
      processing,
    });
  });

  app.post("/jobs/hunt-projects", async (_request, reply) => {
    const processing = await app.queueBridge.enqueueSweep({
      action: "HUNT_PROJECT_LIST",
    });

    return reply.code(202).send({
      processing,
    });
  });
}
