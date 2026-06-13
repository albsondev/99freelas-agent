import { describe, expect, it } from "vitest";

import { OpportunitySourcingService } from "./opportunity-sourcing.service.js";

describe("OpportunitySourcingService", () => {
  it("prioritizes recommended notifications before active hunting", () => {
    const service = new OpportunitySourcingService();

    const plan = service.buildPlan({
      notificationLimit: 20,
    });

    expect(plan.strategy).toBe("RECOMMENDED_NOTIFICATIONS_FIRST");
    expect(plan.steps.map((step) => step.action)).toEqual([
      "PROCESS_RECOMMENDED_NOTIFICATIONS",
      "HUNT_PROJECT_LIST",
    ]);
    expect(plan.steps[0]?.targetUrl).toContain("/project-notifications/view?limit=20");
    expect(plan.steps[1]?.targetUrl).toBe(
      "https://www.99freelas.com.br/projects?categoria=web-mobile-e-software",
    );
  });

  it("can build a retry-first plan without losing the primary sourcing order", () => {
    const service = new OpportunitySourcingService();

    const plan = service.buildPlan({
      retryFailed: true,
    });

    expect(plan.strategy).toBe("RETRY_FAILED_FIRST");
    expect(plan.steps.map((step) => step.action)).toEqual([
      "RETRY_FAILED_SWEEP",
      "PROCESS_RECOMMENDED_NOTIFICATIONS",
      "HUNT_PROJECT_LIST",
    ]);
  });
});
