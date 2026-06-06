import type { FastifyInstance } from "fastify";

export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  app.post("/jobs/email-poll", async (_request, reply) => {
    const processing = await app.queueBridge.enqueueJob({
      type: "email.poll",
    });

    return reply.code(202).send({
      processing,
    });
  });

  app.post("/jobs/process-pending", async (_request, reply) => {
    const processing = await app.queueBridge.enqueueJob({
      type: "jobs.process-pending",
    });

    return reply.code(202).send({
      processing,
    });
  });

  app.post("/jobs/retry-failed", async (_request, reply) => {
    const processing = await app.queueBridge.enqueueJob({
      type: "jobs.retry-failed",
    });

    return reply.code(202).send({
      processing,
    });
  });
}

