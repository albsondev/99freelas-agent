import { loadWorkerEnv } from "./env.js";

async function main() {
  const env = loadWorkerEnv();
  const command = process.argv[2] ?? "dev";

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

