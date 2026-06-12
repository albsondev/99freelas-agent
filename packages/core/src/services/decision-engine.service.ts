import type { AutomationMode, OpportunityDecision } from "../domain/decision.js";
import type { ComplianceResult } from "./compliance-validator.service.js";
import type { DeadlineResult } from "./deadline.service.js";
import type { PricingResult } from "./pricing.service.js";
import type { ScoreResult } from "./opportunity-scoring.service.js";

export type DecisionEngineInput = {
  mode: AutomationMode;
  score: ScoreResult;
  pricing: PricingResult;
  deadline: DeadlineResult;
  compliance: ComplianceResult;
  minimumProposalAmountBrl: number;
  minDeadlineDays: number;
  hasAverageBid: boolean;
  clearScope: boolean;
  duplicateDetected: boolean;
  alreadySubmitted: boolean;
  sessionValid: boolean;
  formDetected: boolean;
  captchaDetected: boolean;
  dailyLimitReached: boolean;
  hourlyLimitReached: boolean;
  autoSubmitOnlyWithClearScope: boolean;
  autoSubmitOnlyWithAverageBid: boolean;
  rejectUnclearScopeWhenAutopilot: boolean;
};

export type DecisionResult = {
  decision: OpportunityDecision;
  canSubmitAutomatically: boolean;
  reasons: string[];
  blockingReasons: string[];
  riskFlags: string[];
};

export class DecisionEngineService {
  decide(input: DecisionEngineInput): DecisionResult {
    const reasons = [...input.score.reasons];
    const blockingReasons: string[] = [];
    const riskFlags = [...new Set(input.score.riskFlags)];

    if (!input.sessionValid) {
      blockingReasons.push("Sessao do navegador nao esta valida.");
    }

    if (!input.formDetected) {
      blockingReasons.push("Formulario de proposta nao foi identificado.");
    }

    if (input.captchaDetected) {
      blockingReasons.push("Captcha detectado; envio automatico deve parar.");
    }

    if (input.duplicateDetected || input.alreadySubmitted) {
      blockingReasons.push("Projeto ou proposta ja processado anteriormente.");
    }

    if (input.dailyLimitReached || input.hourlyLimitReached) {
      blockingReasons.push("Limite operacional de envio automatico atingido.");
    }

    const mustEnforceMinimumProposalAmount =
      !(input.hasAverageBid && input.pricing.strategy === "AVERAGE_BID_DISCOUNT");

    if (
      mustEnforceMinimumProposalAmount &&
      input.pricing.amount < input.minimumProposalAmountBrl
    ) {
      blockingReasons.push("Valor calculado ficou abaixo do minimo configurado.");
    }

    if (input.deadline.deadlineDays < input.minDeadlineDays) {
      blockingReasons.push("Prazo calculado ficou abaixo do minimo configurado.");
    }

    if (input.compliance.status === "BLOCKED") {
      blockingReasons.push(...input.compliance.blockingReasons);
    }

    if (
      input.mode === "AUTOPILOT" &&
      input.rejectUnclearScopeWhenAutopilot &&
      !input.clearScope
    ) {
      blockingReasons.push("Escopo pouco claro para envio automatico.");
    }

    if (
      input.mode === "AUTOPILOT" &&
      input.autoSubmitOnlyWithAverageBid &&
      !input.hasAverageBid
    ) {
      blockingReasons.push("Autopilot exige media de propostas disponivel.");
    }

    const operationalFailure =
      !input.sessionValid || !input.formDetected || input.captchaDetected;

    if (operationalFailure) {
      return {
        decision: "FAILED",
        canSubmitAutomatically: false,
        reasons,
        blockingReasons,
        riskFlags,
      };
    }

    if (
      input.score.decisionHint === "REJECTED" ||
      input.compliance.status === "BLOCKED"
    ) {
      return {
        decision: "REJECTED",
        canSubmitAutomatically: false,
        reasons,
        blockingReasons,
        riskFlags,
      };
    }

    if (input.mode === "DRY_RUN") {
      return {
        decision: "REVIEW_REQUIRED",
        canSubmitAutomatically: false,
        reasons: [...reasons, "Modo DRY_RUN impede envio automatico."],
        blockingReasons,
        riskFlags,
      };
    }

    if (input.mode === "REVIEW_REQUIRED") {
      return {
        decision: "REVIEW_REQUIRED",
        canSubmitAutomatically: false,
        reasons: [...reasons, "Modo REVIEW_REQUIRED exige aprovacao manual."],
        blockingReasons,
        riskFlags,
      };
    }

    const autopilotBlocked =
      blockingReasons.length > 0 ||
      input.compliance.status !== "APPROVED" ||
      input.deadline.needsReview ||
      input.pricing.warnings.length > 0 ||
      (input.autoSubmitOnlyWithClearScope && !input.clearScope);

    if (input.score.decisionHint === "AUTO_SUBMIT" && !autopilotBlocked) {
      return {
        decision: "AUTO_SUBMIT",
        canSubmitAutomatically: true,
        reasons: [...reasons, "Projeto apto para autopilot com alta confianca."],
        blockingReasons,
        riskFlags,
      };
    }

    return {
      decision: "REVIEW_REQUIRED",
      canSubmitAutomatically: false,
      reasons: [...reasons, "Projeto exige revisao antes de qualquer envio real."],
      blockingReasons,
      riskFlags,
    };
  }
}
