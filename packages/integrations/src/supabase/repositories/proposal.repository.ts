import type { Proposal } from "@99freelas/core";

import { assertSupabaseMany, assertSupabaseSingle, type DatabaseClient } from "../client.js";
import type { TableInsert, TableUpdate } from "../database.types.js";
import { mapProposalRow } from "../mappers.js";

export class ProposalRepository {
  constructor(private readonly client: DatabaseClient) {}

  async create(payload: TableInsert<"proposals">): Promise<Proposal> {
    const { data, error } = await this.client
      .from("proposals")
      .insert(payload)
      .select("*")
      .single();

    return mapProposalRow(
      assertSupabaseSingle(data, error, "Failed to create proposal"),
    );
  }

  async getById(id: string): Promise<Proposal | null> {
    const { data, error } = await this.client
      .from("proposals")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch proposal by id: ${error.message}`);
    }

    return data ? mapProposalRow(data) : null;
  }

  async getByOpportunityId(opportunityId: string): Promise<Proposal | null> {
    const { data, error } = await this.client
      .from("proposals")
      .select("*")
      .eq("opportunity_id", opportunityId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch proposal by opportunity id: ${error.message}`);
    }

    return data ? mapProposalRow(data) : null;
  }

  async listRecent(limit = 50): Promise<Proposal[]> {
    const { data, error } = await this.client
      .from("proposals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    return assertSupabaseMany(data, error, "Failed to list proposals").map(
      mapProposalRow,
    );
  }

  async update(id: string, patch: TableUpdate<"proposals">): Promise<Proposal> {
    const { data, error } = await this.client
      .from("proposals")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    return mapProposalRow(
      assertSupabaseSingle(data, error, "Failed to update proposal"),
    );
  }
}

