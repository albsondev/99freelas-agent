import type { JsonValue, Opportunity, Proposal, SubmissionStatus } from "@99freelas/core";
import {
  ComplianceValidatorService,
  DeadlineService,
  PricingService,
  ProposalSubmissionGuardrailsService,
  sanitizeProposalText,
} from "@99freelas/core";
import {
  type BrowserSessionMode,
  createLocalTemplateProposalProvider,
  createProposalLlmProvider,
  createSupabaseAdminClient,
  DailyCounterRepository,
  inspect99FreelasProposalPage,
  inspect99FreelasProposalPageViaPython,
  mockSubmit99FreelasProposalViaPython,
  mockSubmit99FreelasProposal,
  OpportunityRepository,
  type ProposalLlmProvider,
  ProposalRepository,
  SettingsRepository,
  submit99FreelasProposal,
  submit99FreelasProposalViaPython,
  type ProposalObserverStep,
  type ProposalSubmissionBrowserResult,
  UserProfileRepository,
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

export type ProposalBatchExecutionResult = {
  processed: number;
  requested: number;
  results: ProposalSubmitExecutionResult[];
  skipped: string[];
};

function withUpdatedProposalSelection(
  selection: ProposalSelectionResult,
  proposal: Proposal,
  opportunity?: Opportunity,
): ProposalSelectionResult {
  return {
    proposal,
    opportunity: opportunity ?? selection.opportunity,
    reasons: selection.reasons,
  };
}

export async function executeProposalSubmitFlow(input: {
  env: WorkerEnv;
  proposalId: string | null | undefined;
  executeLiveSubmit: boolean | undefined;
  confirmLiveSubmit: boolean | undefined;
  observeBrowser: boolean | undefined;
  stepDelayMs: number | undefined;
  holdOpenMs: number | undefined;
}): Promise<ProposalSubmitExecutionResult> {
  assertControlledBrowserRuntime(input.env, "proposal:submit");

  const client = createSupabaseAdminClient({
    supabaseUrl: input.env.SUPABASE_URL,
    supabaseKey: input.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const proposals = new ProposalRepository(client);
  const opportunities = new OpportunityRepository(client);
  const counters = new DailyCounterRepository(client);
  const settings = new SettingsRepository(client);
  const userProfiles = new UserProfileRepository(client);
  const selection = await resolveProposalSelection({
    proposals,
    opportunities,
    proposalId: input.proposalId,
  });
  const preparedSelection = await refreshProposalUsingLivePageSignals({
    env: input.env,
    proposals,
    opportunities,
    settings,
    userProfiles,
    selection,
  });
  const { proposal, opportunity } = preparedSelection;

  const today = formatCounterDate(new Date());
  const currentHourName = `real_submissions_hour_${formatCounterHour(new Date())}`;
  const [dailyCounter, hourlyCounter] = await Promise.all([
    counters.getByNameAndDate("real_submissions", today),
    counters.getByNameAndDate(currentHourName, today),
  ]);

  const browserInput = {
    amount: proposal.amount,
    deadlineDays: proposal.deadlineDays,
    detailsText: proposal.detailsText,
    headless: input.observeBrowser ? false : input.env.BROWSER_HEADLESS,
    proposalPageUrl: opportunity.url,
    beforeScreenshotPath: `${input.env.BROWSER_SCREENSHOT_DIR}/proposal-submit-before-${proposal.id}.png`,
    afterScreenshotPath: `${input.env.BROWSER_SCREENSHOT_DIR}/proposal-submit-after-${proposal.id}.png`,
    ...(input.observeBrowser
      ? {
          observer: {
            enabled: true,
            stepDelayMs: input.stepDelayMs ?? 1_800,
            holdOpenMs: input.holdOpenMs ?? 12_000,
            onStep: (event: ProposalObserverStep) => {
              logObserverStep(`[submit:${proposal.id.slice(0, 8)}]`, event);
            },
          },
        }
      : {}),
  };

  let browser: ProposalSubmissionBrowserResult;

  try {
    browser =
      input.env.BROWSER_AUTOMATION_RUNTIME === "python-playwright"
        ? await mockSubmit99FreelasProposalViaPython({
            ...browserInput,
            browserName: input.env.PYTHON_BROWSER_NAME,
            profileDir: input.env.PYTHON_BROWSER_PROFILE_DIR,
            pythonExecutable: input.env.PYTHON_EXECUTABLE,
            screenshotDir: input.env.BROWSER_SCREENSHOT_DIR,
            storageStatePath: input.env.PYTHON_BROWSER_STORAGE_STATE_PATH,
          })
        : await mockSubmit99FreelasProposal({
            ...browserInput,
            sessionMode: input.env.BROWSER_SESSION_MODE,
            storageStatePath: input.env.BROWSER_STORAGE_STATE_PATH,
            userDataDir: input.env.BROWSER_USER_DATA_DIR,
            chromeProfileDirectory: input.env.BROWSER_CHROME_PROFILE_DIRECTORY,
          });
  } catch (error) {
    if (isDuplicatedProposalError(error)) {
      return await finalizeDuplicatedProposal({
        proposals,
        opportunities,
        proposal,
        opportunity,
        selection: preparedSelection,
        reason: extractDuplicateProposalReason(error),
      });
    }

    throw error;
  }

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
      finalBrowser =
        input.env.BROWSER_AUTOMATION_RUNTIME === "python-playwright"
          ? await submit99FreelasProposalViaPython({
              ...browserInput,
              browserName: input.env.PYTHON_BROWSER_NAME,
              profileDir: input.env.PYTHON_BROWSER_PROFILE_DIR,
              pythonExecutable: input.env.PYTHON_EXECUTABLE,
              screenshotDir: input.env.BROWSER_SCREENSHOT_DIR,
              storageStatePath: input.env.PYTHON_BROWSER_STORAGE_STATE_PATH,
            })
          : await submit99FreelasProposal({
              ...browserInput,
              sessionMode: input.env.BROWSER_SESSION_MODE,
              storageStatePath: input.env.BROWSER_STORAGE_STATE_PATH,
              userDataDir: input.env.BROWSER_USER_DATA_DIR,
              chromeProfileDirectory: input.env.BROWSER_CHROME_PROFILE_DIRECTORY,
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

  const updatedOpportunity = liveSubmitted
    ? await opportunities.update(opportunity.id, {
        status: "SUBMITTED",
      })
    : null;

  if (liveSubmitted) {
    await Promise.all([
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
    selection: withUpdatedProposalSelection(
      preparedSelection,
      updated,
      updatedOpportunity ?? undefined,
    ),
  };
}

async function finalizeDuplicatedProposal(input: {
  proposals: ProposalRepository;
  opportunities: OpportunityRepository;
  proposal: Proposal;
  opportunity: Opportunity;
  selection: ProposalSelectionResult;
  reason: string;
}): Promise<ProposalSubmitExecutionResult> {
  const updatedProposal = await input.proposals.update(input.proposal.id, {
    submission_status: "DUPLICATED",
    submission_error: input.reason,
    submitted_at: input.proposal.submittedAt ?? null,
  });

  const updatedOpportunity = await input.opportunities.update(input.opportunity.id, {
    status: "SUBMITTED",
  });

  const browser = buildDuplicatedBrowserResult(updatedProposal, updatedOpportunity, input.reason);
  const guardrails = new ProposalSubmissionGuardrailsService().evaluate({
    mode: "AUTOPILOT",
    proposal: updatedProposal,
    opportunity: updatedOpportunity,
    browserReadiness: {
      readyForManualSubmit: false,
      blockingReasons: browser.blockingReasons,
      warnings: browser.warnings,
    },
    allowRealSubmission: false,
    explicitLiveConfirmation: false,
    autopilotMinScore: 0,
    minDetailsLength: 0,
    dailySubmissionCount: 0,
    hourlySubmissionCount: 0,
    maxSubmissionsPerDay: 0,
    maxSubmissionsPerHour: 0,
  });

  return {
    proposalId: updatedProposal.id,
    opportunityId: updatedOpportunity.id,
    submissionStatus: "DUPLICATED",
    submissionError: input.reason,
    beforeScreenshotPath: null,
    afterScreenshotPath: null,
    liveSubmitted: false,
    guardrails,
    browser,
    selection: withUpdatedProposalSelection(input.selection, updatedProposal, updatedOpportunity),
  };
}

export async function executeProposalObserveFlow(input: {
  env: WorkerEnv;
  proposalId: string | null | undefined;
  stepDelayMs: number | undefined;
  holdOpenMs: number | undefined;
}): Promise<ProposalSubmitExecutionResult> {
  assertControlledBrowserRuntime(input.env, "proposal:observe");

  const client = createSupabaseAdminClient({
    supabaseUrl: input.env.SUPABASE_URL,
    supabaseKey: input.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const proposals = new ProposalRepository(client);
  const opportunities = new OpportunityRepository(client);
  const counters = new DailyCounterRepository(client);
  const settings = new SettingsRepository(client);
  const userProfiles = new UserProfileRepository(client);
  const selection = await resolveProposalSelection({
    proposals,
    opportunities,
    proposalId: input.proposalId,
  });
  const preparedSelection = await refreshProposalUsingLivePageSignals({
    env: input.env,
    proposals,
    opportunities,
    settings,
    userProfiles,
    selection,
  });
  const { proposal, opportunity } = preparedSelection;
  const today = formatCounterDate(new Date());
  const currentHourName = `real_submissions_hour_${formatCounterHour(new Date())}`;
  const [dailyCounter, hourlyCounter] = await Promise.all([
    counters.getByNameAndDate("real_submissions", today),
    counters.getByNameAndDate(currentHourName, today),
  ]);

  const observerPrefix = `[observer:${proposal.id.slice(0, 8)}]`;
  const browser =
    input.env.BROWSER_AUTOMATION_RUNTIME === "python-playwright"
      ? await mockSubmit99FreelasProposalViaPython({
          amount: proposal.amount,
          browserName: input.env.PYTHON_BROWSER_NAME,
          deadlineDays: proposal.deadlineDays,
          detailsText: proposal.detailsText,
          headless: false,
          profileDir: input.env.PYTHON_BROWSER_PROFILE_DIR,
          proposalPageUrl: opportunity.url,
          pythonExecutable: input.env.PYTHON_EXECUTABLE,
          screenshotDir: input.env.BROWSER_SCREENSHOT_DIR,
          storageStatePath: input.env.PYTHON_BROWSER_STORAGE_STATE_PATH,
          beforeScreenshotPath: `${input.env.BROWSER_SCREENSHOT_DIR}/proposal-observe-before-${proposal.id}.png`,
          afterScreenshotPath: `${input.env.BROWSER_SCREENSHOT_DIR}/proposal-observe-after-${proposal.id}.png`,
          observer: {
            enabled: true,
            stepDelayMs: input.stepDelayMs ?? 1_800,
            holdOpenMs: input.holdOpenMs ?? 45_000,
            onStep: (event: ProposalObserverStep) => {
              logObserverStep(observerPrefix, event);
            },
          },
        })
      : await mockSubmit99FreelasProposal({
          amount: proposal.amount,
          deadlineDays: proposal.deadlineDays,
          detailsText: proposal.detailsText,
          headless: false,
          proposalPageUrl: opportunity.url,
          sessionMode: input.env.BROWSER_SESSION_MODE,
          storageStatePath: input.env.BROWSER_STORAGE_STATE_PATH,
          userDataDir: input.env.BROWSER_USER_DATA_DIR,
          chromeProfileDirectory: input.env.BROWSER_CHROME_PROFILE_DIRECTORY,
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
    selection: withUpdatedProposalSelection(preparedSelection, updated),
  };
}

export async function executeProposalBatchFlow(input: {
  env: WorkerEnv;
  limit: number;
  executeLiveSubmit: boolean | undefined;
  confirmLiveSubmit: boolean | undefined;
  observeBrowser: boolean | undefined;
  stepDelayMs: number | undefined;
  holdOpenMs: number | undefined;
}): Promise<ProposalBatchExecutionResult> {
  assertControlledBrowserRuntime(input.env, "proposal:submit");

  const client = createSupabaseAdminClient({
    supabaseUrl: input.env.SUPABASE_URL,
    supabaseKey: input.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const proposals = new ProposalRepository(client);
  const opportunities = new OpportunityRepository(client);
  const candidates = await listProposalSelections({
    proposals,
    opportunities,
    limit: Math.max(100, input.limit * 20),
  });

  const results: ProposalSubmitExecutionResult[] = [];
  const skipped: string[] = [];

  for (const candidate of candidates) {
    if (results.length >= input.limit) {
      break;
    }

    const batchSkipReason = getBatchSkipReason(candidate, input.env.AUTOPILOT_MIN_SCORE);

    if (batchSkipReason) {
      skipped.push(`${candidate.proposal.id}: ${batchSkipReason}`);
      continue;
    }

    try {
      const result = await executeProposalSubmitFlow({
        env: input.env,
        proposalId: candidate.proposal.id,
        executeLiveSubmit: input.executeLiveSubmit,
        confirmLiveSubmit: input.confirmLiveSubmit,
        observeBrowser: input.observeBrowser,
        stepDelayMs: input.stepDelayMs,
        holdOpenMs: input.holdOpenMs,
      });
      results.push(result);
    } catch (error) {
      skipped.push(
        `${candidate.proposal.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return {
    processed: results.length,
    requested: input.limit,
    results,
    skipped,
  };
}

async function refreshProposalUsingLivePageSignals(input: {
  env: WorkerEnv;
  proposals: ProposalRepository;
  opportunities: OpportunityRepository;
  settings: SettingsRepository;
  userProfiles: UserProfileRepository;
  selection: ProposalSelectionResult;
}): Promise<ProposalSelectionResult> {
  if (canReusePreparedProposal(input.selection, input.env.MIN_REAL_SUBMISSION_DETAILS_LENGTH)) {
    return {
      proposal: input.selection.proposal,
      opportunity: input.selection.opportunity,
      reasons: [
        ...input.selection.reasons,
        "Sinais comerciais existentes reaproveitados para evitar revalidacao headless desnecessaria.",
      ],
    };
  }

  let inspected =
    input.env.BROWSER_AUTOMATION_RUNTIME === "python-playwright"
      ? await inspect99FreelasProposalPageViaPython({
          browserName: input.env.PYTHON_BROWSER_NAME,
          headless: true,
          profileDir: input.env.PYTHON_BROWSER_PROFILE_DIR,
          proposalPageUrl: input.selection.opportunity.url,
          pythonExecutable: input.env.PYTHON_EXECUTABLE,
          screenshotDir: input.env.BROWSER_SCREENSHOT_DIR,
          storageStatePath: input.env.PYTHON_BROWSER_STORAGE_STATE_PATH,
          timeoutMs: 90_000,
        })
      : await inspect99FreelasProposalPage({
          headless: true,
          proposalPageUrl: input.selection.opportunity.url,
          sessionMode: input.env.BROWSER_SESSION_MODE,
          storageStatePath: input.env.BROWSER_STORAGE_STATE_PATH,
          userDataDir: input.env.BROWSER_USER_DATA_DIR,
          chromeProfileDirectory: input.env.BROWSER_CHROME_PROFILE_DIRECTORY,
          timeoutMs: 90_000,
        });

  if (
    inspected.page.averageBidAmount === null &&
    inspected.page.averageDeadlineDays === null
  ) {
    const fallbackBrowser =
      input.env.BROWSER_AUTOMATION_RUNTIME === "python-playwright"
        ? await mockSubmit99FreelasProposalViaPython({
            amount: input.selection.proposal.amount,
            browserName: input.env.PYTHON_BROWSER_NAME,
            deadlineDays: input.selection.proposal.deadlineDays,
            detailsText: input.selection.proposal.detailsText,
            headless: true,
            profileDir: input.env.PYTHON_BROWSER_PROFILE_DIR,
            proposalPageUrl: input.selection.opportunity.url,
            pythonExecutable: input.env.PYTHON_EXECUTABLE,
            screenshotDir: input.env.BROWSER_SCREENSHOT_DIR,
            storageStatePath: input.env.PYTHON_BROWSER_STORAGE_STATE_PATH,
            timeoutMs: 90_000,
          })
        : await mockSubmit99FreelasProposal({
            amount: input.selection.proposal.amount,
            deadlineDays: input.selection.proposal.deadlineDays,
            detailsText: input.selection.proposal.detailsText,
            headless: true,
            proposalPageUrl: input.selection.opportunity.url,
            sessionMode: input.env.BROWSER_SESSION_MODE,
            storageStatePath: input.env.BROWSER_STORAGE_STATE_PATH,
            userDataDir: input.env.BROWSER_USER_DATA_DIR,
            chromeProfileDirectory: input.env.BROWSER_CHROME_PROFILE_DIRECTORY,
            timeoutMs: 90_000,
          });

    inspected = {
      ...inspected,
      page: fallbackBrowser.page,
      submitButtonVisible: fallbackBrowser.submitButtonVisible,
    };
  }

  if (
    inspected.page.averageBidAmount === null &&
    inspected.page.averageDeadlineDays === null
  ) {
    throw new Error(
      "Nao foi possivel validar media de propostas e prazo medio na pagina autenticada antes do preenchimento.",
    );
  }

  const currentOpportunity = input.selection.opportunity;
  const currentProposal = input.selection.proposal;

  const updatedOpportunity =
    inspected.page.averageBidAmount !== currentOpportunity.averageBidAmount ||
    inspected.page.averageDeadlineDays !== currentOpportunity.averageDeadlineDays
      ? await input.opportunities.update(currentOpportunity.id, {
          average_bid_amount:
            inspected.page.averageBidAmount ?? currentOpportunity.averageBidAmount ?? null,
          average_deadline_days:
            inspected.page.averageDeadlineDays ?? currentOpportunity.averageDeadlineDays ?? null,
          raw_payload: {
            ...asJsonObject(currentOpportunity.rawPayload),
            submissionPreparation: {
              inspectedAt: new Date().toISOString(),
              proposalPageSnapshot: inspected.page,
            },
          },
        })
      : currentOpportunity;

  const [pricingSetting, deadlineSetting, freelancerProfile] = await Promise.all([
    input.settings.getByKey("pricing.defaults"),
    input.settings.getByKey("deadline.defaults"),
    input.userProfiles.getPrimaryProfile(),
  ]);

  const pricingDefaults = asJsonObject(pricingSetting?.value);
  const deadlineDefaults = asJsonObject(deadlineSetting?.value);
  const minimumProposalAmountBrl =
    freelancerProfile?.minimumAmountBrl ??
    readNumberSetting(
      pricingDefaults,
      "minimumProposalAmountBrl",
      input.env.MIN_PROPOSAL_AMOUNT_BRL,
    );
  const minimumDailyRateBrl =
    freelancerProfile?.minimumDailyRateBrl ??
    readNumberSetting(
      pricingDefaults,
      "minimumDailyRateBrl",
      input.env.MIN_DAILY_RATE_BRL,
    );
  const defaultHourlyRateBrl =
    freelancerProfile?.defaultHourlyRateBrl ??
    readNumberSetting(
      pricingDefaults,
      "defaultHourlyRateBrl",
      input.env.DEFAULT_HOURLY_RATE_BRL,
    );

  const deadline = new DeadlineService().calculate({
    title: updatedOpportunity.title ?? "",
    description: updatedOpportunity.description ?? "",
    category: updatedOpportunity.category ?? "",
    skills: updatedOpportunity.skills,
    averageDeadlineDays: updatedOpportunity.averageDeadlineDays ?? null,
    deadlineReductionFactor: readNumberSetting(
      deadlineDefaults,
      "reductionFactor",
      input.env.DEADLINE_REDUCTION_FACTOR,
    ),
    minDeadlineDays: readIntegerSetting(
      deadlineDefaults,
      "minDeadlineDays",
      input.env.MIN_DEADLINE_DAYS,
    ),
    maxDeadlineDays: readIntegerSetting(
      deadlineDefaults,
      "maxDeadlineDays",
      input.env.MAX_DEADLINE_DAYS,
    ),
  });

  const pricing = new PricingService().calculate({
    title: updatedOpportunity.title ?? "",
    description: updatedOpportunity.description ?? "",
    category: updatedOpportunity.category ?? "",
    skills: updatedOpportunity.skills,
    deadlineDays: deadline.deadlineDays,
    averageBidAmount: updatedOpportunity.averageBidAmount ?? null,
    budgetMin: updatedOpportunity.budgetMin ?? null,
    budgetMax: updatedOpportunity.budgetMax ?? null,
    minimumPlatformOfferBrl: extractMinimumOfferAmount(updatedOpportunity.rawPayload),
    minimumProposalAmountBrl,
    minimumDailyRateBrl,
    defaultHourlyRateBrl,
    priceDiscountFactor: readNumberSetting(
      pricingDefaults,
      "discountFactor",
      input.env.PRICE_DISCOUNT_FACTOR,
    ),
  });

  const shouldRegenerate =
    currentProposal.amount !== pricing.amount ||
    currentProposal.deadlineDays !== deadline.deadlineDays ||
    currentOpportunity.averageBidAmount !== updatedOpportunity.averageBidAmount ||
    currentOpportunity.averageDeadlineDays !== updatedOpportunity.averageDeadlineDays;

  if (!shouldRegenerate) {
    return {
      proposal: currentProposal,
      opportunity: updatedOpportunity,
      reasons: [
        ...input.selection.reasons,
        "Sinais comerciais da pagina autenticada validados antes do preenchimento.",
      ],
    };
  }

  const llm = resolveProposalLlmProvider(input.env);
  const generated = await llm.generate({
    opportunity: updatedOpportunity,
    amount: pricing.amount,
    deadlineDays: deadline.deadlineDays,
    pricingExplanation: pricing.explanation,
    deadlineExplanation: deadline.explanation,
    matchedSkills: updatedOpportunity.matchedSkills,
    missingSkills: updatedOpportunity.missingSkills,
    decisionReasons: updatedOpportunity.decisionReasons,
    riskFlags: updatedOpportunity.riskFlags,
    freelancerProfile,
  });

  const compliance = new ComplianceValidatorService().validate({
    detailsText: sanitizeProposalText(generated.detailsText),
    skills: updatedOpportunity.skills,
    ...(withOptional("title", updatedOpportunity.title)),
    ...(withOptional("description", updatedOpportunity.description)),
  });

  const updatedProposal = await input.proposals.update(currentProposal.id, {
    amount: pricing.amount,
    deadline_days: deadline.deadlineDays,
    details_text: sanitizeProposalText(generated.detailsText),
    technical_summary: generated.technicalSummary,
    assumptions: generated.assumptions,
    questions: generated.questions,
    risks: generated.risks,
    llm_provider: generated.llmProvider,
    llm_model: generated.llmModel,
    llm_prompt_version: generated.llmPromptVersion,
    quality_score: generated.qualityScore,
    compliance_status: compliance.status,
    compliance_flags: compliance.flags,
    pricing_strategy: pricing.strategy,
    pricing_explanation: pricing.explanation,
    deadline_strategy: deadline.strategy,
    deadline_explanation: deadline.explanation,
  });

  return {
    proposal: updatedProposal,
    opportunity: updatedOpportunity,
    reasons: [
      ...input.selection.reasons,
      "Proposta recalculada com base nos sinais reais da pagina autenticada.",
    ],
  };
}

function canReusePreparedProposal(
  selection: ProposalSelectionResult,
  minDetailsLength: number,
): boolean {
  const { proposal, opportunity } = selection;

  return (
    typeof opportunity.averageBidAmount === "number" &&
    typeof opportunity.averageDeadlineDays === "number" &&
    Number.isFinite(opportunity.averageBidAmount) &&
    Number.isFinite(opportunity.averageDeadlineDays) &&
    proposal.amount > 0 &&
    proposal.deadlineDays > 0 &&
    proposal.detailsText.trim().length >= minDetailsLength &&
    proposal.complianceStatus === "APPROVED"
  );
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

  const bestCandidate = (
    await listProposalSelections({
      proposals: input.proposals,
      opportunities: input.opportunities,
      limit: 1,
    })
  )[0];

  if (!bestCandidate) {
    throw new Error("No eligible proposal is available for observation right now.");
  }

  return {
    proposal: bestCandidate.proposal,
    opportunity: bestCandidate.opportunity,
    reasons: bestCandidate.reasons,
  };
}

async function listProposalSelections(input: {
  proposals: ProposalRepository;
  opportunities: OpportunityRepository;
  limit: number;
}): Promise<Array<ProposalSelectionResult & { rank: number }>> {
  const proposals = await input.proposals.listRecent(Math.max(50, input.limit));
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

  return candidates.sort((a, b) => b.rank - a.rank).slice(0, input.limit);
}

function getBatchSkipReason(
  candidate: ProposalSelectionResult & { rank: number },
  autopilotMinScore: number,
): string | null {
  if (candidate.opportunity.decision !== "AUTO_SUBMIT") {
    return "Opportunity is not marked as AUTO_SUBMIT.";
  }

  if ((candidate.opportunity.score ?? 0) < autopilotMinScore) {
    return "Opportunity score is below the live batch minimum.";
  }

  const blockingFlags = new Set([
    "EXTERNAL_CONTACT_REQUEST",
    "OFF_PLATFORM_PAYMENT_REQUEST",
  ]);

  const matchedBlockingFlags = candidate.opportunity.riskFlags.filter((flag) =>
    blockingFlags.has(flag),
  );

  if (matchedBlockingFlags.length > 0) {
    return `Opportunity has blocking risk flags: ${matchedBlockingFlags.join(", ")}.`;
  }

  if (candidate.proposal.complianceStatus !== "APPROVED") {
    return "Proposal compliance is not approved.";
  }

  return null;
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

function assertControlledBrowserRuntime(
  env: WorkerEnv,
  command: "proposal:observe" | "proposal:submit",
): void {
  if (env.BROWSER_AUTOMATION_RUNTIME === "python-playwright") {
    return;
  }

  const sessionMode: BrowserSessionMode = env.BROWSER_SESSION_MODE;

  if (sessionMode !== "shared-profile") {
    return;
  }

  throw new Error(
    [
      `O comando ${command} nao deve rodar com BROWSER_SESSION_MODE="shared-profile".`,
      "Esse modo serve apenas como apoio ao fluxo manual/observado no Chrome real e nao oferece controle confiavel do Playwright sobre a nova janela.",
      'Para automacao controlada do worker, troque para BROWSER_SESSION_MODE="dedicated-profile".',
    ].join(" "),
  );
}

function resolveProposalLlmProvider(env: WorkerEnv): ProposalLlmProvider {
  if (env.LLM_PROVIDER === "openai" && env.OPENAI_API_KEY) {
    return createProposalLlmProvider({
      provider: "openai",
      openAiApiKey: env.OPENAI_API_KEY,
      openAiModel: env.OPENAI_MODEL,
      temperature: env.LLM_TEMPERATURE,
      maxOutputTokens: env.LLM_MAX_TOKENS,
    });
  }

  return createLocalTemplateProposalProvider();
}

function asJsonObject(value: JsonValue | null | undefined): Record<string, JsonValue> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, JsonValue>;
  }

  return {};
}

function readNumberSetting(
  source: Record<string, JsonValue>,
  key: string,
  fallback: number,
): number {
  const value = source[key];
  return typeof value === "number" ? value : fallback;
}

function readIntegerSetting(
  source: Record<string, JsonValue>,
  key: string,
  fallback: number,
): number {
  return Math.round(readNumberSetting(source, key, fallback));
}

function extractMinimumOfferAmount(rawPayload: JsonValue | null | undefined): number | null {
  const root = asJsonObject(rawPayload);
  const parse = asJsonObject(root.parse);
  const submissionPreparation = asJsonObject(root.submissionPreparation);
  const proposalPageSnapshot = asJsonObject(submissionPreparation.proposalPageSnapshot);

  const candidates = [
    proposalPageSnapshot.minimumOfferAmount,
    parse.minimumOfferAmount,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

function withOptional<TKey extends string, TValue>(
  key: TKey,
  value: TValue | undefined,
): { [key in TKey]?: TValue } {
  return value === undefined ? {} : { [key]: value } as { [key in TKey]?: TValue };
}

function isDuplicatedProposalError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("DUPLICATED_PROPOSAL:");
}

function extractDuplicateProposalReason(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Projeto ja possui proposta enviada anteriormente.";
  }

  return error.message
    .replace(/^.*DUPLICATED_PROPOSAL:\s*/s, "")
    .trim();
}

function buildDuplicatedBrowserResult(
  proposal: Proposal,
  opportunity: Opportunity,
  reason: string,
): ProposalSubmissionBrowserResult {
  return {
    currentUrl: opportunity.url,
    proposalPageUrl: opportunity.url,
    filledAmount: proposal.amount.toFixed(2),
    filledFinalAmount: proposal.amount.toFixed(2),
    filledDeadlineDays: String(proposal.deadlineDays),
    detailsLength: proposal.detailsText.length,
    page: {
      averageBidAmount: opportunity.averageBidAmount ?? null,
      averageDeadlineDays: opportunity.averageDeadlineDays ?? null,
      minimumOfferAmount: null,
      availableConnections: null,
      requiredConnections: null,
      hasProposalForm: false,
      hasQuestionChannel: false,
    },
    warnings: [],
    blockingReasons: [reason],
    readyForManualSubmit: false,
    submitButtonVisible: false,
    submitButtonEnabled: false,
    submitAttempted: false,
    submitted: false,
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
