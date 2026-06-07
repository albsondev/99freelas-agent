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

    let rawDays = complexity.baseDays;
    let strategy: DeadlineResult["strategy"] = "COMPLEXITY_ESTIMATE";
    let explanation =
      "Prazo calculado pela complexidade inferida do projeto.";

    if (input.averageDeadlineDays !== null && input.averageDeadlineDays !== undefined) {
      rawDays = input.averageDeadlineDays * input.deadlineReductionFactor;
      strategy = "AVERAGE_DEADLINE_REDUCTION";
      explanation = "Prazo calculado a partir da media indicada com reducao controlada.";
    }

    if (complexity.tier === "SYSTEM" && rawDays < 15) {
      rawDays = 15;
      warnings.push("Projeto sistemico ficou com prazo minimo reforcado por segurança.");
    }

    let deadlineDays = Math.ceil(rawDays);

    if (deadlineDays < input.minDeadlineDays) {
      deadlineDays = input.minDeadlineDays;
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

