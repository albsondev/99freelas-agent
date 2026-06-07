import type { ProposalSubmitJobPayload } from "@99freelas/core";
import type {
  AutomationRunRepository,
  ProposalRepository,
} from "@99freelas/integrations";

import type { WorkerEnv } from "../env.js";
import { executeProposalSubmitMock } from "../commands/proposal-submit.command.js";

type ProcessProposalSubmitContext = {
  env: WorkerEnv;
  proposals: ProposalRepository;
  runs: AutomationRunRepository;
};

export async function processProposalSubmitJob(
  payload: ProposalSubmitJobPayload,
  context: ProcessProposalSubmitContext,
): Promise<void> {
  await context.runs.update(payload.runId, {
    status: "PROCESSING",
  });

  const proposal = await context.proposals.getById(payload.proposalId);

  if (!proposal) {
    await context.runs.update(payload.runId, {
      status: "FAILED",
      finished_at: new Date().toISOString(),
      error_code: "PROPOSAL_NOT_FOUND",
      error_message: `Proposal ${payload.proposalId} was not found`,
    });
    return;
  }

  const result = await executeProposalSubmitMock({
    env: context.env,
    proposalId: payload.proposalId,
  });

  await context.runs.update(payload.runId, {
    status: result.submissionStatus === "FAILED_REQUIRES_MANUAL_ACTION" ? "FAILED" : "COMPLETED",
    finished_at: new Date().toISOString(),
    proposal_id: payload.proposalId,
    error_code:
      result.submissionStatus === "FAILED_REQUIRES_MANUAL_ACTION"
        ? "SUBMIT_BLOCKED_IN_MOCK_MODE"
        : null,
    error_message: result.submissionError,
    metadata: {
      proposalId: payload.proposalId,
      opportunityId: result.opportunityId,
      result: "SUBMIT_MOCKED_PHASE_8",
      submissionStatus: result.submissionStatus,
      beforeScreenshotPath: result.beforeScreenshotPath,
      afterScreenshotPath: result.afterScreenshotPath,
      browser: result.browser,
    },
  });
}
