import { describe, expect, it } from "vitest";

import { PricingService } from "./pricing.service.js";

describe("PricingService", () => {
  it("uses discounted average when viable", () => {
    const service = new PricingService();
    const result = service.calculate({
      title: "Integração API",
      description: "Integração simples entre sistema e gateway de pagamento.",
      skills: ["API REST", "Integrações"],
      deadlineDays: 5,
      averageBidAmount: 1200,
      minimumProposalAmountBrl: 150,
      minimumDailyRateBrl: 120,
      defaultHourlyRateBrl: 50,
      priceDiscountFactor: 0.5,
    });

    expect(result.strategy).toBe("AVERAGE_BID_DISCOUNT");
    expect(result.amount).toBe(600);
  });

  it("raises the amount to the platform minimum when the discount gets too low", () => {
    const service = new PricingService();
    const result = service.calculate({
      title: "Bug simples",
      description: "Correção de bug em formulário.",
      skills: ["Correção de bugs"],
      deadlineDays: 4,
      averageBidAmount: 200,
      minimumPlatformOfferBrl: 150,
      minimumProposalAmountBrl: 150,
      minimumDailyRateBrl: 120,
      defaultHourlyRateBrl: 50,
      priceDiscountFactor: 0.5,
    });

    expect(result.strategy).toBe("MINIMUM_FLOOR");
    expect(result.amount).toBe(150);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("keeps a simple wordpress mobile adjustment commercially close to the market average", () => {
    const service = new PricingService();
    const result = service.calculate({
      title: "Customização de site WordPress (ajuste versão mobile)",
      description:
        "Customização simples de site para ajustar a versão mobile e atualizar telefones.",
      skills: ["WordPress"],
      deadlineDays: 2,
      averageBidAmount: 530,
      minimumProposalAmountBrl: 150,
      minimumDailyRateBrl: 120,
      defaultHourlyRateBrl: 50,
      priceDiscountFactor: 0.5,
    });

    expect(result.strategy).toBe("AVERAGE_BID_DISCOUNT");
    expect(result.amount).toBe(270);
  });

  it("keeps the market discount even when it goes below the personal daily floor", () => {
    const service = new PricingService();
    const result = service.calculate({
      title: "Customização de site WordPress (ajuste versão mobile)",
      description:
        "Customização simples de site para ajustar a versão mobile e atualizar telefones.",
      skills: ["WordPress"],
      deadlineDays: 2,
      averageBidAmount: 298.18,
      minimumPlatformOfferBrl: 50,
      minimumProposalAmountBrl: 150,
      minimumDailyRateBrl: 120,
      defaultHourlyRateBrl: 50,
      priceDiscountFactor: 0.5,
    });

    expect(result.strategy).toBe("AVERAGE_BID_DISCOUNT");
    expect(result.amount).toBe(150);
    expect(result.warnings).toEqual([]);
  });
});
