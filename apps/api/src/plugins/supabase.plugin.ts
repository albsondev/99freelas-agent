import type { FastifyInstance } from "fastify";

import {
  AutomationRunRepository,
  OpportunityRepository,
  ProposalRepository,
  SettingsRepository,
  UserProfileRepository,
  createSupabaseAdminClient,
} from "@99freelas/integrations";

import type { ApiEnv } from "../env.js";

export async function registerSupabasePlugin(
  app: FastifyInstance,
  env: ApiEnv,
): Promise<void> {
  const client = createSupabaseAdminClient({
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  app.decorate("repositories", {
    automationRuns: new AutomationRunRepository(client),
    opportunities: new OpportunityRepository(client),
    proposals: new ProposalRepository(client),
    settings: new SettingsRepository(client),
    userProfiles: new UserProfileRepository(client),
  });
}
