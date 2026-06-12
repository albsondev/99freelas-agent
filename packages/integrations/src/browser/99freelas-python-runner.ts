import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { BrowserSessionResult } from "./99freelas-auth.js";
import type {
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

type PythonRunnerSubmitInput = PythonRunnerBaseInput &
  Omit<
    Submit99FreelasProposalInput,
    | "headless"
    | "sessionMode"
    | "storageStatePath"
    | "userDataDir"
    | "chromeProfileDirectory"
  >;

type DaemonCommandName =
  | "health"
  | "auth"
  | "session-check"
  | "proposal-prefill"
  | "proposal-submit"
  | "shutdown";

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

export async function authenticate99FreelasSessionViaPython(
  input: PythonRunnerAuthInput,
): Promise<BrowserSessionResult> {
  await ensurePythonRunnerDaemon(input);
  return sendDaemonCommand<BrowserSessionResult>("auth", input, 16 * 60_000);
}

export async function validate99FreelasSessionViaPython(
  input: PythonRunnerAuthInput,
): Promise<BrowserSessionResult> {
  await ensurePythonRunnerDaemon(input);
  return sendDaemonCommand<BrowserSessionResult>("session-check", input, input.timeoutMs ?? 45_000);
}

export async function prefill99FreelasProposalFormViaPython(
  input: PythonRunnerPrefillInput,
): Promise<Prefill99FreelasProposalResult> {
  await ensurePythonRunnerDaemon(input);
  return sendDaemonCommand<Prefill99FreelasProposalResult>(
    "proposal-prefill",
    input,
    input.timeoutMs ?? 60_000,
  );
}

export async function mockSubmit99FreelasProposalViaPython(
  input: PythonRunnerSubmitInput,
): Promise<MockSubmit99FreelasProposalResult> {
  await ensurePythonRunnerDaemon(input);
  return sendDaemonCommand<MockSubmit99FreelasProposalResult>(
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
  await ensurePythonRunnerDaemon(input);
  return sendDaemonCommand<ProposalSubmissionBrowserResult>(
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
  if (await isDaemonHealthy(input)) {
    return;
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

    await waitForDaemonHealthy(input, 15_000);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

async function isDaemonHealthy(input: PythonRunnerConfig): Promise<boolean> {
  try {
    const result = await sendDaemonCommand<{ status: string }>("health", input, 1_500);
    return result.status === "ready";
  } catch {
    return false;
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
    }, timeoutMs);

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
