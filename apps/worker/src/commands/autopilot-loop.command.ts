import {
  QueueNames,
  type OpportunityFetchSweepAction,
} from "@99freelas/core";
import {
  AutomationRunRepository,
  createLocalTemplateProposalProvider,
  createProposalLlmProvider,
  createSupabaseAdminClient,
  OpportunityRepository,
  ProposalRepository,
  SettingsRepository,
  UserProfileRepository,
  validate99FreelasSession,
  validate99FreelasSessionViaPython,
} from "@99freelas/integrations";

import type { WorkerEnv } from "../env.js";
import { createInlineOpportunityPipelineProducer } from "../processors/inline-opportunity-pipeline.js";
import {
  processOpportunityFetchJob,
  type SourcingStepReport,
} from "../processors/opportunity-fetch.processor.js";
import {
  executeProposalBatchFlow,
  type ProposalBatchExecutionResult,
} from "./proposal-submit.command.js";

type ContinuousAutopilotOptions = {
  batchSize: number;
  holdOpenMs?: number | undefined;
  maxCycles?: number | undefined;
  pollIntervalMs: number;
  stepDelayMs?: number | undefined;
};

type ContinuousAutopilotCycleReport = {
  cycleNumber: number;
  startedAt: string;
  finishedAt: string;
  sourcing: Array<{
    action: OpportunityFetchSweepAction;
    runId: string;
    report: SourcingStepReport | null;
  }>;
  batches: ProposalBatchExecutionResult[];
  submittedCount: number;
  duplicatedCount: number;
  blockedCount: number;
  sourcedCount: number;
  autoSubmitCount: number;
  reviewCount: number;
  rejectedCount: number;
};

type ContinuousAutopilotResult = {
  cyclesCompleted: number;
  stoppedBySignal: boolean;
  reports: ContinuousAutopilotCycleReport[];
};

export async function runContinuousAutopilot(
  env: WorkerEnv,
  options: ContinuousAutopilotOptions,
): Promise<ContinuousAutopilotResult> {
  await ensureVisibleSession(env);

  const client = createSupabaseAdminClient({
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const runs = new AutomationRunRepository(client);
  const opportunities = new OpportunityRepository(client);
  const proposals = new ProposalRepository(client);
  const settings = new SettingsRepository(client);
  const userProfiles = new UserProfileRepository(client);
  const llm =
    env.LLM_PROVIDER === "openai" && env.OPENAI_API_KEY
      ? createProposalLlmProvider({
          provider: "openai",
          openAiApiKey: env.OPENAI_API_KEY,
          openAiModel: env.OPENAI_MODEL,
          temperature: env.LLM_TEMPERATURE,
          maxOutputTokens: env.LLM_MAX_TOKENS,
        })
      : createLocalTemplateProposalProvider();

  const producer = createInlineOpportunityPipelineProducer({
    env,
    opportunities,
    proposals,
    runs,
    settings,
    userProfiles,
    llm,
  });

  let stopRequested = false;
  const reports: ContinuousAutopilotCycleReport[] = [];

  const requestStop = () => {
    stopRequested = true;
  };

  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  try {
    let cycleNumber = 0;

    while (!stopRequested) {
      cycleNumber += 1;
      const startedAt = new Date().toISOString();
      const sourcing: ContinuousAutopilotCycleReport["sourcing"] = [];

      console.log(`\n[Ciclo ${cycleNumber}] Iniciado em ${formatDateTime(startedAt)}.`);
      for (const action of [
        "PROCESS_RECOMMENDED_NOTIFICATIONS",
        "HUNT_PROJECT_LIST",
      ] satisfies OpportunityFetchSweepAction[]) {
        const run = await runs.create({
          type: QueueNames.OPPORTUNITY_FETCH,
          status: "QUEUED",
          metadata: {
            source: "worker.autopilot-loop",
            action,
            cycleNumber,
          },
        });

        console.log(`[Ciclo ${cycleNumber}] ${describeStepAction(action)}...`);

        const sourcingResult = await processOpportunityFetchJob(
          {
            runId: run.id,
            action,
          },
          {
            env,
            opportunities,
            proposals,
            runs,
            settings,
            userProfiles,
            llm,
            producer,
          },
        );
        const stepReport = sourcingResult?.steps.find((step) => step.action === action) ?? null;

        sourcing.push({
          action,
          runId: run.id,
          report: stepReport,
        });

        console.log(formatSourcingStepSummary(cycleNumber, action, stepReport));
      }

      const batches: ProposalBatchExecutionResult[] = [];

      while (!stopRequested) {
        const batch = await executeProposalBatchFlow({
          env,
          limit: Math.max(1, options.batchSize),
          executeLiveSubmit: true,
          confirmLiveSubmit: true,
          observeBrowser: true,
          stepDelayMs: options.stepDelayMs,
          holdOpenMs: options.holdOpenMs,
        });

        batches.push(batch);

        console.log(formatBatchSummary(cycleNumber, batch));

        if (batch.processed === 0) {
          break;
        }
      }

      const cycleReport = summarizeCycle(cycleNumber, startedAt, batches, sourcing);
      reports.push(cycleReport);

      console.log(formatCycleSummary(cycleReport));

      if (stopRequested) {
        break;
      }

      if (options.maxCycles && cycleNumber >= options.maxCycles) {
        break;
      }

      if (options.pollIntervalMs > 0) {
        await sleep(options.pollIntervalMs);
      }
    }
  } finally {
    process.removeListener("SIGINT", requestStop);
    process.removeListener("SIGTERM", requestStop);
  }

  return {
    cyclesCompleted: reports.length,
    stoppedBySignal: stopRequested,
    reports,
  };
}

async function ensureVisibleSession(env: WorkerEnv): Promise<void> {
  const session =
    env.BROWSER_AUTOMATION_RUNTIME === "python-playwright"
      ? await validate99FreelasSessionViaPython({
          browserName: env.PYTHON_BROWSER_NAME,
          headless: false,
          profileDir: env.PYTHON_BROWSER_PROFILE_DIR,
          pythonExecutable: env.PYTHON_EXECUTABLE,
          screenshotDir: env.BROWSER_SCREENSHOT_DIR,
          storageStatePath: env.PYTHON_BROWSER_STORAGE_STATE_PATH,
        })
      : await validate99FreelasSession({
          headless: false,
          sessionMode: env.BROWSER_SESSION_MODE,
          storageStatePath: env.BROWSER_STORAGE_STATE_PATH,
          userDataDir: env.BROWSER_USER_DATA_DIR,
          chromeProfileDirectory: env.BROWSER_CHROME_PROFILE_DIRECTORY,
        });

  if (!session.isAuthenticated) {
    throw new Error(
      "Sessao do 99Freelas nao esta autenticada. Rode auth:99freelas antes de iniciar o loop continuo.",
    );
  }
}

function summarizeCycle(
  cycleNumber: number,
  startedAt: string,
  batches: ProposalBatchExecutionResult[],
  sourcing: ContinuousAutopilotCycleReport["sourcing"],
): ContinuousAutopilotCycleReport {
  const results = batches.flatMap((batch) => batch.results);
  const sourcedCount = sourcing.reduce(
    (total, step) => total + (step.report?.importedCount ?? 0),
    0,
  );
  const autoSubmitCount = sourcing.reduce(
    (total, step) => total + (step.report?.autoSubmitCount ?? 0),
    0,
  );
  const reviewCount = sourcing.reduce(
    (total, step) => total + (step.report?.reviewCount ?? 0),
    0,
  );
  const rejectedCount = sourcing.reduce(
    (total, step) => total + (step.report?.rejectedCount ?? 0),
    0,
  );

  return {
    cycleNumber,
    startedAt,
    finishedAt: new Date().toISOString(),
    sourcing,
    batches,
    submittedCount: results.filter((result) => result.submissionStatus === "SUBMITTED").length,
    duplicatedCount: results.filter((result) => result.submissionStatus === "DUPLICATED").length,
    blockedCount: results.filter((result) => result.submissionStatus !== "SUBMITTED").length,
    sourcedCount,
    autoSubmitCount,
    reviewCount,
    rejectedCount,
  };
}

function formatSourcingStepSummary(
  cycleNumber: number,
  action: OpportunityFetchSweepAction,
  report: SourcingStepReport | null,
): string {
  if (!report) {
    return `[Ciclo ${cycleNumber}] ${describeStepAction(action)} concluida, mas sem metricas detalhadas.`;
  }

  const triagedCount = report.autoSubmitCount + report.reviewCount + report.rejectedCount;
  const approvalRate = triagedCount > 0
    ? `${Math.round((report.autoSubmitCount / triagedCount) * 100)}%`
    : "0%";
  const topReason = report.topDecisionReasons[0];
  const topRisk = report.topRiskFlags[0];
  const lines = [
    `[Ciclo ${cycleNumber}] ${describeStepAction(action)} concluida: ${report.pagesVisited} pagina(s), ${report.linksCollected} link(s), ${report.importedCount} novo(s), ${report.duplicatedCount} repetido(s).`,
    `[Ciclo ${cycleNumber}] Triagem: ${report.autoSubmitCount} apto(s) para envio, ${report.reviewCount} em revisao, ${report.rejectedCount} rejeitado(s). Aprovacao automatica: ${approvalRate}.`,
  ];

  if (topReason) {
    lines.push(
      `[Ciclo ${cycleNumber}] Motivo mais frequente: ${topReason.label} (${topReason.count}x).`,
    );
  }

  if (topRisk) {
    lines.push(
      `[Ciclo ${cycleNumber}] Alerta mais frequente: ${humanizeFlag(topRisk.label)} (${topRisk.count}x).`,
    );
  }

  return lines.join("\n");
}

function formatBatchSummary(cycleNumber: number, batch: ProposalBatchExecutionResult): string {
  const submitted = batch.results.filter((item) => item.liveSubmitted).length;
  const duplicated = batch.results.filter(
    (item) => item.submissionStatus === "DUPLICATED",
  ).length;
  const pending = batch.results.filter(
    (item) => item.submissionStatus !== "SUBMITTED" && item.submissionStatus !== "DUPLICATED",
  ).length;
  const topSkips = summarizeTextCounts(batch.skipped);
  const lines = [
    `[Ciclo ${cycleNumber}] Lote de envio: ${submitted} enviada(s), ${duplicated} duplicada(s), ${pending} bloqueada(s)/pendente(s), ${batch.processed}/${batch.requested} processada(s).`,
  ];

  if (topSkips.length > 0) {
    lines.push(`[Ciclo ${cycleNumber}] Principais pulos: ${topSkips.join(" | ")}.`);
  }

  return lines.join("\n");
}

function formatCycleSummary(report: ContinuousAutopilotCycleReport): string {
  return [
    `\n[Ciclo ${report.cycleNumber}] Resumo final`,
    `[Ciclo ${report.cycleNumber}] Novos projetos coletados: ${report.sourcedCount}.`,
    `[Ciclo ${report.cycleNumber}] Fila formada: ${report.autoSubmitCount} apto(s), ${report.reviewCount} em revisao, ${report.rejectedCount} rejeitado(s).`,
    `[Ciclo ${report.cycleNumber}] Envios: ${report.submittedCount} proposta(s) enviada(s), ${report.duplicatedCount} duplicada(s), ${report.blockedCount} bloqueada(s)/pendente(s).`,
    `[Ciclo ${report.cycleNumber}] Encerrado em ${formatDateTime(report.finishedAt)}.`,
  ].join("\n");
}

function describeStepAction(action: OpportunityFetchSweepAction): string {
  return action === "PROCESS_RECOMMENDED_NOTIFICATIONS"
    ? "Leitura das notificacoes recomendadas"
    : "Varredura da lista publica de projetos";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

function summarizeTextCounts(entries: string[], limit = 3): string[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const normalized = entry.includes(": ") ? entry.split(": ").slice(1).join(": ") : entry;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => `${label} (${count}x)`);
}

function humanizeFlag(flag: string): string {
  const dictionary: Record<string, string> = {
    CLOUD_INFRA_SCOPE: "escopo de cloud/infra",
    EXTERNAL_CONTACT_REQUEST: "pedido de contato fora da plataforma",
    FULL_ECOMMERCE_SCOPE: "e-commerce completo",
    HIGH_COMPETITION: "concorrencia alta",
    IMPOSSIBLE_DEADLINE: "prazo agressivo demais",
    JAVA_SCOPE: "stack Java",
    LOW_AVERAGE_BID: "media de propostas baixa",
    LOW_BUDGET: "orcamento baixo",
    NATIVE_APP_SCOPE: "app mobile/nativo",
    OFF_PLATFORM_PAYMENT_REQUEST: "pagamento por fora",
    PURE_DESIGN_SCOPE: "escopo mais de design",
    REACT_NATIVE_REVIEW_ONLY: "React Native apenas para revisao manual",
    UNCLEAR_SCOPE: "escopo pouco claro",
  };

  return dictionary[flag] ?? flag;
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, delayMs);
  });
}
