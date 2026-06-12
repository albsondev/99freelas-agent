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
  minimumPlatformOfferBrl?: number | null;
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

function roundDiscountedAmount(value: number, minimumFloor: number): number {
  const rounded =
    value < 500
      ? Math.floor(value / 10) * 10
      : Math.floor(value / 50) * 50;

  if (rounded >= minimumFloor) {
    return rounded;
  }

  if (minimumFloor < 500) {
    return Math.ceil(minimumFloor / 10) * 10;
  }

  return Math.ceil(minimumFloor / 50) * 50;
}

export class PricingService {
  calculate(input: PricingInput): PricingResult {
    const warnings: string[] = [];
    const complexity = inferProjectComplexity(input);
    const hasAverageBid =
      input.averageBidAmount !== null && input.averageBidAmount !== undefined;
    const averageBidAmount = hasAverageBid ? input.averageBidAmount! : null;
    const discountedAverage =
      averageBidAmount !== null
        ? averageBidAmount * input.priceDiscountFactor
        : null;
    const estimatedByHours = complexity.baseHours * input.defaultHourlyRateBrl;
    const budgetBasedReference =
      input.budgetMax ?? input.budgetMin ?? null;
    const minimumPlatformOfferBrl = Math.max(input.minimumPlatformOfferBrl ?? 0, 0);
    const minimumDiscountFloor = Math.max(
      minimumPlatformOfferBrl,
      input.minimumProposalAmountBrl,
    );

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
    const commercialFloor = Math.max(input.minimumProposalAmountBrl, minimumByDeadline);

    if (discountedAverage !== null) {
      if (baseAmount < minimumDiscountFloor) {
        warnings.push(
          "Valor com desconto precisou subir para respeitar o piso minimo permitido.",
        );
        baseAmount = minimumDiscountFloor;
        strategy = "MINIMUM_FLOOR";
        explanation =
          "Valor ajustado para respeitar a oferta minima permitida sem perder competitividade.";
      }
    } else if (baseAmount < commercialFloor) {
      warnings.push(
        "Valor base precisou subir para respeitar o piso minimo comercial.",
      );
      baseAmount = commercialFloor;
      strategy = "MINIMUM_FLOOR";
      explanation =
        "Valor elevado para respeitar o minimo por proposta e o piso diario.";
    }

    const finalAmount =
      discountedAverage !== null
        ? roundDiscountedAmount(baseAmount, minimumDiscountFloor)
        : roundCommercialAmount(baseAmount);

    if (
      averageBidAmount !== null &&
      finalAmount >= averageBidAmount
    ) {
      warnings.push(
        "Desconto sobre a media perdeu agressividade depois da aplicacao dos pisos minimos.",
      );
    }

    if (complexity.needsReview) {
      warnings.push("Projeto pede leitura humana para validar viabilidade comercial.");
    }

    return {
      amount: finalAmount,
      strategy,
      explanation,
      warnings,
    };
  }
}
