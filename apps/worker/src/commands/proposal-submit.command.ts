import type { SubmissionStatus } from "@99freelas/core";
import { ProposalSubmissionGuardrailsService } from "@99freelas/core";
import {
  createSupabaseAdminClient,
  DailyCounterRepository,
  mockSubmit99FreelasProposal,
  OpportunityRepository,
  ProposalRepository,
  submit99FreelasProposal,
  type ProposalSubmissionBrowserResult,
} from "@99freelas/integrations";

import type { WorkerEnv } from "../env.js";

export type ProposalSubmitExecutionResult = {
  proposalId: string;
  opportunityId: string;
  submissionStatus: SubmissionStatus;
  submissionError: string | null;
  beforeScreenshotPath: string | null;
  afterScreenshotPath: string | null;
  liveSubmitted: boolean;
  guardrails: ReturnType<ProposalSubmissionGuardrailsService["evaluate"]>;
  browser: ProposalSubmissionBrowserResult;
};

export async function executeProposalSubmitFlow(input: {
  env: WorkerEnv;
  proposalId?: string | null;
  executeLiveSubmit?: boolean;
  confirmLiveSubmit?: boolean;
}): Promise<ProposalSubmitExecutionResult> {
  const client = createSupabaseAdminClient({
    supabaseUrl: input.env.SUPABASE_URL,
    supabaseKey: input.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const proposals = new ProposalRepository(client);
  const opportunities = new OpportunityRepository(client);
  const counters = new DailyCounterRepository(client);
  const proposal =
    input.proposalId !== undefined && input.proposalId !== null
      ? await proposals.getById(input.proposalId)
      : (await proposals.listRecent(10)).find(
          (item) => item.submissionStatus !== "SUBMITTED",
        ) ?? null;

  if (!proposal) {
    throw new Error(
      input.proposalId
        ? `Proposal ${input.proposalId} was not found.`
        : "No pending proposal was found to submit.",
    );
  }

  if (proposal.submissionStatus === "SUBMITTED" || proposal.submissionStatus === "DUPLICATED") {
    throw new Error(`Proposal ${proposal.id} is already in terminal status ${proposal.submissionStatus}.`);
  }

  const opportunity = await opportunities.getById(proposal.opportunityId);

  if (!opportunity) {
    throw new Error(
      `Opportunity ${proposal.opportunityId} linked to proposal ${proposal.id} was not found.`,
    );
  }

  const today = formatCounterDate(new Date());
  const currentHourName = `real_submissions_hour_${formatCounterHour(new Date())}`;
  const [dailyCounter, hourlyCounter] = await Promise.all([
    counters.getByNameAndDate("real_submissions", today),
    counters.getByNameAndDate(currentHourName, today),
  ]);

  const browser = await mockSubmit99FreelasProposal({
    amount: proposal.amount,
    deadlineDays: proposal.deadlineDays,
    detailsText: proposal.detailsText,
    headless: input.env.BROWSER_HEADLESS,
    proposalPageUrl: opportunity.url,
    storageStatePath: input.env.BROWSER_STORAGE_STATE_PATH,
    beforeScreenshotPath: `${input.env.BROWSER_SCREENSHOT_DIR}/proposal-submit-before-${proposal.id}.png`,
    afterScreenshotPath: `${input.env.BROWSER_SCREENSHOT_DIR}/proposal-submit-after-${proposal.id}.png`,
  });

  const guardrails = new ProposalSubmissionGuardrailsService().evaluate({
    mode: input.env.AUTOMATION_MODE,
    proposal,
    opportunity,
    browserReadiness: {
      readyForManualSubmit: browser.readyForManualSubmit,
      blockingReasons: browser.blockingReasons,
      warnings: browser.warnings,
    },
    allowRealSubmission: input.env.ENABLE_REAL_99FREELAS_SUBMISSION,
    explicitLiveConfirmation: input.confirmLiveSubmit === true,
    autopilotMinScore: input.env.AUTOPILOT_MIN_SCORE,
    minDetailsLength: input.env.MIN_REAL_SUBMISSION_DETAILS_LENGTH,
    dailySubmissionCount: dailyCounter?.value ?? 0,
    hourlySubmissionCount: hourlyCounter?.value ?? 0,
    maxSubmissionsPerDay: input.env.MAX_AUTOPILOT_SUBMISSIONS_PER_DAY,
    maxSubmissionsPerHour: input.env.MAX_AUTOPILOT_SUBMISSIONS_PER_HOUR,
  });

  let liveSubmitted = false;
  let finalBrowser = browser;
  let submissionStatus: SubmissionStatus = browser.readyForManualSubmit
    ? "PENDING"
    : "FAILED_REQUIRES_MANUAL_ACTION";
  let submissionError =
    browser.readyForManualSubmit
      ? null
      : browser.blockingReasons.join(" ");

  if (input.executeLiveSubmit) {
    if (guardrails.canSubmitForReal) {
      finalBrowser = await submit99FreelasProposal({
        amount: proposal.amount,
        deadlineDays: proposal.deadlineDays,
        detailsText: proposal.detailsText,
        headless: input.env.BROWSER_HEADLESS,
        proposalPageUrl: opportunity.url,
        storageStatePath: input.env.BROWSER_STORAGE_STATE_PATH,
        beforeScreenshotPath: `${input.env.BROWSER_SCREENSHOT_DIR}/proposal-submit-before-${proposal.id}.png`,
        afterScreenshotPath: `${input.env.BROWSER_SCREENSHOT_DIR}/proposal-submit-after-${proposal.id}.png`,
      });

      liveSubmitted = finalBrowser.submitted;
      submissionStatus = liveSubmitted ? "SUBMITTED" : "FAILED_REQUIRES_MANUAL_ACTION";
      submissionError = liveSubmitted
        ? null
        : "Nenhum sinal claro de sucesso foi detectado apos o clique de envio.";
    } else {
      submissionStatus =
        guardrails.status === "REVIEW_REQUIRED"
          ? "PENDING"
          : "FAILED_REQUIRES_MANUAL_ACTION";
      submissionError = [...guardrails.reviewReasons, ...guardrails.blockingReasons].join(" ");
    }
  }

  const updated = await proposals.update(proposal.id, {
    submission_status: submissionStatus,
    submission_error: submissionError,
    submitted_at: liveSubmitted ? new Date().toISOString() : proposal.submittedAt ?? null,
    before_screenshot_path: finalBrowser.beforeScreenshotPath ?? null,
    after_screenshot_path: finalBrowser.afterScreenshotPath ?? null,
  });

  if (liveSubmitted) {
    await Promise.all([
      opportunities.update(opportunity.id, {
        status: "SUBMITTED",
      }),
      incrementCounter(counters, "real_submissions", today, dailyCounter?.value ?? 0),
      incrementCounter(counters, currentHourName, today, hourlyCounter?.value ?? 0),
    ]);
  }

  return {
    proposalId: updated.id,
    opportunityId: opportunity.id,
    submissionStatus,
    submissionError,
    beforeScreenshotPath: updated.beforeScreenshotPath ?? null,
    afterScreenshotPath: updated.afterScreenshotPath ?? null,
    liveSubmitted,
    guardrails,
    browser: finalBrowser,
  };
}

async function incrementCounter(
  repository: DailyCounterRepository,
  name: string,
  counterDate: string,
  currentValue: number,
): Promise<void> {
  await repository.upsert({
    name,
    counter_date: counterDate,
    value: currentValue + 1,
  });
}

function formatCounterDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatCounterHour(date: Date): string {
  return String(date.getHours()).padStart(2, "0");
}
