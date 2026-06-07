import { describe, expect, it } from "vitest";

import {
  assessSubmissionReadiness,
  extract99FreelasProposalWarnings,
} from "./99freelas-proposal-submit.js";

describe("99Freelas proposal submit helpers", () => {
  it("extracts page warnings relevant to final proposal submission", () => {
    const warnings = extract99FreelasProposalWarnings(`
Atenção: não compartilhe suas informações de contato.
Esta proposta requer 1 conexão. Após enviar esta proposta, você terá 250 conexões restantes.
Outro texto irrelevante.
    `);

    expect(warnings).toEqual([
      "Atenção: não compartilhe suas informações de contato.",
      "Esta proposta requer 1 conexão. Após enviar esta proposta, você terá 250 conexões restantes.",
    ]);
  });

  it("marks the page as ready when the real form is visible and consistent", () => {
    expect(
      assessSubmissionReadiness({
        detailsLength: 420,
        page: {
          averageBidAmount: 467.31,
          averageDeadlineDays: 8,
          minimumOfferAmount: 50,
          availableConnections: 250,
          requiredConnections: 1,
          hasProposalForm: true,
          hasQuestionChannel: true,
        },
        submitButtonVisible: true,
        submitButtonEnabled: true,
      }),
    ).toEqual([]);
  });

  it("returns blocking reasons when the page is not safe to submit", () => {
    expect(
      assessSubmissionReadiness({
        detailsLength: 90,
        page: {
          averageBidAmount: 467.31,
          averageDeadlineDays: 8,
          minimumOfferAmount: 50,
          availableConnections: 0,
          requiredConnections: 1,
          hasProposalForm: false,
          hasQuestionChannel: true,
        },
        submitButtonVisible: false,
        submitButtonEnabled: false,
      }),
    ).toEqual([
      "Formulario de proposta nao foi encontrado.",
      "Botao de envio nao esta visivel.",
      "Botao de envio nao esta habilitado.",
      "Texto da proposta ficou curto demais para envio seguro.",
      "Quantidade de conexoes disponiveis nao cobre a proposta.",
    ]);
  });
});
