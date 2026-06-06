import { loadWorkerEnv } from "./env.js";
import { registerWorkers } from "./queues/register-workers.js";

async function main() {
  const env = loadWorkerEnv();
  const command = process.argv[2] ?? "dev";

  if (command === "dev" || command === "start") {
    const runtime = await registerWorkers(env);

    const shutdown = async () => {
      await runtime.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    console.log(
      JSON.stringify(
        {
          service: "worker",
          command,
          mode: env.AUTOMATION_MODE,
          status: "listening",
          redisUrl: env.REDIS_URL,
        },
        null,
        2,
      ),
    );

    return;
  }

  console.log(
    JSON.stringify(
      {
        service: "worker",
        command,
        mode: env.AUTOMATION_MODE,
        status: "bootstrapped",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Worker failed to start", error);
  process.exit(1);
});
