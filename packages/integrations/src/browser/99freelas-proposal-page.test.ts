import { describe, expect, it } from "vitest";

import { parse99FreelasProposalPage } from "./99freelas-proposal-page.js";

describe("parse99FreelasProposalPage", () => {
  it("extracts commercial signals from a real proposal page snapshot", () => {
    const snapshot = `
- heading "Front-end e design React, Next.js + Tailwind para ajustes (+ detalhes)" [level=1]
- text: "Valor médio das propostas: R$ 467,31"
- text: "Duração média estimada: 8 dias"
- heading "Enviar proposta" [level=2]
- generic: Sua oferta
- textbox "Sua oferta": 50,00
- generic: "(Oferta mínima: R$ 50,00)"
- generic: Duração estimada
- textbox "Duração estimada"
- generic: Detalhes
- textbox "Detalhes":
- generic: Esta proposta requer 1 conexão. Após enviar esta proposta, você terá 250 conexões restantes.
- button "Enviar proposta"
- link "Fazer pergunta":
  - /url: https://www.99freelas.com.br/project/message/front-end-e-design-react-next-js-tailwind-para-ajustes-758611
    `;

    expect(parse99FreelasProposalPage(snapshot)).toEqual({
      averageBidAmount: 467.31,
      averageDeadlineDays: 8,
      minimumOfferAmount: 50,
      availableConnections: 250,
      requiredConnections: 1,
      hasProposalForm: true,
      hasQuestionChannel: true,
    });
  });

  it("returns nulls when the proposal page has not loaded the expected commercial data", () => {
    expect(parse99FreelasProposalPage('heading "Página inicial"')).toEqual({
      averageBidAmount: null,
      averageDeadlineDays: null,
      minimumOfferAmount: null,
      availableConnections: null,
      requiredConnections: null,
      hasProposalForm: false,
      hasQuestionChannel: false,
    });
  });
});
