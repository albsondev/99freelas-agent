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

  it("does not treat WhatsApp or email as off-platform contact when they are part of the product", () => {
    const service = new OpportunityScoringService();
    const result = service.score({
      title: "Sistema web de gestão de cobranças recorrentes com WhatsApp e e-mail",
      description:
        "Preciso desenvolver um sistema web com integração de WhatsApp e e-mail para cobranças automáticas, painel administrativo, relatórios e regras de automação. Todo o contato do projeto será pela plataforma.",
      category: "Desenvolvimento Web",
      skills: ["React", "Node.js", "Integrações", "Dashboard"],
      proposalCount: 40,
      averageBidAmount: 900,
      averageDeadlineDays: 10,
    });

    expect(result.riskFlags).not.toContain("EXTERNAL_CONTACT_REQUEST");
    expect(result.score).toBeGreaterThanOrEqual(60);
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

  it("keeps lawyer website requests in review when they match the preferred profile", () => {
    const service = new OpportunityScoringService();
    const result = service.score({
      title: "Site para marca de advogado",
      description:
        "Preciso de um site para minha marca, sou advogado e não tenho logo nem nada, pode fazer tudo por mim.",
      category: "Web, Mobile & Software / Desenvolvimento Web",
      skills: [],
      proposalCount: 86,
    });

    expect(result.decisionHint).toBe("REVIEW_REQUIRED");
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.reasons).toContain("Projeto de site para advocacia entra no perfil aceito.");
  });

  it("blocks complex WordPress builds from automatic submission", () => {
    const service = new OpportunityScoringService();
    const result = service.score({
      title: "Criar e integrar 29 páginas no site (WordPress/Elementor)",
      description:
        "Preciso criar e integrar 29 páginas em WordPress com Elementor, mantendo consistência visual e estrutura completa do site.",
      category: "Desenvolvimento Web",
      skills: ["WordPress", "Elementor"],
      proposalCount: 41,
      averageBidAmount: 1200,
      averageDeadlineDays: 16,
    });

    expect(result.riskFlags).toContain("WORDPRESS_COMPLEX_SCOPE");
    expect(result.decisionHint).not.toBe("AUTO_SUBMIT");
  });
});
