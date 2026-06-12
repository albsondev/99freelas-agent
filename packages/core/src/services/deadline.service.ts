import { inferProjectComplexity } from "./shared/project-complexity.js";

export type DeadlineInput = {
  title: string;
  description: string;
  category?: string;
  skills: string[];
  averageDeadlineDays?: number | null;
  deadlineReductionFactor: number;
  minDeadlineDays: number;
  maxDeadlineDays: number;
};

export type DeadlineResult = {
  deadlineDays: number;
  strategy:
    | "AVERAGE_DEADLINE_REDUCTION"
    | "COMPLEXITY_ESTIMATE"
    | "MINIMUM_FLOOR"
    | "MAXIMUM_CAP";
  explanation: string;
  warnings: string[];
  needsReview: boolean;
};

export class DeadlineService {
  calculate(input: DeadlineInput): DeadlineResult {
    const warnings: string[] = [];
    const complexity = inferProjectComplexity(input);
    const hasAverageDeadline =
      input.averageDeadlineDays !== null && input.averageDeadlineDays !== undefined;
    const averageDeadlineDays = hasAverageDeadline ? input.averageDeadlineDays! : null;

    let rawDays = complexity.baseDays;
    let strategy: DeadlineResult["strategy"] = "COMPLEXITY_ESTIMATE";
    let explanation =
      "Prazo calculado pela complexidade inferida do projeto.";

    if (averageDeadlineDays !== null) {
      rawDays = averageDeadlineDays * input.deadlineReductionFactor;
      strategy = "AVERAGE_DEADLINE_REDUCTION";
      explanation = "Prazo calculado a partir da media indicada com reducao controlada.";
    }

    if (!hasAverageDeadline && complexity.tier === "SYSTEM" && rawDays < 15) {
      rawDays = 15;
      warnings.push("Projeto sistemico ficou com prazo minimo reforcado por segurança.");
    }

    let deadlineDays = Math.ceil(rawDays);

    if (averageDeadlineDays !== null) {
      const strictDeadlineCap =
        averageDeadlineDays > 1 ? Math.floor(averageDeadlineDays) - 1 : 1;
      deadlineDays = Math.min(deadlineDays, Math.max(1, strictDeadlineCap));
    }

    const effectiveMinimumDays = averageDeadlineDays !== null
      ? Math.min(
          input.minDeadlineDays,
          Math.max(1, Math.floor(averageDeadlineDays - 1)),
        )
      : input.minDeadlineDays;

    if (deadlineDays < effectiveMinimumDays) {
      deadlineDays = effectiveMinimumDays;
      strategy = "MINIMUM_FLOOR";
      explanation = "Prazo ajustado para nao prometer entrega inviavel.";
    }

    if (deadlineDays > input.maxDeadlineDays) {
      deadlineDays = input.maxDeadlineDays;
      strategy = "MAXIMUM_CAP";
      explanation = "Prazo ajustado ao teto operacional configurado.";
    }

    const needsReview =
      complexity.needsReview ||
      /urgente|prazo apertado|o quanto antes/i.test(
        `${input.title} ${input.description}`,
      );

    if (needsReview) {
      warnings.push("Projeto pede revisao humana antes de prometer prazo definitivo.");
    }

    return {
      deadlineDays,
      strategy,
      explanation,
      warnings,
      needsReview,
    };
  }
}
