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
    expect(result.detailsText).toMatch(/olá, tudo bem|ola, tudo bem/i);
    expect(result.detailsText).toMatch(/faz bastante sentido|entendi bem|me parece|pensando no resultado|analisei sua solicitação|consigo te ajudar/i);
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

  it("uses the wordpress/sites family when the project is site oriented", async () => {
    const provider = createLocalTemplateProposalProvider();

    const result = await provider.generate({
      opportunity: {
        id: "opp-4",
        source: "PROJECT_LISTING",
        url: "https://www.99freelas.com.br/project/teste-4",
        title: "Ajustes de layout e responsividade em site WordPress com Elementor",
        description:
          "Preciso corrigir seções, ajustar layout mobile, revisar blog e melhorar a responsividade de um site em WordPress com Elementor.",
        category: "Desenvolvimento Web",
        skills: ["WordPress", "Elementor"],
        rawPayload: {},
        status: "QUALIFIED",
        decisionReasons: ["MATCHED_STACK"],
        riskFlags: [],
        matchedSkills: ["WordPress"],
        missingSkills: [],
        score: 89,
        firstSeenAt: "2026-06-12T00:00:00.000Z",
        lastSeenAt: "2026-06-12T00:00:00.000Z",
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z",
      },
      amount: 500,
      deadlineDays: 3,
      pricingExplanation: "Estimativa competitiva.",
      deadlineExplanation: "Prazo pensado para revisão e implementação.",
      matchedSkills: ["WordPress"],
      missingSkills: [],
      decisionReasons: ["MATCHED_STACK"],
      riskFlags: [],
    });

    expect(result.detailsText).toMatch(/wordpress|elementor/i);
    expect(result.detailsText).toMatch(/site|layout|responsividade|visitante/i);
  });

  it("uses the systems and bugs family when the project is technical", async () => {
    const provider = createLocalTemplateProposalProvider();

    const result = await provider.generate({
      opportunity: {
        id: "opp-5",
        source: "PROJECT_LISTING",
        url: "https://www.99freelas.com.br/project/teste-5",
        title: "Correção de bugs e ajustes em sistema React com API",
        description:
          "Projeto para corrigir bugs, ajustar integração com API e melhorar alguns fluxos de dashboard em sistema React já em produção.",
        category: "Desenvolvimento Web",
        skills: ["React", "API REST"],
        rawPayload: {},
        status: "QUALIFIED",
        decisionReasons: ["MATCHED_STACK"],
        riskFlags: [],
        matchedSkills: ["React", "API REST"],
        missingSkills: [],
        score: 90,
        firstSeenAt: "2026-06-12T00:00:00.000Z",
        lastSeenAt: "2026-06-12T00:00:00.000Z",
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z",
      },
      amount: 700,
      deadlineDays: 4,
      pricingExplanation: "Estimativa competitiva.",
      deadlineExplanation: "Prazo pensado para análise e correção.",
      matchedSkills: ["React", "API REST"],
      missingSkills: [],
      decisionReasons: ["MATCHED_STACK"],
      riskFlags: [],
    });

    expect(result.detailsText).toMatch(/funcionamento atual|ponto exato do ajuste|sistema/i);
    expect(result.detailsText).toMatch(/estabilidade|manutenção|melhorias técnicas/i);
  });

  it("does not classify institutional portfolio projects as AI projects", async () => {
    const provider = createLocalTemplateProposalProvider();

    const result = await provider.generate({
      opportunity: {
        id: "opp-6",
        source: "PROJECT_LISTING",
        url: "https://www.99freelas.com.br/project/teste-6",
        title: "Atualização de site profissional para galeria de arte e portfólio",
        description:
          "Fotógrafo fine art contemporâneo busca profissional para refinamento de site autoral já existente, voltado para galeria de arte e portfólio de artista. Necessário repertório estético refinado, entendimento editorial e experiência com Webflow/Framer/WordPress premium.",
        category: "Desenvolvimento Web",
        skills: ["WordPress"],
        rawPayload: {},
        status: "QUALIFIED",
        decisionReasons: ["MATCHED_STACK"],
        riskFlags: ["TOO_GENERIC"],
        matchedSkills: ["WordPress"],
        missingSkills: [],
        score: 74,
        firstSeenAt: "2026-06-12T00:00:00.000Z",
        lastSeenAt: "2026-06-12T00:00:00.000Z",
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z",
      },
      amount: 500,
      deadlineDays: 2,
      pricingExplanation: "Estimativa competitiva.",
      deadlineExplanation: "Prazo pensado para revisão e implementação.",
      matchedSkills: ["WordPress"],
      missingSkills: [],
      decisionReasons: ["MATCHED_STACK"],
      riskFlags: ["TOO_GENERIC"],
    });

    expect(result.detailsText).toMatch(/site|portfólio|portfolio|visitante/i);
    expect(result.detailsText).not.toMatch(/projeto com IA aplicada/i);
    expect(result.assumptions.join(" ")).not.toMatch(/projeto com IA aplicada/i);
    expect(result.questions.join(" ")).not.toMatch(/projeto com IA aplicada/i);
  });
});
