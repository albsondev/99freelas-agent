import { normalizeCurrencyBRL, normalizeDeadlineDays } from "@99freelas/core";

export type ProposalPageSnapshot = {
  averageBidAmount: number | null;
  averageDeadlineDays: number | null;
  minimumOfferAmount: number | null;
  availableConnections: number | null;
  requiredConnections: number | null;
  hasProposalForm: boolean;
  hasQuestionChannel: boolean;
};

export function parse99FreelasProposalPage(snapshot: string): ProposalPageSnapshot {
  const averageBidLine = matchLine(snapshot, /Valor m[eé]dio das propostas:\s*R\$\s*[\d.,]+/i);
  const averageDeadlineLine = matchLine(snapshot, /Dura[cç][aã]o m[eé]dia estimada:\s*\d+\s*dias?/i);
  const minimumOfferLine = matchLine(snapshot, /Oferta m[ií]nima:\s*R\$\s*[\d.,]+/i);
  const connectionsLine = matchLine(
    snapshot,
    /Esta proposta requer\s+\d+\s+conex(?:ão|ões).*?você ter[áa]\s+\d+\s+conex(?:ão|ões)\s+restantes/i,
  );

  const hasOfferField =
    snapshot.includes('textbox "Sua oferta"') || snapshot.includes("Sua oferta");
  const hasDetailsField =
    snapshot.includes('textbox "Detalhes"') || snapshot.includes("Detalhes");
  const hasProposalAction =
    snapshot.includes('heading "Enviar proposta"') ||
    snapshot.includes('button "Enviar proposta"') ||
    snapshot.includes('heading "Melhorar proposta"') ||
    snapshot.includes('button "Melhorar proposta"') ||
    snapshot.includes("Enviar proposta") ||
    snapshot.includes("Melhorar proposta");

  return {
    averageBidAmount: averageBidLine ? normalizeCurrencyBRL(averageBidLine) : null,
    averageDeadlineDays: averageDeadlineLine
      ? normalizeDeadlineDays(averageDeadlineLine)
      : null,
    minimumOfferAmount: minimumOfferLine ? normalizeCurrencyBRL(minimumOfferLine) : null,
    availableConnections: extractFirstInteger(
      connectionsLine,
      /ter[áa]\s+(\d+)\s+conex(?:ão|ões)\s+restantes/i,
    ),
    requiredConnections: extractFirstInteger(
      connectionsLine,
      /Esta proposta requer\s+(\d+)\s+conex(?:ão|ões)/i,
    ),
    hasProposalForm: hasProposalAction && hasOfferField && hasDetailsField,
    hasQuestionChannel:
      snapshot.includes('link "Fazer pergunta"') ||
      snapshot.includes("Fazer pergunta") ||
      snapshot.includes("/project/message/"),
  };
}

function matchLine(source: string, pattern: RegExp): string | null {
  const match = source.match(pattern);

  return match?.[0] ?? null;
}

function extractFirstInteger(source: string | null, pattern: RegExp): number | null {
  if (!source) {
    return null;
  }

  const match = source.match(pattern);
  const value = Number(match?.[1] ?? "");

  return Number.isFinite(value) ? value : null;
}
