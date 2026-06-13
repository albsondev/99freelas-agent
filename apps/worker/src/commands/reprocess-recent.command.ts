import { QueueNames, type OpportunitySource } from "@99freelas/core";
import {
  AutomationRunRepository,
  OpportunityRepository,
  ProposalRepository,
  SettingsRepository,
  UserProfileRepository,
} from "@99freelas/integrations";

import type { WorkerEnv } from "../env.js";
import { createInlineOpportunityPipelineProducer } from "../processors/inline-opportunity-pipeline.js";
import { processOpportunityFetchJob } from "../processors/opportunity-fetch.processor.js";
import type { ProposalLlmProvider } from "@99freelas/integrations";

type ReprocessRecentOptions = {
  hours: number;
  limit: number;
  sources?: OpportunitySource[] | undefined;
};

type ReprocessRecentResult = {
  scanned: number;
  eligible: number;
  skippedSubmitted: number;
  skippedDuplicated: number;
  resetCount: number;
  reprocessedCount: number;
  opportunityIds: string[];
};

export async function reprocessRecentOpportunities(
  env: WorkerEnv,
  deps: {
    opportunities: OpportunityRepository;
    proposals: ProposalRepository;
    runs: AutomationRunRepository;
    settings: SettingsRepository;
    userProfiles: UserProfileRepository;
    llm: ProposalLlmProvider;
  },
  options: ReprocessRecentOptions,
): Promise<ReprocessRecentResult> {
  const sources = options.sources ?? [
    "RECOMMENDED_NOTIFICATION",
    "PROJECT_LISTING",
    "MANUAL_URL",
  ];
  const recentOpportunities = await deps.opportunities.listRecent(Math.max(1, options.limit));
  const cutoff = Date.now() - options.hours * 60 * 60 * 1000;
  const eligible = recentOpportunities.filter((opportunity) => {
    const createdAt = new Date(opportunity.createdAt).getTime();
    return Number.isFinite(createdAt) && createdAt >= cutoff && sources.includes(opportunity.source);
  });

  console.log(
    `[Reset] ${recentOpportunities.length} oportunidade(s) recentes lidas. ` +
      `${eligible.length} elegivel(is) para reset/reprocessamento.`,
  );

  const producer = createInlineOpportunityPipelineProducer({
    env,
    opportunities: deps.opportunities,
    proposals: deps.proposals,
    runs: deps.runs,
    settings: deps.settings,
    userProfiles: deps.userProfiles,
    llm: deps.llm,
  });

  let skippedSubmitted = 0;
  let skippedDuplicated = 0;
  let resetCount = 0;
  let reprocessedCount = 0;
  const opportunityIds: string[] = [];
  const total = eligible.length;

  for (const [index, opportunity] of eligible.entries()) {
    const proposal = await deps.proposals.getByOpportunityId(opportunity.id);
    const progress = `${index + 1}/${total}`;

    if (opportunity.status === "SUBMITTED" || proposal?.submissionStatus === "SUBMITTED") {
      skippedSubmitted += 1;
      console.log(
        `[Reset ${progress}] Preservado por ja estar enviado: ${opportunity.title ?? opportunity.url}`,
      );
      continue;
    }

    if (proposal?.submissionStatus === "DUPLICATED") {
      skippedDuplicated += 1;
      console.log(
        `[Reset ${progress}] Preservado por duplicidade encerrada: ${opportunity.title ?? opportunity.url}`,
      );
      continue;
    }

    console.log(`[Reset ${progress}] Reprocessando: ${opportunity.title ?? opportunity.url}`);

    await deps.opportunities.update(opportunity.id, {
      status: "NEW",
      decision: null,
      decision_reasons: [],
      risk_flags: [],
      score: null,
      matched_skills: [],
      missing_skills: [],
      last_seen_at: new Date().toISOString(),
    });

    if (proposal) {
      await deps.proposals.update(proposal.id, {
        submission_status: "NOT_SUBMITTED",
        submission_error: null,
        submitted_at: null,
        before_screenshot_path: null,
        after_screenshot_path: null,
      });
    }

    resetCount += 1;
    opportunityIds.push(opportunity.id);

    const run = await deps.runs.create({
      type: QueueNames.OPPORTUNITY_FETCH,
      status: "QUEUED",
      opportunity_id: opportunity.id,
      metadata: {
        source: "worker.reprocess-recent",
        reason: "REPROCESS",
      },
    });

    await processOpportunityFetchJob(
      {
        runId: run.id,
        opportunityId: opportunity.id,
        reason: "REPROCESS",
      },
      {
        env,
        opportunities: deps.opportunities,
        proposals: deps.proposals,
        runs: deps.runs,
        settings: deps.settings,
        userProfiles: deps.userProfiles,
        llm: deps.llm,
        producer,
      },
    );

    reprocessedCount += 1;
  }

  return {
    scanned: recentOpportunities.length,
    eligible: eligible.length,
    skippedSubmitted,
    skippedDuplicated,
    resetCount,
    reprocessedCount,
    opportunityIds,
  };
}
