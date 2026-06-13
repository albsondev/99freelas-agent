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

type ProposalVoiceStyle =
  | "consultivo"
  | "objetivo"
  | "parceiro"
  | "estrategico";

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
  const voiceStyle = selectVoiceStyle(input);
  const clientGoal = inferClientGoal(input.opportunity, projectType);

  const technicalSummary = compactWhitespace(
    [
      `Abordagem focada em ${projectType}`,
      `com entrega planejada em ${input.deadlineDays} dias`,
      `e prioridade em ${joinListForSentence(focusSkills.slice(0, 3))}.`,
    ].join(" "),
  );

  const paragraphs = [
    buildContextParagraph(input, projectType, focusSkills, cautionMode, voiceStyle, clientGoal),
    buildExecutionParagraph(input, focusSkills, cautionMode, voiceStyle, clientGoal),
    buildRiskControlParagraph(input, cautionMode, voiceStyle),
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
  voiceStyle: ProposalVoiceStyle,
  clientGoal: string,
): string {
  const title = compactWhitespace(input.opportunity.title ?? "este projeto");
  const skillBlock = joinListForSentence(focusSkills.slice(0, 3));
  const openings: Record<ProposalVoiceStyle, string> = {
    consultivo: `Li com atenção o projeto ${title} e faz bastante sentido conduzir isso com um caminho bem prático, principalmente para ${clientGoal}.`,
    objetivo: `Vi o projeto ${title} e entendi bem o que precisa sair do papel aqui: ${clientGoal}.`,
    parceiro: `Seu projeto ${title} me parece um daqueles casos em que vale entrar com agilidade, organização e visão de entrega para ${clientGoal}.`,
    estrategico: `Analisei o projeto ${title} pensando no resultado final que você quer alcançar, e dá para conduzir isso de forma enxuta para ${clientGoal}.`,
  };
  const confidence: Record<ProposalVoiceStyle, string> = {
    consultivo: `Tenho familiaridade real com ${skillBlock}, então consigo começar pelo que mais destrava o projeto sem complicar o processo.`,
    objetivo: `Tenho prática com ${skillBlock}, o que ajuda a atacar exatamente os pontos que costumam gerar retrabalho nesse tipo de demanda.`,
    parceiro: `Como já trabalho com ${skillBlock}, consigo tocar esse tipo de entrega com foco em clareza, ritmo e evolução contínua.`,
    estrategico: `A combinação de ${skillBlock} ajuda bastante a transformar esse escopo em uma entrega objetiva, com menos risco e mais previsibilidade.`,
  };

  if (cautionMode) {
    return compactWhitespace(
      `${openings[voiceStyle]} Antes de ampliar o escopo, eu prefiro validar os pontos críticos e alinhar o que realmente é prioridade. ${confidence[voiceStyle]}`,
    );
  }

  return compactWhitespace(`${openings[voiceStyle]} ${confidence[voiceStyle]}`);
}

function buildExecutionParagraph(
  input: ProposalGenerationInput,
  focusSkills: string[],
  cautionMode: boolean,
  voiceStyle: ProposalVoiceStyle,
  clientGoal: string,
): string {
  const skillsTail = joinListForSentence(focusSkills.slice(0, 2));
  const executionVariants: Record<ProposalVoiceStyle, string> = {
    consultivo: `A minha forma de conduzir seria entrar primeiro no que mais impacta ${clientGoal}, revisar o cenário atual e evoluir a entrega em etapas curtas, para você conseguir acompanhar tudo com segurança.`,
    objetivo: `A ideia aqui é ir direto ao ponto: revisar o que já existe, corrigir o que trava o avanço e deixar a entrega pronta para funcionar de forma estável sem enrolação.`,
    parceiro: `Eu costumo tocar esse tipo de projeto de forma bem próxima do cliente: organizo as prioridades, executo o que destrava mais rápido e mantenho a comunicação simples durante todo o processo.`,
    estrategico: `A condução que faz mais sentido aqui é organizar o escopo por impacto, resolver primeiro o que acelera o resultado e evitar desperdício de tempo com etapas que não agregam agora.`,
  };
  const closingVariants: Record<ProposalVoiceStyle, string> = {
    consultivo: `Consigo trabalhar com ${skillsTail} dentro de uma janela realista de ${input.deadlineDays} dias, mantendo tudo claro pela plataforma e sem prometer além do necessário.`,
    objetivo: `Consigo entregar isso usando ${skillsTail} em ${input.deadlineDays} dias, com comunicação objetiva e foco no que realmente precisa funcionar.`,
    parceiro: `Posso tocar essa entrega com ${skillsTail} ao longo de ${input.deadlineDays} dias, deixando o processo leve para você acompanhar e seguro para colocar em produção.`,
    estrategico: `Com ${skillsTail}, consigo conduzir esse trabalho em ${input.deadlineDays} dias de forma competitiva, organizada e com atenção para evitar retrabalho depois.`,
  };

  if (cautionMode) {
    return compactWhitespace(
      `${executionVariants[voiceStyle]} Faço isso validando primeiro os pontos críticos e abrindo o restante do escopo à medida que o projeto for ficando mais claro. ${closingVariants[voiceStyle]}`,
    );
  }

  return compactWhitespace(`${executionVariants[voiceStyle]} ${closingVariants[voiceStyle]}`);
}

function buildRiskControlParagraph(
  input: ProposalGenerationInput,
  cautionMode: boolean,
  voiceStyle: ProposalVoiceStyle,
): string {
  const hasAverageBid =
    typeof input.opportunity.averageBidAmount === "number" &&
    input.opportunity.averageBidAmount > 0;
  const scopeHint = input.riskFlags.includes("UNCLEAR_SCOPE")
    ? "Como o escopo ainda pede algumas confirmações, eu prefiro alinhar isso logo no começo para evitar retrabalho e expectativa desalinhada."
    : "Se aparecer algum detalhe sensível de regra de negócio, integração ou legado, eu costumo tratar isso cedo para a entrega seguir redonda.";
  const commercialHint = hasAverageBid
    ? "Também ajustei a proposta para ficar competitiva em relação ao que o mercado está praticando neste projeto."
    : "A proposta foi pensada para ficar atrativa, coerente e viável dentro do cenário que o projeto mostra hoje.";
  const closes: Record<ProposalVoiceStyle, string> = {
    consultivo: "Se fizer sentido para você, eu posso começar de forma organizada e ir te atualizando por etapas.",
    objetivo: "Se a ideia for resolver isso sem complicar, consigo seguir bem nessa linha.",
    parceiro: "A intenção é justamente facilitar a sua decisão e tocar isso com tranquilidade.",
    estrategico: "O foco é te ajudar a fechar esse projeto com uma entrega segura e bem encaminhada desde o início.",
  };

  if (cautionMode) {
    return compactWhitespace(`${scopeHint} ${commercialHint} ${closes[voiceStyle]}`);
  }

  return compactWhitespace(`${commercialHint} ${scopeHint} ${closes[voiceStyle]}`);
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

function selectVoiceStyle(input: ProposalGenerationInput): ProposalVoiceStyle {
  const seedSource = [
    input.opportunity.id,
    input.opportunity.title ?? "",
    input.amount,
    input.deadlineDays,
  ].join("|");
  const seed = hashString(seedSource);
  const styles: ProposalVoiceStyle[] = [
    "consultivo",
    "objetivo",
    "parceiro",
    "estrategico",
  ];

  return styles[seed % styles.length] ?? "consultivo";
}

function inferClientGoal(opportunity: Opportunity, projectType: string): string {
  const source = compactWhitespace(
    `${opportunity.title ?? ""} ${opportunity.description ?? ""}`.toLowerCase(),
  );

  if (/\bbug|erro|corre(?:ç|c)[aã]o|ajuste|manuten/.test(source)) {
    return "colocar o fluxo para funcionar com mais estabilidade";
  }

  if (/\blanding page\b|\blp\b/.test(source)) {
    return "ter uma página mais convincente e pronta para conversão";
  }

  if (/\bsite\b/.test(source)) {
    return "tirar o site do papel com agilidade e boa apresentação";
  }

  return `avançar com ${projectType} de forma segura`;
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
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
