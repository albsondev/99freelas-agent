import { loadAppEnv, type AppEnv } from "@99freelas/config";

export type ApiEnv = Pick<
  AppEnv,
  | "NODE_ENV"
  | "API_PORT"
  | "API_BASE_URL"
  | "SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "SUPABASE_STORAGE_BUCKET"
  | "REDIS_URL"
>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const env = loadAppEnv(source);

  return {
    NODE_ENV: env.NODE_ENV,
    API_PORT: env.API_PORT,
    API_BASE_URL: env.API_BASE_URL,
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_BUCKET: env.SUPABASE_STORAGE_BUCKET,
    REDIS_URL: env.REDIS_URL,
  };
}
