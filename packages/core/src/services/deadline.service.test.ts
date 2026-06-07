import { describe, expect, it } from "vitest";

import { DeadlineService } from "./deadline.service.js";

describe("DeadlineService", () => {
  it("reduces average deadline while respecting floor", () => {
    const service = new DeadlineService();
    const result = service.calculate({
      title: "Landing page com formulário",
      description: "Página institucional com formulário e backend simples.",
      skills: ["React", "API REST"],
      averageDeadlineDays: 8,
      deadlineReductionFactor: 0.75,
      minDeadlineDays: 2,
      maxDeadlineDays: 45,
    });

    expect(result.strategy).toBe("AVERAGE_DEADLINE_REDUCTION");
    expect(result.deadlineDays).toBe(6);
  });

  it("flags very broad system scope for review", () => {
    const service = new DeadlineService();
    const result = service.calculate({
      title: "Plataforma SaaS completa",
      description: "Quero uma plataforma completa estilo SaaS com módulos administrativos.",
      skills: ["Node.js", "React"],
      deadlineReductionFactor: 0.75,
      minDeadlineDays: 2,
      maxDeadlineDays: 45,
    });

    expect(result.needsReview).toBe(true);
    expect(result.deadlineDays).toBeGreaterThanOrEqual(15);
  });
});

