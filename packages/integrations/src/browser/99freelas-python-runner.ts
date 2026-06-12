import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { BrowserSessionResult } from "./99freelas-auth.js";
import type {
  Collect99FreelasProjectListingsResult,
  ProjectListingSourceKind,
} from "./99freelas-project-list.js";
import type {
  Scrape99FreelasProjectPageInput,
  Scrape99FreelasProjectPageResult,
} from "./99freelas-project-page.js";
import type {
  Inspect99FreelasProposalPageResult,
  Prefill99FreelasProposalInput,
  Prefill99FreelasProposalResult,
} from "./99freelas-proposal-form.js";
import type {
  MockSubmit99FreelasProposalResult,
  ProposalSubmissionBrowserResult,
  Submit99FreelasProposalInput,
} from "./99freelas-proposal-submit.js";

export type PythonBrowserName = "chromium" | "firefox" | "webkit";

export type PythonRunnerConfig = {
  browserName: PythonBrowserName;
  daemonHost?: string;
  daemonPort?: number;
  headless?: boolean;
  profileDir: string;
  pythonExecutable: string;
  screenshotDir?: string;
  storageStatePath: string;
};

type PythonRunnerBaseInput = PythonRunnerConfig & {
  timeoutMs?: number;
};

type PythonRunnerAuthInput = PythonRunnerBaseInput;

type PythonRunnerPrefillInput = PythonRunnerBaseInput &
  Omit<
    Prefill99FreelasProposalInput,
    | "headless"
    | "sessionMode"
    | "storageStatePath"
    | "userDataDir"
    | "chromeProfileDirectory"
  >;

type PythonRunnerInspectProposalPageInput = PythonRunnerBaseInput & {
  proposalPageUrl: string;
};

type PythonRunnerSubmitInput = PythonRunnerBaseInput &
  Omit<
    Submit99FreelasProposalInput,
    | "headless"
    | "sessionMode"
    | "storageStatePath"
    | "userDataDir"
    | "chromeProfileDirectory"
  >;

export type Collect99FreelasProjectListingsInput = PythonRunnerBaseInput & {
  limit?: number;
  listingUrl: string;
  sourceKind: ProjectListingSourceKind;
};

export type Scrape99FreelasProjectPageViaPythonInput = PythonRunnerBaseInput &
  Scrape99FreelasProjectPageInput;

type DaemonCommandName =
  | "health"
  | "auth"
  | "session-check"
  | "project-list-collect"
  | "project-page-scrape"
  | "proposal-page-inspect"
  | "proposal-prefill"
  | "proposal-submit"
  | "shutdown";

type DirectCommandName = Exclude<DaemonCommandName, "health" | "shutdown">;

type DaemonEnvelope<T> =
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      error: string;
    };

const PYTHON_RUNNER_SCRIPT_PATH = fileURLToPath(
  new URL("../../../../apps/browser-runner/src/runner.py", import.meta.url),
);
const PROJECT_ROOT = resolve(dirname(PYTHON_RUNNER_SCRIPT_PATH), "..", "..", "..");
const DEFAULT_DAEMON_HOST = "127.0.0.1";
const DEFAULT_DAEMON_PORT = 44731;

type DaemonHealthResult = {
  status: string;
  browserName?: string;
  headless?: boolean;
  storageStatePath?: string;
  profileDir?: string;
};

export async function authenticate99FreelasSessionViaPython(
  input: PythonRunnerAuthInput,
): Promise<BrowserSessionResult> {
  await shutdown99FreelasPythonRunnerDaemon(input).catch(() => undefined);
  return runPythonCommandDirect<BrowserSessionResult>("auth", input, 16 * 60_000);
}

export async function validate99FreelasSessionViaPython(
  input: PythonRunnerAuthInput,
): Promise<BrowserSessionResult> {
  return runWithDaemonFallback<BrowserSessionResult>(
    "session-check",
    input,
    input.timeoutMs ?? 45_000,
  );
}

export async function prefill99FreelasProposalFormViaPython(
  input: PythonRunnerPrefillInput,
): Promise<Prefill99FreelasProposalResult> {
  return runWithDaemonFallback<Prefill99FreelasProposalResult>(
    "proposal-prefill",
    input,
    input.timeoutMs ?? 60_000,
  );
}

export async function inspect99FreelasProposalPageViaPython(
  input: PythonRunnerInspectProposalPageInput,
): Promise<Inspect99FreelasProposalPageResult> {
  return runWithDaemonFallback<Inspect99FreelasProposalPageResult>(
    "proposal-page-inspect",
    input,
    input.timeoutMs ?? 120_000,
  );
}

export async function collect99FreelasProjectListingsViaPython(
  input: Collect99FreelasProjectListingsInput,
): Promise<Collect99FreelasProjectListingsResult> {
  return runWithDaemonFallback<Collect99FreelasProjectListingsResult>(
    "project-list-collect",
    input,
    input.timeoutMs ?? 90_000,
  );
}

export async function scrape99FreelasProjectPageViaPython(
  input: Scrape99FreelasProjectPageViaPythonInput,
): Promise<Scrape99FreelasProjectPageResult> {
  return runWithDaemonFallback<Scrape99FreelasProjectPageResult>(
    "project-page-scrape",
    input,
    input.timeoutMs ?? 90_000,
  );
}

export async function mockSubmit99FreelasProposalViaPython(
  input: PythonRunnerSubmitInput,
): Promise<MockSubmit99FreelasProposalResult> {
  return runWithDaemonFallback<MockSubmit99FreelasProposalResult>(
    "proposal-submit",
    {
      ...input,
      executeSubmit: false,
    },
    input.timeoutMs ?? 90_000,
  );
}

export async function submit99FreelasProposalViaPython(
  input: PythonRunnerSubmitInput,
): Promise<ProposalSubmissionBrowserResult> {
  return runWithDaemonFallback<ProposalSubmissionBrowserResult>(
    "proposal-submit",
    {
      ...input,
      executeSubmit: true,
    },
    input.timeoutMs ?? 120_000,
  );
}

export async function shutdown99FreelasPythonRunnerDaemon(
  input: PythonRunnerConfig,
): Promise<void> {
  const healthy = await isDaemonHealthy(input);
  if (!healthy) {
    return;
  }

  await sendDaemonCommand("shutdown", input, 5_000).catch(() => undefined);
}

async function ensurePythonRunnerDaemon(input: PythonRunnerConfig): Promise<void> {
  const health = await getDaemonHealth(input);
  if (health && isCompatibleDaemonHealth(health, input)) {
    return;
  }

  if (health) {
    await sendDaemonCommand("shutdown", input, 5_000).catch(() => undefined);
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 500);
    });
  }

  const workdir = await mkdtemp(resolve(tmpdir(), "99freelas-python-daemon-"));
  const inputPath = resolve(workdir, "daemon-input.json");
  const outputPath = resolve(workdir, "daemon-output.json");

  try {
    await writeFile(inputPath, JSON.stringify(input, null, 2), "utf8");

    const child = spawn(
      extractPythonExecutable(input),
      [PYTHON_RUNNER_SCRIPT_PATH, "serve", "--input", inputPath, "--output", outputPath],
      {
        cwd: PROJECT_ROOT,
        detached: true,
        env: process.env,
        stdio: "ignore",
      },
    );
    child.unref();

    await waitForDaemonHealthy(input, 45_000);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

async function runWithDaemonFallback<T>(
  command: DirectCommandName,
  payload: unknown,
  timeoutMs: number,
): Promise<T> {
  if (command === "auth") {
    return runPythonCommandDirect<T>(command, payload, timeoutMs);
  }

  if (!wantsVisibleBrowser(payload)) {
    return runPythonCommandDirect<T>(command, payload, timeoutMs);
  }

  return runVisibleCommandWithDaemon<T>(
    command,
    payload as PythonRunnerConfig,
    timeoutMs,
  );
}

async function runVisibleCommandWithDaemon<T>(
  command: DirectCommandName,
  payload: PythonRunnerConfig,
  timeoutMs: number,
): Promise<T> {
  let firstError: unknown;

  try {
    await ensurePythonRunnerDaemon(payload);
    return await sendDaemonCommand<T>(command, payload, timeoutMs);
  } catch (error) {
    firstError = error;
  }

  await shutdown99FreelasPythonRunnerDaemon(payload).catch(() => undefined);
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, 350);
  });

  try {
    await ensurePythonRunnerDaemon(payload);
    return await sendDaemonCommand<T>(command, payload, timeoutMs);
  } catch (error) {
    const primaryMessage =
      error instanceof Error
        ? error.message
        : "Visible Python browser daemon command failed.";
    const retryMessage =
      firstError instanceof Error ? ` First attempt: ${firstError.message}` : "";
    throw new Error(`${primaryMessage}${retryMessage}`);
  }
}

function wantsVisibleBrowser(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "headless" in payload &&
    payload.headless === false
  );
}

async function isDaemonHealthy(input: PythonRunnerConfig): Promise<boolean> {
  const health = await getDaemonHealth(input);
  return health?.status === "ready" && isCompatibleDaemonHealth(health, input);
}

async function getDaemonHealth(input: PythonRunnerConfig): Promise<DaemonHealthResult | null> {
  try {
    return await sendDaemonCommand<DaemonHealthResult>("health", input, 4_000);
  } catch {
    return null;
  }
}

async function waitForDaemonHealthy(
  input: PythonRunnerConfig,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isDaemonHealthy(input)) {
      return;
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 300);
    });
  }

  throw new Error("Python browser daemon did not become healthy in time.");
}

async function sendDaemonCommand<T = unknown>(
  command: DaemonCommandName,
  payload: unknown,
  timeoutMs: number,
): Promise<T> {
  const host = extractDaemonHost(payload);
  const port = extractDaemonPort(payload);

  return new Promise<T>((resolvePromise, rejectPromise) => {
    const socket = createConnection({ host, port });
    let buffer = "";
    let settled = false;

    const timer = setTimeout(() => {
      socket.destroy();
      if (!settled) {
        settled = true;
        rejectPromise(new Error(`Timed out waiting for Python browser daemon command ${command}.`));
      }
    }, timeoutMs + 15_000);

    socket.on("connect", () => {
      socket.write(
        `${JSON.stringify({ command, payload }, null, 0)}\n`,
        "utf8",
      );
    });

    socket.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();

      if (!buffer.includes("\n")) {
        return;
      }

      clearTimeout(timer);
      socket.end();

      if (settled) {
        return;
      }

      settled = true;

      try {
        const line = buffer.split("\n")[0] ?? "";
        const envelope = JSON.parse(line) as DaemonEnvelope<T>;

        if (!envelope.ok) {
          rejectPromise(new Error(envelope.error));
          return;
        }

        resolvePromise(envelope.result);
      } catch (error) {
        rejectPromise(error);
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        rejectPromise(error);
      }
    });

    socket.on("close", () => {
      clearTimeout(timer);
      if (!settled && buffer.length === 0) {
        settled = true;
        rejectPromise(new Error("Python browser daemon connection closed before any response."));
      }
    });
  });
}

async function runPythonCommandDirect<T>(
  command: DirectCommandName,
  payload: unknown,
  timeoutMs: number,
  cause?: unknown,
): Promise<T> {
  const workdir = await mkdtemp(resolve(tmpdir(), "99freelas-python-direct-"));
  const inputPath = resolve(workdir, "runner-input.json");
  const outputPath = resolve(workdir, "runner-output.json");

  try {
    await writeFile(inputPath, JSON.stringify(payload, null, 2), "utf8");

    const stderrChunks: Buffer[] = [];
    const child = spawn(
      extractPythonExecutable(payload),
      [PYTHON_RUNNER_SCRIPT_PATH, command, "--input", inputPath, "--output", outputPath],
      {
        cwd: PROJECT_ROOT,
        env: process.env,
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.from(chunk));
    });

    const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
      let settled = false;
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        if (!settled) {
          settled = true;
          rejectPromise(
            new Error(`Timed out waiting for Python runner direct command ${command}.`),
          );
        }
      }, timeoutMs + 15_000);

      child.on("error", (error) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          rejectPromise(error);
        }
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolvePromise(code ?? 0);
        }
      });
    });

    if (exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      const directMessage =
        stderr.length > 0
          ? `Python runner direct command ${command} failed: ${stderr}`
          : `Python runner direct command ${command} exited with code ${exitCode}.`;
      const daemonMessage = cause instanceof Error ? ` Daemon fallback cause: ${cause.message}` : "";
      throw new Error(`${directMessage}${daemonMessage}`);
    }

    const raw = await readFile(outputPath, "utf8");
    return JSON.parse(raw) as T;
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

function extractPythonExecutable(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "pythonExecutable" in payload &&
    typeof payload.pythonExecutable === "string" &&
    payload.pythonExecutable.length > 0
  ) {
    return payload.pythonExecutable;
  }

  return "python3";
}

function extractDaemonHost(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "daemonHost" in payload &&
    typeof payload.daemonHost === "string" &&
    payload.daemonHost.length > 0
  ) {
    return payload.daemonHost;
  }

  return DEFAULT_DAEMON_HOST;
}

function extractDaemonPort(payload: unknown): number {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "daemonPort" in payload &&
    typeof payload.daemonPort === "number" &&
    Number.isFinite(payload.daemonPort)
  ) {
    return payload.daemonPort;
  }

  return DEFAULT_DAEMON_PORT;
}

function isCompatibleDaemonHealth(
  health: DaemonHealthResult,
  input: PythonRunnerConfig,
): boolean {
  return (
    health.status === "ready" &&
    health.browserName === input.browserName &&
    health.headless === input.headless &&
    health.storageStatePath === input.storageStatePath &&
    health.profileDir === input.profileDir
  );
}
