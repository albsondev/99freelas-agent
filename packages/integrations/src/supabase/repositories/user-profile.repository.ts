import type { UserProfile } from "@99freelas/core";

import { assertSupabaseSingle, type DatabaseClient } from "../client.js";
import type { TableInsert, TableUpdate } from "../database.types.js";
import { mapUserProfileRow } from "../mappers.js";

export class UserProfileRepository {
  constructor(private readonly client: DatabaseClient) {}

  async getByUserId(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.client
      .from("user_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch user profile by user id: ${error.message}`);
    }

    return data ? mapUserProfileRow(data) : null;
  }

  async upsert(payload: TableInsert<"user_profiles">): Promise<UserProfile> {
    const { data, error } = await this.client
      .from("user_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("*")
      .single();

    return mapUserProfileRow(
      assertSupabaseSingle(data, error, "Failed to upsert user profile"),
    );
  }

  async update(id: string, patch: TableUpdate<"user_profiles">): Promise<UserProfile> {
    const { data, error } = await this.client
      .from("user_profiles")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    return mapUserProfileRow(
      assertSupabaseSingle(data, error, "Failed to update user profile"),
    );
  }
}

