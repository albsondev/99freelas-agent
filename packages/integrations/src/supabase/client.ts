import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";

import { loadAppEnv } from "@99freelas/config";

import type { Database } from "./database.types.js";

export type DatabaseClient = SupabaseClient<Database>;

export function createSupabaseAdminClient(
  source: NodeJS.ProcessEnv = process.env,
): DatabaseClient {
  const env = loadAppEnv(source);

  return createClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export function createSupabaseAnonClient(
  source: NodeJS.ProcessEnv = process.env,
): DatabaseClient {
  const env = loadAppEnv(source);

  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

export function assertSupabaseSingle<T>(
  data: T | null,
  error: PostgrestError | null,
  context: string,
): T {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }

  if (data === null) {
    throw new Error(`${context}: empty response`);
  }

  return data;
}

export function assertSupabaseMany<T>(
  data: T[] | null,
  error: PostgrestError | null,
  context: string,
): T[] {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }

  return data ?? [];
}

