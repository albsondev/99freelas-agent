import type { Opportunity } from "../domain/opportunity.js";
import type { Proposal } from "../domain/proposal.js";

export type ProposalSubmissionGuardrailsInput = {
  mode: "DRY_RUN" | "REVIEW_REQUIRED" | "AUTOPILOT";
  proposal: Pick<
    Proposal,
    "amount" | "detailsText" | "complianceFlags" | "complianceStatus" | "submissionStatus"
  >;
  opportunity: Pick<Opportunity, "decision" | "riskFlags" | "score">;
  browserReadiness?: {
    readyForManualSubmit: boolean;
    blockingReasons: string[];
    warnings: string[];
  };
  allowRealSubmission: boolean;
  explicitLiveConfirmation: boolean;
  autopilotMinScore: number;
  minDetailsLength: number;
  dailySubmissionCount: number;
  hourlySubmissionCount: number;
  maxSubmissionsPerDay: number;
  maxSubmissionsPerHour: number;
};

export type ProposalSubmissionGuardrailsResult = {
  status: "READY_FOR_REAL_SUBMIT" | "REVIEW_REQUIRED" | "BLOCKED";
  canSubmitForReal: boolean;
  blockingReasons: string[];
  reviewReasons: string[];
  warnings: string[];
};

const HARD_BLOCKING_RISK_FLAGS = new Set([
  "EXTERNAL_CONTACT_REQUEST",
  "OFF_PLATFORM_PAYMENT_REQUEST",
  "UNCLEAR_SCOPE",
  "LOW_BUDGET",
  "LOW_AVERAGE_BID",
  "IMPOSSIBLE_DEADLINE",
  "PURE_DESIGN_SCOPE",
  "MARKETING_SCOPE",
  "NATIVE_APP_SCOPE",
]);

export class ProposalSubmissionGuardrailsService {
  evaluate(
    input: ProposalSubmissionGuardrailsInput,
  ): ProposalSubmissionGuardrailsResult {
    const blockingReasons: string[] = [];
    const reviewReasons: string[] = [];
    const warnings = [...new Set(input.browserReadiness?.warnings ?? [])];

    if (
      input.proposal.submissionStatus === "SUBMITTED" ||
      input.proposal.submissionStatus === "DUPLICATED"
    ) {
      blockingReasons.push("A proposta ja foi enviada anteriormente.");
    }

    if (input.proposal.complianceStatus === "BLOCKED") {
      blockingReasons.push("Compliance bloqueou a proposta para envio real.");
    } else if (input.proposal.complianceStatus !== "APPROVED") {
      reviewReasons.push("Compliance ainda nao aprovou a proposta para envio real.");
    }

    if (input.opportunity.decision === "REJECTED" || input.opportunity.decision === "FAILED") {
      blockingReasons.push("A oportunidade nao esta apta para submissao automatica.");
    } else if (input.opportunity.decision !== "AUTO_SUBMIT") {
      reviewReasons.push("A oportunidade ainda nao foi marcada como AUTO_SUBMIT.");
    }

    if ((input.opportunity.score ?? 0) < input.autopilotMinScore) {
      blockingReasons.push("Score abaixo do minimo configurado para envio real.");
    }

    const hardRiskFlags = input.opportunity.riskFlags.filter((flag) =>
      HARD_BLOCKING_RISK_FLAGS.has(flag),
    );

    if (hardRiskFlags.length > 0) {
      blockingReasons.push(
        `Risk flags bloqueantes detectadas: ${hardRiskFlags.join(", ")}.`,
      );
    }

    if (input.proposal.detailsText.trim().length < input.minDetailsLength) {
      blockingReasons.push("Texto da proposta ficou abaixo do minimo seguro.");
    }

    if (input.dailySubmissionCount >= input.maxSubmissionsPerDay) {
      blockingReasons.push("Limite diario de submissao automatica atingido.");
    }

    if (input.hourlySubmissionCount >= input.maxSubmissionsPerHour) {
      blockingReasons.push("Limite horario de submissao automatica atingido.");
    }

    if (input.mode !== "AUTOPILOT") {
      reviewReasons.push("Modo atual nao e AUTOPILOT.");
    }

    if (!input.allowRealSubmission) {
      reviewReasons.push("Flag explicita de envio real ainda esta desabilitada.");
    }

    if (!input.explicitLiveConfirmation) {
      reviewReasons.push("Faltou a confirmacao explicita do comando para envio real.");
    }

    if (input.browserReadiness) {
      blockingReasons.push(...input.browserReadiness.blockingReasons);

      if (!input.browserReadiness.readyForManualSubmit) {
        blockingReasons.push("A pagina ainda nao ficou pronta para um submit seguro.");
      }
    }

    if (blockingReasons.length > 0) {
      return {
        status: "BLOCKED",
        canSubmitForReal: false,
        blockingReasons: [...new Set(blockingReasons)],
        reviewReasons: [...new Set(reviewReasons)],
        warnings,
      };
    }

    if (reviewReasons.length > 0) {
      return {
        status: "REVIEW_REQUIRED",
        canSubmitForReal: false,
        blockingReasons: [],
        reviewReasons: [...new Set(reviewReasons)],
        warnings,
      };
    }

    return {
      status: "READY_FOR_REAL_SUBMIT",
      canSubmitForReal: true,
      blockingReasons: [],
      reviewReasons: [],
      warnings,
    };
  }
}
