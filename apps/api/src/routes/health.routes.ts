import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async () => ({
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString(),
  }));

  app.get("/metrics", async (_request, reply) => {
    const memory = process.memoryUsage();

    reply.header("content-type", "text/plain; version=0.0.4");

    return [
      "# HELP process_resident_memory_bytes Resident memory size in bytes.",
      "# TYPE process_resident_memory_bytes gauge",
      `process_resident_memory_bytes ${memory.rss}`,
      "# HELP process_heap_used_bytes Heap used in bytes.",
      "# TYPE process_heap_used_bytes gauge",
      `process_heap_used_bytes ${memory.heapUsed}`,
    ].join("\n");
  });
}
