import { describe, expect, it } from "vitest";

import { ProposalSubmissionGuardrailsService } from "./proposal-submission-guardrails.service.js";

describe("ProposalSubmissionGuardrailsService", () => {
  it("permite envio real quando todos os guardrails passam", () => {
    const result = new ProposalSubmissionGuardrailsService().evaluate({
      mode: "AUTOPILOT",
      proposal: {
        amount: 650,
        detailsText: "Tenho experiencia direta com React, Next.js e Tailwind. Posso corrigir os ajustes visuais, revisar responsividade, alinhar componentes e entregar com validacao funcional bem documentada ainda nesta semana.",
        complianceFlags: [],
        complianceStatus: "APPROVED",
        submissionStatus: "PENDING",
      },
      opportunity: {
        decision: "AUTO_SUBMIT",
        riskFlags: [],
        score: 93,
      },
      browserReadiness: {
        readyForManualSubmit: true,
        blockingReasons: [],
        warnings: [],
      },
      allowRealSubmission: true,
      explicitLiveConfirmation: true,
      autopilotMinScore: 85,
      minDetailsLength: 120,
      dailySubmissionCount: 1,
      hourlySubmissionCount: 0,
      maxSubmissionsPerDay: 10,
      maxSubmissionsPerHour: 3,
    });

    expect(result.status).toBe("READY_FOR_REAL_SUBMIT");
    expect(result.canSubmitForReal).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.reviewReasons).toEqual([]);
  });

  it("bloqueia quando encontra riscos operacionais ou de conteudo", () => {
    const result = new ProposalSubmissionGuardrailsService().evaluate({
      mode: "AUTOPILOT",
      proposal: {
        amount: 90,
        detailsText: "Texto curto",
        complianceFlags: ["TOO_SHORT"],
        complianceStatus: "BLOCKED",
        submissionStatus: "PENDING",
      },
      opportunity: {
        decision: "AUTO_SUBMIT",
        riskFlags: ["UNCLEAR_SCOPE"],
        score: 78,
      },
      browserReadiness: {
        readyForManualSubmit: false,
        blockingReasons: ["Botao de envio nao esta habilitado."],
        warnings: ["Atencao: nao compartilhe suas informacoes de contato."],
      },
      allowRealSubmission: true,
      explicitLiveConfirmation: true,
      autopilotMinScore: 85,
      minDetailsLength: 120,
      dailySubmissionCount: 10,
      hourlySubmissionCount: 4,
      maxSubmissionsPerDay: 10,
      maxSubmissionsPerHour: 4,
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.canSubmitForReal).toBe(false);
    expect(result.blockingReasons).toContain(
      "Compliance bloqueou a proposta para envio real.",
    );
    expect(result.blockingReasons).toContain(
      "Botao de envio nao esta habilitado.",
    );
    expect(result.warnings).toHaveLength(1);
  });

  it("pede revisao quando faltam apenas chaves explicitas de liberacao", () => {
    const result = new ProposalSubmissionGuardrailsService().evaluate({
      mode: "REVIEW_REQUIRED",
      proposal: {
        amount: 500,
        detailsText: "Tenho vivencia com correcao de bugs em React e Next.js, consigo revisar o fluxo visual, componentes compartilhados e responsividade com entrega objetiva e comunicacao clara durante todo o processo.",
        complianceFlags: [],
        complianceStatus: "APPROVED",
        submissionStatus: "PENDING",
      },
      opportunity: {
        decision: "REVIEW_REQUIRED",
        riskFlags: [],
        score: 90,
      },
      browserReadiness: {
        readyForManualSubmit: true,
        blockingReasons: [],
        warnings: [],
      },
      allowRealSubmission: false,
      explicitLiveConfirmation: false,
      autopilotMinScore: 85,
      minDetailsLength: 120,
      dailySubmissionCount: 0,
      hourlySubmissionCount: 0,
      maxSubmissionsPerDay: 10,
      maxSubmissionsPerHour: 4,
    });

    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.canSubmitForReal).toBe(false);
    expect(result.reviewReasons).toContain("Modo atual nao e AUTOPILOT.");
    expect(result.reviewReasons).toContain(
      "Flag explicita de envio real ainda esta desabilitada.",
    );
  });
});
