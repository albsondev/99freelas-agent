import type { Opportunity, UserProfile } from "@99freelas/core";
import { compactWhitespace } from "@99freelas/core";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { proposalDraftSchema, type ProposalDraft } from "./proposal-draft.schema.js";
import {
  buildProposalSystemPrompt,
  buildProposalUserPrompt,
  PROPOSAL_PROMPT_VERSION,
} from "./proposal-prompt.js";

export type ProposalGenerationInput = {
  opportunity: Opportunity;
  amount: number;
  deadlineDays: number;
  pricingExplanation: string;
  deadlineExplanation: string;
  matchedSkills: string[];
  missingSkills: string[];
  decisionReasons: string[];
  riskFlags: string[];
  freelancerProfile?: UserProfile | null;
};

export type ProposalGenerationUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ProposalGenerationResult = ProposalDraft & {
  llmProvider: "openai";
  llmModel: string;
  llmPromptVersion: string;
  responseId?: string;
  usage?: ProposalGenerationUsage;
};

export type ProposalLlmProvider = {
  generate(input: ProposalGenerationInput): Promise<ProposalGenerationResult>;
};

type CreateProposalLlmProviderConfig = {
  provider: "openai";
  openAiApiKey: string;
  openAiModel: string;
  temperature: number;
  maxOutputTokens: number;
};

export function createProposalLlmProvider(
  config: CreateProposalLlmProviderConfig,
): ProposalLlmProvider {
  return new OpenAiProposalGenerator({
    apiKey: config.openAiApiKey,
    model: config.openAiModel,
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
  });
}

type OpenAiProposalGeneratorConfig = {
  apiKey: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
};

class OpenAiProposalGenerator implements ProposalLlmProvider {
  private readonly client: OpenAI;

  constructor(private readonly config: OpenAiProposalGeneratorConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  async generate(
    input: ProposalGenerationInput,
  ): Promise<ProposalGenerationResult> {
    const response = await this.client.responses.parse({
      model: this.config.model,
      temperature: this.config.temperature,
      max_output_tokens: this.config.maxOutputTokens,
      input: [
        {
          role: "system",
          content: buildProposalSystemPrompt(),
        },
        {
          role: "user",
          content: buildProposalUserPrompt(input),
        },
      ],
      text: {
        format: zodTextFormat(proposalDraftSchema, "proposal_draft"),
      },
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI did not return a structured proposal draft.");
    }

    const draft = proposalDraftSchema.parse(response.output_parsed);

    return {
      ...normalizeProposalDraft(draft),
      llmProvider: "openai",
      llmModel: this.config.model,
      llmPromptVersion: PROPOSAL_PROMPT_VERSION,
      responseId: response.id,
      usage: response.usage
        ? {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}

function normalizeProposalDraft(draft: ProposalDraft): ProposalDraft {
  return {
    technicalSummary: compactWhitespace(draft.technicalSummary),
    detailsText: draft.detailsText
      .split(/\n{2,}/)
      .map((paragraph) => compactWhitespace(paragraph))
      .filter(Boolean)
      .join("\n\n"),
    assumptions: normalizeStringList(draft.assumptions),
    questions: normalizeStringList(draft.questions),
    risks: normalizeStringList(draft.risks),
    qualityScore: draft.qualityScore,
  };
}

function normalizeStringList(items: string[]): string[] {
  return [...new Set(items.map((item) => compactWhitespace(item)).filter(Boolean))];
}
