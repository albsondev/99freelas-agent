import type { Opportunity, UserProfile } from "@99freelas/core";

export const PROPOSAL_PROMPT_VERSION = "proposal-v1";

export type ProposalPromptInput = {
  opportunity: Opportunity;
  amount: number;
  deadlineDays: number;
  pricingExplanation: string;
  deadlineExplanation: string;
  matchedSkills: string[];
  missingSkills: string[];
  decisionReasons: string[];
  riskFlags: string[];
  freelancerProfile?: UserProfile | null;
};

type SerializedFreelancerProfile = {
  displayName: string;
  headline: string;
  seniority: string;
  mainSkills: string[];
  secondarySkills: string[];
  proposalTone: string;
  portfolioSummary: string;
};

const DEFAULT_PROFILE: SerializedFreelancerProfile = {
  displayName: "Especialista Web Full Stack",
  headline:
    "Desenvolvedor focado em JavaScript, TypeScript, PHP, APIs e integracoes web",
  seniority: "senior",
  mainSkills: ["JavaScript", "TypeScript", "Node.js", "PHP", "APIs", "Supabase"],
  secondarySkills: ["Laravel", "Next.js", "Automacao", "Dashboards"],
  proposalTone: "consultivo_direto",
  portfolioSummary:
    "Experiencia com sistemas web sob medida, integracoes, manutencao evolutiva e entrega incremental.",
};

function resolveFreelancerProfile(
  profile?: UserProfile | null,
): SerializedFreelancerProfile {
  if (!profile) {
    return DEFAULT_PROFILE;
  }

  return {
    displayName: profile.displayName,
    headline: profile.headline ?? DEFAULT_PROFILE.headline,
    seniority: profile.seniority,
    mainSkills:
      profile.mainSkills.length > 0 ? profile.mainSkills : DEFAULT_PROFILE.mainSkills,
    secondarySkills:
      profile.secondarySkills.length > 0
        ? profile.secondarySkills
        : DEFAULT_PROFILE.secondarySkills,
    proposalTone: profile.proposalTone,
    portfolioSummary:
      profile.portfolioSummary ?? DEFAULT_PROFILE.portfolioSummary,
  };
}

export function buildProposalSystemPrompt(): string {
  return [
    "Voce escreve propostas comerciais em portugues do Brasil para 99Freelas.",
    "Seu objetivo e gerar uma proposta curta, especifica e convincente, sem soar generica.",
    "A proposta precisa mostrar aderencia tecnica ao projeto, clareza de execucao e seguranca comercial.",
    "Regras obrigatorias:",
    "- Nunca inclua email, telefone, WhatsApp, Telegram, links externos ou convite para contato fora da plataforma.",
    "- Nunca prometa garantia absoluta, prazo impossivel ou resultado milagroso.",
    "- Nunca diga que foi escrita por IA.",
    "- detailsText deve ser texto corrido com 2 ou 3 paragrafos curtos, sem markdown e sem listas.",
    "- detailsText deve mencionar o contexto do projeto e a abordagem de entrega.",
    "- technicalSummary deve resumir a abordagem tecnica em uma frase objetiva.",
    "- assumptions, questions e risks devem ser concretos e curtos.",
    "- qualityScore deve refletir a qualidade comercial do rascunho entre 0 e 100.",
  ].join("\n");
}

export function buildProposalUserPrompt(input: ProposalPromptInput): string {
  const profile = resolveFreelancerProfile(input.freelancerProfile);
  const opportunityContext = {
    title: input.opportunity.title ?? "",
    description: input.opportunity.description ?? "",
    category: input.opportunity.category ?? "",
    skills: input.opportunity.skills,
    budgetText: input.opportunity.budgetText ?? null,
    budgetMin: input.opportunity.budgetMin ?? null,
    budgetMax: input.opportunity.budgetMax ?? null,
    averageBidAmount: input.opportunity.averageBidAmount ?? null,
    averageDeadlineDays: input.opportunity.averageDeadlineDays ?? null,
    proposalCount: input.opportunity.proposalCount ?? null,
    interestedCount: input.opportunity.interestedCount ?? null,
    clientName: input.opportunity.clientName ?? null,
    clientRating: input.opportunity.clientRating ?? null,
  };
  const strategy = {
    amountBrl: input.amount,
    deadlineDays: input.deadlineDays,
    pricingExplanation: input.pricingExplanation,
    deadlineExplanation: input.deadlineExplanation,
    matchedSkills: input.matchedSkills,
    missingSkills: input.missingSkills,
    decisionReasons: input.decisionReasons,
    riskFlags: input.riskFlags,
  };

  return [
    "Gere um JSON valido conforme o schema solicitado.",
    "Use o contexto abaixo para escrever a proposta.",
    "",
    "Perfil do freelancer:",
    JSON.stringify(profile, null, 2),
    "",
    "Projeto do cliente:",
    JSON.stringify(opportunityContext, null, 2),
    "",
    "Estrategia comercial e tecnica recomendada:",
    JSON.stringify(strategy, null, 2),
    "",
    "Objetivo de escrita:",
    "- destacar aderencia tecnica real",
    "- mostrar entendimento do escopo",
    "- vender confianca sem exagero",
    "- manter o texto especifico para este projeto",
  ].join("\n");
}
