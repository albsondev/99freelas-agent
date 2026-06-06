import type { FastifyInstance } from "fastify";
import { z } from "zod";

const proposalParamsSchema = z.object({
  id: z.string().uuid(),
});

const proposalEditSchema = z.object({
  detailsText: z.string().min(20).optional(),
  amount: z.number().positive().optional(),
  deadlineDays: z.number().int().positive().optional(),
});

export async function registerProposalRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/proposals", async () => {
    const proposals = await app.repositories.proposals.listRecent();

    return {
      items: proposals,
      total: proposals.length,
    };
  });

  app.get("/proposals/:id", async (request, reply) => {
    const { id } = proposalParamsSchema.parse(request.params);
    const proposal = await app.repositories.proposals.getById(id);

    if (!proposal) {
      return reply.code(404).send({
        message: "Proposal not found",
      });
    }

    return {
      item: proposal,
    };
  });

  app.patch("/proposals/:id/edit", async (request, reply) => {
    const { id } = proposalParamsSchema.parse(request.params);
    const patch = proposalEditSchema.parse(request.body);
    const proposal = await app.repositories.proposals.getById(id);

    if (!proposal) {
      return reply.code(404).send({
        message: "Proposal not found",
      });
    }

    const updatePayload: {
      details_text?: string;
      amount?: number;
      deadline_days?: number;
    } = {};

    if (patch.detailsText !== undefined) {
      updatePayload.details_text = patch.detailsText;
    }

    if (patch.amount !== undefined) {
      updatePayload.amount = patch.amount;
    }

    if (patch.deadlineDays !== undefined) {
      updatePayload.deadline_days = patch.deadlineDays;
    }

    const updated = await app.repositories.proposals.update(id, updatePayload);

    return {
      item: updated,
    };
  });

  app.patch("/proposals/:id/approve", async (request, reply) => {
    const { id } = proposalParamsSchema.parse(request.params);
    const proposal = await app.repositories.proposals.getById(id);

    if (!proposal) {
      return reply.code(404).send({
        message: "Proposal not found",
      });
    }

    const updated = await app.repositories.proposals.update(id, {
      compliance_status: "APPROVED",
    });

    return {
      item: updated,
    };
  });

  app.patch("/proposals/:id/reject", async (request, reply) => {
    const { id } = proposalParamsSchema.parse(request.params);
    const proposal = await app.repositories.proposals.getById(id);

    if (!proposal) {
      return reply.code(404).send({
        message: "Proposal not found",
      });
    }

    const updated = await app.repositories.proposals.update(id, {
      compliance_status: "REVIEW_REQUIRED",
      submission_status: "NOT_SUBMITTED",
    });

    return {
      item: updated,
    };
  });

  app.post("/proposals/:id/submit", async (request, reply) => {
    const { id } = proposalParamsSchema.parse(request.params);
    const proposal = await app.repositories.proposals.getById(id);

    if (!proposal) {
      return reply.code(404).send({
        message: "Proposal not found",
      });
    }

    const processing = await app.queueBridge.enqueueProposalSubmit({
      proposalId: id,
    });

    return reply.code(202).send({
      proposalId: id,
      processing,
    });
  });
}
