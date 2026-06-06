import type { Opportunity } from "@99freelas/core";

import { assertSupabaseMany, assertSupabaseSingle, type DatabaseClient } from "../client.js";
import type { TableInsert, TableUpdate } from "../database.types.js";
import { mapOpportunityRow } from "../mappers.js";

export class OpportunityRepository {
  constructor(private readonly client: DatabaseClient) {}

  async create(payload: TableInsert<"opportunities">): Promise<Opportunity> {
    const { data, error } = await this.client
      .from("opportunities")
      .insert(payload)
      .select("*")
      .single();

    return mapOpportunityRow(
      assertSupabaseSingle(data, error, "Failed to create opportunity"),
    );
  }

  async getById(id: string): Promise<Opportunity | null> {
    const { data, error } = await this.client
      .from("opportunities")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch opportunity by id: ${error.message}`);
    }

    return data ? mapOpportunityRow(data) : null;
  }

  async findByCanonicalUrl(canonicalUrl: string): Promise<Opportunity | null> {
    const { data, error } = await this.client
      .from("opportunities")
      .select("*")
      .eq("canonical_url", canonicalUrl)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch opportunity by canonical url: ${error.message}`);
    }

    return data ? mapOpportunityRow(data) : null;
  }

  async listRecent(limit = 50): Promise<Opportunity[]> {
    const { data, error } = await this.client
      .from("opportunities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    return assertSupabaseMany(data, error, "Failed to list opportunities").map(
      mapOpportunityRow,
    );
  }

  async update(id: string, patch: TableUpdate<"opportunities">): Promise<Opportunity> {
    const { data, error } = await this.client
      .from("opportunities")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    return mapOpportunityRow(
      assertSupabaseSingle(data, error, "Failed to update opportunity"),
    );
  }
}

