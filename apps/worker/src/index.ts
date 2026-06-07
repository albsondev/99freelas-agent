import {
  authenticate99FreelasSession,
  createSupabaseAdminClient,
  OpportunityRepository,
  prefill99FreelasProposalForm,
  ProposalRepository,
  validate99FreelasSession,
} from "@99freelas/integrations";

import { executeProposalSubmitFlow } from "./commands/proposal-submit.command.js";
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

  if (command === "proposal:prefill") {
    const client = createSupabaseAdminClient({
      supabaseUrl: env.SUPABASE_URL,
      supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    });
    const proposals = new ProposalRepository(client);
    const opportunities = new OpportunityRepository(client);
    const proposalId = readOption("--proposal-id");
    const proposal =
      proposalId !== null
        ? await proposals.getById(proposalId)
        : (await proposals.listRecent(10)).find(
            (item) => item.submissionStatus !== "SUBMITTED",
          ) ?? null;

    if (!proposal) {
      throw new Error(
        proposalId
          ? `Proposal ${proposalId} was not found.`
          : "No pending proposal was found to prefill.",
      );
    }

    const opportunity = await opportunities.getById(proposal.opportunityId);

    if (!opportunity) {
      throw new Error(
        `Opportunity ${proposal.opportunityId} linked to proposal ${proposal.id} was not found.`,
      );
    }

    const prefill = await prefill99FreelasProposalForm({
      amount: proposal.amount,
      deadlineDays: proposal.deadlineDays,
      detailsText: proposal.detailsText,
      headless: env.BROWSER_HEADLESS,
      proposalPageUrl: opportunity.url,
      screenshotPath: `${env.BROWSER_SCREENSHOT_DIR}/proposal-prefill-${proposal.id}.png`,
      storageStatePath: env.BROWSER_STORAGE_STATE_PATH,
    });

    await proposals.update(proposal.id, {
      before_screenshot_path: prefill.screenshotPath ?? null,
    });

    console.log(
      JSON.stringify(
        {
          service: "worker",
          command,
          status: "prefilled",
          proposalId: proposal.id,
          opportunityId: opportunity.id,
          prefill,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "proposal:submit") {
    const result = await executeProposalSubmitFlow({
      env,
      proposalId: readOption("--proposal-id"),
      executeLiveSubmit: process.argv.includes("--live"),
      confirmLiveSubmit: process.argv.includes("--confirm-live-submit"),
    });

    console.log(
      JSON.stringify(
        {
          service: "worker",
          command,
          status: result.liveSubmitted
            ? "submitted"
            : result.submissionStatus === "PENDING"
              ? "mock-ready"
              : "mock-blocked",
          result,
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

function readOption(name: string): string | null {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

main().catch((error) => {
  console.error("Worker failed to start", error);
  process.exit(1);
});
