import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true" || normalized === "1") {
      return true;
    }

    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return value;
}, z.boolean());

const nonEmptyString = z.string().min(1);

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_URL: nonEmptyString,
  SUPABASE_ANON_KEY: nonEmptyString,
  SUPABASE_SERVICE_ROLE_KEY: nonEmptyString,
  SUPABASE_STORAGE_BUCKET: nonEmptyString.default("proposal-audit"),
  API_PORT: z.coerce.number().int().positive().default(3333),
  API_BASE_URL: nonEmptyString.default("http://localhost:3333"),
  NEXT_PUBLIC_SUPABASE_URL: nonEmptyString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmptyString,
  NEXT_PUBLIC_API_BASE_URL: nonEmptyString.default("http://localhost:3333"),
  REDIS_URL: nonEmptyString.default("redis://localhost:6379"),
  IMAP_ENABLED: booleanFromEnv.default(true),
  IMAP_HOST: nonEmptyString.default("imap.gmail.com"),
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  IMAP_SECURE: booleanFromEnv.default(true),
  IMAP_USER: z.string().default(""),
  IMAP_PASSWORD: z.string().default(""),
  EMAIL_FROM_FILTER: z.string().default("99freelas"),
  EMAIL_SUBJECT_FILTER: z.string().default(""),
  LLM_PROVIDER: z.enum(["openai"]).default("openai"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: nonEmptyString.default("gpt-4.1-mini"),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.35),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(1200),
  BROWSER_HEADLESS: booleanFromEnv.default(false),
  BROWSER_SESSION_MODE: z
    .enum(["auto", "storage-state", "dedicated-profile", "shared-profile"])
    .default("dedicated-profile"),
  BROWSER_STORAGE_STATE_PATH: nonEmptyString.default("./.auth/99freelas.storage-state.json"),
  BROWSER_USER_DATA_DIR: nonEmptyString.default("./.auth/99freelas.automation-profile"),
  BROWSER_CHROME_PROFILE_DIRECTORY: z.string().default("Default"),
  BROWSER_SCREENSHOT_DIR: nonEmptyString.default("./.audit/screenshots"),
  AUTOMATION_MODE: z.enum(["DRY_RUN", "REVIEW_REQUIRED", "AUTOPILOT"]).default("REVIEW_REQUIRED"),
  AUTOPILOT_MIN_SCORE: z.coerce.number().int().min(0).max(100).default(85),
  REVIEW_MIN_SCORE: z.coerce.number().int().min(0).max(100).default(60),
  MAX_AUTOPILOT_SUBMISSIONS_PER_DAY: z.coerce.number().int().nonnegative().default(15),
  MAX_AUTOPILOT_SUBMISSIONS_PER_HOUR: z.coerce.number().int().nonnegative().default(4),
  MAX_FAILED_SUBMISSIONS_PER_DAY: z.coerce.number().int().nonnegative().default(10),
  MAX_PROJECTS_FETCHED_PER_HOUR: z.coerce.number().int().nonnegative().default(30),
  PRICE_DISCOUNT_FACTOR: z.coerce.number().min(0).default(0.5),
  MIN_PROPOSAL_AMOUNT_BRL: z.coerce.number().nonnegative().default(150),
  MIN_DAILY_RATE_BRL: z.coerce.number().nonnegative().default(120),
  DEFAULT_HOURLY_RATE_BRL: z.coerce.number().nonnegative().default(50),
  MIN_ACCEPTABLE_AVERAGE_BID_BRL: z.coerce.number().nonnegative().default(200),
  DEADLINE_REDUCTION_FACTOR: z.coerce.number().min(0).default(0.75),
  MIN_DEADLINE_DAYS: z.coerce.number().int().positive().default(2),
  MAX_DEADLINE_DAYS: z.coerce.number().int().positive().default(45),
  AUTO_SUBMIT_ONLY_WITH_CLEAR_SCOPE: booleanFromEnv.default(true),
  AUTO_SUBMIT_ONLY_WITH_AVERAGE_BID: booleanFromEnv.default(false),
  REJECT_EXTERNAL_CONTACT_REQUESTS: booleanFromEnv.default(true),
  REJECT_LOW_BUDGET_PROJECTS: booleanFromEnv.default(true),
  REJECT_UNCLEAR_SCOPE_WHEN_AUTOPILOT: booleanFromEnv.default(true),
  SAVE_SCREENSHOT_BEFORE_SUBMIT: booleanFromEnv.default(true),
  SAVE_SCREENSHOT_AFTER_SUBMIT: booleanFromEnv.default(true),
  SAVE_HTML_SNAPSHOT: booleanFromEnv.default(false),
  ENABLE_REAL_99FREELAS_SUBMISSION: booleanFromEnv.default(false),
  MIN_REAL_SUBMISSION_DETAILS_LENGTH: z.coerce.number().int().positive().default(140),
  NOTIFICATION_PROVIDER: z.enum(["console", "telegram"]).default("console"),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_CHAT_ID: z.string().default(""),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function loadAppEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return appEnvSchema.parse(source);
}
