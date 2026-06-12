import {
  QueueNames,
  extractBudgetRangeBRL,
  extractSkills,
  normalizeCurrencyBRL,
  type JsonValue,
  type OpportunityParseJobPayload,
} from "@99freelas/core";
import {
  scrape99FreelasProjectPageViaPython,
  type AutomationRunRepository,
  type OpportunityRepository,
} from "@99freelas/integrations";
import type { WorkerEnv } from "../env.js";
import type { ProcessorProducer } from "./processor-producer.js";

type ProcessOpportunityParseContext = {
  env: WorkerEnv;
  opportunities: OpportunityRepository;
  runs: AutomationRunRepository;
  producer: ProcessorProducer;
};

function asJsonObject(value: JsonValue): Record<string, JsonValue> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, JsonValue>;
  }

  return {};
}

function parseInteger(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function processOpportunityParseJob(
  payload: OpportunityParseJobPayload,
  context: ProcessOpportunityParseContext,
): Promise<void> {
  await context.runs.update(payload.runId, {
    status: "PROCESSING",
  });

  const opportunity = await context.opportunities.getById(payload.opportunityId);

  if (!opportunity) {
    await context.runs.update(payload.runId, {
      status: "FAILED",
      finished_at: new Date().toISOString(),
      error_code: "OPPORTUNITY_NOT_FOUND",
      error_message: `Opportunity ${payload.opportunityId} was not found`,
    });
    return;
  }

  const fallbackTitle =
    opportunity.title ??
    `Projeto ${opportunity.externalId ?? opportunity.id.slice(0, 8)}`;
  const fallbackDescription =
    opportunity.description ??
    "Descricao ainda nao extraida do HTML real. Pipeline em modo mockado na Fase 3.";

  let scrapedProject:
    | Awaited<ReturnType<typeof scrape99FreelasProjectPageViaPython>>
    | null = null;
  let parserName = "python-project-page-v1";
  let parseWarning: string | null = null;

  try {
    scrapedProject = await scrape99FreelasProjectPageViaPython({
      browserName: context.env.PYTHON_BROWSER_NAME,
      headless: true,
      profileDir: context.env.PYTHON_BROWSER_PROFILE_DIR,
      projectUrl: opportunity.url,
      pythonExecutable: context.env.PYTHON_EXECUTABLE,
      screenshotDir: context.env.BROWSER_SCREENSHOT_DIR,
      storageStatePath: context.env.PYTHON_BROWSER_STORAGE_STATE_PATH,
      timeoutMs: 45_000,
    });
  } catch (error) {
    parserName = "mock-fallback-phase-3";
    parseWarning =
      error instanceof Error ? error.message : "Unknown project page scraping error";
  }

  const parsedTitle = scrapedProject?.title?.trim() || fallbackTitle;
  const parsedDescription =
    scrapedProject?.description?.trim() || fallbackDescription;
  const parsedCategory = [
    scrapedProject?.category?.trim() ?? null,
    scrapedProject?.subcategory?.trim() ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" / ");
  const budgetRange = extractBudgetRangeBRL(scrapedProject?.budgetText ?? "");
  const detectedSkills = extractSkills(
    [parsedTitle, parsedDescription, parsedCategory || (opportunity.category ?? "")].join(" "),
  );
  const mergedSkills = [
    ...new Set([
      ...opportunity.skills,
      ...(scrapedProject?.skills ?? []),
      ...detectedSkills,
    ]),
  ];

  await context.opportunities.update(payload.opportunityId, {
    title: parsedTitle,
    description: parsedDescription,
    category: parsedCategory || opportunity.category || null,
    budget_text: scrapedProject?.budgetText ?? opportunity.budgetText ?? null,
    budget_min: budgetRange.min ?? opportunity.budgetMin ?? null,
    budget_max: budgetRange.max ?? opportunity.budgetMax ?? null,
    proposal_count:
      parseInteger(scrapedProject?.proposalCountText) ?? opportunity.proposalCount ?? null,
    interested_count:
      parseInteger(scrapedProject?.interestedCountText) ??
      opportunity.interestedCount ??
      null,
    skills: mergedSkills,
    status: "PARSED",
    raw_payload: {
      ...asJsonObject(opportunity.rawPayload),
      parse: {
        parsedAt: new Date().toISOString(),
        parser: parserName,
        detectedSkills,
        ...(parseWarning ? { parseWarning } : {}),
        ...(scrapedProject
          ? {
              publicProject: scrapedProject,
              minimumOfferAmount: normalizeCurrencyBRL(
                scrapedProject.minimumOfferText ?? "",
              ),
            }
          : {}),
      },
    },
  });

  await context.runs.update(payload.runId, {
    status: "COMPLETED",
    finished_at: new Date().toISOString(),
    metadata: {
      opportunityId: payload.opportunityId,
      result: "PARSED",
    },
  });

  const scoreRun = await context.runs.create({
    type: QueueNames.OPPORTUNITY_SCORE,
    status: "QUEUED",
    opportunity_id: payload.opportunityId,
    metadata: {
      source: "worker.parse-processor",
      parentRunId: payload.runId,
    },
  });

  const scoreJob = await context.producer.enqueue(QueueNames.OPPORTUNITY_SCORE, {
    runId: scoreRun.id,
    opportunityId: payload.opportunityId,
  });

  await context.runs.update(scoreRun.id, {
    job_id: scoreJob.jobId,
  });
}
