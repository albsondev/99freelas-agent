import { describe, expect, it } from "vitest";

import {
  containsExternalContact,
  containsSuspiciousPaymentRequest,
  extractBudgetRangeBRL,
  extractSkills,
  normalizeCurrencyBRL,
  normalizeDeadlineDays,
  sanitizeProposalText,
} from "./normalization.js";

describe("normalization utils", () => {
  it("normalizes BRL values from common formats", () => {
    expect(normalizeCurrencyBRL("R$ 1.500,00")).toBe(1500);
    expect(normalizeCurrencyBRL("1500 reais")).toBe(1500);
    expect(normalizeCurrencyBRL("Até R$ 2 mil")).toBe(2000);
  });

  it("extracts budget range when text contains interval", () => {
    expect(extractBudgetRangeBRL("de R$ 500 a R$ 1.000")).toEqual({
      min: 500,
      max: 1000,
    });
  });

  it("normalizes deadlines from days, weeks and months", () => {
    expect(normalizeDeadlineDays("3 dias")).toBe(3);
    expect(normalizeDeadlineDays("2 semanas")).toBe(14);
    expect(normalizeDeadlineDays("1 mês")).toBe(30);
  });

  it("extracts canonical skills from free text", () => {
    expect(
      extractSkills("Preciso de dashboard em Next.js com Supabase e integração API."),
    ).toEqual(
      expect.arrayContaining([
        "Next.js",
        "Supabase",
        "API REST",
        "Integrações",
        "Dashboard",
      ]),
    );
  });

  it("sanitizes proposal text without killing paragraphs", () => {
    expect(
      sanitizeProposalText(" Olá, cliente.   \n\n Posso ajudar com  React e Node.  "),
    ).toBe("Olá, cliente.\n\nPosso ajudar com React e Node.");
  });

  it("detects external contact and suspicious payment requests", () => {
    expect(containsExternalContact("Me chama no WhatsApp 11999999999")).toBe(true);
    expect(containsSuspiciousPaymentRequest("Podemos fazer o pagamento por fora via PIX")).toBe(
      true,
    );
  });
});
