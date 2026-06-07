import type { SubmissionStatus } from "@99freelas/core";
import {
  createSupabaseAdminClient,
  mockSubmit99FreelasProposal,
  OpportunityRepository,
  ProposalRepository,
} from "@99freelas/integrations";

import type { WorkerEnv } from "../env.js";

export type ProposalSubmitExecutionResult = {
  proposalId: string;
  opportunityId: string;
  submissionStatus: SubmissionStatus;
  submissionError: string | null;
  beforeScreenshotPath: string | null;
  afterScreenshotPath: string | null;
  browser: Awaited<ReturnType<typeof mockSubmit99FreelasProposal>>;
};

export async function executeProposalSubmitMock(input: {
  env: WorkerEnv;
  proposalId?: string | null;
}): Promise<ProposalSubmitExecutionResult> {
  const client = createSupabaseAdminClient({
    supabaseUrl: input.env.SUPABASE_URL,
    supabaseKey: input.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const proposals = new ProposalRepository(client);
  const opportunities = new OpportunityRepository(client);
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
        : "No pending proposal was found to simulate submission.",
    );
  }

  const opportunity = await opportunities.getById(proposal.opportunityId);

  if (!opportunity) {
    throw new Error(
      `Opportunity ${proposal.opportunityId} linked to proposal ${proposal.id} was not found.`,
    );
  }

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
    browser,
  };
}
