import { z } from "zod";

export const proposalDraftSchema = z.object({
  technicalSummary: z.string().min(40).max(320),
  detailsText: z.string().min(160).max(1200),
  assumptions: z.array(z.string().min(8).max(180)).max(4),
  questions: z.array(z.string().min(8).max(180)).max(4),
  risks: z.array(z.string().min(8).max(180)).max(4),
  qualityScore: z.number().int().min(0).max(100),
});

export type ProposalDraft = z.infer<typeof proposalDraftSchema>;
