import type { DailyCounter } from "@99freelas/core";

import { assertSupabaseMany, assertSupabaseSingle, type DatabaseClient } from "../client.js";
import type { TableInsert, TableUpdate } from "../database.types.js";
import { mapDailyCounterRow } from "../mappers.js";

export class DailyCounterRepository {
  constructor(private readonly client: DatabaseClient) {}

  async getByNameAndDate(
    name: string,
    counterDate: string,
  ): Promise<DailyCounter | null> {
    const { data, error } = await this.client
      .from("daily_counters")
      .select("*")
      .eq("name", name)
      .eq("counter_date", counterDate)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch daily counter: ${error.message}`);
    }

    return data ? mapDailyCounterRow(data) : null;
  }

  async listRecent(limit = 50): Promise<DailyCounter[]> {
    const { data, error } = await this.client
      .from("daily_counters")
      .select("*")
      .order("counter_date", { ascending: false })
      .limit(limit);

    return assertSupabaseMany(data, error, "Failed to list daily counters").map(
      mapDailyCounterRow,
    );
  }

  async upsert(payload: TableInsert<"daily_counters">): Promise<DailyCounter> {
    const { data, error } = await this.client
      .from("daily_counters")
      .upsert(payload, { onConflict: "counter_date,name" })
      .select("*")
      .single();

    return mapDailyCounterRow(
      assertSupabaseSingle(data, error, "Failed to upsert daily counter"),
    );
  }

  async update(id: string, patch: TableUpdate<"daily_counters">): Promise<DailyCounter> {
    const { data, error } = await this.client
      .from("daily_counters")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    return mapDailyCounterRow(
      assertSupabaseSingle(data, error, "Failed to update daily counter"),
    );
  }
}

