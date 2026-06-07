import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";

import { loadAppEnv } from "@99freelas/config";

import type { Database } from "./database.types.js";

export type DatabaseClient = SupabaseClient<Database>;
type SupabaseClientOptions = {
  supabaseUrl: string;
  supabaseKey: string;
};

function isSupabaseClientOptions(
  input: SupabaseClientOptions | NodeJS.ProcessEnv | undefined,
): input is SupabaseClientOptions {
  return Boolean(
    input &&
      typeof input === "object" &&
      "supabaseUrl" in input &&
      "supabaseKey" in input,
  );
}

function resolveClientOptions(
  input?: SupabaseClientOptions | NodeJS.ProcessEnv,
  keyName: "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_ANON_KEY" = "SUPABASE_SERVICE_ROLE_KEY",
): SupabaseClientOptions {
  if (isSupabaseClientOptions(input)) {
    return input;
  }

  const env = loadAppEnv(input ?? process.env);

  return {
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env[keyName],
  };
}

export function createSupabaseAdminClient(
  input?: SupabaseClientOptions | NodeJS.ProcessEnv,
): DatabaseClient {
  const options = resolveClientOptions(input, "SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(
    options.supabaseUrl,
    options.supabaseKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export function createSupabaseAnonClient(
  input?: SupabaseClientOptions | NodeJS.ProcessEnv,
): DatabaseClient {
  const options = resolveClientOptions(input, "SUPABASE_ANON_KEY");

  return createClient<Database>(options.supabaseUrl, options.supabaseKey);
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
