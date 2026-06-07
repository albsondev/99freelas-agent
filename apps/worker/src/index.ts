import {
  authenticate99FreelasSession,
  validate99FreelasSession,
} from "@99freelas/integrations";

import { loadWorkerEnv } from "./env.js";
import { registerWorkers } from "./queues/register-workers.js";

async function main() {
  const env = loadWorkerEnv();
  const command = process.argv[2] ?? "dev";
  const shouldForce = process.argv.includes("--force");

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

  if (command === "auth:99freelas") {
    if (!shouldForce) {
      try {
        const existingSession = await validate99FreelasSession({
          headless: true,
          storageStatePath: env.BROWSER_STORAGE_STATE_PATH,
        });

        if (existingSession.isAuthenticated) {
          console.log(
            JSON.stringify(
              {
                service: "worker",
                command,
                status: "session-already-valid",
                session: existingSession,
              },
              null,
              2,
            ),
          );
          return;
        }
      } catch {
        // If the file is missing or the browser cannot restore state, continue to manual auth.
      }
    }

    const session = await authenticate99FreelasSession({
      headless: env.BROWSER_HEADLESS,
      storageStatePath: env.BROWSER_STORAGE_STATE_PATH,
      userDataDir: env.BROWSER_USER_DATA_DIR,
    });

    console.log(
      JSON.stringify(
        {
          service: "worker",
          command,
          status: "session-saved",
          session,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "session:check") {
    const session = await validate99FreelasSession({
      headless: true,
      storageStatePath: env.BROWSER_STORAGE_STATE_PATH,
    });

    console.log(
      JSON.stringify(
        {
          service: "worker",
          command,
          status: session.isAuthenticated ? "session-valid" : "session-invalid",
          session,
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
