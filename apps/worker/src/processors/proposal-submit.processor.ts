import type { ProposalSubmitJobPayload } from "@99freelas/core";
import type {
  AutomationRunRepository,
  ProposalRepository,
} from "@99freelas/integrations";

type ProcessProposalSubmitContext = {
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

  await context.proposals.update(payload.proposalId, {
    submission_status: "PENDING",
  });

  await context.runs.update(payload.runId, {
    status: "COMPLETED",
    finished_at: new Date().toISOString(),
    metadata: {
      proposalId: payload.proposalId,
      result: "SUBMIT_PLACEHOLDER_PHASE_3",
    },
  });
}

