import { compactWhitespace } from "./text.js";

const SKILL_PATTERNS: Array<{ canonical: string; patterns: RegExp[] }> = [
  { canonical: "JavaScript", patterns: [/\bjavascript\b/i, /\bjs\b/i] },
  { canonical: "TypeScript", patterns: [/\btypescript\b/i, /\bts\b/i] },
  { canonical: "React", patterns: [/\breact(?:\.js)?\b/i] },
  { canonical: "Vue.js", patterns: [/\bvue(?:\.js)?\b/i, /\bvuejs\b/i] },
  { canonical: "Next.js", patterns: [/\bnext(?:\.js)?\b/i] },
  { canonical: "Node.js", patterns: [/\bnode(?:\.js)?\b/i] },
  { canonical: "PHP", patterns: [/\bphp\b/i] },
  { canonical: "Laravel", patterns: [/\blaravel\b/i] },
  { canonical: "WordPress", patterns: [/\bwordpress\b/i, /\bwp\b/i] },
  { canonical: "WooCommerce", patterns: [/\bwoocommerce\b/i] },
  { canonical: "API REST", patterns: [/\bapi\b/i, /\brest\b/i] },
  { canonical: "Integrações", patterns: [/\bintegra(?:ç|c)(?:a|ã)o(?:es)?\b/i] },
  { canonical: "Dashboard", patterns: [/\bdashboard\b/i, /\bpainel\b/i] },
  { canonical: "Supabase", patterns: [/\bsupabase\b/i] },
  { canonical: "Firebase", patterns: [/\bfirebase\b/i] },
  { canonical: "Stripe", patterns: [/\bstripe\b/i] },
  { canonical: "Mercado Pago", patterns: [/\bmercado\s+pago\b/i] },
  { canonical: "PagSeguro", patterns: [/\bpagseguro\b/i] },
  { canonical: "Automação", patterns: [/\bautoma(?:ç|c)(?:a|ã)o\b/i] },
  { canonical: "IA aplicada a web", patterns: [/\bia\b/i, /\bintelig[êe]ncia artificial\b/i] },
  { canonical: "Correção de bugs", patterns: [/\bbug(?:s)?\b/i, /\bcorre(?:ç|c)(?:a|ã)o\b/i] },
  { canonical: "Landing Pages", patterns: [/\blanding page\b/i, /\blp\b/i] },
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+\b/i;
const PHONE_PATTERN =
  /(?:\+?\d{1,3}\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})/;
const OFF_PLATFORM_CONTACT_PATTERN =
  /\b(?:contato fora|fale comigo por fora|me chama|me chame|chama no|falar por fora|conversar por fora|passo meu contato|te mando meu contato)\b/i;
const SUSPICIOUS_PAYMENT_PATTERN =
  /\b(?:pix por fora|pagamento por fora|fora da plataforma|transfer[êe]ncia direta|dep[óo]sito direto)\b/i;

export type BudgetRange = {
  min: number | null;
  max: number | null;
};

function normalizeNumberishToken(token: string): number | null {
  const normalized = token
    .toLowerCase()
    .replace(/r\$/g, "")
    .replace(/reais?/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  const multiplier = /\bmil\b|\bk\b/.test(normalized) ? 1000 : 1;
  const numeric = normalized
    .replace(/\bmil\b/g, "")
    .replace(/\bk\b/g, "")
    .replace(/[^\d.,-]/g, "")
    .trim();

  if (!numeric) {
    return null;
  }

  const hasComma = numeric.includes(",");
  const hasDot = numeric.includes(".");

  let parsed = numeric;

  if (hasComma && hasDot) {
    parsed = numeric.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    parsed = numeric.replace(",", ".");
  } else if (hasDot) {
    const dotCount = numeric.split(".").length - 1;
    const fractionalPart = numeric.split(".").at(-1) ?? "";

    if (dotCount > 1 || fractionalPart.length === 3) {
      parsed = numeric.replace(/\./g, "");
    }
  }

  const value = Number(parsed);

  if (!Number.isFinite(value)) {
    return null;
  }

  return value * multiplier;
}

export function extractBudgetRangeBRL(text: string): BudgetRange {
  const source = compactWhitespace(text.toLowerCase());
  const rangeMatches = [...source.matchAll(/(\d[\d.,\s]*(?:mil|k)?)\s*(?:a|at[ée]|-|e)\s*(\d[\d.,\s]*(?:mil|k)?)/gi)];

  if (rangeMatches.length > 0) {
    const firstRange = rangeMatches[0];
    const min = normalizeNumberishToken(firstRange?.[1] ?? "");
    const max = normalizeNumberishToken(firstRange?.[2] ?? "");

    return {
      min,
      max,
    };
  }

  const values = [...source.matchAll(/(\d[\d.,\s]*(?:mil|k)?)/gi)]
    .map((match) => normalizeNumberishToken(match[1] ?? ""))
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return {
      min: null,
      max: null,
    };
  }

  return {
    min: values[0] ?? null,
    max: values.length > 1 ? values[values.length - 1] ?? null : values[0] ?? null,
  };
}

export function normalizeCurrencyBRL(text: string): number | null {
  const range = extractBudgetRangeBRL(text);

  if (range.min !== null && range.max !== null && range.min !== range.max) {
    return Math.round(((range.min + range.max) / 2) * 100) / 100;
  }

  return range.max ?? range.min;
}

export function normalizeDeadlineDays(text: string): number | null {
  const source = compactWhitespace(text.toLowerCase());
  const match = source.match(/(\d+(?:[.,]\d+)?)\s*(dia|dias|semana|semanas|m[eê]s|mes|m[eê]ses|hora|horas)\b/i);

  if (!match) {
    return null;
  }

  const amount = Number((match[1] ?? "").replace(",", "."));

  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = (match[2] ?? "").toLowerCase();

  if (unit.startsWith("hora")) {
    return Math.max(1, Math.ceil(amount / 8));
  }

  if (unit.startsWith("semana")) {
    return Math.ceil(amount * 7);
  }

  if (unit.startsWith("m")) {
    return Math.ceil(amount * 30);
  }

  return Math.ceil(amount);
}

export function extractSkills(text: string): string[] {
  const source = compactWhitespace(text);

  return SKILL_PATTERNS.filter(({ patterns }) =>
    patterns.some((pattern) => pattern.test(source)),
  ).map(({ canonical }) => canonical);
}

export function sanitizeProposalText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n\n")
    .map((paragraph) => compactWhitespace(paragraph))
    .filter(Boolean)
    .join("\n\n");
}

export function containsExternalContact(text: string): boolean {
  const source = sanitizeProposalText(text);

  return (
    EMAIL_PATTERN.test(source) ||
    URL_PATTERN.test(source) ||
    PHONE_PATTERN.test(source) ||
    OFF_PLATFORM_CONTACT_PATTERN.test(source)
  );
}

export function containsSuspiciousPaymentRequest(text: string): boolean {
  return SUSPICIOUS_PAYMENT_PATTERN.test(sanitizeProposalText(text));
}
