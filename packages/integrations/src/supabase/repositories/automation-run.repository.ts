import type { AutomationRun } from "@99freelas/core";

import { assertSupabaseMany, assertSupabaseSingle, type DatabaseClient } from "../client.js";
import type { TableInsert, TableUpdate } from "../database.types.js";
import { mapAutomationRunRow } from "../mappers.js";

export class AutomationRunRepository {
  constructor(private readonly client: DatabaseClient) {}

  async create(payload: TableInsert<"automation_runs">): Promise<AutomationRun> {
    const { data, error } = await this.client
      .from("automation_runs")
      .insert(payload)
      .select("*")
      .single();

    return mapAutomationRunRow(
      assertSupabaseSingle(data, error, "Failed to create automation run"),
    );
  }

  async update(id: string, patch: TableUpdate<"automation_runs">): Promise<AutomationRun> {
    const { data, error } = await this.client
      .from("automation_runs")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    return mapAutomationRunRow(
      assertSupabaseSingle(data, error, "Failed to update automation run"),
    );
  }

  async listRecent(limit = 50): Promise<AutomationRun[]> {
    const { data, error } = await this.client
      .from("automation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);

    return assertSupabaseMany(data, error, "Failed to list automation runs").map(
      mapAutomationRunRow,
    );
  }
}

