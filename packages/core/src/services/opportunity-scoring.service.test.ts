import { describe, expect, it } from "vitest";

import { OpportunityScoringService } from "./opportunity-scoring.service.js";

describe("OpportunityScoringService", () => {
  it("scores a strong web project as review or autopilot candidate", () => {
    const service = new OpportunityScoringService();
    const result = service.score({
      title: "Dashboard React com integração Supabase",
      description:
        "Preciso de um painel administrativo em React e Node.js com integração de API REST, autenticação e relatórios. O escopo está descrito em detalhes e inclui ajustes pontuais no frontend.",
      category: "Desenvolvimento Web",
      skills: ["React", "Node.js", "Supabase", "API REST"],
      averageBidAmount: 1400,
      budgetMin: 900,
      budgetMax: 1800,
      averageDeadlineDays: 7,
      proposalCount: 6,
      clientRating: 4.8,
    });

    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.matchedSkills).toContain("React");
    expect(result.riskFlags).not.toContain("PURE_DESIGN_SCOPE");
  });

  it("rejects scope with strong mismatch and external contact signs", () => {
    const service = new OpportunityScoringService();
    const result = service.score({
      title: "App Flutter com contato por WhatsApp",
      description:
        "Projeto para Flutter e Android nativo. Falar no WhatsApp para fechar e pagar por fora.",
      category: "Mobile",
      skills: ["Flutter", "Android"],
      averageBidAmount: 100,
      budgetMax: 150,
      proposalCount: 30,
    });

    expect(result.decisionHint).toBe("REJECTED");
    expect(result.riskFlags).toContain("NATIVE_APP_SCOPE");
    expect(result.riskFlags).toContain("EXTERNAL_CONTACT_REQUEST");
  });

  it("rejects projects centered on cloud, Java or full ecommerce", () => {
    const service = new OpportunityScoringService();
    const result = service.score({
      title: "Sistema Java com AWS para ecommerce completo",
      description:
        "Preciso de backend em Java Spring Boot, deploy na AWS e estrutura completa de ecommerce com checkout e catalogo.",
      category: "Desenvolvimento Web",
      skills: ["Java", "AWS"],
      averageBidAmount: 2500,
      budgetMax: 4000,
      proposalCount: 8,
    });

    expect(result.decisionHint).toBe("REJECTED");
    expect(result.riskFlags).toContain("CLOUD_INFRA_SCOPE");
    expect(result.riskFlags).toContain("JAVA_SCOPE");
    expect(result.riskFlags).toContain("FULL_ECOMMERCE_SCOPE");
  });

  it("keeps simple React Native bugfixes in review instead of hard rejection", () => {
    const service = new OpportunityScoringService();
    const result = service.score({
      title: "Ajuste rapido em React Native",
      description:
        "Preciso corrigir um bug simples em uma tela React Native, revisar um erro pontual de formulario e ajustar o consumo de API em um fluxo pequeno ja existente. O escopo esta bem delimitado e a demanda e somente de manutencao rapida.",
      category: "Mobile",
      skills: ["React", "TypeScript", "API REST"],
      averageBidAmount: 600,
      budgetMax: 800,
      proposalCount: 4,
      clientRating: 4.9,
    });

    expect(result.decisionHint).toBe("REVIEW_REQUIRED");
    expect(result.riskFlags).not.toContain("NATIVE_APP_SCOPE");
  });
});
