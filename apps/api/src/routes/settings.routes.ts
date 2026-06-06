import type { FastifyInstance } from "fastify";
import { z } from "zod";

const profileSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1),
  headline: z.string().optional(),
  seniority: z.string().default("fullstack"),
  mainSkills: z.array(z.string()).default([]),
  secondarySkills: z.array(z.string()).default([]),
  preferredProjectTypes: z.array(z.string()).default([]),
  blockedProjectTypes: z.array(z.string()).default([]),
  minimumAmountBrl: z.number().nonnegative().default(150),
  minimumDailyRateBrl: z.number().nonnegative().default(120),
  defaultHourlyRateBrl: z.number().nonnegative().default(50),
  proposalTone: z.string().default("professional_direct"),
  portfolioSummary: z.string().optional(),
});

const automationSettingsSchema = z.object({
  mode: z.enum(["DRY_RUN", "REVIEW_REQUIRED", "AUTOPILOT"]),
  autopilotMinScore: z.number().int().min(0).max(100),
  reviewMinScore: z.number().int().min(0).max(100),
  maxAutopilotSubmissionsPerDay: z.number().int().nonnegative(),
  maxAutopilotSubmissionsPerHour: z.number().int().nonnegative(),
});

export async function registerSettingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/settings/profile", async (request, reply) => {
    const userId = z
      .string()
      .uuid()
      .safeParse((request.query as Record<string, unknown> | undefined)?.userId);

    if (!userId.success) {
      return reply.code(400).send({
        message: "Query param userId is required",
      });
    }

    const profile = await app.repositories.userProfiles.getByUserId(userId.data);

    if (!profile) {
      return reply.code(404).send({
        message: "Profile not found",
      });
    }

    return {
      item: profile,
    };
  });

  app.put("/settings/profile", async (request) => {
    const profile = profileSchema.parse(request.body);

    const item = await app.repositories.userProfiles.upsert({
      user_id: profile.userId,
      display_name: profile.displayName,
      headline: profile.headline ?? null,
      seniority: profile.seniority,
      main_skills: profile.mainSkills,
      secondary_skills: profile.secondarySkills,
      preferred_project_types: profile.preferredProjectTypes,
      blocked_project_types: profile.blockedProjectTypes,
      minimum_amount_brl: profile.minimumAmountBrl,
      minimum_daily_rate_brl: profile.minimumDailyRateBrl,
      default_hourly_rate_brl: profile.defaultHourlyRateBrl,
      proposal_tone: profile.proposalTone,
      portfolio_summary: profile.portfolioSummary ?? null,
    });

    return {
      item,
    };
  });

  app.get("/settings/automation", async (request, reply) => {
    const setting = await app.repositories.settings.getByKey("automation.defaults");

    if (!setting) {
      return reply.code(404).send({
        message: "Automation settings not found",
      });
    }

    return {
      item: setting,
    };
  });

  app.put("/settings/automation", async (request) => {
    const value = automationSettingsSchema.parse(request.body);
    const item = await app.repositories.settings.upsert({
      key: "automation.defaults",
      value,
      description: "Configuracao principal do modo de automacao.",
    });

    return {
      item,
    };
  });
}
