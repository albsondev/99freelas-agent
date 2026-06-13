import { extractSkills } from "../utils/normalization.js";
import { compactWhitespace } from "../utils/text.js";

export type ScoreInput = {
  title: string;
  description: string;
  skills: string[];
  category?: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  averageBidAmount?: number | null;
  averageDeadlineDays?: number | null;
  proposalCount?: number | null;
  clientRating?: number | null;
};

export type ScoreResult = {
  score: number;
  decisionHint: "AUTO_SUBMIT" | "REVIEW_REQUIRED" | "REJECTED";
  reasons: string[];
  matchedSkills: string[];
  missingSkills: string[];
  riskFlags: string[];
};

type ScoringConfig = {
  autopilotMinScore: number;
  reviewMinScore: number;
  minimumAverageBidBrl: number;
};

const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  autopilotMinScore: 85,
  reviewMinScore: 60,
  minimumAverageBidBrl: 200,
};

const POSITIVE_SKILLS: Array<{ skill: string; weight: number }> = [
  { skill: "JavaScript", weight: 7 },
  { skill: "TypeScript", weight: 8 },
  { skill: "React", weight: 8 },
  { skill: "Vue.js", weight: 7 },
  { skill: "Next.js", weight: 8 },
  { skill: "Node.js", weight: 8 },
  { skill: "PHP", weight: 6 },
  { skill: "Laravel", weight: 7 },
  { skill: "WordPress", weight: 6 },
  { skill: "WooCommerce", weight: 7 },
  { skill: "API REST", weight: 6 },
  { skill: "Integrações", weight: 6 },
  { skill: "Dashboard", weight: 5 },
  { skill: "Supabase", weight: 5 },
  { skill: "Automação", weight: 5 },
  { skill: "IA aplicada a web", weight: 5 },
  { skill: "Correção de bugs", weight: 4 },
  { skill: "Landing Pages", weight: 4 },
];

const PREFERRED_SCOPE_RULES: Array<{
  patterns: RegExp[];
  weight: number;
  reason: string;
}> = [
  {
    patterns: [/\bsite\b/i, /\b(?:advogad|advocacia|jur[ií]dic)\w*\b/i],
    weight: 40,
    reason: "Projeto de site para advocacia entra no perfil aceito.",
  },
  {
    patterns: [/\bsite\b/i, /\b(?:educacional|escola|curso|professor|ensino)\b/i],
    weight: 36,
    reason: "Projeto de site educacional entra no perfil aceito.",
  },
  {
    patterns: [/\blanding page\b/i],
    weight: 34,
    reason: "Landing pages entram no perfil aceito.",
  },
  {
    patterns: [/\bsite\b/i, /\b(?:pessoal|institucional|marca pessoal|portf[oó]lio)\b/i],
    weight: 30,
    reason: "Sites pessoais e institucionais entram no perfil aceito.",
  },
  {
    patterns: [
      /\b(?:bug|ajuste|corre(?:ç|c)(?:a|ã)o|erro|manuten(?:ç|c)(?:a|ã)o)\b/i,
      /\b(?:javascript|typescript|react|next(?:\.js)?|vue(?:\.js)?|php|wordpress|node(?:\.js)?)\b/i,
    ],
    weight: 26,
    reason: "Correção de bugs em stacks aceitas entra no perfil.",
  },
];

const NEGATIVE_RULES: Array<{
  patterns: RegExp[];
  penalty: number;
  riskFlag: string;
  reason: string;
  missingSkill?: string;
}> = [
  {
    patterns: [/\baws\b/i, /\bazure\b/i, /\bamazon web services\b/i, /\bcloudformation\b/i],
    penalty: 32,
    riskFlag: "CLOUD_INFRA_SCOPE",
    reason: "Escopo com foco em cloud/infra fora do perfil principal.",
    missingSkill: "AWS/Azure",
  },
  {
    patterns: [/\bjava\b/i, /\bspring boot\b/i, /\bspring\b/i, /\bjsp\b/i],
    penalty: 34,
    riskFlag: "JAVA_SCOPE",
    reason: "Projeto com stack Java fora do escopo desejado.",
    missingSkill: "Java",
  },
  {
    patterns: [/\bsocial media\b/i, /\btr[áa]fego pago\b/i],
    penalty: 30,
    riskFlag: "MARKETING_SCOPE",
    reason: "Escopo orientado a marketing fora do foco principal.",
    missingSkill: "Marketing digital",
  },
  {
    patterns: [/\bflutter\b/i, /\breact native\b/i, /\bandroid\b/i, /\bios\b/i],
    penalty: 26,
    riskFlag: "NATIVE_APP_SCOPE",
    reason: "Projeto com foco em app nativo ou mobile dedicado.",
    missingSkill: "Mobile nativo",
  },
  {
    patterns: [/\be-?commerce completo\b/i, /\bloja virtual completa\b/i, /\bmarketplace\b/i, /\bshopify\b/i, /\bmagento\b/i],
    penalty: 34,
    riskFlag: "FULL_ECOMMERCE_SCOPE",
    reason: "Projeto com sinais de e-commerce completo fora do escopo desejado.",
    missingSkill: "E-commerce completo",
  },
  {
    patterns: [/\bpagamento por fora\b/i, /\bpix por fora\b/i],
    penalty: 24,
    riskFlag: "OFF_PLATFORM_PAYMENT_REQUEST",
    reason: "Escopo sugere pagamento fora da plataforma.",
  },
];

export class OpportunityScoringService {
  constructor(private readonly config: ScoringConfig = DEFAULT_SCORING_CONFIG) {}

  score(input: ScoreInput): ScoreResult {
    const normalizedSkills = [
      ...new Set([
        ...input.skills,
        ...extractSkills(
          [input.title, input.description, input.category ?? ""].join(" "),
        ),
      ]),
    ];
    const source = compactWhitespace(
      [input.title, input.description, input.category ?? "", ...normalizedSkills].join(
        " ",
      ),
    );

    let score = 20;
    const reasons: string[] = [];
    const riskFlags: string[] = [];
    const missingSkills = new Set<string>();
    const matchedSkills = POSITIVE_SKILLS.filter(({ skill }) =>
      normalizedSkills.includes(skill),
    ).map(({ skill }) => skill);
    const matchedPreferredScopes = PREFERRED_SCOPE_RULES.filter((rule) =>
      rule.patterns.every((pattern) => pattern.test(source)),
    );

    for (const { skill, weight } of POSITIVE_SKILLS) {
      if (matchedSkills.includes(skill)) {
        score += weight;
      }
    }

    for (const rule of matchedPreferredScopes) {
      score += rule.weight;
      reasons.push(rule.reason);
    }

    if (matchedSkills.length > 0) {
      reasons.push(`Compatibilidade técnica detectada: ${matchedSkills.join(", ")}.`);
    }

    if (
      matchedPreferredScopes.length > 0 &&
      /\bdesenvolvimento web\b/i.test(source)
    ) {
      score += 10;
      reasons.push("Categoria de desenvolvimento web reforça aderência ao perfil.");
    }

    if (input.description.trim().length >= 180) {
      score += 8;
      reasons.push("Descrição com escopo minimamente explicada.");
    } else if (matchedPreferredScopes.length > 0) {
      score -= 3;
      riskFlags.push("UNCLEAR_SCOPE");
      reasons.push("Descrição curta, mas em um tipo de projeto que faz parte do perfil aceito.");
    } else {
      score -= 12;
      riskFlags.push("UNCLEAR_SCOPE");
      reasons.push("Descrição curta demais para concluir escopo com confiança.");
    }

    if ((input.averageBidAmount ?? 0) >= this.config.minimumAverageBidBrl) {
      score += 6;
      reasons.push("Faixa de propostas parece comercialmente viável.");
    } else if ((input.averageBidAmount ?? 0) > 0) {
      score -= 12;
      riskFlags.push("LOW_AVERAGE_BID");
      reasons.push("Média de propostas abaixo da faixa confortável.");
    }

    if ((input.budgetMax ?? input.budgetMin ?? 0) >= this.config.minimumAverageBidBrl) {
      score += 4;
      reasons.push("Orçamento indicado não parece inviável.");
    } else if ((input.budgetMax ?? input.budgetMin ?? 0) > 0) {
      score -= 10;
      riskFlags.push("LOW_BUDGET");
      reasons.push("Orçamento sinaliza pouco espaço comercial.");
    }

    if ((input.clientRating ?? 0) >= 4) {
      score += 4;
      reasons.push("Histórico do cliente inspira mais confiança.");
    }

    if ((input.averageDeadlineDays ?? 0) > 0 && (input.averageDeadlineDays ?? 0) < 2) {
      score -= 8;
      riskFlags.push("IMPOSSIBLE_DEADLINE");
      reasons.push("Prazo médio indicado parece agressivo demais.");
    }

    if ((input.proposalCount ?? 0) >= 20) {
      reasons.push("Projeto com concorrência alta, mas ainda vale disputar se houver aderência.");
    }

    const isSimpleMobileFix =
      /\breact native\b/i.test(source) &&
      /\b(?:bug|ajuste|corre(?:ç|c)(?:a|ã)o|erro|simples|rapido|rápido)\b/i.test(source);
    const hasPureDesignScope = detectPureDesignScope(source);
    const hasExplicitExternalContactRequest = detectExplicitExternalContactRequest(source);
    const hasComplexWordPressScope = detectComplexWordPressScope(source);

    if (isSimpleMobileFix) {
      score += 20;
      riskFlags.push("REACT_NATIVE_REVIEW_ONLY");
      reasons.push("React Native aparece em contexto simples/pontual, mantendo revisão possível.");
    }

    if (hasPureDesignScope) {
      score -= 28;
      riskFlags.push("PURE_DESIGN_SCOPE");
      reasons.push("Escopo com viés forte de design puro.");
      missingSkills.add("Design");
    }

    if (hasExplicitExternalContactRequest) {
      score -= 18;
      riskFlags.push("EXTERNAL_CONTACT_REQUEST");
      reasons.push("Escopo sugere contato fora da plataforma.");
    }

    if (hasComplexWordPressScope) {
      score -= 14;
      riskFlags.push("WORDPRESS_COMPLEX_SCOPE");
      reasons.push("Escopo em WordPress parece grande demais para envio automático sem revisão.");
    }

    for (const rule of NEGATIVE_RULES) {
      if (rule.riskFlag === "NATIVE_APP_SCOPE" && isSimpleMobileFix) {
        continue;
      }

      if (rule.patterns.some((pattern) => pattern.test(source))) {
        score -= rule.penalty;
        riskFlags.push(rule.riskFlag);
        reasons.push(rule.reason);

        if (rule.missingSkill) {
          missingSkills.add(rule.missingSkill);
        }
      }
    }

    score = Math.max(0, Math.min(100, score));

    const autoSubmitBlockingFlags = new Set([
      "EXTERNAL_CONTACT_REQUEST",
      "OFF_PLATFORM_PAYMENT_REQUEST",
      "UNCLEAR_SCOPE",
      "CLOUD_INFRA_SCOPE",
      "JAVA_SCOPE",
      "FULL_ECOMMERCE_SCOPE",
      "REACT_NATIVE_REVIEW_ONLY",
      "PURE_DESIGN_SCOPE",
      "WORDPRESS_COMPLEX_SCOPE",
    ]);

    const hardRejectFlags = new Set([
      "EXTERNAL_CONTACT_REQUEST",
      "OFF_PLATFORM_PAYMENT_REQUEST",
      "CLOUD_INFRA_SCOPE",
      "JAVA_SCOPE",
      "FULL_ECOMMERCE_SCOPE",
      "NATIVE_APP_SCOPE",
    ]);

    const decisionHint =
      riskFlags.some((flag) => hardRejectFlags.has(flag)) || score < this.config.reviewMinScore
        ? "REJECTED"
        : score >= this.config.autopilotMinScore &&
            !riskFlags.some((flag) => autoSubmitBlockingFlags.has(flag))
        ? "AUTO_SUBMIT"
        : "REVIEW_REQUIRED";

    return {
      score,
      decisionHint,
      reasons,
      matchedSkills,
      missingSkills: [...missingSkills],
      riskFlags: [...new Set(riskFlags)],
    };
  }
}

function detectPureDesignScope(source: string): boolean {
  const designSignals = [
    /\bui\/ux\b/i,
    /\bux\/ui\b/i,
    /\bfigma\b/i,
    /\bwireframe\b/i,
    /\bprot[oó]tip[oa]\b/i,
    /\bidentidade visual\b/i,
    /\blogo(?:marca)?\b/i,
    /\bweb design\b/i,
  ];
  const implementationSignals = [
    /\bwordpress\b/i,
    /\belementor\b/i,
    /\bphp\b/i,
    /\breact\b/i,
    /\bnext(?:\.js)?\b/i,
    /\bvue(?:\.js)?\b/i,
    /\bnode(?:\.js)?\b/i,
    /\bdesenvolvimento web\b/i,
    /\bsite\b/i,
    /\blanding page\b/i,
    /\bintegra(?:ç|c)(?:a|ã)o\b/i,
  ];

  return (
    designSignals.some((pattern) => pattern.test(source)) &&
    !implementationSignals.some((pattern) => pattern.test(source))
  );
}

function detectExplicitExternalContactRequest(source: string): boolean {
  const directRequestPatterns = [
    /\b(?:falar|chamar|me chama|me chame|entrar em contato|contato|conversar|negociar|tratar|fechar)\b[\s\S]{0,40}\b(?:whatsapp|telegram|e-?mail|email)\b/i,
    /\b(?:whatsapp|telegram|e-?mail|email)\b[\s\S]{0,40}\b(?:para fechar|para contato|para conversar|para negociar|para tratar)\b/i,
    /\b(?:telefone|celular)\b[\s\S]{0,20}\b(?:whatsapp|telegram)\b/i,
    /\b(?:meu|me chama no|fale comigo no)\b[\s\S]{0,20}\b(?:whatsapp|telegram|e-?mail|email)\b/i,
  ];

  return directRequestPatterns.some((pattern) => pattern.test(source));
}

function detectComplexWordPressScope(source: string): boolean {
  const hasWordPressSignal =
    /\bwordpress\b/i.test(source) || /\belementor\b/i.test(source);

  if (!hasWordPressSignal) {
    return false;
  }

  const safeSimpleSignals = [
    /\b(?:ajuste|ajustes|bug|bugs|corre(?:ç|c)(?:a|ã)o|manuten(?:ç|c)(?:a|ã)o)\b/i,
    /\blanding page\b/i,
    /\b(?:p[aá]gina|lp)\s+simples\b/i,
  ];

  if (safeSimpleSignals.some((pattern) => pattern.test(source))) {
    return false;
  }

  const hardSignals = [
    /\b(?:\d{2,}|vinte|trinta|quarenta|cinquenta)\s+p[aá]ginas?\b/i,
    /\bsite completo\b/i,
    /\bsite inteiro\b/i,
    /\b(?:[áa]rea de membros|portal|plataforma ead|eduma)\b/i,
    /\b(?:muitas|v[aá]rias)\s+p[aá]ginas?\b/i,
  ];

  if (hardSignals.some((pattern) => pattern.test(source))) {
    return true;
  }

  let effortSignals = 0;
  const weightedSignals = [
    /\b(?:criar|criação|desenvolver|integrar|reestruturar)\b[\s\S]{0,20}\b(?:site|p[aá]ginas?)\b/i,
    /\bportf[oó]lio\b/i,
    /\bblog\b/i,
    /\bseo\b/i,
    /\bgaler(?:ia|ias)\b/i,
    /\bformul[áa]rio\b/i,
    /\bresponsivo\b/i,
    /\btablet\b/i,
    /\bmobile\b/i,
    /\bdesktop\b/i,
    /\b(?:quem somos|servi[cç]os|contato)\b/i,
  ];

  for (const pattern of weightedSignals) {
    if (pattern.test(source)) {
      effortSignals += 1;
    }
  }

  return effortSignals >= 4;
}
