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
});

