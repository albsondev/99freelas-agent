import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { chromium } from "playwright";

import {
  build99FreelasProposalPageUrl,
  format99FreelasDeadlineInput,
  format99FreelasMoneyInput,
} from "./99freelas-proposal-form.js";
import {
  parse99FreelasProposalPage,
  type ProposalPageSnapshot,
} from "./99freelas-proposal-page.js";
import { selectors99Freelas } from "./selectors/99freelas.selectors.js";

export type MockSubmit99FreelasProposalInput = {
  amount: number;
  deadlineDays: number;
  detailsText: string;
  headless?: boolean;
  proposalPageUrl: string;
  storageStatePath: string;
  timeoutMs?: number;
  beforeScreenshotPath?: string;
  afterScreenshotPath?: string;
};

export type ProposalSubmissionBrowserResult = {
  currentUrl: string;
  proposalPageUrl: string;
  filledAmount: string;
  filledFinalAmount: string;
  filledDeadlineDays: string;
  detailsLength: number;
  page: ProposalPageSnapshot;
  warnings: string[];
  blockingReasons: string[];
  readyForManualSubmit: boolean;
  submitButtonVisible: boolean;
  submitButtonEnabled: boolean;
  submitAttempted: boolean;
  submitted: boolean;
  postSubmitUrl?: string;
  postSubmitHasProposalForm?: boolean;
  beforeScreenshotPath?: string;
  afterScreenshotPath?: string;
};

export type MockSubmit99FreelasProposalResult = ProposalSubmissionBrowserResult;

export type Submit99FreelasProposalInput = MockSubmit99FreelasProposalInput & {
  postSubmitTimeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 45_000;

export async function mockSubmit99FreelasProposal(
  input: MockSubmit99FreelasProposalInput,
): Promise<MockSubmit99FreelasProposalResult> {
  return run99FreelasProposalSubmission(input, false);
}

export async function submit99FreelasProposal(
  input: Submit99FreelasProposalInput,
): Promise<ProposalSubmissionBrowserResult> {
  return run99FreelasProposalSubmission(input, true);
}

async function run99FreelasProposalSubmission(
  input: Submit99FreelasProposalInput,
  executeSubmit: boolean,
): Promise<ProposalSubmissionBrowserResult> {
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

    const beforeScreenshotPath = input.beforeScreenshotPath
      ? resolve(input.beforeScreenshotPath)
      : null;
    const afterScreenshotPath = input.afterScreenshotPath
      ? resolve(input.afterScreenshotPath)
      : null;

    if (beforeScreenshotPath) {
      await ensureParentDir(beforeScreenshotPath);
      await page.screenshot({
        path: beforeScreenshotPath,
        fullPage: true,
      });
    }

    await page.locator(selectors99Freelas.proposalAmountInput).fill(
      format99FreelasMoneyInput(input.amount),
    );
    await page.locator(selectors99Freelas.proposalDeadlineInput).fill(
      format99FreelasDeadlineInput(input.deadlineDays),
    );
    await page.locator(selectors99Freelas.proposalDetailsTextarea).fill(
      input.detailsText,
    );

    const submitButton = page.locator(selectors99Freelas.submitButton);
    const submitButtonVisible = await submitButton.isVisible();
    const submitButtonEnabled = await submitButton.isEnabled();
    const snapshot = await page.locator("body").innerText();
    const pageSignals = parse99FreelasProposalPage(snapshot);
    const warnings = extract99FreelasProposalWarnings(snapshot);

    const filledAmount = await page
      .locator(selectors99Freelas.proposalAmountInput)
      .inputValue();
    const filledFinalAmount = await page
      .locator(selectors99Freelas.proposalFinalAmountInput)
      .inputValue();
    const filledDeadlineDays = await page
      .locator(selectors99Freelas.proposalDeadlineInput)
      .inputValue();
    const filledDetails = await page
      .locator(selectors99Freelas.proposalDetailsTextarea)
      .inputValue();

    const blockingReasons = assessSubmissionReadiness({
      detailsLength: filledDetails.length,
      page: pageSignals,
      submitButtonEnabled,
      submitButtonVisible,
    });

    let currentUrl = page.url();
    let submitted = false;
    let postSubmitUrl: string | undefined;
    let postSubmitHasProposalForm: boolean | undefined;

    if (executeSubmit && blockingReasons.length === 0) {
      await submitButton.click();
      await page.waitForTimeout(input.postSubmitTimeoutMs ?? 5_000);

      const postSubmitSnapshot = await page.locator("body").innerText();
      const postSubmitSignals = parse99FreelasProposalPage(postSubmitSnapshot);

      currentUrl = page.url();
      postSubmitUrl = currentUrl;
      postSubmitHasProposalForm = postSubmitSignals.hasProposalForm;
      submitted = currentUrl !== proposalPageUrl || !postSubmitSignals.hasProposalForm;
    }

    if (afterScreenshotPath) {
      await ensureParentDir(afterScreenshotPath);
      await page.screenshot({
        path: afterScreenshotPath,
        fullPage: true,
      });
    }

    return {
      currentUrl,
      proposalPageUrl,
      filledAmount,
      filledFinalAmount,
      filledDeadlineDays,
      detailsLength: filledDetails.length,
      page: pageSignals,
      warnings,
      blockingReasons,
      readyForManualSubmit: blockingReasons.length === 0,
      submitButtonVisible,
      submitButtonEnabled,
      submitAttempted: executeSubmit && blockingReasons.length === 0,
      submitted,
      ...(postSubmitUrl ? { postSubmitUrl } : {}),
      ...(postSubmitHasProposalForm !== undefined
        ? { postSubmitHasProposalForm }
        : {}),
      ...(beforeScreenshotPath ? { beforeScreenshotPath } : {}),
      ...(afterScreenshotPath ? { afterScreenshotPath } : {}),
    };
  } finally {
    await browser.close();
  }
}

export function assessSubmissionReadiness(input: {
  detailsLength: number;
  page: ProposalPageSnapshot;
  submitButtonVisible: boolean;
  submitButtonEnabled: boolean;
}): string[] {
  const blockingReasons: string[] = [];

  if (!input.page.hasProposalForm) {
    blockingReasons.push("Formulario de proposta nao foi encontrado.");
  }

  if (!input.submitButtonVisible) {
    blockingReasons.push("Botao de envio nao esta visivel.");
  }

  if (!input.submitButtonEnabled) {
    blockingReasons.push("Botao de envio nao esta habilitado.");
  }

  if (input.detailsLength < 120) {
    blockingReasons.push("Texto da proposta ficou curto demais para envio seguro.");
  }

  if (
    input.page.requiredConnections !== null &&
    input.page.availableConnections !== null &&
    input.page.requiredConnections > input.page.availableConnections
  ) {
    blockingReasons.push("Quantidade de conexoes disponiveis nao cobre a proposta.");
  }

  return blockingReasons;
}

export function extract99FreelasProposalWarnings(snapshot: string): string[] {
  const lines = snapshot
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return [...new Set(lines.filter((line) =>
    /aten[cç][aã]o|conex(?:ão|ões)|nao compartilhe suas informa[cç][õo]es de contato/i.test(
      line,
    ),
  ))];
}

async function ensureParentDir(targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
}
