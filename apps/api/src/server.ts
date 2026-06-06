import Fastify from "fastify";
import { ZodError } from "zod";

import { loadApiEnv } from "./env.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerJobRoutes } from "./routes/jobs.routes.js";
import { registerOpportunityRoutes } from "./routes/opportunities.routes.js";
import { registerProposalRoutes } from "./routes/proposals.routes.js";
import { registerSettingsRoutes } from "./routes/settings.routes.js";
import { registerQueuesPlugin } from "./plugins/queues.plugin.js";
import { registerSupabasePlugin } from "./plugins/supabase.plugin.js";

async function buildServer() {
  const env = loadApiEnv();
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        message: "Validation failed",
        issues: error.issues,
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      message: "Internal server error",
    });
  });

  await registerSupabasePlugin(app, env);
  await registerQueuesPlugin(app, env);
  await registerHealthRoutes(app);
  await registerOpportunityRoutes(app);
  await registerProposalRoutes(app);
  await registerSettingsRoutes(app);
  await registerJobRoutes(app);

  return { app, env };
}

async function start() {
  const { app, env } = await buildServer();
  await app.listen({
    host: "0.0.0.0",
    port: env.API_PORT,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((error) => {
    console.error("Failed to start API server", error);
    process.exit(1);
  });
}

export { buildServer };
