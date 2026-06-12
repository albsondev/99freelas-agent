import { compactWhitespace } from "../../utils/text.js";

export type ComplexityTier =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "WORDPRESS"
  | "WOOCOMMERCE"
  | "SYSTEM";

export type ComplexityProfile = {
  tier: ComplexityTier;
  baseHours: number;
  baseDays: number;
  needsReview: boolean;
  reasons: string[];
};

type ComplexityRule = {
  tier: ComplexityTier;
  baseHours: number;
  baseDays: number;
  needsReview?: boolean;
  patterns: RegExp[];
  reason: string;
};

const COMPLEXITY_RULES: ComplexityRule[] = [
  {
    tier: "SYSTEM",
    baseHours: 140,
    baseDays: 25,
    needsReview: true,
    patterns: [/\bsaas\b/i, /\bmarketplace\b/i, /\bplataforma\b/i, /\bsistema completo\b/i],
    reason: "Projeto com sinal de escopo sistêmico.",
  },
  {
    tier: "WOOCOMMERCE",
    baseHours: 72,
    baseDays: 15,
    patterns: [/\bwoocommerce\b/i, /\be-commerce\b/i, /\bloja virtual\b/i],
    reason: "Projeto com sinais de e-commerce.",
  },
  {
    tier: "WORDPRESS",
    baseHours: 36,
    baseDays: 8,
    patterns: [/\bwordpress\b/i, /\belementor\b/i],
    reason: "Projeto com sinais de WordPress.",
  },
  {
    tier: "HIGH",
    baseHours: 52,
    baseDays: 10,
    patterns: [/\bdashboard\b/i, /\bcrud\b/i, /\bpainel\b/i, /\badministrativo\b/i],
    reason: "Projeto com sinais de painel administrativo.",
  },
  {
    tier: "MEDIUM",
    baseHours: 28,
    baseDays: 5,
    patterns: [/\bintegra(?:ç|c)(?:a|ã)o\b/i, /\bapi\b/i, /\bbackend\b/i, /\bformul[áa]rio\b/i],
    reason: "Projeto com sinais de integração ou backend.",
  },
  {
    tier: "LOW",
    baseHours: 8,
    baseDays: 2,
    patterns: [/\bbug\b/i, /\bajuste\b/i, /\bcorre(?:ç|c)(?:a|ã)o\b/i, /\berro\b/i],
    reason: "Projeto com sinais de correção pontual.",
  },
];

export function inferProjectComplexity(
  input: Partial<{
    title: string;
    description: string;
    category: string;
    skills: string[];
  }>,
): ComplexityProfile {
  const source = compactWhitespace(
    [
      input.title ?? "",
      input.description ?? "",
      input.category ?? "",
      ...(input.skills ?? []),
    ].join(" "),
  );

  const isLightWordPressAdjustment =
    /\bwordpress\b|\belementor\b/i.test(source) &&
    /\bajuste\b|\bcorre(?:ç|c)(?:a|ã)o\b|\bbug\b|\bmobile\b|\bresponsiv[oa]\b|\btelefone\b/i.test(
      source,
    );

  if (isLightWordPressAdjustment) {
    return {
      tier: "LOW",
      baseHours: 10,
      baseDays: 2,
      needsReview: false,
      reasons: ["Projeto com sinais de ajuste pontual em WordPress."],
    };
  }

  for (const rule of COMPLEXITY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(source))) {
      return {
        tier: rule.tier,
        baseHours: rule.baseHours,
        baseDays: rule.baseDays,
        needsReview: rule.needsReview ?? false,
        reasons: [rule.reason],
      };
    }
  }

  const descriptionLength = (input.description ?? "").trim().length;

  if (descriptionLength > 900) {
    return {
      tier: "HIGH",
      baseHours: 60,
      baseDays: 12,
      needsReview: true,
      reasons: ["Descrição longa sugere escopo amplo ou pouco delimitado."],
    };
  }

  return {
    tier: "MEDIUM",
    baseHours: 24,
    baseDays: 5,
    needsReview: descriptionLength < 120,
    reasons: [
      descriptionLength < 120
        ? "Escopo curto demais para estimativa confortável."
        : "Projeto sem sinal forte, usando estimativa intermediária.",
    ],
  };
}
