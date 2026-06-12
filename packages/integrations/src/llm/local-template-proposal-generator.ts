import {
  compactWhitespace,
  extractSkills,
  sanitizeProposalText,
  type Opportunity,
  type UserProfile,
} from "@99freelas/core";

import { proposalDraftSchema, type ProposalDraft } from "./proposal-draft.schema.js";
import type {
  ProposalGenerationInput,
  ProposalGenerationResult,
  ProposalLlmProvider,
} from "./openai-proposal-generator.js";

const LOCAL_TEMPLATE_MODEL = "local-template-v1";
const LOCAL_TEMPLATE_PROMPT_VERSION = "proposal-template-v1";

type SerializedFreelancerProfile = {
  displayName: string;
  headline: string;
  mainSkills: string[];
  secondarySkills: string[];
  preferredProjectTypes: string[];
  blockedProjectTypes: string[];
  portfolioSummary: string;
};

const DEFAULT_PROFILE: SerializedFreelancerProfile = {
  displayName: "Especialista Web Full Stack",
  headline:
    "Desenvolvedor web focado em JavaScript, TypeScript, PHP, React, Vue.js, Next.js e Node.js",
  mainSkills: ["JavaScript", "TypeScript", "React", "Vue.js", "Next.js", "Node.js", "PHP"],
  secondarySkills: ["WordPress", "APIs", "Supabase", "Landing Pages", "Correção de bugs"],
  preferredProjectTypes: [
    "Sites pessoais",
    "Sites educacionais",
    "Sites para advogados",
    "Landing Pages",
    "Projetos PHP",
    "Projetos React.js",
    "Projetos Vue.js",
    "Projetos Next.js",
    "Projetos Node.js",
    "Correção de erros e bugs",
    "Projetos WordPress com manutenção ou ajustes",
  ],
  blockedProjectTypes: [
    "AWS e Azure",
    "Projetos em Java",
    "Ecommerce completo",
    "React Native complexo",
  ],
  portfolioSummary:
    "Experiência com sistemas web sob medida, manutenção evolutiva, correção de bugs, integrações e entregas enxutas para projetos web.",
};

export function createLocalTemplateProposalProvider(): ProposalLlmProvider {
  return {
    generate(input) {
      return Promise.resolve(buildLocalTemplateProposal(input));
    },
  };
}

function buildLocalTemplateProposal(
  input: ProposalGenerationInput,
): ProposalGenerationResult {
  const profile = resolveFreelancerProfile(input.freelancerProfile);
  const focusSkills = pickFocusSkills(input.opportunity, profile, input.matchedSkills);
  const projectType = inferProjectType(input.opportunity, focusSkills);
  const cautionMode = shouldUseCautiousTone(input, profile);

  const technicalSummary = compactWhitespace(
    [
      `Abordagem focada em ${projectType}`,
      `com execução objetiva em ${input.deadlineDays} dias`,
      `e prioridade em ${joinListForSentence(focusSkills.slice(0, 3))}.`,
    ].join(" "),
  );

  const paragraphs = [
    buildContextParagraph(input, projectType, focusSkills, cautionMode),
    buildExecutionParagraph(input, focusSkills, cautionMode),
    buildRiskControlParagraph(input, cautionMode),
  ];

  const detailsText = sanitizeProposalText(paragraphs.join("\n\n"));
  const assumptions = buildAssumptions(input, projectType);
  const questions = buildQuestions(input, projectType);
  const risks = buildRisks(input, cautionMode);
  const qualityScore = calculateQualityScore(input, focusSkills, cautionMode);

  const draft: ProposalDraft = proposalDraftSchema.parse({
    technicalSummary,
    detailsText,
    assumptions,
    questions,
    risks,
    qualityScore,
  });

  return {
    ...draft,
    llmProvider: "local-template",
    llmModel: LOCAL_TEMPLATE_MODEL,
    llmPromptVersion: LOCAL_TEMPLATE_PROMPT_VERSION,
  };
}

function resolveFreelancerProfile(
  profile?: UserProfile | null,
): SerializedFreelancerProfile {
  if (!profile) {
    return DEFAULT_PROFILE;
  }

  return {
    displayName: profile.displayName,
    headline: profile.headline ?? DEFAULT_PROFILE.headline,
    mainSkills:
      profile.mainSkills.length > 0 ? profile.mainSkills : DEFAULT_PROFILE.mainSkills,
    secondarySkills:
      profile.secondarySkills.length > 0
        ? profile.secondarySkills
        : DEFAULT_PROFILE.secondarySkills,
    preferredProjectTypes:
      profile.preferredProjectTypes.length > 0
        ? profile.preferredProjectTypes
        : DEFAULT_PROFILE.preferredProjectTypes,
    blockedProjectTypes:
      profile.blockedProjectTypes.length > 0
        ? profile.blockedProjectTypes
        : DEFAULT_PROFILE.blockedProjectTypes,
    portfolioSummary:
      profile.portfolioSummary ?? DEFAULT_PROFILE.portfolioSummary,
  };
}

function pickFocusSkills(
  opportunity: Opportunity,
  profile: SerializedFreelancerProfile,
  matchedSkills: string[],
): string[] {
  const combined = [
    ...matchedSkills,
    ...opportunity.skills,
    ...extractSkills(`${opportunity.title ?? ""} ${opportunity.description ?? ""}`),
    ...profile.mainSkills,
  ];

  return [...new Set(combined.map((item) => compactWhitespace(item)).filter(Boolean))].slice(0, 5);
}

function inferProjectType(opportunity: Opportunity, focusSkills: string[]): string {
  const source = compactWhitespace(
    `${opportunity.title ?? ""} ${opportunity.description ?? ""} ${opportunity.category ?? ""}`.toLowerCase(),
  );

  if (/\bbug|erro|corre(?:ç|c)[aã]o|ajuste|manuten/.test(source)) {
    return "correção de bugs e estabilização";
  }

  if (/\blanding page\b|\blp\b/.test(source)) {
    return "landing page";
  }

  if (focusSkills.some((skill) => skill === "WordPress")) {
    return "ajustes ou evolução em WordPress";
  }

  if (focusSkills.some((skill) => skill === "Next.js")) {
    return "projeto web em Next.js";
  }

  if (focusSkills.some((skill) => skill === "React")) {
    return "projeto web em React";
  }

  if (focusSkills.some((skill) => skill === "Vue.js")) {
    return "projeto web em Vue.js";
  }

  if (focusSkills.some((skill) => skill === "PHP")) {
    return "projeto web em PHP";
  }

    return "projeto web sob medida";
}

function shouldUseCautiousTone(
  input: ProposalGenerationInput,
  profile: SerializedFreelancerProfile,
): boolean {
  const source = compactWhitespace(
    `${input.opportunity.title ?? ""} ${input.opportunity.description ?? ""}`.toLowerCase(),
  );

  return (
    input.missingSkills.length >= 2 ||
    input.riskFlags.includes("UNCLEAR_SCOPE") ||
    profile.blockedProjectTypes.some((item) =>
      source.includes(compactWhitespace(item).toLowerCase()),
    )
  );
}

function buildContextParagraph(
  input: ProposalGenerationInput,
  projectType: string,
  focusSkills: string[],
  cautionMode: boolean,
): string {
  const title = compactWhitespace(input.opportunity.title ?? "este projeto");
  const skillBlock = joinListForSentence(focusSkills.slice(0, 3));

  if (cautionMode) {
    return compactWhitespace(
      `Li o escopo de ${title} e a melhor forma de conduzir ${projectType} aqui é com uma entrada bem objetiva, validando primeiro os pontos críticos do fluxo antes de expandir o trabalho. Tenho aderência prática com ${skillBlock}, o que ajuda a atacar a entrega com foco técnico e sem prometer além do que o projeto mostra hoje.`,
    );
  }

  return compactWhitespace(
    `Analisei o projeto ${title} e ele conversa bem com um fluxo de ${projectType}, principalmente pela combinação de ${skillBlock}. A proposta aqui é entrar já com entendimento do contexto, reduzir retrabalho e entregar uma solução enxuta, segura e alinhada ao que você precisa colocar de pé rapidamente.`,
  );
}

function buildExecutionParagraph(
  input: ProposalGenerationInput,
  focusSkills: string[],
  cautionMode: boolean,
): string {
  const executionLabel = cautionMode ? "diagnóstico e entrega faseada" : "execução direta";
  const skillsTail = joinListForSentence(focusSkills.slice(0, 2));

  return compactWhitespace(
    `Minha abordagem é seguir com ${executionLabel}: revisar o que já existe, ajustar os pontos prioritários, validar os cenários principais e deixar a entrega organizada para continuidade. Consigo trabalhar com ${skillsTail} em uma janela realista de ${input.deadlineDays} dias, mantendo comunicação clara pela plataforma e uma implementação competitiva sem sacrificar estabilidade.`,
  );
}

function buildRiskControlParagraph(
  input: ProposalGenerationInput,
  cautionMode: boolean,
): string {
  const hasAverageBid =
    typeof input.opportunity.averageBidAmount === "number" &&
    input.opportunity.averageBidAmount > 0;
  const scopeHint = input.riskFlags.includes("UNCLEAR_SCOPE")
    ? "Como o escopo ainda pede algumas confirmações, eu costumo alinhar logo no início as regras de negócio e os limites da entrega para evitar retrabalho."
    : "Se houver integrações, regras de negócio sensíveis ou algum ponto legado, eu costumo tratar isso logo no início para reduzir risco de regressão.";
  const bidHint = hasAverageBid
    ? "A estratégia comercial já foi ajustada para manter a proposta competitiva frente à média observada."
    : "A estratégia comercial foi pensada para manter a proposta objetiva e atrativa dentro do contexto atual.";

  if (cautionMode) {
    return compactWhitespace(`${scopeHint} ${bidHint}`);
  }

  return compactWhitespace(`${bidHint} ${scopeHint}`);
}

function buildAssumptions(
  input: ProposalGenerationInput,
  projectType: string,
): string[] {
  const items = [
    `O escopo principal está concentrado em ${projectType}.`,
    "O acesso ao ambiente ou aos arquivos necessários será disponibilizado no início.",
    input.opportunity.averageDeadlineDays
      ? `A expectativa de prazo do mercado para este projeto gira em torno de ${input.opportunity.averageDeadlineDays} dias.`
      : `O prazo proposto de ${input.deadlineDays} dias considera uma entrega enxuta e priorizada.`,
  ];

  return items.slice(0, 3);
}

function buildQuestions(
  input: ProposalGenerationInput,
  projectType: string,
): string[] {
  const items = [
    `Existe algum fluxo mais crítico dentro de ${projectType} que precisa ser priorizado já na primeira entrega?`,
    "Você já possui ambiente de homologação ou o ajuste precisa acontecer direto no ambiente atual?",
    input.opportunity.proposalCount && input.opportunity.proposalCount > 10
      ? "Há alguma restrição técnica ou de negócio que ainda não apareceu na descrição pública do projeto?"
      : "Existe alguma referência visual ou técnica que você espera que seja seguida?",
  ];

  return items.slice(0, 3);
}

function buildRisks(
  input: ProposalGenerationInput,
  cautionMode: boolean,
): string[] {
  const items = [
    input.riskFlags.includes("UNCLEAR_SCOPE")
      ? "Escopo ainda parcialmente aberto, com chance de ajuste fino após a análise inicial."
      : "Dependências legadas ou regras escondidas podem exigir ajuste fino após a validação técnica.",
    cautionMode
      ? "Se houver stack paralela não descrita, pode ser necessário replanejar parte da execução."
      : "Mudanças fora do escopo principal podem impactar prazo se entrarem no meio da execução.",
  ];

  return items.slice(0, 2);
}

function calculateQualityScore(
  input: ProposalGenerationInput,
  focusSkills: string[],
  cautionMode: boolean,
): number {
  let score = 72;
  score += Math.min(12, input.matchedSkills.length * 4);
  score += Math.min(8, focusSkills.length * 2);
  score -= Math.min(15, input.missingSkills.length * 4);
  score -= Math.min(12, input.riskFlags.length * 3);
  score -= cautionMode ? 4 : 0;

  return Math.max(55, Math.min(94, score));
}

function joinListForSentence(items: string[]): string {
  if (items.length === 0) {
    return "tecnologias web aderentes ao projeto";
  }

  if (items.length === 1) {
    return items[0] ?? "tecnologias web";
  }

  if (items.length === 2) {
    return `${items[0]} e ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}
