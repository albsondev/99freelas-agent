import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const PYTHON_RUNNER_SCRIPT_PATH = fileURLToPath(
  new URL("../../../../apps/browser-runner/src/runner.py", import.meta.url),
);
const PROJECT_ROOT = resolve(dirname(PYTHON_RUNNER_SCRIPT_PATH), "..", "..", "..");

export async function authenticate99FreelasSessionViaPython(
  input: PythonRunnerAuthInput,
): Promise<BrowserSessionResult> {
  return runPythonRunnerCommand<BrowserSessionResult>("auth", input, {
    interactive: true,
  });
}

export async function validate99FreelasSessionViaPython(
  input: PythonRunnerAuthInput,
): Promise<BrowserSessionResult> {
  return runPythonRunnerCommand<BrowserSessionResult>("session-check", input);
}

export async function prefill99FreelasProposalFormViaPython(
  input: PythonRunnerPrefillInput,
): Promise<Prefill99FreelasProposalResult> {
  return runPythonRunnerCommand<Prefill99FreelasProposalResult>("proposal-prefill", input);
}

export async function mockSubmit99FreelasProposalViaPython(
  input: PythonRunnerSubmitInput,
): Promise<MockSubmit99FreelasProposalResult> {
  return runPythonRunnerCommand<MockSubmit99FreelasProposalResult>("proposal-submit", {
    ...input,
    executeSubmit: false,
  });
}

export async function submit99FreelasProposalViaPython(
  input: PythonRunnerSubmitInput,
): Promise<ProposalSubmissionBrowserResult> {
  return runPythonRunnerCommand<ProposalSubmissionBrowserResult>("proposal-submit", {
    ...input,
    executeSubmit: true,
  });
}

async function runPythonRunnerCommand<T>(
  command: string,
  payload: unknown,
  options?: {
    interactive?: boolean;
  },
): Promise<T> {
  const workdir = await mkdtemp(resolve(tmpdir(), "99freelas-python-runner-"));
  const inputPath = resolve(workdir, "input.json");
  const outputPath = resolve(workdir, "output.json");

  try {
    await writeFile(inputPath, JSON.stringify(payload, null, 2), "utf8");
    const mirrorStdIO = options?.interactive || hasEnabledObserver(payload);

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(
        extractPythonExecutable(payload),
        [PYTHON_RUNNER_SCRIPT_PATH, command, "--input", inputPath, "--output", outputPath],
        {
          cwd: PROJECT_ROOT,
          env: process.env,
          stdio: mirrorStdIO ? "inherit" : ["ignore", "ignore", "pipe"],
        },
      );

      let stderr = "";

      if (!mirrorStdIO && child.stderr) {
        child.stderr.on("data", (chunk: Buffer | string) => {
          stderr += chunk.toString();
        });
      }

      child.on("error", rejectPromise);
      child.on("exit", (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }

        rejectPromise(
          new Error(
            stderr.trim().length > 0
              ? stderr.trim()
              : `Python browser runner exited with code ${code ?? "unknown"}.`,
          ),
        );
      });
    });

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

function hasEnabledObserver(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null || !("observer" in payload)) {
    return false;
  }

  const observer = payload.observer;

  if (typeof observer !== "object" || observer === null || !("enabled" in observer)) {
    return false;
  }

  return observer.enabled === true;
}
