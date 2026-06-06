import { loadAppEnv, type AppEnv } from "@99freelas/config";

export type WorkerEnv = Pick<
  AppEnv,
  | "NODE_ENV"
  | "AUTOMATION_MODE"
  | "SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "SUPABASE_STORAGE_BUCKET"
  | "REDIS_URL"
>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const env = loadAppEnv(source);

  return {
    NODE_ENV: env.NODE_ENV,
    AUTOMATION_MODE: env.AUTOMATION_MODE,
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_BUCKET: env.SUPABASE_STORAGE_BUCKET,
    REDIS_URL: env.REDIS_URL,
  };
}
