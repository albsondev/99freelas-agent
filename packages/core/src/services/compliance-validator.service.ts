import {
  containsExternalContact,
  containsSuspiciousPaymentRequest,
  extractSkills,
  sanitizeProposalText,
} from "../utils/normalization.js";

export type ComplianceValidationInput = {
  detailsText: string;
  title?: string;
  description?: string;
  skills?: string[];
};

export type ComplianceResult = {
  status: "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED";
  flags: string[];
  blockingReasons: string[];
};

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+\b/i;
const PHONE_PATTERN =
  /(?:\+?\d{1,3}\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})/;
const WHATSAPP_PATTERN = /\bwhatsapp\b/i;
const TELEGRAM_PATTERN = /\btelegram\b/i;
const ABSOLUTE_GUARANTEE_PATTERN =
  /\b(?:100%\s*garantido|garantia total|sem erro nenhum|resultado garantido|garanto\s*100%|100%\s*de\s*sucesso)\b/i;
const GENERIC_PATTERN =
  /\b(?:tenho interesse no projeto|ol[aá], tudo bem|posso ajudar em qualquer demanda)\b/i;
const AGGRESSIVE_PATTERN =
  /\b(?:melhor do mercado|imperd[ií]vel|fecho hoje sem falta)\b/i;

export class ComplianceValidatorService {
  validate(input: ComplianceValidationInput): ComplianceResult {
    const text = sanitizeProposalText(input.detailsText);
    const flags: string[] = [];
    const blockingReasons: string[] = [];
    const paragraphs = text ? text.split(/\n\s*\n/) : [];

    if (!text) {
      flags.push("EMPTY_TEXT");
      blockingReasons.push("Texto da proposta vazio.");
    }

    if (paragraphs.length > 3) {
      flags.push("TOO_LONG");
    }

    if (text.length > 1200) {
      flags.push("TOO_LONG");
    }

    if (text.length > 0 && text.length < 120) {
      flags.push("TOO_SHORT");
    }

    if (EMAIL_PATTERN.test(text)) {
      flags.push("EXTERNAL_EMAIL_DETECTED");
      blockingReasons.push("Detectado e-mail na proposta.");
    }

    if (PHONE_PATTERN.test(text)) {
      flags.push("PHONE_DETECTED");
      blockingReasons.push("Detectado telefone na proposta.");
    }

    if (WHATSAPP_PATTERN.test(text)) {
      flags.push("WHATSAPP_DETECTED");
      blockingReasons.push("Detectado convite para WhatsApp.");
    }

    if (TELEGRAM_PATTERN.test(text)) {
      flags.push("TELEGRAM_DETECTED");
      blockingReasons.push("Detectado convite para Telegram.");
    }

    if (URL_PATTERN.test(text)) {
      flags.push("EXTERNAL_LINK_DETECTED");
      blockingReasons.push("Detectado link externo na proposta.");
    }

    if (containsExternalContact(text)) {
      flags.push("OFF_PLATFORM_CONTACT_DETECTED");
      blockingReasons.push("Texto sugere contato fora da plataforma.");
    }

    if (containsSuspiciousPaymentRequest(text)) {
      flags.push("OFF_PLATFORM_PAYMENT_DETECTED");
      blockingReasons.push("Texto sugere pagamento fora da plataforma.");
    }

    if (ABSOLUTE_GUARANTEE_PATTERN.test(text)) {
      flags.push("ABSOLUTE_GUARANTEE_DETECTED");
      blockingReasons.push("Texto promete garantia absoluta.");
    }

    if (GENERIC_PATTERN.test(text)) {
      flags.push("TOO_GENERIC");
    }

    if (AGGRESSIVE_PATTERN.test(text)) {
      flags.push("AGGRESSIVE_LANGUAGE");
    }

    const contextTerms = new Set<string>([
      ...(input.skills ?? []),
      ...extractSkills([input.title ?? "", input.description ?? ""].join(" ")),
      ...((input.title ?? "").split(/\W+/).filter((term) => term.length >= 5)),
    ]);
    const mentionsContext =
      [...contextTerms].length === 0
        ? true
        : [...contextTerms].some((term) =>
            text.toLowerCase().includes(term.toLowerCase()),
          );

    if (!mentionsContext) {
      flags.push("MISSING_PROJECT_CONTEXT");
    }

    const criticalFlags = new Set([
      "EMPTY_TEXT",
      "EXTERNAL_EMAIL_DETECTED",
      "PHONE_DETECTED",
      "WHATSAPP_DETECTED",
      "TELEGRAM_DETECTED",
      "EXTERNAL_LINK_DETECTED",
      "OFF_PLATFORM_CONTACT_DETECTED",
      "OFF_PLATFORM_PAYMENT_DETECTED",
      "ABSOLUTE_GUARANTEE_DETECTED",
    ]);

    const status = blockingReasons.length > 0
      ? "BLOCKED"
      : flags.some((flag) => !criticalFlags.has(flag))
        ? "REVIEW_REQUIRED"
        : "APPROVED";

    return {
      status,
      flags: [...new Set(flags)],
      blockingReasons,
    };
  }
}
