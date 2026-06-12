import {
  authenticate99FreelasSession,
  authenticate99FreelasSessionViaPython,
  createSupabaseAdminClient,
  OpportunityRepository,
  prefill99FreelasProposalForm,
  prefill99FreelasProposalFormViaPython,
  ProposalRepository,
  shutdown99FreelasPythonRunnerDaemon,
  validate99FreelasSessionViaPython,
  validate99FreelasSession,
} from "@99freelas/integrations";

import {
  executeProposalObserveFlow,
  executeProposalSubmitFlow,
} from "./commands/proposal-submit.command.js";
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
    if (env.BROWSER_AUTOMATION_RUNTIME === "python-playwright") {
      const session = await authenticate99FreelasSessionViaPython({
        browserName: env.PYTHON_BROWSER_NAME,
        headless: false,
        profileDir: env.PYTHON_BROWSER_PROFILE_DIR,
        pythonExecutable: env.PYTHON_EXECUTABLE,
        screenshotDir: env.BROWSER_SCREENSHOT_DIR,
        storageStatePath: env.PYTHON_BROWSER_STORAGE_STATE_PATH,
      });

      console.log(
        JSON.stringify(
          {
            service: "worker",
            command,
            runtime: env.BROWSER_AUTOMATION_RUNTIME,
            status: "session-saved",
            session,
          },
          null,
          2,
        ),
      );
      return;
    }

    assertWorkerControlledBrowserMode(env.BROWSER_SESSION_MODE, command);

    if (!shouldForce) {
      try {
        const existingSession = await validate99FreelasSession({
          headless: true,
          sessionMode: env.BROWSER_SESSION_MODE,
          storageStatePath: env.BROWSER_STORAGE_STATE_PATH,
          chromeProfileDirectory: env.BROWSER_CHROME_PROFILE_DIRECTORY,
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
      sessionMode: env.BROWSER_SESSION_MODE,
      storageStatePath: env.BROWSER_STORAGE_STATE_PATH,
      userDataDir: env.BROWSER_USER_DATA_DIR,
      chromeProfileDirectory: env.BROWSER_CHROME_PROFILE_DIRECTORY,
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
    if (env.BROWSER_AUTOMATION_RUNTIME === "python-playwright") {
      const session = await validate99FreelasSessionViaPython({
        browserName: env.PYTHON_BROWSER_NAME,
        headless: env.BROWSER_HEADLESS,
        profileDir: env.PYTHON_BROWSER_PROFILE_DIR,
        pythonExecutable: env.PYTHON_EXECUTABLE,
        screenshotDir: env.BROWSER_SCREENSHOT_DIR,
        storageStatePath: env.PYTHON_BROWSER_STORAGE_STATE_PATH,
      });

      console.log(
        JSON.stringify(
          {
            service: "worker",
            command,
            runtime: env.BROWSER_AUTOMATION_RUNTIME,
            status: session.isAuthenticated ? "session-valid" : "session-invalid",
            session,
          },
          null,
          2,
        ),
      );
      return;
    }

    assertWorkerControlledBrowserMode(env.BROWSER_SESSION_MODE, command);

    const session = await validate99FreelasSession({
      headless: true,
      sessionMode: env.BROWSER_SESSION_MODE,
      storageStatePath: env.BROWSER_STORAGE_STATE_PATH,
      chromeProfileDirectory: env.BROWSER_CHROME_PROFILE_DIRECTORY,
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

  if (command === "session:shutdown") {
    if (env.BROWSER_AUTOMATION_RUNTIME === "python-playwright") {
      await shutdown99FreelasPythonRunnerDaemon({
        browserName: env.PYTHON_BROWSER_NAME,
        headless: env.BROWSER_HEADLESS,
        profileDir: env.PYTHON_BROWSER_PROFILE_DIR,
        pythonExecutable: env.PYTHON_EXECUTABLE,
        screenshotDir: env.BROWSER_SCREENSHOT_DIR,
        storageStatePath: env.PYTHON_BROWSER_STORAGE_STATE_PATH,
      });

      console.log(
        JSON.stringify(
          {
            service: "worker",
            command,
            runtime: env.BROWSER_AUTOMATION_RUNTIME,
            status: "daemon-stopped",
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
          runtime: env.BROWSER_AUTOMATION_RUNTIME,
          status: "not-applicable",
          message:
            'session:shutdown e necessario apenas no runtime "python-playwright".',
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "proposal:prefill") {
    if (env.BROWSER_AUTOMATION_RUNTIME !== "python-playwright") {
      assertWorkerControlledBrowserMode(env.BROWSER_SESSION_MODE, command);
    }

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

    const prefill =
      env.BROWSER_AUTOMATION_RUNTIME === "python-playwright"
        ? await prefill99FreelasProposalFormViaPython({
            amount: proposal.amount,
            browserName: env.PYTHON_BROWSER_NAME,
            deadlineDays: proposal.deadlineDays,
            detailsText: proposal.detailsText,
            headless: env.BROWSER_HEADLESS,
            profileDir: env.PYTHON_BROWSER_PROFILE_DIR,
            proposalPageUrl: opportunity.url,
            pythonExecutable: env.PYTHON_EXECUTABLE,
            screenshotDir: env.BROWSER_SCREENSHOT_DIR,
            screenshotPath: `${env.BROWSER_SCREENSHOT_DIR}/proposal-prefill-${proposal.id}.png`,
            storageStatePath: env.PYTHON_BROWSER_STORAGE_STATE_PATH,
          })
        : await prefill99FreelasProposalForm({
            amount: proposal.amount,
            deadlineDays: proposal.deadlineDays,
            detailsText: proposal.detailsText,
            headless: env.BROWSER_HEADLESS,
            proposalPageUrl: opportunity.url,
            sessionMode: env.BROWSER_SESSION_MODE,
            screenshotPath: `${env.BROWSER_SCREENSHOT_DIR}/proposal-prefill-${proposal.id}.png`,
            storageStatePath: env.BROWSER_STORAGE_STATE_PATH,
            userDataDir: env.BROWSER_USER_DATA_DIR,
            chromeProfileDirectory: env.BROWSER_CHROME_PROFILE_DIRECTORY,
          });

    await proposals.update(proposal.id, {
      before_screenshot_path: prefill.screenshotPath ?? null,
    });

    console.log(
      JSON.stringify(
        {
          service: "worker",
          command,
          runtime: env.BROWSER_AUTOMATION_RUNTIME,
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
      observeBrowser: process.argv.includes("--observe"),
      stepDelayMs: readNumberOption("--step-delay-ms"),
      holdOpenMs: readNumberOption("--hold-ms"),
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

  if (command === "proposal:observe") {
    const result = await executeProposalObserveFlow({
      env,
      proposalId: readOption("--proposal-id"),
      stepDelayMs: readNumberOption("--step-delay-ms"),
      holdOpenMs: readNumberOption("--hold-ms"),
    });

    console.log(
      JSON.stringify(
        {
          service: "worker",
          command,
          status: result.submissionStatus === "PENDING" ? "observation-complete" : "observation-blocked",
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

function assertWorkerControlledBrowserMode(
  sessionMode: string,
  command: "auth:99freelas" | "session:check" | "proposal:prefill",
): void {
  if (sessionMode !== "shared-profile") {
    return;
  }

  throw new Error(
    [
      `O comando ${command} nao deve rodar com BROWSER_SESSION_MODE="shared-profile".`,
      "Nesse modo, o Chrome principal pode reutilizar a sessao ja aberta e o Playwright perder o controle da nova janela.",
      'Use BROWSER_SESSION_MODE="dedicated-profile" para automacao controlada do worker.',
      "Se a ideia for acompanhar o Chrome real, prefira o fluxo live/manual observado fora do worker controlado.",
    ].join(" "),
  );
}

function readOption(name: string): string | null {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function readNumberOption(name: string): number | undefined {
  const value = readOption(name);

  if (value === null) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

main().catch((error) => {
  console.error("Worker failed to start", error);
  process.exit(1);
});
