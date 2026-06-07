import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  extractProjectIdFromUrl,
  is99FreelasUrl,
  normalizeProjectUrl,
} from "@99freelas/core";

const importUrlSchema = z.object({
  url: z.string().url(),
});

const opportunityParamsSchema = z.object({
  id: z.string().uuid(),
});

function buildDuplicateResponse(opportunityId: string) {
  return {
    duplicated: true,
    opportunityId,
    processing: {
      enqueued: false,
    },
  };
}

export async function registerOpportunityRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/opportunities", async () => {
    const opportunities = await app.repositories.opportunities.listRecent();

    return {
      items: opportunities,
      total: opportunities.length,
    };
  });

  app.get("/opportunities/:id", async (request, reply) => {
    const { id } = opportunityParamsSchema.parse(request.params);
    const opportunity = await app.repositories.opportunities.getById(id);

    if (!opportunity) {
      return reply.code(404).send({
        message: "Opportunity not found",
      });
    }

    return {
      item: opportunity,
    };
  });

  app.post("/opportunities/import-url", async (request, reply) => {
    const { url } = importUrlSchema.parse(request.body);

    if (!is99FreelasUrl(url)) {
      return reply.code(400).send({
        message: "Only 99Freelas URLs are supported",
      });
    }

    const canonicalUrl = normalizeProjectUrl(url);
    const duplicated = await app.repositories.opportunities.findByCanonicalUrl(
      canonicalUrl,
    );

    if (duplicated) {
      return reply.code(200).send(buildDuplicateResponse(duplicated.id));
    }

    const opportunity = await app.repositories.opportunities.create({
      source: "MANUAL_URL",
      url,
      canonical_url: canonicalUrl,
      external_id: extractProjectIdFromUrl(canonicalUrl),
      raw_payload: {
        importedFrom: "api",
      },
      status: "NEW",
    });

    const processing = await app.queueBridge.enqueueOpportunityProcessing({
      opportunityId: opportunity.id,
      reason: "IMPORT_URL",
    });

    return reply.code(202).send({
      duplicated: false,
      opportunityId: opportunity.id,
      processing: {
        enqueued: true,
        runId: processing.runId,
        status: processing.status,
      },
    });
  });

  app.post("/opportunities/:id/process", async (request, reply) => {
    const { id } = opportunityParamsSchema.parse(request.params);
    const opportunity = await app.repositories.opportunities.getById(id);

    if (!opportunity) {
      return reply.code(404).send({
        message: "Opportunity not found",
      });
    }

    const processing = await app.queueBridge.enqueueOpportunityProcessing({
      opportunityId: opportunity.id,
      reason: "PROCESS",
    });

    return reply.code(202).send({
      opportunityId: opportunity.id,
      processing,
    });
  });

  app.post("/opportunities/:id/reprocess", async (request, reply) => {
    const { id } = opportunityParamsSchema.parse(request.params);
    const opportunity = await app.repositories.opportunities.getById(id);

    if (!opportunity) {
      return reply.code(404).send({
        message: "Opportunity not found",
      });
    }

    const updatedOpportunity = await app.repositories.opportunities.update(id, {
      status: "NEW",
      decision: null,
      decision_reasons: [],
      risk_flags: [],
      score: null,
      matched_skills: [],
      missing_skills: [],
      last_seen_at: new Date().toISOString(),
    });

    const processing = await app.queueBridge.enqueueOpportunityProcessing({
      opportunityId: updatedOpportunity.id,
      reason: "REPROCESS",
    });

    return reply.code(202).send({
      opportunityId: updatedOpportunity.id,
      processing,
    });
  });

  app.post("/opportunities/:id/generate-proposal", async (request, reply) => {
    const { id } = opportunityParamsSchema.parse(request.params);
    const opportunity = await app.repositories.opportunities.getById(id);

    if (!opportunity) {
      return reply.code(404).send({
        message: "Opportunity not found",
      });
    }

    const processing = await app.queueBridge.enqueueProposalGeneration({
      opportunityId: opportunity.id,
    });

    return reply.code(202).send({
      opportunityId: opportunity.id,
      processing,
    });
  });
}
