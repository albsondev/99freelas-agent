import { describe, expect, it } from "vitest";

import { DecisionEngineService } from "./decision-engine.service.js";

describe("DecisionEngineService", () => {
  it("allows AUTO_SUBMIT only when autopilot blockers are absent", () => {
    const service = new DecisionEngineService();
    const result = service.decide({
      mode: "AUTOPILOT",
      score: {
        score: 92,
        decisionHint: "AUTO_SUBMIT",
        reasons: ["Stack muito aderente."],
        matchedSkills: ["React", "Node.js"],
        missingSkills: [],
        riskFlags: [],
      },
      pricing: {
        amount: 700,
        strategy: "AVERAGE_BID_DISCOUNT",
        explanation: "ok",
        warnings: [],
      },
      deadline: {
        deadlineDays: 5,
        strategy: "AVERAGE_DEADLINE_REDUCTION",
        explanation: "ok",
        warnings: [],
        needsReview: false,
      },
      compliance: {
        status: "APPROVED",
        flags: [],
        blockingReasons: [],
      },
      minimumProposalAmountBrl: 150,
      minDeadlineDays: 2,
      hasAverageBid: true,
      clearScope: true,
      duplicateDetected: false,
      alreadySubmitted: false,
      sessionValid: true,
      formDetected: true,
      captchaDetected: false,
      dailyLimitReached: false,
      hourlyLimitReached: false,
      autoSubmitOnlyWithClearScope: true,
      autoSubmitOnlyWithAverageBid: false,
      rejectUnclearScopeWhenAutopilot: true,
    });

    expect(result.decision).toBe("AUTO_SUBMIT");
    expect(result.canSubmitAutomatically).toBe(true);
  });

  it("keeps autopilot permissive even with non-critical warnings", () => {
    const service = new DecisionEngineService();
    const result = service.decide({
      mode: "AUTOPILOT",
      score: {
        score: 68,
        decisionHint: "AUTO_SUBMIT",
        reasons: ["Projeto aderente, mas com algum grau de incerteza."],
        matchedSkills: ["PHP"],
        missingSkills: [],
        riskFlags: ["REACT_NATIVE_REVIEW_ONLY"],
      },
      pricing: {
        amount: 350,
        strategy: "HOURLY_ESTIMATE",
        explanation: "ok",
        warnings: ["Sem media de propostas; usando estimativa."],
      },
      deadline: {
        deadlineDays: 3,
        strategy: "COMPLEXITY_ESTIMATE",
        explanation: "ok",
        warnings: ["Prazo inferido por heuristica."],
        needsReview: true,
      },
      compliance: {
        status: "APPROVED",
        flags: ["TOO_LONG"],
        blockingReasons: [],
      },
      minimumProposalAmountBrl: 150,
      minDeadlineDays: 2,
      hasAverageBid: false,
      clearScope: false,
      duplicateDetected: false,
      alreadySubmitted: false,
      sessionValid: true,
      formDetected: true,
      captchaDetected: false,
      dailyLimitReached: false,
      hourlyLimitReached: false,
      autoSubmitOnlyWithClearScope: true,
      autoSubmitOnlyWithAverageBid: false,
      rejectUnclearScopeWhenAutopilot: true,
    });

    expect(result.decision).toBe("AUTO_SUBMIT");
    expect(result.canSubmitAutomatically).toBe(true);
  });

  it("returns FAILED when operational blockers appear", () => {
    const service = new DecisionEngineService();
    const result = service.decide({
      mode: "AUTOPILOT",
      score: {
        score: 90,
        decisionHint: "AUTO_SUBMIT",
        reasons: [],
        matchedSkills: [],
        missingSkills: [],
        riskFlags: [],
      },
      pricing: {
        amount: 500,
        strategy: "AVERAGE_BID_DISCOUNT",
        explanation: "ok",
        warnings: [],
      },
      deadline: {
        deadlineDays: 4,
        strategy: "COMPLEXITY_ESTIMATE",
        explanation: "ok",
        warnings: [],
        needsReview: false,
      },
      compliance: {
        status: "APPROVED",
        flags: [],
        blockingReasons: [],
      },
      minimumProposalAmountBrl: 150,
      minDeadlineDays: 2,
      hasAverageBid: true,
      clearScope: true,
      duplicateDetected: false,
      alreadySubmitted: false,
      sessionValid: false,
      formDetected: true,
      captchaDetected: false,
      dailyLimitReached: false,
      hourlyLimitReached: false,
      autoSubmitOnlyWithClearScope: true,
      autoSubmitOnlyWithAverageBid: false,
      rejectUnclearScopeWhenAutopilot: true,
    });

    expect(result.decision).toBe("FAILED");
    expect(result.canSubmitAutomatically).toBe(false);
  });

  it("does not block discounted market pricing below the personal minimum when average bid exists", () => {
    const service = new DecisionEngineService();
    const result = service.decide({
      mode: "AUTOPILOT",
      score: {
        score: 90,
        decisionHint: "AUTO_SUBMIT",
        reasons: [],
        matchedSkills: ["WordPress"],
        missingSkills: [],
        riskFlags: [],
      },
      pricing: {
        amount: 150,
        strategy: "AVERAGE_BID_DISCOUNT",
        explanation: "ok",
        warnings: [],
      },
      deadline: {
        deadlineDays: 2,
        strategy: "AVERAGE_DEADLINE_REDUCTION",
        explanation: "ok",
        warnings: [],
        needsReview: false,
      },
      compliance: {
        status: "APPROVED",
        flags: [],
        blockingReasons: [],
      },
      minimumProposalAmountBrl: 200,
      minDeadlineDays: 2,
      hasAverageBid: true,
      clearScope: true,
      duplicateDetected: false,
      alreadySubmitted: false,
      sessionValid: true,
      formDetected: true,
      captchaDetected: false,
      dailyLimitReached: false,
      hourlyLimitReached: false,
      autoSubmitOnlyWithClearScope: true,
      autoSubmitOnlyWithAverageBid: false,
      rejectUnclearScopeWhenAutopilot: true,
    });

    expect(result.decision).toBe("AUTO_SUBMIT");
    expect(result.blockingReasons).toEqual([]);
  });
});
