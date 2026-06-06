import type { AutomationRunRepository } from "@99freelas/integrations";
import type { EmailPollJobPayload } from "@99freelas/core";

export async function processEmailPollJob(
  payload: EmailPollJobPayload,
  runs: AutomationRunRepository,
): Promise<void> {
  await runs.update(payload.runId, {
    status: "COMPLETED",
    finished_at: new Date().toISOString(),
    metadata: {
      triggeredBy: payload.triggeredBy,
      result: "NOOP_MVP_PHASE_3",
    },
  });
}

