import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { selectors99Freelas } from "./selectors/99freelas.selectors.js";

export type BrowserSessionResult = {
  isAuthenticated: boolean;
  storageStatePath: string;
  currentUrl: string;
  cookiesCount: number;
  originsCount: number;
  detectedSignals: string[];
};

export type Authenticate99FreelasOptions = {
  headless?: boolean;
  storageStatePath: string;
  userDataDir?: string;
  timeoutMs?: number;
};

export type Open99FreelasSessionContextOptions = {
  headless?: boolean;
  storageStatePath: string;
  userDataDir?: string;
};

export type Open99FreelasSessionContextResult = {
  mode: "storage-state" | "persistent-profile";
  context: BrowserContext;
  close: () => Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const AUTH_COOKIE_HINTS = ["freelas", "session", "auth", "token"];

export async function authenticate99FreelasSession(
  options: Authenticate99FreelasOptions,
): Promise<BrowserSessionResult> {
  const storageStatePath = resolveProjectPath(options.storageStatePath);
  const userDataDir = resolveProjectPath(
    options.userDataDir ?? "./.auth/99freelas.chrome-profile",
  );
  await mkdir(dirname(storageStatePath), { recursive: true });
  await mkdir(userDataDir, { recursive: true });

  const context = await launchPreferredPersistentContext({
    headless: false,
    userDataDir,
  });

  try {
    const page = await context.newPage();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    await page.goto(selectors99Freelas.homeUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    await page.goto(selectors99Freelas.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    printAuthInstructions(storageStatePath, options.headless ?? false);
    await promptForManualConfirmation();

    const result = await inspect99FreelasSession({
      context,
      page,
      storageStatePath,
      timeoutMs,
    });

    if (!result.isAuthenticated) {
      throw new Error(
        "Sessao ainda nao parece autenticada. Faça login completo no navegador e rode o comando novamente.",
      );
    }

    await context.storageState({
      path: storageStatePath,
      indexedDB: true,
    });

    return result;
  } finally {
    await context.close();
  }
}

export async function validate99FreelasSession(
  options: Authenticate99FreelasOptions,
): Promise<BrowserSessionResult> {
  const opened = await open99FreelasSessionContext(options);

  try {
    const page = await opened.context.newPage();

    await page.goto(selectors99Freelas.dashboardUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    return inspect99FreelasSession({
      context: opened.context,
      page,
      storageStatePath: resolveProjectPath(options.storageStatePath),
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
  } finally {
    await opened.close();
  }
}

export async function open99FreelasSessionContext(
  options: Open99FreelasSessionContextOptions,
): Promise<Open99FreelasSessionContextResult> {
  const storageStatePath = resolveProjectPath(options.storageStatePath);
  const userDataDir = resolveProjectPath(
    options.userDataDir ?? "./.auth/99freelas.chrome-profile",
  );

  if (existsSync(storageStatePath)) {
    const browser = await launchPreferredBrowser({
      headless: options.headless ?? true,
    });
    const context = await browser.newContext({
      storageState: storageStatePath,
    });

    return {
      mode: "storage-state",
      context,
      close: async () => {
        await browser.close();
      },
    };
  }

  await mkdir(userDataDir, { recursive: true });
  const context = await launchPreferredPersistentContext({
    headless: options.headless ?? false,
    userDataDir,
  });

  return {
    mode: "persistent-profile",
    context,
    close: async () => {
      await context.close();
    },
  };
}

type InspectSessionInput = {
  context: BrowserContext;
  page: Page;
  storageStatePath: string;
  timeoutMs: number;
};

async function inspect99FreelasSession(
  input: InspectSessionInput,
): Promise<BrowserSessionResult> {
  await input.page.waitForLoadState("domcontentloaded", {
    timeout: input.timeoutMs,
  });

  const currentUrl = input.page.url();
  const cookies = await input.context.cookies();
  const storageState = await input.context.storageState({ indexedDB: true });
  const bodyText = await readBodyText(input.page);
  const detectedSignals: string[] = [];

  const hasAuthenticatedMarker = await pageHasAnySelector(
    input.page,
    selectors99Freelas.authenticatedMarkers,
  );

  if (hasAuthenticatedMarker) {
    detectedSignals.push("authenticated-marker");
  }

  const hasLoginMarker = await pageHasAnySelector(
    input.page,
    selectors99Freelas.loginMarkers,
  );

  if (hasLoginMarker) {
    detectedSignals.push("login-marker");
  }

  const hasAuthCookie = cookies.some((cookie) =>
    AUTH_COOKIE_HINTS.some((hint) =>
      `${cookie.name} ${cookie.domain}`.toLowerCase().includes(hint),
    ),
  );

  if (hasAuthCookie) {
    detectedSignals.push("auth-cookie");
  }

  if (!/entrar|acessar|minha conta|faça login/i.test(bodyText)) {
    detectedSignals.push("body-without-login-copy");
  }

  const isLoginLikeUrl =
    /\/login\b|\/entrar\b|\/cadastro\b/i.test(currentUrl);

  const isAuthenticated =
    !isLoginLikeUrl &&
    (hasAuthenticatedMarker || hasAuthCookie || detectedSignals.includes("body-without-login-copy"));

  return {
    isAuthenticated,
    storageStatePath: input.storageStatePath,
    currentUrl,
    cookiesCount: cookies.length,
    originsCount: storageState.origins.length,
    detectedSignals,
  };
}

async function pageHasAnySelector(page: Page, selectors: readonly string[]): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count();

    if (count === 0) {
      continue;
    }

    if (await locator.isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

async function readBodyText(page: Page): Promise<string> {
  try {
    const text = await page.locator("body").innerText({
      timeout: 5_000,
    });

    return text;
  } catch {
    return "";
  }
}

async function promptForManualConfirmation(): Promise<void> {
  const rl = createInterface({ input, output });

  try {
    const answer = await rl.question(
      "Depois de concluir o login no navegador, pressione Enter para salvar a sessao. Digite 'cancelar' para abortar: ",
    );

    if (answer.trim().toLowerCase() === "cancelar") {
      throw new Error("Autenticacao cancelada manualmente.");
    }
  } finally {
    rl.close();
  }
}

function printAuthInstructions(storageStatePath: string, requestedHeadless: boolean): void {
  console.log(
    JSON.stringify(
      {
        service: "worker",
        command: "auth:99freelas",
        status: "awaiting-manual-login",
        loginUrl: selectors99Freelas.loginUrl,
        storageStatePath,
        note:
          "O navegador abriu em modo visual para voce concluir o login manualmente e salvar a sessao.",
        requestedHeadless,
      },
      null,
      2,
    ),
  );
}

async function launchPreferredPersistentContext(input: {
  headless: boolean;
  userDataDir: string;
}): Promise<BrowserContext> {
  const launchers: Array<{
    label: string;
    launch: () => Promise<BrowserContext>;
  }> = [
    {
      label: "chrome-persistent",
      launch: () =>
        chromium.launchPersistentContext(input.userDataDir, {
          channel: "chrome",
          headless: input.headless,
        }),
    },
    {
      label: "chromium-persistent",
      launch: () =>
        chromium.launchPersistentContext(input.userDataDir, {
          headless: input.headless,
        }),
    },
  ];

  let lastError: unknown = null;

  for (const launcher of launchers) {
    try {
      return await launcher.launch();
    } catch (error) {
      lastError = error;
      console.warn(
        JSON.stringify(
          {
            service: "worker",
            command: "auth:99freelas",
            status: "browser-launch-fallback",
            browser: launcher.label,
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to launch a persistent browser context for 99Freelas auth.");
}

async function launchPreferredBrowser(input: {
  headless: boolean;
}): Promise<Browser> {
  const launchers: Array<{
    label: string;
    launch: () => Promise<Browser>;
  }> = [
    {
      label: "chrome",
      launch: () =>
        chromium.launch({
          channel: "chrome",
          headless: input.headless,
        }),
    },
    {
      label: "chromium",
      launch: () =>
        chromium.launch({
          headless: input.headless,
        }),
    },
  ];

  let lastError: unknown = null;

  for (const launcher of launchers) {
    try {
      return await launcher.launch();
    } catch (error) {
      lastError = error;
      console.warn(
        JSON.stringify(
          {
            service: "worker",
            command: "auth:99freelas",
            status: "browser-launch-fallback",
            browser: launcher.label,
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to launch a supported browser for 99Freelas auth.");
}

function resolveProjectPath(targetPath: string): string {
  if (targetPath.startsWith("/")) {
    return targetPath;
  }

  return resolve(findWorkspaceRoot(process.cwd()), targetPath);
}

function findWorkspaceRoot(startDir: string): string {
  let currentDir = resolve(startDir);

  while (true) {
    if (existsSync(join(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}
