import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const AUTH_COOKIE_HINTS = ["freelas", "session", "auth", "token"];

export async function authenticate99FreelasSession(
  options: Authenticate99FreelasOptions,
): Promise<BrowserSessionResult> {
  const storageStatePath = resolve(options.storageStatePath);
  await mkdir(dirname(storageStatePath), { recursive: true });

  const browser = await chromium.launch({
    headless: false,
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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
    await browser.close();
  }
}

export async function validate99FreelasSession(
  options: Authenticate99FreelasOptions,
): Promise<BrowserSessionResult> {
  const storageStatePath = resolve(options.storageStatePath);
  const browser = await chromium.launch({
    headless: options.headless ?? true,
  });

  try {
    const context = await browser.newContext({
      storageState: storageStatePath,
    });
    const page = await context.newPage();

    await page.goto(selectors99Freelas.dashboardUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    return inspect99FreelasSession({
      context,
      page,
      storageStatePath,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
  } finally {
    await browser.close();
  }
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
