import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { BrowserSessionMode } from "./99freelas-auth.js";
import { open99FreelasSessionContext } from "./99freelas-auth.js";
import { parse99FreelasProposalPage, type ProposalPageSnapshot } from "./99freelas-proposal-page.js";
import { selectors99Freelas } from "./selectors/99freelas.selectors.js";

export type Prefill99FreelasProposalInput = {
  amount: number;
  deadlineDays: number;
  detailsText: string;
  headless?: boolean;
  proposalPageUrl: string;
  sessionMode?: BrowserSessionMode;
  screenshotPath?: string;
  storageStatePath: string;
  userDataDir?: string;
  chromeProfileDirectory?: string;
  timeoutMs?: number;
};

export type Prefill99FreelasProposalResult = {
  currentUrl: string;
  filledAmount: string;
  filledDeadlineDays: string;
  detailsLength: number;
  page: ProposalPageSnapshot;
  proposalPageUrl: string;
  screenshotPath?: string;
  submitButtonVisible: boolean;
};

export type Inspect99FreelasProposalPageResult = {
  currentUrl: string;
  page: ProposalPageSnapshot;
  proposalPageUrl: string;
  submitButtonVisible: boolean;
};

const DEFAULT_TIMEOUT_MS = 45_000;

export async function prefill99FreelasProposalForm(
  input: Prefill99FreelasProposalInput,
): Promise<Prefill99FreelasProposalResult> {
  const opened = await open99FreelasSessionContext({
    headless: input.headless ?? false,
    ...(input.sessionMode ? { sessionMode: input.sessionMode } : {}),
    storageStatePath: input.storageStatePath,
    ...(input.userDataDir ? { userDataDir: input.userDataDir } : {}),
    ...(input.chromeProfileDirectory
      ? { chromeProfileDirectory: input.chromeProfileDirectory }
      : {}),
  });

  try {
    const page = await opened.context.newPage();
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const proposalPageUrl = build99FreelasProposalPageUrl(input.proposalPageUrl);

    await page.goto(proposalPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    const formLocator = page.locator(selectors99Freelas.proposalForm).first();
    await formLocator.waitFor({
      state: "visible",
      timeout: timeoutMs,
    });

    const pageSignals = await waitForCommercialSignals(page, timeoutMs);

    await page.locator(selectors99Freelas.proposalAmountInput).fill(
      format99FreelasMoneyInput(input.amount),
    );
    await page.locator(selectors99Freelas.proposalDeadlineInput).fill(
      format99FreelasDeadlineInput(input.deadlineDays),
    );
    await page.locator(selectors99Freelas.proposalDetailsTextarea).fill(
      input.detailsText,
    );

    const domSnapshot = await page.locator(selectors99Freelas.submitButton).isVisible();

    const filledAmount = await page
      .locator(selectors99Freelas.proposalAmountInput)
      .inputValue();
    const filledDeadlineDays = await page
      .locator(selectors99Freelas.proposalDeadlineInput)
      .inputValue();
    const filledDetails = await page
      .locator(selectors99Freelas.proposalDetailsTextarea)
      .inputValue();

    if (input.screenshotPath) {
      const resolvedScreenshotPath = resolve(input.screenshotPath);
      await mkdir(dirname(resolvedScreenshotPath), { recursive: true });
      await page.screenshot({
        path: resolvedScreenshotPath,
        fullPage: true,
      });
    }

    return {
      currentUrl: page.url(),
      proposalPageUrl,
      filledAmount,
      filledDeadlineDays,
      detailsLength: filledDetails.length,
      page: pageSignals,
      submitButtonVisible: domSnapshot,
      ...(input.screenshotPath
        ? {
            screenshotPath: resolve(input.screenshotPath),
          }
        : {}),
    };
  } finally {
    await opened.close();
  }
}

export async function inspect99FreelasProposalPage(input: {
  headless?: boolean;
  proposalPageUrl: string;
  sessionMode?: BrowserSessionMode;
  storageStatePath: string;
  userDataDir?: string;
  chromeProfileDirectory?: string;
  timeoutMs?: number;
}): Promise<Inspect99FreelasProposalPageResult> {
  const opened = await open99FreelasSessionContext({
    headless: input.headless ?? false,
    ...(input.sessionMode ? { sessionMode: input.sessionMode } : {}),
    storageStatePath: input.storageStatePath,
    ...(input.userDataDir ? { userDataDir: input.userDataDir } : {}),
    ...(input.chromeProfileDirectory
      ? { chromeProfileDirectory: input.chromeProfileDirectory }
      : {}),
  });

  try {
    const page = await opened.context.newPage();
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const proposalPageUrl = build99FreelasProposalPageUrl(input.proposalPageUrl);

    await page.goto(proposalPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    const formLocator = page.locator(selectors99Freelas.proposalForm).first();
    await formLocator.waitFor({
      state: "visible",
      timeout: timeoutMs,
    });
    const pageSignals = await waitForCommercialSignals(page, timeoutMs);
    const submitButtonVisible = await page
      .locator(selectors99Freelas.submitButton)
      .isVisible();

    return {
      currentUrl: page.url(),
      proposalPageUrl,
      page: pageSignals,
      submitButtonVisible,
    };
  } finally {
    await opened.close();
  }
}

async function waitForCommercialSignals(
  page: { locator: (selector: string) => { innerText: () => Promise<string> } },
  timeoutMs: number,
): Promise<ProposalPageSnapshot> {
  const startedAt = Date.now();
  let lastSignals = parse99FreelasProposalPage("");

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await page.locator("body").innerText();
    lastSignals = parse99FreelasProposalPage(snapshot);

    if (
      lastSignals.averageBidAmount !== null ||
      lastSignals.averageDeadlineDays !== null ||
      lastSignals.minimumOfferAmount !== null
    ) {
      return lastSignals;
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 500);
    });
  }

  return lastSignals;
}

export function build99FreelasProposalPageUrl(projectUrl: string): string {
  const normalized = projectUrl.trim();

  if (/\/project\/bid\//i.test(normalized)) {
    return normalized;
  }

  return normalized.replace("/project/", "/project/bid/");
}

export function format99FreelasMoneyInput(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

export function format99FreelasDeadlineInput(days: number): string {
  return String(Math.max(1, Math.round(days)));
}
