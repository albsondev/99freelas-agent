import type { SettingRecord } from "@99freelas/core";

import { assertSupabaseMany, assertSupabaseSingle, type DatabaseClient } from "../client.js";
import type { TableInsert, TableUpdate } from "../database.types.js";
import { mapSettingRow } from "../mappers.js";

export class SettingsRepository {
  constructor(private readonly client: DatabaseClient) {}

  async getByKey(key: string): Promise<SettingRecord | null> {
    const { data, error } = await this.client
      .from("settings")
      .select("*")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch setting by key: ${error.message}`);
    }

    return data ? mapSettingRow(data) : null;
  }

  async listAll(): Promise<SettingRecord[]> {
    const { data, error } = await this.client.from("settings").select("*").order("key");

    return assertSupabaseMany(data, error, "Failed to list settings").map(
      mapSettingRow,
    );
  }

  async upsert(payload: TableInsert<"settings">): Promise<SettingRecord> {
    const { data, error } = await this.client
      .from("settings")
      .upsert(payload, { onConflict: "key" })
      .select("*")
      .single();

    return mapSettingRow(
      assertSupabaseSingle(data, error, "Failed to upsert setting"),
    );
  }

  async update(id: string, patch: TableUpdate<"settings">): Promise<SettingRecord> {
    const { data, error } = await this.client
      .from("settings")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    return mapSettingRow(
      assertSupabaseSingle(data, error, "Failed to update setting"),
    );
  }
}

