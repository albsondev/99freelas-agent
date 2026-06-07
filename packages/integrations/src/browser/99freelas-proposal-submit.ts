import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { open99FreelasSessionContext } from "./99freelas-auth.js";
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
  userDataDir?: string;
  timeoutMs?: number;
  beforeScreenshotPath?: string;
  afterScreenshotPath?: string;
  observer?: ProposalObserverOptions;
};

export type ProposalObserverStepName =
  | "browser-opened"
  | "proposal-page-opened"
  | "proposal-form-detected"
  | "before-screenshot-captured"
  | "amount-filled"
  | "deadline-filled"
  | "details-filled"
  | "readiness-evaluated"
  | "paused-before-submit"
  | "submit-clicked"
  | "after-screenshot-captured"
  | "observer-finished";

export type ProposalObserverStep = {
  step: ProposalObserverStepName;
  message: string;
  currentUrl?: string;
};

export type ProposalObserverOptions = {
  enabled?: boolean;
  stepDelayMs?: number;
  holdOpenMs?: number;
  onStep?: (event: ProposalObserverStep) => Promise<void> | void;
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
  const opened = await open99FreelasSessionContext({
    headless: input.headless ?? false,
    storageStatePath: input.storageStatePath,
    ...(input.userDataDir ? { userDataDir: input.userDataDir } : {}),
  });

  try {
    const page = await opened.context.newPage();
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const proposalPageUrl = build99FreelasProposalPageUrl(input.proposalPageUrl);
    const stepDelayMs = input.observer?.stepDelayMs ?? 1_500;

    await emitObserverStep(input.observer, {
      step: "browser-opened",
      message: "Navegador do 99Freelas aberto em modo observacao.",
    });

    await page.goto(proposalPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    await emitObserverStep(input.observer, {
      step: "proposal-page-opened",
      message: "Pagina da proposta aberta.",
      currentUrl: page.url(),
    });
    await waitForObserver(input.observer, stepDelayMs);

    const formLocator = page.locator(selectors99Freelas.proposalForm).first();
    await formLocator.waitFor({
      state: "visible",
      timeout: timeoutMs,
    });

    await emitObserverStep(input.observer, {
      step: "proposal-form-detected",
      message: "Formulario de proposta localizado na pagina.",
      currentUrl: page.url(),
    });
    await waitForObserver(input.observer, stepDelayMs);

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
      await emitObserverStep(input.observer, {
        step: "before-screenshot-captured",
        message: "Screenshot inicial capturada antes do preenchimento.",
        currentUrl: page.url(),
      });
    }

    await page.locator(selectors99Freelas.proposalAmountInput).fill(
      format99FreelasMoneyInput(input.amount),
    );
    await emitObserverStep(input.observer, {
      step: "amount-filled",
      message: "Campo de oferta preenchido.",
      currentUrl: page.url(),
    });
    await waitForObserver(input.observer, stepDelayMs);
    await page.locator(selectors99Freelas.proposalDeadlineInput).fill(
      format99FreelasDeadlineInput(input.deadlineDays),
    );
    await emitObserverStep(input.observer, {
      step: "deadline-filled",
      message: "Campo de duracao estimada preenchido.",
      currentUrl: page.url(),
    });
    await waitForObserver(input.observer, stepDelayMs);
    await page.locator(selectors99Freelas.proposalDetailsTextarea).fill(
      input.detailsText,
    );
    await emitObserverStep(input.observer, {
      step: "details-filled",
      message: "Campo de detalhes preenchido com a proposta gerada.",
      currentUrl: page.url(),
    });
    await waitForObserver(input.observer, stepDelayMs);

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

    await emitObserverStep(input.observer, {
      step: "readiness-evaluated",
      message:
        blockingReasons.length === 0
          ? "Guardrails da pagina passaram; pronto para observar o submit."
          : `Guardrails encontraram bloqueios: ${blockingReasons.join(" ")}`,
      currentUrl: page.url(),
    });
    await waitForObserver(input.observer, stepDelayMs);

    let currentUrl = page.url();
    let submitted = false;
    let postSubmitUrl: string | undefined;
    let postSubmitHasProposalForm: boolean | undefined;

    if (executeSubmit && blockingReasons.length === 0) {
      await emitObserverStep(input.observer, {
        step: "paused-before-submit",
        message: "Pausa curta antes do clique final de envio.",
        currentUrl: page.url(),
      });
      await waitForObserver(input.observer, stepDelayMs);
      await submitButton.click();
      await emitObserverStep(input.observer, {
        step: "submit-clicked",
        message: "Botao final de envio clicado.",
        currentUrl: page.url(),
      });
      await page.waitForTimeout(input.postSubmitTimeoutMs ?? 5_000);
    } else if (!executeSubmit && input.observer?.enabled) {
      await emitObserverStep(input.observer, {
        step: "paused-before-submit",
        message: "Observacao concluida; a pagina vai permanecer aberta antes de fechar sem enviar.",
        currentUrl: page.url(),
      });
      await waitForObserver(input.observer, input.observer.holdOpenMs ?? 45_000);
    }

    if (executeSubmit && blockingReasons.length === 0) {
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
      await emitObserverStep(input.observer, {
        step: "after-screenshot-captured",
        message: "Screenshot final capturada apos o fluxo observado.",
        currentUrl,
      });
    }

    await emitObserverStep(input.observer, {
      step: "observer-finished",
      message: submitted
        ? "Fluxo observado foi encerrado apos tentativa de envio."
        : "Fluxo observado foi encerrado sem enviar proposta.",
      currentUrl,
    });

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
    await opened.close();
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

async function emitObserverStep(
  observer: ProposalObserverOptions | undefined,
  event: ProposalObserverStep,
): Promise<void> {
  if (!observer?.enabled || !observer.onStep) {
    return;
  }

  await observer.onStep(event);
}

async function waitForObserver(
  observer: ProposalObserverOptions | undefined,
  durationMs: number,
): Promise<void> {
  if (!observer?.enabled || durationMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, durationMs));
}
