import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { platform, stdin as input, stdout as output } from "node:process";

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

export type BrowserSessionMode =
  | "auto"
  | "storage-state"
  | "dedicated-profile"
  | "shared-profile";

export type Authenticate99FreelasOptions = {
  headless?: boolean;
  sessionMode?: BrowserSessionMode;
  storageStatePath: string;
  userDataDir?: string;
  chromeProfileDirectory?: string;
  timeoutMs?: number;
};

export type Open99FreelasSessionContextOptions = {
  headless?: boolean;
  sessionMode?: BrowserSessionMode;
  storageStatePath: string;
  userDataDir?: string;
  chromeProfileDirectory?: string;
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
  const sessionMode = options.sessionMode ?? "dedicated-profile";
  const userDataDir = resolveBrowserUserDataDir({
    sessionMode,
    ...(options.userDataDir ? { userDataDir: options.userDataDir } : {}),
  });
  await mkdir(dirname(storageStatePath), { recursive: true });
  await ensureBrowserUserDataDir({
    sessionMode,
    userDataDir,
  });

  const context = await launchPreferredPersistentContext({
    headless: false,
    sessionMode,
    userDataDir,
    ...(options.chromeProfileDirectory
      ? { chromeProfileDirectory: options.chromeProfileDirectory }
      : {}),
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

    printAuthInstructions({
      storageStatePath,
      userDataDir,
      requestedHeadless: options.headless ?? false,
    });
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

    await persistStorageState({
      context,
      storageStatePath,
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
  const userDataDir = resolveBrowserUserDataDir({
    sessionMode: options.sessionMode ?? "dedicated-profile",
    ...(options.userDataDir ? { userDataDir: options.userDataDir } : {}),
  });
  const sessionMode = options.sessionMode ?? "dedicated-profile";

  if (sessionMode === "storage-state") {
    if (!existsSync(storageStatePath)) {
      throw new Error(
        `Storage state file was not found at ${storageStatePath}. Rode auth:99freelas ou use BROWSER_SESSION_MODE="dedicated-profile".`,
      );
    }

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

  if (sessionMode === "auto" && existsSync(storageStatePath)) {
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

  await ensureBrowserUserDataDir({
    sessionMode,
    userDataDir,
  });
  const context = await launchPreferredPersistentContext({
    headless: options.headless ?? false,
    sessionMode,
    userDataDir,
    ...(options.chromeProfileDirectory
      ? { chromeProfileDirectory: options.chromeProfileDirectory }
      : {}),
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
  const storageState = await readContextStorageState(input.context);
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

function printAuthInstructions(input: {
  storageStatePath: string;
  userDataDir: string;
  requestedHeadless: boolean;
}): void {
  console.log(
    JSON.stringify(
      {
        service: "worker",
        command: "auth:99freelas",
        status: "awaiting-manual-login",
        loginUrl: selectors99Freelas.loginUrl,
        storageStatePath: input.storageStatePath,
        userDataDir: input.userDataDir,
        note:
          "O navegador abriu em uma nova janela do Chrome para voce concluir o login manualmente e salvar a sessao.",
        requestedHeadless: input.requestedHeadless,
      },
      null,
      2,
    ),
  );
}

async function launchPreferredPersistentContext(input: {
  headless: boolean;
  userDataDir: string;
  sessionMode: BrowserSessionMode;
  chromeProfileDirectory?: string;
}): Promise<BrowserContext> {
  const launchArgs =
    input.sessionMode === "shared-profile" && input.chromeProfileDirectory
      ? [`--profile-directory=${input.chromeProfileDirectory}`, "--new-window"]
      : undefined;
  const launchers: Array<{
    label: string;
    launch: () => Promise<BrowserContext>;
  }> = [
    {
      label: "chrome-persistent",
      launch: () =>
        chromium.launchPersistentContext(input.userDataDir, {
          channel: "chrome",
          ...(launchArgs ? { args: launchArgs } : {}),
          headless: input.headless,
        }),
    },
    {
      label: "chromium-persistent",
      launch: () =>
        chromium.launchPersistentContext(input.userDataDir, {
          ...(launchArgs ? { args: launchArgs } : {}),
          headless: input.headless,
        }),
    },
  ];

  let lastError: unknown = null;

  for (const launcher of launchers) {
    try {
      return await launcher.launch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (
        input.sessionMode === "shared-profile" &&
        /Abrindo em uma sess[aã]o de navegador existente|Target page, context or browser has been closed/i.test(
          message,
        )
      ) {
        lastError = new Error(
          "O Chrome reutilizou a sessao ja aberta do seu perfil principal e o Playwright perdeu o controle da janela. Para automacao 100% controlada, use dedicated-profile. Para testes ao vivo no Chrome real, prefira o fluxo manual/observado no Chrome ja aberto.",
        );
      } else {
        lastError = error;
      }

      console.warn(
        JSON.stringify(
          {
            service: "worker",
            command: "auth:99freelas",
            status: "browser-launch-fallback",
            browser: launcher.label,
            message,
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

async function readContextStorageState(context: BrowserContext): Promise<{
  origins: Array<unknown>;
}> {
  try {
    return await context.storageState({ indexedDB: true });
  } catch {
    return {
      origins: [],
    };
  }
}

async function persistStorageState(input: {
  context: BrowserContext;
  storageStatePath: string;
}): Promise<void> {
  try {
    await input.context.storageState({
      path: input.storageStatePath,
      indexedDB: true,
    });
  } catch (error) {
    console.warn(
      JSON.stringify(
        {
          service: "worker",
          command: "auth:99freelas",
          status: "storage-state-save-skipped",
          message: error instanceof Error ? error.message : String(error),
          storageStatePath: input.storageStatePath,
        },
        null,
        2,
      ),
    );
  }
}

async function ensureBrowserUserDataDir(input: {
  sessionMode: BrowserSessionMode;
  userDataDir: string;
}): Promise<void> {
  if (input.sessionMode === "shared-profile") {
    if (!existsSync(input.userDataDir)) {
      throw new Error(
        `Chrome user data dir nao foi encontrado em ${input.userDataDir}. Ajuste BROWSER_USER_DATA_DIR para o caminho real do seu Chrome.`,
      );
    }

    return;
  }

  await mkdir(input.userDataDir, { recursive: true });
}

function resolveBrowserUserDataDir(input: {
  sessionMode: BrowserSessionMode;
  userDataDir?: string;
}): string {
  if (input.userDataDir) {
    return resolveProjectPath(input.userDataDir);
  }

  if (input.sessionMode === "shared-profile") {
    return resolveSharedChromeUserDataDir();
  }

  return resolveProjectPath("./.auth/99freelas.automation-profile");
}

function resolveSharedChromeUserDataDir(): string {
  if (platform === "darwin") {
    return resolve(homedir(), "Library/Application Support/Google/Chrome");
  }

  if (platform === "win32") {
    return resolve(homedir(), "AppData/Local/Google/Chrome/User Data");
  }

  return resolve(homedir(), ".config/google-chrome");
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
