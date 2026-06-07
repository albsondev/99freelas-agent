import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { chromium } from "playwright";

import { parse99FreelasProposalPage, type ProposalPageSnapshot } from "./99freelas-proposal-page.js";
import { selectors99Freelas } from "./selectors/99freelas.selectors.js";

export type Prefill99FreelasProposalInput = {
  amount: number;
  deadlineDays: number;
  detailsText: string;
  headless?: boolean;
  proposalPageUrl: string;
  screenshotPath?: string;
  storageStatePath: string;
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

const DEFAULT_TIMEOUT_MS = 45_000;

export async function prefill99FreelasProposalForm(
  input: Prefill99FreelasProposalInput,
): Promise<Prefill99FreelasProposalResult> {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: input.headless ?? false,
  });

  try {
    const context = await browser.newContext({
      storageState: resolve(input.storageStatePath),
    });
    const page = await context.newPage();
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

    await page.locator(selectors99Freelas.proposalAmountInput).fill(
      format99FreelasMoneyInput(input.amount),
    );
    await page.locator(selectors99Freelas.proposalDeadlineInput).fill(
      format99FreelasDeadlineInput(input.deadlineDays),
    );
    await page.locator(selectors99Freelas.proposalDetailsTextarea).fill(
      input.detailsText,
    );

    const snapshot = await page.locator("body").innerText();
    const domSnapshot = await page.locator(selectors99Freelas.submitButton).isVisible();
    const pageSignals = parse99FreelasProposalPage(snapshot);

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
    await browser.close();
  }
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
