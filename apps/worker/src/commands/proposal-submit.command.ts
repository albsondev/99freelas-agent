import type { Opportunity, Proposal, SubmissionStatus } from "@99freelas/core";
import { ProposalSubmissionGuardrailsService } from "@99freelas/core";
import {
  createSupabaseAdminClient,
  DailyCounterRepository,
  mockSubmit99FreelasProposal,
  OpportunityRepository,
  ProposalRepository,
  submit99FreelasProposal,
  type ProposalObserverStep,
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
  selection: ProposalSelectionResult;
};

export type ProposalSelectionResult = {
  proposal: Proposal;
  opportunity: Opportunity;
  reasons: string[];
};

export async function executeProposalSubmitFlow(input: {
  env: WorkerEnv;
  proposalId: string | null | undefined;
  executeLiveSubmit: boolean | undefined;
  confirmLiveSubmit: boolean | undefined;
}): Promise<ProposalSubmitExecutionResult> {
  const client = createSupabaseAdminClient({
    supabaseUrl: input.env.SUPABASE_URL,
    supabaseKey: input.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const proposals = new ProposalRepository(client);
  const opportunities = new OpportunityRepository(client);
  const counters = new DailyCounterRepository(client);
  const selection = await resolveProposalSelection({
    proposals,
    opportunities,
    proposalId: input.proposalId,
  });
  const { proposal, opportunity } = selection;

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
    userDataDir: input.env.BROWSER_USER_DATA_DIR,
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
        userDataDir: input.env.BROWSER_USER_DATA_DIR,
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
    selection,
  };
}

export async function executeProposalObserveFlow(input: {
  env: WorkerEnv;
  proposalId: string | null | undefined;
  stepDelayMs: number | undefined;
  holdOpenMs: number | undefined;
}): Promise<ProposalSubmitExecutionResult> {
  const client = createSupabaseAdminClient({
    supabaseUrl: input.env.SUPABASE_URL,
    supabaseKey: input.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const proposals = new ProposalRepository(client);
  const opportunities = new OpportunityRepository(client);
  const counters = new DailyCounterRepository(client);
  const selection = await resolveProposalSelection({
    proposals,
    opportunities,
    proposalId: input.proposalId,
  });
  const { proposal, opportunity } = selection;
  const today = formatCounterDate(new Date());
  const currentHourName = `real_submissions_hour_${formatCounterHour(new Date())}`;
  const [dailyCounter, hourlyCounter] = await Promise.all([
    counters.getByNameAndDate("real_submissions", today),
    counters.getByNameAndDate(currentHourName, today),
  ]);

  const observerPrefix = `[observer:${proposal.id.slice(0, 8)}]`;
  const browser = await mockSubmit99FreelasProposal({
    amount: proposal.amount,
    deadlineDays: proposal.deadlineDays,
    detailsText: proposal.detailsText,
    headless: false,
    proposalPageUrl: opportunity.url,
    storageStatePath: input.env.BROWSER_STORAGE_STATE_PATH,
    userDataDir: input.env.BROWSER_USER_DATA_DIR,
    beforeScreenshotPath: `${input.env.BROWSER_SCREENSHOT_DIR}/proposal-observe-before-${proposal.id}.png`,
    afterScreenshotPath: `${input.env.BROWSER_SCREENSHOT_DIR}/proposal-observe-after-${proposal.id}.png`,
    observer: {
      enabled: true,
      stepDelayMs: input.stepDelayMs ?? 1_800,
      holdOpenMs: input.holdOpenMs ?? 45_000,
      onStep: (event) => {
        logObserverStep(observerPrefix, event);
      },
    },
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
    explicitLiveConfirmation: false,
    autopilotMinScore: input.env.AUTOPILOT_MIN_SCORE,
    minDetailsLength: input.env.MIN_REAL_SUBMISSION_DETAILS_LENGTH,
    dailySubmissionCount: dailyCounter?.value ?? 0,
    hourlySubmissionCount: hourlyCounter?.value ?? 0,
    maxSubmissionsPerDay: input.env.MAX_AUTOPILOT_SUBMISSIONS_PER_DAY,
    maxSubmissionsPerHour: input.env.MAX_AUTOPILOT_SUBMISSIONS_PER_HOUR,
  });

  const submissionStatus: SubmissionStatus = browser.readyForManualSubmit
    ? "PENDING"
    : "FAILED_REQUIRES_MANUAL_ACTION";
  const submissionError =
    browser.readyForManualSubmit
      ? null
      : browser.blockingReasons.join(" ");

  const updated = await proposals.update(proposal.id, {
    submission_status: submissionStatus,
    submission_error: submissionError,
    before_screenshot_path: browser.beforeScreenshotPath ?? null,
    after_screenshot_path: browser.afterScreenshotPath ?? null,
  });

  return {
    proposalId: updated.id,
    opportunityId: opportunity.id,
    submissionStatus,
    submissionError,
    beforeScreenshotPath: updated.beforeScreenshotPath ?? null,
    afterScreenshotPath: updated.afterScreenshotPath ?? null,
    liveSubmitted: false,
    guardrails,
    browser,
    selection,
  };
}

async function resolveProposalSelection(input: {
  proposals: ProposalRepository;
  opportunities: OpportunityRepository;
  proposalId: string | null | undefined;
}): Promise<ProposalSelectionResult> {
  if (input.proposalId) {
    const proposal = await input.proposals.getById(input.proposalId);

    if (!proposal) {
      throw new Error(`Proposal ${input.proposalId} was not found.`);
    }

    if (proposal.submissionStatus === "SUBMITTED" || proposal.submissionStatus === "DUPLICATED") {
      throw new Error(
        `Proposal ${proposal.id} is already in terminal status ${proposal.submissionStatus}.`,
      );
    }

    const opportunity = await input.opportunities.getById(proposal.opportunityId);

    if (!opportunity) {
      throw new Error(
        `Opportunity ${proposal.opportunityId} linked to proposal ${proposal.id} was not found.`,
      );
    }

    return {
      proposal,
      opportunity,
      reasons: ["Proposta escolhida explicitamente por --proposal-id."],
    };
  }

  const proposals = await input.proposals.listRecent(30);
  const candidates: Array<ProposalSelectionResult & { rank: number }> = [];

  for (const proposal of proposals) {
    if (proposal.submissionStatus === "SUBMITTED" || proposal.submissionStatus === "DUPLICATED") {
      continue;
    }

    if (proposal.complianceStatus === "BLOCKED") {
      continue;
    }

    const opportunity = await input.opportunities.getById(proposal.opportunityId);

    if (!opportunity) {
      continue;
    }

    if (opportunity.decision === "REJECTED" || opportunity.decision === "FAILED") {
      continue;
    }

    const rank = computeProposalRank(proposal, opportunity);

    if (rank <= 0) {
      continue;
    }

    candidates.push({
      proposal,
      opportunity,
      rank,
      reasons: describeProposalSelection(proposal, opportunity, rank),
    });
  }

  const bestCandidate = candidates.sort((a, b) => b.rank - a.rank)[0];

  if (!bestCandidate) {
    throw new Error("No eligible proposal is available for observation right now.");
  }

  return {
    proposal: bestCandidate.proposal,
    opportunity: bestCandidate.opportunity,
    reasons: bestCandidate.reasons,
  };
}

function computeProposalRank(proposal: Proposal, opportunity: Opportunity): number {
  let rank = opportunity.score ?? 0;

  if (opportunity.decision === "AUTO_SUBMIT") {
    rank += 30;
  } else if (opportunity.decision === "REVIEW_REQUIRED") {
    rank += 10;
  }

  if (proposal.complianceStatus === "APPROVED") {
    rank += 20;
  } else if (proposal.complianceStatus === "REVIEW_REQUIRED") {
    rank += 5;
  }

  if (proposal.submissionStatus === "PENDING") {
    rank += 8;
  }

  if (opportunity.riskFlags.includes("REACT_NATIVE_REVIEW_ONLY")) {
    rank -= 12;
  }

  rank -= opportunity.riskFlags.length * 4;
  rank -= proposal.complianceFlags.length * 2;

  return rank;
}

function describeProposalSelection(
  proposal: Proposal,
  opportunity: Opportunity,
  rank: number,
): string[] {
  const reasons = [
    `Score calculado para observacao: ${rank}.`,
    `Decision atual da oportunidade: ${opportunity.decision ?? "N/A"}.`,
    `Compliance atual da proposta: ${proposal.complianceStatus}.`,
  ];

  if (typeof opportunity.score === "number") {
    reasons.push(`Score base da oportunidade: ${opportunity.score}.`);
  }

  if (opportunity.riskFlags.length > 0) {
    reasons.push(`Risk flags presentes: ${opportunity.riskFlags.join(", ")}.`);
  }

  return reasons;
}

function logObserverStep(prefix: string, event: ProposalObserverStep): void {
  console.log(
    JSON.stringify(
      {
        scope: prefix,
        step: event.step,
        message: event.message,
        currentUrl: event.currentUrl ?? null,
      },
      null,
      2,
    ),
  );
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
