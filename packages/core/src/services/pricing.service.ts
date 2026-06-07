import { inferProjectComplexity } from "./shared/project-complexity.js";

export type PricingInput = {
  title: string;
  description: string;
  category?: string;
  skills: string[];
  deadlineDays: number;
  averageBidAmount?: number | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  minimumProposalAmountBrl: number;
  minimumDailyRateBrl: number;
  defaultHourlyRateBrl: number;
  priceDiscountFactor: number;
};

export type PricingResult = {
  amount: number;
  strategy:
    | "AVERAGE_BID_DISCOUNT"
    | "HOURLY_ESTIMATE"
    | "MINIMUM_FLOOR"
    | "BUDGET_BASED";
  explanation: string;
  warnings: string[];
};

function roundCommercialAmount(value: number): number {
  if (value < 500) {
    return Math.ceil(value / 10) * 10;
  }

  return Math.ceil(value / 50) * 50;
}

export class PricingService {
  calculate(input: PricingInput): PricingResult {
    const warnings: string[] = [];
    const complexity = inferProjectComplexity(input);
    const discountedAverage =
      input.averageBidAmount !== null && input.averageBidAmount !== undefined
        ? input.averageBidAmount * input.priceDiscountFactor
        : null;
    const estimatedByHours = complexity.baseHours * input.defaultHourlyRateBrl;
    const budgetBasedReference =
      input.budgetMax ?? input.budgetMin ?? null;

    let baseAmount = estimatedByHours;
    let strategy: PricingResult["strategy"] = "HOURLY_ESTIMATE";
    let explanation =
      "Valor calculado a partir de estimativa de horas pela complexidade do projeto.";

    if (discountedAverage !== null) {
      baseAmount = discountedAverage;
      strategy = "AVERAGE_BID_DISCOUNT";
      explanation = "Valor calculado com desconto sobre a média das propostas.";
    } else if (budgetBasedReference !== null) {
      baseAmount = budgetBasedReference * 0.9;
      strategy = "BUDGET_BASED";
      explanation = "Valor calculado com base no orçamento visível do projeto.";
    }

    const minimumByDeadline = input.deadlineDays * input.minimumDailyRateBrl;
    const floor = Math.max(input.minimumProposalAmountBrl, minimumByDeadline);

    if (baseAmount < floor) {
      warnings.push(
        "Valor base precisou subir para respeitar o piso minimo comercial.",
      );
      baseAmount = floor;
      strategy = "MINIMUM_FLOOR";
      explanation =
        "Valor elevado para respeitar o minimo por proposta e o piso diario.";
    }

    if (
      input.averageBidAmount !== null &&
      input.averageBidAmount !== undefined &&
      roundCommercialAmount(baseAmount) >= input.averageBidAmount
    ) {
      warnings.push(
        "Desconto sobre a media perdeu agressividade depois da aplicacao dos pisos minimos.",
      );
    }

    if (complexity.needsReview) {
      warnings.push("Projeto pede leitura humana para validar viabilidade comercial.");
    }

    return {
      amount: roundCommercialAmount(baseAmount),
      strategy,
      explanation,
      warnings,
    };
  }
}

