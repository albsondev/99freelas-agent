import { describe, expect, it } from "vitest";

import { ComplianceValidatorService } from "./compliance-validator.service.js";

describe("ComplianceValidatorService", () => {
  it("approves concise and contextual proposal text", () => {
    const service = new ComplianceValidatorService();
    const result = service.validate({
      title: "Dashboard React",
      description: "Painel administrativo com React e Supabase.",
      skills: ["React", "Supabase"],
      detailsText:
        "Entendi que você precisa de um dashboard em React com uma base sólida em Supabase e regras claras de acesso.\n\nConsigo estruturar a implementação com foco em organização do frontend, integração da API e estabilidade na entrega.\n\nSe fizer sentido, alinhamos os detalhes por aqui e eu inicio pela validação técnica do escopo.",
    });

    expect(result.status).toBe("APPROVED");
    expect(result.flags).toEqual([]);
  });

  it("blocks proposal with contact outside the platform", () => {
    const service = new ComplianceValidatorService();
    const result = service.validate({
      detailsText: "Me chama no WhatsApp 11999999999 que eu garanto 100% de sucesso.",
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.flags).toContain("WHATSAPP_DETECTED");
    expect(result.flags).toContain("ABSOLUTE_GUARANTEE_DETECTED");
  });
});

