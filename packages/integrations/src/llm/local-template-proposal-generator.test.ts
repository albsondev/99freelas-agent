import { describe, expect, it } from "vitest";

import { proposalDraftSchema } from "./proposal-draft.schema.js";
import { createLocalTemplateProposalProvider } from "./local-template-proposal-generator.js";

describe("local template proposal generator", () => {
  it("builds a valid proposal draft without any API dependency", async () => {
    const provider = createLocalTemplateProposalProvider();

    const result = await provider.generate({
      opportunity: {
        id: "opp-1",
        source: "MANUAL_URL",
        url: "https://www.99freelas.com.br/project/teste-1",
        title: "Correcao de bugs em sistema Next.js",
        description:
          "Preciso corrigir erros em um sistema online feito com Next.js, React e Node.js. O foco é estabilizar o fluxo de login e alguns ajustes de dashboard.",
        category: "Desenvolvimento Web",
        skills: ["Next.js", "React", "Node.js"],
        rawPayload: {},
        status: "QUALIFIED",
        decisionReasons: ["MATCHED_STACK"],
        riskFlags: [],
        matchedSkills: ["Next.js", "React", "Node.js"],
        missingSkills: [],
        score: 91,
        firstSeenAt: "2026-06-12T00:00:00.000Z",
        lastSeenAt: "2026-06-12T00:00:00.000Z",
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z",
      },
      amount: 850,
      deadlineDays: 4,
      pricingExplanation: "Abaixo da media para ganhar competitividade.",
      deadlineExplanation: "Prazo reduzido com foco nos itens prioritarios.",
      matchedSkills: ["Next.js", "React", "Node.js"],
      missingSkills: [],
      decisionReasons: ["MATCHED_STACK"],
      riskFlags: [],
    });

    const parsed = proposalDraftSchema.parse({
      technicalSummary: result.technicalSummary,
      detailsText: result.detailsText,
      assumptions: result.assumptions,
      questions: result.questions,
      risks: result.risks,
      qualityScore: result.qualityScore,
    });

    expect(parsed.detailsText).toContain("Next.js");
    expect(parsed.detailsText.length).toBeGreaterThanOrEqual(160);
    expect(result.llmProvider).toBe("local-template");
    expect(result.llmModel).toBe("local-template-v1");
    expect(result.detailsText.toLowerCase()).not.toContain("whatsapp");
    expect(result.detailsText.toLowerCase()).not.toContain("http");
    expect(result.detailsText).toMatch(/faz bastante sentido|entendi bem|me parece|pensando no resultado/i);
    expect(result.detailsText).toMatch(/comunicação|acompanhar|plataforma|tranquilidade/i);
    expect(result.technicalSummary).toContain("entrega planejada");
  });

  it("switches to a more cautious tone when the scope is unclear", async () => {
    const provider = createLocalTemplateProposalProvider();

    const result = await provider.generate({
      opportunity: {
        id: "opp-2",
        source: "MANUAL_URL",
        url: "https://www.99freelas.com.br/project/teste-2",
        title: "Ajustes diversos em sistema legado",
        description:
          "Projeto com escopo aberto, alguns bugs e possiveis integracoes ainda nao detalhadas.",
        category: "Desenvolvimento Web",
        skills: ["PHP"],
        rawPayload: {},
        status: "QUALIFIED",
        decisionReasons: ["REVIEW_SCOPE"],
        riskFlags: ["UNCLEAR_SCOPE"],
        matchedSkills: ["PHP"],
        missingSkills: ["Integracoes"],
        score: 68,
        firstSeenAt: "2026-06-12T00:00:00.000Z",
        lastSeenAt: "2026-06-12T00:00:00.000Z",
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z",
      },
      amount: 600,
      deadlineDays: 5,
      pricingExplanation: "Proposta enxuta para entrada rapida.",
      deadlineExplanation: "Primeira entrega priorizando o que e critico.",
      matchedSkills: ["PHP"],
      missingSkills: ["Integracoes"],
      decisionReasons: ["REVIEW_SCOPE"],
      riskFlags: ["UNCLEAR_SCOPE"],
    });

    expect(result.detailsText).toMatch(/validando primeiro os pontos críticos|alinhar isso logo no começo/i);
    expect(result.risks[0]).toContain("Escopo");
    expect(result.risks[0]).toContain("análise");
    expect(result.qualityScore).toBeLessThan(90);
  });

  it("caps details text length even when the listing title comes noisy", async () => {
    const provider = createLocalTemplateProposalProvider();

    const result = await provider.generate({
      opportunity: {
        id: "opp-3",
        source: "PROJECT_LISTING",
        url: "https://www.99freelas.com.br/project/teste-3",
        title:
          "Desenvolvimento web full stack - TypeScript, JavaScript e Python Desenvolvimento Web | Intermediário Preciso de um desenvolvedor full stack especializado em TypeScript/JavaScript e Python. Temos um sistema de CRM e precisamos de um profissional para manutenção, evolução, integrações, correções e melhorias contínuas com bastante agilidade e boa comunicação.",
        description:
          "Precisamos de apoio contínuo para manutenção do CRM, correção de bugs, pequenos ajustes, integrações, revisão de fluxos e melhorias em módulos já existentes. O objetivo é estabilizar o sistema e acelerar a evolução sem criar retrabalho.",
        category: "Desenvolvimento Web",
        skills: ["TypeScript", "JavaScript", "Python", "React", "Node.js"],
        rawPayload: {},
        status: "QUALIFIED",
        decisionReasons: ["MATCHED_STACK"],
        riskFlags: [],
        matchedSkills: ["TypeScript", "JavaScript", "React", "Node.js"],
        missingSkills: [],
        score: 88,
        firstSeenAt: "2026-06-12T00:00:00.000Z",
        lastSeenAt: "2026-06-12T00:00:00.000Z",
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z",
      },
      amount: 1400,
      deadlineDays: 7,
      pricingExplanation: "Abaixo da media para manter competitividade sem perder viabilidade.",
      deadlineExplanation: "Prazo pensado para atacar prioridades sem prometer correria artificial.",
      matchedSkills: ["TypeScript", "JavaScript", "React", "Node.js"],
      missingSkills: [],
      decisionReasons: ["MATCHED_STACK"],
      riskFlags: [],
    });

    expect(result.detailsText.length).toBeLessThanOrEqual(1200);
    expect(result.detailsText.length).toBeGreaterThanOrEqual(160);
    expect(result.detailsText).toContain("TypeScript");
  });
});
