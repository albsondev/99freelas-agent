import Fastify from "fastify";

import { loadApiEnv } from "./env.js";
import { registerHealthRoutes } from "./routes/health.routes.js";

async function buildServer() {
  const env = loadApiEnv();
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
  });

  await registerHealthRoutes(app);

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

