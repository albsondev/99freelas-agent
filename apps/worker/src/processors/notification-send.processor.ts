import type { NotificationSendJobPayload } from "@99freelas/core";
import type { AutomationRunRepository } from "@99freelas/integrations";

export async function processNotificationSendJob(
  payload: NotificationSendJobPayload,
  runs: AutomationRunRepository,
): Promise<void> {
  console.log(
    JSON.stringify(
      {
        service: "worker",
        queue: "notification.send",
        event: payload.event,
        metadata: payload.metadata ?? {},
      },
      null,
      2,
    ),
  );

  await runs.update(payload.runId, {
    status: "COMPLETED",
    finished_at: new Date().toISOString(),
    metadata: {
      channel: payload.channel,
      event: payload.event,
      result: "NOTIFIED_CONSOLE",
    },
  });
}

