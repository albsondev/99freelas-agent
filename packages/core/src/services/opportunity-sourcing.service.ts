import type { OpportunityFetchSweepAction } from "../queue-jobs.js";

export type OpportunitySourceStep = {
  action: OpportunityFetchSweepAction;
  label: string;
  description: string;
  priority: number;
  targetUrl?: string;
};

export type OpportunitySourcingPlanInput = {
  fallbackToProjectListing?: boolean;
  notificationLimit?: number;
  retryFailed?: boolean;
};

export type OpportunitySourcingPlan = {
  strategy: "RECOMMENDED_NOTIFICATIONS_FIRST" | "RETRY_FAILED_FIRST";
  steps: OpportunitySourceStep[];
};

const RECOMMENDED_NOTIFICATIONS_URL =
  "https://www.99freelas.com.br/project-notifications/view?limit=20";
const PROJECT_LIST_URL = "https://www.99freelas.com.br/projects?categoria=web-mobile-e-software";

export class OpportunitySourcingService {
  buildPlan(input: OpportunitySourcingPlanInput = {}): OpportunitySourcingPlan {
    if (input.retryFailed) {
      return {
        strategy: "RETRY_FAILED_FIRST",
        steps: [
          {
            action: "RETRY_FAILED_SWEEP",
            label: "Retomar falhas anteriores",
            description:
              "Antes de buscar novos projetos, o sistema revisa oportunidades que falharam em etapas anteriores do pipeline.",
            priority: 1,
          },
          ...this.buildPrimarySourcingSteps(input),
        ],
      };
    }

    return {
      strategy: "RECOMMENDED_NOTIFICATIONS_FIRST",
      steps: this.buildPrimarySourcingSteps(input),
    };
  }

  describeAction(action: OpportunityFetchSweepAction): OpportunitySourceStep {
    return this.buildPlan().steps.find((step) => step.action === action) ?? {
      action,
      label: "Varredura genérica",
      description: "Ação de sourcing ainda não descrita explicitamente.",
      priority: 99,
    };
  }

  private buildPrimarySourcingSteps(
    input: OpportunitySourcingPlanInput,
  ): OpportunitySourceStep[] {
    const notificationLimit = Math.max(1, input.notificationLimit ?? 20);
    const steps: OpportunitySourceStep[] = [
      {
        action: "PROCESS_RECOMMENDED_NOTIFICATIONS",
        label: "Ler notificações recomendadas",
        description:
          `Abrir as notificações de projetos recomendados para o freelancer, validar uma a uma e priorizar as oportunidades alinhadas ao perfil antes de qualquer caça ativa.`,
        priority: 1,
        targetUrl: `${RECOMMENDED_NOTIFICATIONS_URL.replace("limit=20", `limit=${notificationLimit}`)}`,
      },
    ];

    if (input.fallbackToProjectListing !== false) {
      steps.push({
        action: "HUNT_PROJECT_LIST",
        label: "Caça ativa na listagem pública",
        description:
          "Quando não houver novas notificações úteis, o sistema deve abrir /projects, percorrer a listagem e filtrar sequencialmente os títulos e descrições que combinam com o perfil.",
        priority: 2,
        targetUrl: PROJECT_LIST_URL,
      });
    }

    return steps;
  }
}
