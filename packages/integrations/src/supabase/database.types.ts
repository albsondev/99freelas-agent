export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      automation_runs: {
        Row: {
          created_at: string;
          duration_ms: number | null;
          error_code: string | null;
          error_message: string | null;
          finished_at: string | null;
          id: string;
          job_id: string | null;
          metadata: Json;
          opportunity_id: string | null;
          proposal_id: string | null;
          started_at: string;
          status: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          duration_ms?: number | null;
          error_code?: string | null;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          job_id?: string | null;
          metadata?: Json;
          opportunity_id?: string | null;
          proposal_id?: string | null;
          started_at?: string;
          status: string;
          type: string;
        };
        Update: {
          created_at?: string;
          duration_ms?: number | null;
          error_code?: string | null;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          job_id?: string | null;
          metadata?: Json;
          opportunity_id?: string | null;
          proposal_id?: string | null;
          started_at?: string;
          status?: string;
          type?: string;
        };
        Relationships: [];
      };
      daily_counters: {
        Row: {
          counter_date: string;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          value: number;
        };
        Insert: {
          counter_date: string;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
          value?: number;
        };
        Update: {
          counter_date?: string;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          value?: number;
        };
        Relationships: [];
      };
      opportunities: {
        Row: {
          average_bid_amount: number | null;
          average_deadline_days: number | null;
          budget_max: number | null;
          budget_min: number | null;
          budget_text: string | null;
          canonical_url: string | null;
          category: string | null;
          client_history_text: string | null;
          client_name: string | null;
          client_rating: number | null;
          created_at: string;
          decision: Database["public"]["Enums"]["opportunity_decision"] | null;
          decision_reasons: string[];
          description: string | null;
          external_id: string | null;
          first_seen_at: string;
          id: string;
          interested_count: number | null;
          last_seen_at: string;
          matched_skills: string[];
          missing_skills: string[];
          proposal_count: number | null;
          raw_payload: Json;
          risk_flags: string[];
          score: number | null;
          skills: string[];
          source: string;
          source_message_id: string | null;
          status: Database["public"]["Enums"]["opportunity_status"];
          title: string | null;
          updated_at: string;
          url: string;
        };
        Insert: {
          average_bid_amount?: number | null;
          average_deadline_days?: number | null;
          budget_max?: number | null;
          budget_min?: number | null;
          budget_text?: string | null;
          canonical_url?: string | null;
          category?: string | null;
          client_history_text?: string | null;
          client_name?: string | null;
          client_rating?: number | null;
          created_at?: string;
          decision?: Database["public"]["Enums"]["opportunity_decision"] | null;
          decision_reasons?: string[];
          description?: string | null;
          external_id?: string | null;
          first_seen_at?: string;
          id?: string;
          interested_count?: number | null;
          last_seen_at?: string;
          matched_skills?: string[];
          missing_skills?: string[];
          proposal_count?: number | null;
          raw_payload?: Json;
          risk_flags?: string[];
          score?: number | null;
          skills?: string[];
          source: string;
          source_message_id?: string | null;
          status?: Database["public"]["Enums"]["opportunity_status"];
          title?: string | null;
          updated_at?: string;
          url: string;
        };
        Update: {
          average_bid_amount?: number | null;
          average_deadline_days?: number | null;
          budget_max?: number | null;
          budget_min?: number | null;
          budget_text?: string | null;
          canonical_url?: string | null;
          category?: string | null;
          client_history_text?: string | null;
          client_name?: string | null;
          client_rating?: number | null;
          created_at?: string;
          decision?: Database["public"]["Enums"]["opportunity_decision"] | null;
          decision_reasons?: string[];
          description?: string | null;
          external_id?: string | null;
          first_seen_at?: string;
          id?: string;
          interested_count?: number | null;
          last_seen_at?: string;
          matched_skills?: string[];
          missing_skills?: string[];
          proposal_count?: number | null;
          raw_payload?: Json;
          risk_flags?: string[];
          score?: number | null;
          skills?: string[];
          source?: string;
          source_message_id?: string | null;
          status?: Database["public"]["Enums"]["opportunity_status"];
          title?: string | null;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      proposals: {
        Row: {
          after_screenshot_path: string | null;
          amount: number;
          assumptions: string[];
          before_screenshot_path: string | null;
          compliance_flags: string[];
          compliance_status: Database["public"]["Enums"]["compliance_status"];
          created_at: string;
          deadline_days: number;
          deadline_explanation: string | null;
          deadline_strategy: string | null;
          details_text: string;
          html_snapshot_path: string | null;
          id: string;
          llm_model: string | null;
          llm_prompt_version: string | null;
          llm_provider: string | null;
          mode: Database["public"]["Enums"]["automation_mode"];
          opportunity_id: string;
          pricing_explanation: string | null;
          pricing_strategy: string | null;
          quality_score: number | null;
          questions: string[];
          risks: string[];
          submission_error: string | null;
          submission_status: Database["public"]["Enums"]["submission_status"];
          submitted_at: string | null;
          technical_summary: string | null;
          updated_at: string;
        };
        Insert: {
          after_screenshot_path?: string | null;
          amount: number;
          assumptions?: string[];
          before_screenshot_path?: string | null;
          compliance_flags?: string[];
          compliance_status?: Database["public"]["Enums"]["compliance_status"];
          created_at?: string;
          deadline_days: number;
          deadline_explanation?: string | null;
          deadline_strategy?: string | null;
          details_text: string;
          html_snapshot_path?: string | null;
          id?: string;
          llm_model?: string | null;
          llm_prompt_version?: string | null;
          llm_provider?: string | null;
          mode: Database["public"]["Enums"]["automation_mode"];
          opportunity_id: string;
          pricing_explanation?: string | null;
          pricing_strategy?: string | null;
          quality_score?: number | null;
          questions?: string[];
          risks?: string[];
          submission_error?: string | null;
          submission_status?: Database["public"]["Enums"]["submission_status"];
          submitted_at?: string | null;
          technical_summary?: string | null;
          updated_at?: string;
        };
        Update: {
          after_screenshot_path?: string | null;
          amount?: number;
          assumptions?: string[];
          before_screenshot_path?: string | null;
          compliance_flags?: string[];
          compliance_status?: Database["public"]["Enums"]["compliance_status"];
          created_at?: string;
          deadline_days?: number;
          deadline_explanation?: string | null;
          deadline_strategy?: string | null;
          details_text?: string;
          html_snapshot_path?: string | null;
          id?: string;
          llm_model?: string | null;
          llm_prompt_version?: string | null;
          llm_provider?: string | null;
          mode?: Database["public"]["Enums"]["automation_mode"];
          opportunity_id?: string;
          pricing_explanation?: string | null;
          pricing_strategy?: string | null;
          quality_score?: number | null;
          questions?: string[];
          risks?: string[];
          submission_error?: string | null;
          submission_status?: Database["public"]["Enums"]["submission_status"];
          submitted_at?: string | null;
          technical_summary?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key: string;
          updated_at?: string;
          value: Json;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          blocked_project_types: string[];
          created_at: string;
          default_hourly_rate_brl: number;
          display_name: string;
          headline: string | null;
          id: string;
          main_skills: string[];
          minimum_amount_brl: number;
          minimum_daily_rate_brl: number;
          portfolio_summary: string | null;
          preferred_project_types: string[];
          proposal_tone: string;
          secondary_skills: string[];
          seniority: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          blocked_project_types?: string[];
          created_at?: string;
          default_hourly_rate_brl?: number;
          display_name: string;
          headline?: string | null;
          id?: string;
          main_skills?: string[];
          minimum_amount_brl?: number;
          minimum_daily_rate_brl?: number;
          portfolio_summary?: string | null;
          preferred_project_types?: string[];
          proposal_tone?: string;
          secondary_skills?: string[];
          seniority?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          blocked_project_types?: string[];
          created_at?: string;
          default_hourly_rate_brl?: number;
          display_name?: string;
          headline?: string | null;
          id?: string;
          main_skills?: string[];
          minimum_amount_brl?: number;
          minimum_daily_rate_brl?: number;
          portfolio_summary?: string | null;
          preferred_project_types?: string[];
          proposal_tone?: string;
          secondary_skills?: string[];
          seniority?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      automation_mode: "DRY_RUN" | "REVIEW_REQUIRED" | "AUTOPILOT";
      compliance_status: "PENDING" | "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED";
      opportunity_decision:
        | "AUTO_SUBMIT"
        | "REVIEW_REQUIRED"
        | "REJECTED"
        | "FAILED";
      opportunity_status:
        | "NEW"
        | "FETCHED"
        | "PARSED"
        | "QUALIFIED"
        | "REJECTED"
        | "PROPOSAL_GENERATED"
        | "WAITING_REVIEW"
        | "APPROVED"
        | "SUBMITTED"
        | "FAILED"
        | "DUPLICATED";
      submission_status:
        | "NOT_SUBMITTED"
        | "PENDING"
        | "SUBMITTED"
        | "FAILED"
        | "FAILED_REQUIRES_MANUAL_ACTION"
        | "DUPLICATED";
    };
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database["public"];

export type TableName = keyof PublicSchema["Tables"];

export type TableRow<T extends TableName> = PublicSchema["Tables"][T]["Row"];
export type TableInsert<T extends TableName> = PublicSchema["Tables"][T]["Insert"];
export type TableUpdate<T extends TableName> = PublicSchema["Tables"][T]["Update"];
