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
const LOCAL_TEMPLATE_PROMPT_VERSION = "proposal-template-v3";
const MAX_DETAILS_TEXT_LENGTH = 1200;

type ProjectCategory =
  | "institutional-site"
  | "landing-page"
  | "wordpress-adjustment"
  | "system"
  | "integration"
  | "frontend"
  | "bugfix"
  | "dashboard"
  | "pdf-documents"
  | "ai-project"
  | "generic-web";

type ProjectComplexity = "simple" | "medium" | "complex" | "critical";

type ProjectContext = {
  category: ProjectCategory;
  complexity: ProjectComplexity;
  source: string;
  title: string;
  description: string;
  focusSkills: string[];
  techSignals: string[];
  featureSignals: string[];
  nicheSignals: string[];
  sensitiveSignals: string[];
};

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
      return Promise.resolve(buildLocalContextProposal(input));
    },
  };
}

function buildLocalContextProposal(
  input: ProposalGenerationInput,
): ProposalGenerationResult {
  const profile = resolveFreelancerProfile(input.freelancerProfile);
  const context = buildProjectContext(input, profile);
  const objectiveSummary = buildObjectiveSummary(context);
  const criticalPoint = buildCriticalPoint(context);
  const experienceSentence = buildExperienceSentence(context);
  const approachSentence = buildApproachSentence(context);
  const valueSentence = buildValueSentence(context);
  const flexibilitySentence = buildFlexibilitySentence(input, context);
  const closingSentence = buildClosingSentence(context);

  const technicalSummary = compactWhitespace(
    [
      `Abordagem focada em ${humanizeCategory(context.category)}`,
      `com entrega planejada em ${input.deadlineDays} dias`,
      `e prioridade em ${joinListForSentence(context.focusSkills.slice(0, 3))}.`,
    ].join(" "),
  );

  const paragraphs = [
    sanitizeProposalText(
      [
        "Olá, tudo bem?",
        buildOpening(context),
        `Pelo que entendi, o objetivo é ${objectiveSummary}.`,
        `Vejo como ponto importante ${criticalPoint}.`,
        experienceSentence,
      ].join(" "),
    ),
    sanitizeProposalText(
      [
        approachSentence,
        buildDeliverablesSentence(context),
        buildQualitySentence(context),
      ].join(" "),
    ),
    sanitizeProposalText(
      [valueSentence, flexibilitySentence, closingSentence].join(" "),
    ),
  ];

  const detailsText = fitDetailsText(paragraphs);
  const assumptions = buildAssumptions(input, context);
  const questions = buildQuestions(input, context);
  const risks = buildRisks(context);
  const qualityScore = calculateQualityScore(input, context);

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

function buildProjectContext(
  input: ProposalGenerationInput,
  profile: SerializedFreelancerProfile,
): ProjectContext {
  const title = compactWhitespace(input.opportunity.title ?? "");
  const description = compactWhitespace(input.opportunity.description ?? "");
  const source = compactWhitespace(
    `${title} ${description} ${input.opportunity.category ?? ""}`.toLowerCase(),
  );
  const focusSkills = pickFocusSkills(input.opportunity, profile, input.matchedSkills);
  const techSignals = extractTechnologySignals(source, focusSkills);
  const featureSignals = extractFeatureSignals(source);
  const nicheSignals = extractNicheSignals(source);
  const sensitiveSignals = extractSensitiveSignals(source);
  const category = inferCategory(source, techSignals, featureSignals);
  const complexity = inferComplexity(source, category, sensitiveSignals, featureSignals);

  return {
    category,
    complexity,
    source,
    title,
    description,
    focusSkills,
    techSignals,
    featureSignals,
    nicheSignals,
    sensitiveSignals,
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

function extractTechnologySignals(source: string, focusSkills: string[]): string[] {
  const catalog: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\bwordpress\b/i, label: "WordPress" },
    { pattern: /\belementor\b/i, label: "Elementor" },
    { pattern: /\breact(?:\.js)?\b/i, label: "React" },
    { pattern: /\bnext(?:\.js)?\b/i, label: "Next.js" },
    { pattern: /\bvue(?:\.js)?\b/i, label: "Vue.js" },
    { pattern: /\bnode(?:\.js)?\b/i, label: "Node.js" },
    { pattern: /\btypescript\b/i, label: "TypeScript" },
    { pattern: /\bjavascript\b/i, label: "JavaScript" },
    { pattern: /\bphp\b/i, label: "PHP" },
    { pattern: /\bsupabase\b/i, label: "Supabase" },
    { pattern: /\bapi\b/i, label: "API REST" },
    { pattern: /\bhtml2canvas\b/i, label: "html2canvas" },
    { pattern: /\bjspdf\b/i, label: "jsPDF" },
    { pattern: /\bgemini|google ai|ia\b/i, label: "integração com IA" },
  ];

  const labels = catalog
    .filter((item) => item.pattern.test(source))
    .map((item) => item.label);

  return [...new Set([...focusSkills, ...labels])].slice(0, 5);
}

function extractFeatureSignals(source: string): string[] {
  const catalog: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\bblog\b/i, label: "blog" },
    { pattern: /\bseo\b/i, label: "SEO" },
    { pattern: /\bwhatsapp\b/i, label: "integração com WhatsApp" },
    { pattern: /\bformul[áa]rio\b/i, label: "formulários" },
    { pattern: /\bresponsiv/i, label: "responsividade" },
    { pattern: /\bdashboard\b/i, label: "dashboard" },
    { pattern: /\bapi\b/i, label: "integração com API" },
    { pattern: /\bwebhook\b/i, label: "webhooks" },
    { pattern: /\bpdf\b/i, label: "geração de PDF" },
    { pattern: /\blogin\b/i, label: "fluxo de login" },
    { pattern: /\bfiltros?\b/i, label: "filtros" },
    { pattern: /\bexporta(?:ç|c)(?:a|ã)o\b/i, label: "exportação de dados" },
    { pattern: /\bpainel administrativo\b/i, label: "painel administrativo" },
    { pattern: /\blanding page\b|\blp\b/i, label: "landing page" },
    { pattern: /\bsite institucional\b|\bsite profissional\b/i, label: "site institucional" },
    { pattern: /\bportf[oó]lio\b/i, label: "portfólio" },
    { pattern: /\bcontato\b/i, label: "captação de contatos" },
    { pattern: /\bbug|erro|corre(?:ç|c)(?:a|ã)o|ajuste\b/i, label: "correções e ajustes" },
    { pattern: /\bpermiss(?:ã|a)o|permiss(?:o|õ)es\b/i, label: "controle de permissões" },
  ];

  return [...new Set(catalog.filter((item) => item.pattern.test(source)).map((item) => item.label))]
    .slice(0, 6);
}

function extractNicheSignals(source: string): string[] {
  const catalog: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\badvogad|advocacia|jur[ií]dic/i, label: "jurídico" },
    { pattern: /\bmedic|sa[úu]de|laudo|cl[ií]nic/i, label: "saúde" },
    { pattern: /\bconsultoria\b/i, label: "consultoria" },
    { pattern: /\beduca(?:ç|c)(?:a|ã)o|escola|curso\b/i, label: "educação" },
    { pattern: /\be-?commerce|loja\b/i, label: "comércio" },
  ];

  return [...new Set(catalog.filter((item) => item.pattern.test(source)).map((item) => item.label))]
    .slice(0, 3);
}

function extractSensitiveSignals(source: string): string[] {
  const catalog: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\bpagamento|pix|webhook|saldo|saque|comiss[aã]o\b/i, label: "financeiro" },
    { pattern: /\bmedic|sa[úu]de|laudo\b/i, label: "saúde" },
    { pattern: /\bjur[ií]dic|advocacia\b/i, label: "jurídico" },
    { pattern: /\bdados sens[ií]veis|credenciais|autentica(?:ç|c)(?:a|ã)o\b/i, label: "dados sensíveis" },
    { pattern: /\bia\b|\bgemini\b|\bopenai\b|\bgoogle ai\b/i, label: "IA" },
  ];

  return [...new Set(catalog.filter((item) => item.pattern.test(source)).map((item) => item.label))]
    .slice(0, 4);
}

function inferCategory(
  source: string,
  techSignals: string[],
  featureSignals: string[],
): ProjectCategory {
  if (/\bpdf\b|\bhtml2canvas\b|\bjspdf\b/i.test(source)) {
    return "pdf-documents";
  }

  if (/\bgemini\b|\bgoogle ai\b|\bopenai\b|\bia\b/i.test(source)) {
    return "ai-project";
  }

  if (/\blanding page\b|\blp\b/i.test(source)) {
    return "landing-page";
  }

  if (/\bwordpress\b|\belementor\b/i.test(source) && /\bbug|erro|ajuste|blog|layout|responsiv/i.test(source)) {
    return "wordpress-adjustment";
  }

  if (/\bsite institucional\b|\bsite profissional\b|\bportf[oó]lio\b/i.test(source)) {
    return "institutional-site";
  }

  if (/\bbug|erro|corre(?:ç|c)(?:a|ã)o|ajuste\b/i.test(source)) {
    return "bugfix";
  }

  if (/\bapi\b|\bwebhook\b|\bpagamento\b/i.test(source)) {
    return "integration";
  }

  if (/\bdashboard\b|\bpainel administrativo\b/i.test(source)) {
    return "dashboard";
  }

  if (/\bsistema\b|\bárea logada\b|\bpainel\b|\bgest[aã]o\b/i.test(source)) {
    return "system";
  }

  if (techSignals.some((item) => ["React", "Next.js", "Vue.js"].includes(item))) {
    return "frontend";
  }

  if (featureSignals.includes("site institucional")) {
    return "institutional-site";
  }

  return "generic-web";
}

function inferComplexity(
  source: string,
  category: ProjectCategory,
  sensitiveSignals: string[],
  featureSignals: string[],
): ProjectComplexity {
  if (sensitiveSignals.length > 0) {
    return "critical";
  }

  if (
    ["system", "integration", "dashboard", "pdf-documents", "ai-project"].includes(category) ||
    featureSignals.length >= 4
  ) {
    return "complex";
  }

  if (
    ["institutional-site", "landing-page", "wordpress-adjustment", "frontend", "bugfix"].includes(
      category,
    ) ||
    featureSignals.length >= 2
  ) {
    return "medium";
  }

  return "simple";
}

function buildOpening(context: ProjectContext): string {
  const variants = [
    "Li a descrição do projeto com atenção e acredito que consigo te ajudar com essa demanda.",
    "Analisei sua solicitação com cuidado e vejo que dá para conduzir esse projeto com segurança.",
    "Seu projeto está claro e acredito que posso contribuir com uma entrega bem estruturada.",
    "Consigo te ajudar com essa demanda, principalmente porque o escopo mostra exatamente onde precisam estar os cuidados técnicos.",
  ];

  return variants[hashString(`${context.title}|${context.category}`) % variants.length] ?? variants[0]!;
}

function buildObjectiveSummary(context: ProjectContext): string {
  const focus = joinListForSentence(context.featureSignals.slice(0, 3));
  const categoryText = humanizeCategory(context.category);

  if (context.featureSignals.length === 0) {
    return `${normalizeSentence(context.title || categoryText)}, com foco em uma entrega organizada e pronta para uso`;
  }

  return `${normalizeSentence(context.title || categoryText)}, envolvendo ${focus}, com foco em um resultado funcional e bem estruturado`;
}

function buildCriticalPoint(context: ProjectContext): string {
  const source = context.source;

  if (context.category === "pdf-documents") {
    return "garantir previsibilidade visual no PDF e fidelidade aos dados exibidos, para que o resultado final fique confiável e sem quebra de layout";
  }

  if (context.category === "integration") {
    return "tratar a integração de forma segura, principalmente no controle de credenciais, retornos da API e consistência das regras do fluxo";
  }

  if (context.category === "dashboard" || context.category === "system") {
    return "estruturar os fluxos principais com clareza para que a entrega fique estável, fácil de manter e sem impacto desnecessário em outras partes do sistema";
  }

  if (context.category === "landing-page") {
    return "organizar a hierarquia visual e os pontos de conversão para que a página fique clara, profissional e preparada para gerar contato";
  }

  if (
    context.category === "institutional-site" ||
    context.category === "wordpress-adjustment"
  ) {
    return "garantir que a estrutura visual, a responsividade e a organização do conteúdo transmitam credibilidade e funcionem bem em computador e celular";
  }

  if (context.category === "bugfix" || /\bbug|erro|ajuste\b/i.test(source)) {
    return "identificar o ponto exato do ajuste e corrigir sem comprometer outras partes do fluxo já existente";
  }

  if (context.complexity === "critical") {
    return `conduzir a implementação com cuidado técnico e previsibilidade, principalmente por envolver ${joinListForSentence(
      context.sensitiveSignals.slice(0, 2),
    )}`;
  }

  return "alinhar uma execução limpa, organizada e sem retrabalho, para que a solução fique bem aplicada do início ao fim";
}

function buildExperienceSentence(context: ProjectContext): string {
  const skills = joinListForSentence(context.focusSkills.slice(0, 4));
  const relatedNeed =
    context.featureSignals.length > 0
      ? joinListForSentence(context.featureSignals.slice(0, 3))
      : humanizeCategory(context.category);

  return `Tenho experiência com ${skills} e com entregas desse tipo, especialmente em demandas que envolvem ${relatedNeed}.`;
}

function buildApproachSentence(context: ProjectContext): string {
  const steps = buildApproachSteps(context);
  const categoryLead =
    context.category === "bugfix" || context.category === "system" || context.category === "dashboard"
      ? "Começando pelo entendimento do funcionamento atual e pelo ponto exato do ajuste"
      : context.category === "wordpress-adjustment" || context.category === "institutional-site"
        ? "Começando pela leitura da estrutura atual do site e pela validação dos pontos principais"
        : "";
  const prefix =
    context.complexity === "simple"
      ? "Minha abordagem seria"
      : context.complexity === "critical"
        ? "Minha sugestão aqui seria conduzir a entrega em etapas bem claras"
        : "Minha abordagem seria seguir uma execução organizada";
  const communicationSuffix = " com comunicação clara durante o processo";

  const cautionSuffix =
    context.source.includes("escopo aberto") ||
    context.source.includes("não detalhad") ||
    context.source.includes("nao detalhad")
      ? " Faria isso validando primeiro os pontos críticos e alinhando o restante logo no começo."
      : "";

  if (categoryLead) {
    return `${categoryLead}, ${prefix.toLowerCase()}${communicationSuffix}: ${steps}.${cautionSuffix}`;
  }

  return `${prefix}${communicationSuffix}: ${steps}.${cautionSuffix}`;
}

function buildApproachSteps(context: ProjectContext): string {
  const steps =
    context.complexity === "critical" || context.complexity === "complex"
      ? [
          "analisar a estrutura atual e validar as prioridades",
          "definir a melhor abordagem técnica para o fluxo principal",
          "implementar os ajustes ou funcionalidades centrais",
          "testar os pontos essenciais para evitar regressões",
          "entregar tudo organizado e pronto para uso",
        ]
      : [
          "analisar a estrutura atual",
          "validar a melhor forma de implementação",
          "executar os ajustes principais",
          "testar o funcionamento final",
          "entregar tudo alinhado e funcionando corretamente",
        ];

  return steps.join("; ");
}

function buildDeliverablesSentence(context: ProjectContext): string {
  const features = context.featureSignals.slice(0, 3);
  const techs = context.techSignals.slice(0, 3);

  if (features.length === 0 && techs.length === 0) {
    return "A entrega pode incluir a implementação principal, testes de validação e os ajustes finais necessários para deixar tudo consistente.";
  }

  if (features.length === 0) {
    return `A entrega pode incluir a condução técnica usando ${joinListForSentence(
      techs,
    )}, sempre com foco no que mais impacta o resultado final do projeto.`;
  }

  if (techs.length === 0) {
    return `A entrega pode incluir a condução de ${joinListForSentence(
      features,
    )}, sempre com foco no que mais impacta o resultado final do projeto.`;
  }

  const outcomeTail =
    context.category === "integration" || context.category === "system" || context.category === "dashboard" || context.category === "bugfix"
      ? "com foco em estabilidade e manutenção futura"
      : context.category === "wordpress-adjustment" || context.category === "institutional-site" || context.category === "landing-page"
        ? "com foco em responsividade, clareza visual e experiência do visitante"
        : "com foco no que mais impacta o resultado final do projeto";

  return `A entrega pode incluir a condução de ${joinListForSentence(
    features,
  )}, trabalhando isso com ${joinListForSentence(
    techs,
  )} e ${outcomeTail}.`;
}

function buildQualitySentence(context: ProjectContext): string {
  const parts = ["organização", "clareza de execução"];

  if (context.category === "landing-page" || context.category === "institutional-site") {
    parts.push("responsividade");
    parts.push("credibilidade visual");
  }

  if (context.category === "integration" || context.category === "system") {
    parts.push("segurança");
    parts.push("facilidade de manutenção");
  }

  if (context.category === "pdf-documents") {
    parts.push("previsibilidade visual");
    parts.push("consistência dos dados");
  }

  return `Também cuido para que a entrega fique sólida em ${joinListForSentence(
    [...new Set(parts)].slice(0, 4),
  )}, evitando soluções apressadas que gerem retrabalho depois.`;
}

function buildValueSentence(context: ProjectContext): string {
  if (context.category === "landing-page") {
    return "Trabalho com comunicação clara ao longo da execução e também posso observar pontos de melhoria durante o processo, principalmente em hierarquia visual, clareza da oferta e posicionamento dos CTAs, caso isso faça sentido para o projeto.";
  }

  if (context.category === "institutional-site" || context.category === "wordpress-adjustment") {
    return "Trabalho com comunicação clara ao longo da execução e também posso observar pontos de melhoria durante o processo, principalmente em usabilidade, organização visual, SEO inicial e experiência do visitante, caso isso faça sentido para o projeto.";
  }

  if (context.category === "integration" || context.category === "system" || context.category === "dashboard") {
    return "Trabalho com comunicação clara ao longo da execução e também posso observar pontos de melhoria durante o processo, principalmente em organização do fluxo, estabilidade, melhorias técnicas, segurança e manutenção futura, caso isso faça sentido para o projeto.";
  }

  return "Trabalho com comunicação clara ao longo da execução e também posso observar pontos de melhoria durante o processo, principalmente em clareza da solução, estabilidade e manutenção futura, caso isso faça sentido para o projeto.";
}

function buildFlexibilitySentence(
  input: ProposalGenerationInput,
  context: ProjectContext,
): string {
  const hasAverageBid =
    typeof input.opportunity.averageBidAmount === "number" &&
    input.opportunity.averageBidAmount > 0;

  if (context.complexity === "critical" || context.complexity === "complex") {
    return hasAverageBid
      ? "Sobre prazo e valor, deixei uma estimativa inicial com base nas informações disponíveis e na média praticada hoje, mas posso alinhar melhor conforme prioridade, urgência e detalhes técnicos da entrega."
      : "Sobre prazo e valor, deixei uma estimativa inicial com base nas informações disponíveis, mas estou aberto a alinhar conforme escopo real, prioridade, urgência e detalhes da implementação.";
  }

  return hasAverageBid
    ? "Sobre prazo e valor, deixei uma estimativa inicial com base nas informações disponíveis e no cenário atual de mercado, mas posso ajustar conforme o volume real de trabalho e a prioridade da entrega."
    : "Sobre prazo e valor, deixei uma estimativa inicial com base nas informações disponíveis, mas estou aberto a alinhar conforme o volume de ajustes e o nível de personalização necessário.";
}

function buildClosingSentence(context: ProjectContext): string {
  if (context.complexity === "critical") {
    return "Posso conduzir esse projeto com comunicação clara, cuidado técnico e foco em uma entrega funcional, estável e bem acabada, mantendo você acompanhado ao longo do processo.";
  }

  return "Posso conduzir esse projeto com comunicação clara, organização e foco em uma entrega funcional, bem acabada e pronta para uso, para que você consiga acompanhar o andamento com tranquilidade.";
}

function buildAssumptions(
  input: ProposalGenerationInput,
  context: ProjectContext,
): string[] {
  const assumptions = [
    `O escopo principal está concentrado em ${humanizeCategory(context.category)}.`,
    "O acesso ao ambiente, arquivos ou credenciais necessários será disponibilizado no início da execução.",
    input.opportunity.averageDeadlineDays
      ? `A expectativa de prazo do mercado para este projeto gira em torno de ${input.opportunity.averageDeadlineDays} dias.`
      : `O prazo proposto de ${input.deadlineDays} dias considera uma entrega enxuta, priorizada e sem prometer correria artificial.`,
  ];

  return assumptions.slice(0, 3);
}

function buildQuestions(
  input: ProposalGenerationInput,
  context: ProjectContext,
): string[] {
  const categoryText = humanizeCategory(context.category);
  const feature = buildPriorityFocus(context);

  const items = [
    `Existe algum ponto dentro de ${categoryText} que precise ser priorizado já na primeira entrega, principalmente em ${feature}?`,
    "Você já possui ambiente de homologação ou o ajuste precisa acontecer direto no ambiente atual?",
    input.opportunity.proposalCount && input.opportunity.proposalCount > 10
      ? "Há alguma restrição técnica ou de negócio que ainda não apareceu na descrição pública do projeto?"
      : "Existe alguma referência visual, técnica ou funcional que você espera que seja seguida?",
  ];

  return items.slice(0, 3);
}

function buildPriorityFocus(context: ProjectContext): string {
  const firstFeature = context.featureSignals[0];
  const categoryText = humanizeCategory(context.category);

  if (firstFeature && firstFeature !== categoryText) {
    return firstFeature;
  }

  if (context.category === "institutional-site" || context.category === "wordpress-adjustment") {
    return "estrutura visual, responsividade e organização do conteúdo";
  }

  if (context.category === "landing-page") {
    return "hierarquia visual e conversão";
  }

  if (context.category === "bugfix" || context.category === "system" || context.category === "dashboard") {
    return "fluxo principal e estabilidade";
  }

  if (context.category === "integration") {
    return "integração principal e consistência do fluxo";
  }

  if (context.category === "pdf-documents") {
    return "layout final e consistência dos dados";
  }

  return "o fluxo principal";
}

function buildRisks(context: ProjectContext): string[] {
  const scopeIsOpen =
    context.source.includes("escopo aberto") ||
    context.source.includes("não detalhad") ||
    context.source.includes("nao detalhad");
  const items = [
    scopeIsOpen
      ? "Escopo ainda parcialmente aberto, com chance de ajuste fino após a análise inicial."
      : context.complexity === "critical"
      ? `Por envolver ${joinListForSentence(context.sensitiveSignals.slice(0, 2)) || "regras sensíveis"}, pode ser necessário validar com mais cuidado alguns detalhes antes de fechar o fluxo definitivo.`
      : "Dependências legadas, regras escondidas ou particularidades do ambiente atual podem exigir ajuste fino após a validação técnica.",
    context.complexity === "simple"
      ? "Se surgirem itens fora do escopo principal durante a execução, isso pode impactar prazo e exigir realinhamento."
      : "Mudanças fora do escopo principal podem impactar prazo se entrarem no meio da execução.",
  ];

  return items.slice(0, 2);
}

function calculateQualityScore(
  input: ProposalGenerationInput,
  context: ProjectContext,
): number {
  let score = 70;
  score += Math.min(12, context.focusSkills.length * 2);
  score += Math.min(8, context.featureSignals.length * 2);
  score += context.complexity === "critical" ? 4 : 0;
  score -= Math.min(10, input.missingSkills.length * 3);
  score -= input.riskFlags.includes("UNCLEAR_SCOPE") ? 4 : 0;

  return Math.max(60, Math.min(96, score));
}

function humanizeCategory(category: ProjectCategory): string {
  const dictionary: Record<ProjectCategory, string> = {
    "institutional-site": "site institucional",
    "landing-page": "landing page",
    "wordpress-adjustment": "ajustes ou evolução em WordPress",
    system: "sistema web",
    integration: "integração com serviços externos",
    frontend: "projeto web em front-end",
    bugfix: "correção de bugs e ajustes",
    dashboard: "dashboard ou painel administrativo",
    "pdf-documents": "geração de PDF ou documentos",
    "ai-project": "projeto com IA aplicada",
    "generic-web": "projeto web sob medida",
  };

  return dictionary[category];
}

function joinListForSentence(items: string[]): string {
  const filtered = items.map((item) => compactWhitespace(item)).filter(Boolean);

  if (filtered.length === 0) {
    return "funcionalidades centrais do projeto";
  }

  if (filtered.length === 1) {
    return filtered[0]!;
  }

  if (filtered.length === 2) {
    return `${filtered[0]} e ${filtered[1]}`;
  }

  return `${filtered.slice(0, -1).join(", ")} e ${filtered.at(-1)}`;
}

function fitDetailsText(paragraphs: string[]): string {
  let currentParagraphs = [...paragraphs];
  let currentText = sanitizeProposalText(currentParagraphs.join("\n\n"));

  if (currentText.length <= MAX_DETAILS_TEXT_LENGTH) {
    return currentText;
  }

  while (currentText.length > MAX_DETAILS_TEXT_LENGTH) {
    const trimOrder = [2, 1, 0];
    const removableIndex =
      trimOrder.find((index) => {
        const paragraph = currentParagraphs[index] ?? "";
        return countSentences(paragraph) > minimumSentencesForParagraph(index);
      }) ?? -1;

    if (removableIndex === -1) {
      break;
    }

    currentParagraphs[removableIndex] = removeLastSentence(
      currentParagraphs[removableIndex] ?? "",
      minimumSentencesForParagraph(removableIndex),
    );
    currentText = sanitizeProposalText(currentParagraphs.join("\n\n"));
  }

  if (currentText.length <= MAX_DETAILS_TEXT_LENGTH) {
    return currentText;
  }

  return trimToSentenceBoundary(currentText, MAX_DETAILS_TEXT_LENGTH);
}

function minimumSentencesForParagraph(index: number): number {
  if (index === 0) {
    return 5;
  }

  if (index === 1) {
    return 2;
  }

  return 2;
}

function countSentences(value: string): number {
  return splitSentences(value).length;
}

function removeLastSentence(value: string, minimumSentences = 2): string {
  const normalized = compactWhitespace(value);
  const parts = splitSentences(normalized);

  if (parts.length <= minimumSentences) {
    return normalized;
  }

  return parts.slice(0, -1).join(" ");
}

function trimToSentenceBoundary(value: string, maxLength: number): string {
  const normalized = sanitizeProposalText(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const slice = normalized.slice(0, maxLength);
  const maskedSlice = maskSentenceBoundaryExceptions(slice);
  const lastBoundary = Math.max(
    maskedSlice.lastIndexOf("."),
    maskedSlice.lastIndexOf("!"),
    maskedSlice.lastIndexOf("?"),
  );

  if (lastBoundary >= Math.floor(maxLength * 0.7)) {
    return slice.slice(0, lastBoundary + 1).trim();
  }

  const lastSpace = slice.lastIndexOf(" ");
  return slice.slice(0, lastSpace > 0 ? lastSpace : maxLength).trim();
}

function splitSentences(value: string): string[] {
  const masked = maskSentenceBoundaryExceptions(compactWhitespace(value));

  return masked
    .split(/(?<=[.!?])\s+/)
    .map((item) => unmaskSentenceBoundaryExceptions(compactWhitespace(item)))
    .filter(Boolean);
}

function maskSentenceBoundaryExceptions(value: string): string {
  return value
    .replaceAll("Next.js", "Next§js")
    .replaceAll("Node.js", "Node§js")
    .replaceAll("Vue.js", "Vue§js")
    .replaceAll("React.js", "React§js");
}

function unmaskSentenceBoundaryExceptions(value: string): string {
  return value.replaceAll("§js", ".js");
}

function normalizeSentence(value: string): string {
  const normalized = compactWhitespace(value).replace(/[.:;,-]+$/g, "");
  if (!normalized) {
    return normalized;
  }

  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}
