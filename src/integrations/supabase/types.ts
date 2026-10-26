export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_id: string | null;
          company_id: string;
          created_at: string;
          id: string;
          run_id: string | null;
          summary: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          company_id: string;
          created_at?: string;
          id?: string;
          run_id?: string | null;
          summary: string;
          type: string;
        };
        Update: {
          actor_id?: string | null;
          company_id?: string;
          created_at?: string;
          id?: string;
          run_id?: string | null;
          summary?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      ad_accounts: {
        Row: {
          clicks: number;
          company_id: string;
          daily_budget: number;
          hard_cap: number;
          signups: number;
          spend: number;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          clicks?: number;
          company_id: string;
          daily_budget?: number;
          hard_cap?: number;
          signups?: number;
          spend?: number;
          status?: string;
        };
        Update: {
          clicks?: number;
          company_id?: string;
          daily_budget?: number;
          hard_cap?: number;
          signups?: number;
          spend?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ad_accounts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_jobs: {
        Row: {
          attempts: number;
          company_id: string;
          created_at: string;
          created_by: string | null;
          estimated_credits: number;
          finished_at: string | null;
          heartbeat_at: string | null;
          id: string;
          job_type: string;
          last_error: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          run_id: string | null;
          scheduled_for: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
          task_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          estimated_credits?: number;
          finished_at?: string | null;
          heartbeat_at?: string | null;
          id?: string;
          job_type: string;
          last_error?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          run_id?: string | null;
          scheduled_for?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          task_id?: string | null;
        };
        Update: {
          attempts?: number;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          estimated_credits?: number;
          finished_at?: string | null;
          heartbeat_at?: string | null;
          id?: string;
          job_type?: string;
          last_error?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          run_id?: string | null;
          scheduled_for?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          task_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_jobs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_jobs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_jobs_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_jobs_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_runs: {
        Row: {
          company_id: string;
          cost_usd: number;
          created_at: string;
          credits_charged: number;
          finished_at: string | null;
          id: string;
          job_id: string | null;
          model: string;
          pillar: Database["public"]["Enums"]["pillar"];
          started_at: string | null;
          status: Database["public"]["Enums"]["run_status"];
          steps: NonNullable<Json>;
          task: string;
          task_id: string | null;
          usage: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          cost_usd?: number;
          created_at?: string;
          credits_charged?: number;
          finished_at?: string | null;
          id?: string;
          job_id?: string | null;
          model: string;
          pillar: Database["public"]["Enums"]["pillar"];
          started_at?: string | null;
          status?: Database["public"]["Enums"]["run_status"];
          steps?: NonNullable<Json>;
          task: string;
          task_id?: string | null;
          usage?: NonNullable<Json>;
        };
        Update: {
          company_id?: string;
          cost_usd?: number;
          created_at?: string;
          credits_charged?: number;
          finished_at?: string | null;
          id?: string;
          job_id?: string | null;
          model?: string;
          pillar?: Database["public"]["Enums"]["pillar"];
          started_at?: string | null;
          status?: Database["public"]["Enums"]["run_status"];
          steps?: NonNullable<Json>;
          task?: string;
          task_id?: string | null;
          usage?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "agent_runs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_runs_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "agent_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_runs_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      approvals: {
        Row: {
          action_type: Database["public"]["Enums"]["approval_action"];
          company_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          estimated_credits: number;
          executed_at: string | null;
          execution_attempts: number;
          execution_error: string | null;
          execution_result: Json | null;
          execution_run_id: string | null;
          execution_status: Database["public"]["Enums"]["execution_status"];
          id: string;
          original_payload: Json | null;
          payload: NonNullable<Json>;
          requested_by: string | null;
          run_id: string | null;
          status: Database["public"]["Enums"]["approval_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          action_type: Database["public"]["Enums"]["approval_action"];
          company_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          estimated_credits?: number;
          executed_at?: string | null;
          execution_attempts?: number;
          execution_error?: string | null;
          execution_result?: Json | null;
          execution_run_id?: string | null;
          execution_status?: Database["public"]["Enums"]["execution_status"];
          id?: string;
          original_payload?: Json | null;
          payload: NonNullable<Json>;
          requested_by?: string | null;
          run_id?: string | null;
          status?: Database["public"]["Enums"]["approval_status"];
          updated_at?: string;
        };
        Update: {
          action_type?: Database["public"]["Enums"]["approval_action"];
          company_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          estimated_credits?: number;
          executed_at?: string | null;
          execution_attempts?: number;
          execution_error?: string | null;
          execution_result?: Json | null;
          execution_run_id?: string | null;
          execution_status?: Database["public"]["Enums"]["execution_status"];
          id?: string;
          original_payload?: Json | null;
          payload?: NonNullable<Json>;
          requested_by?: string | null;
          run_id?: string | null;
          status?: Database["public"]["Enums"]["approval_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approvals_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approvals_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approvals_execution_run_id_fkey";
            columns: ["execution_run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approvals_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approvals_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      capture_settings: {
        Row: {
          auto_accept_own_notes: boolean;
          company_id: string;
          keep_audio_days: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          auto_accept_own_notes?: boolean;
          company_id: string;
          keep_audio_days?: number;
          updated_at?: string;
        };
        Update: {
          auto_accept_own_notes?: boolean;
          company_id?: string;
          keep_audio_days?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "capture_settings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      captures: {
        Row: {
          audio_delete_after: string | null;
          audio_deleted_at: string | null;
          audio_path: string | null;
          company_id: string;
          consent: string;
          created_at: string;
          created_by: string | null;
          duration_seconds: number | null;
          error: string | null;
          id: string;
          job_id: string | null;
          participants: string[];
          source: string;
          status: string;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          audio_delete_after?: string | null;
          audio_deleted_at?: string | null;
          audio_path?: string | null;
          company_id: string;
          consent: string;
          created_at?: string;
          created_by?: string | null;
          duration_seconds?: number | null;
          error?: string | null;
          id?: string;
          job_id?: string | null;
          participants?: string[];
          source: string;
          status?: string;
          title?: string;
        };
        Update: {
          audio_delete_after?: string | null;
          audio_deleted_at?: string | null;
          audio_path?: string | null;
          company_id?: string;
          consent?: string;
          created_at?: string;
          created_by?: string | null;
          duration_seconds?: number | null;
          error?: string | null;
          id?: string;
          job_id?: string | null;
          participants?: string[];
          source?: string;
          status?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "captures_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "captures_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "captures_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "agent_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          author_id: string | null;
          company_id: string;
          content: string;
          created_at: string;
          id: string;
          sender: Database["public"]["Enums"]["chat_sender"];
        };
        ComputedFields: never;
        Insert: {
          author_id?: string | null;
          company_id: string;
          content: string;
          created_at?: string;
          id?: string;
          sender: Database["public"]["Enums"]["chat_sender"];
        };
        Update: {
          author_id?: string | null;
          company_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          sender?: Database["public"]["Enums"]["chat_sender"];
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      cohort_companies: {
        Row: {
          cohort_id: string;
          company_id: string;
          created_at: string;
          credit_cap: number;
        };
        ComputedFields: never;
        Insert: {
          cohort_id: string;
          company_id: string;
          created_at?: string;
          credit_cap?: number;
        };
        Update: {
          cohort_id?: string;
          company_id?: string;
          created_at?: string;
          credit_cap?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cohort_companies_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cohort_companies_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      cohort_mentors: {
        Row: {
          cohort_id: string;
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          cohort_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          cohort_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cohort_mentors_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cohort_mentors_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cohorts: {
        Row: {
          created_at: string;
          credit_pool: number;
          default_credit_cap: number;
          id: string;
          institution: string;
          join_code: string | null;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          credit_pool?: number;
          default_credit_cap?: number;
          id?: string;
          institution: string;
          join_code?: string | null;
          name: string;
        };
        Update: {
          created_at?: string;
          credit_pool?: number;
          default_credit_cap?: number;
          id?: string;
          institution?: string;
          join_code?: string | null;
          name?: string;
        };
        Relationships: [];
      };
      commitments: {
        Row: {
          company_id: string;
          completed_at: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          due_date: string;
          followup_approval_id: string | null;
          followup_draft: string | null;
          id: string;
          source_item_id: string | null;
          status: string;
          to_name: string;
          what: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          completed_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_date: string;
          followup_approval_id?: string | null;
          followup_draft?: string | null;
          id?: string;
          source_item_id?: string | null;
          status?: string;
          to_name: string;
          what: string;
        };
        Update: {
          company_id?: string;
          completed_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_date?: string;
          followup_approval_id?: string | null;
          followup_draft?: string | null;
          id?: string;
          source_item_id?: string | null;
          status?: string;
          to_name?: string;
          what?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commitments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commitments_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commitments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commitments_followup_approval_id_fkey";
            columns: ["followup_approval_id"];
            isOneToOne: false;
            referencedRelation: "approvals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commitments_source_item_id_fkey";
            columns: ["source_item_id"];
            isOneToOne: false;
            referencedRelation: "extracted_items";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          activation_definition: string | null;
          channels: string[];
          created_at: string;
          created_by: string | null;
          customer_type: Database["public"]["Enums"]["customer_type"];
          description: string;
          entry_path: Database["public"]["Enums"]["entry_path"];
          existing_website_url: string | null;
          goal_90d: string | null;
          google_business_url: string | null;
          id: string;
          name: string;
          plan: Database["public"]["Enums"]["company_plan"];
          sector: Database["public"]["Enums"]["sector_pack"];
          slug: string;
          social_handles: NonNullable<Json>;
          stage: Database["public"]["Enums"]["stage"];
          started_at: string;
          starting_stage: string | null;
          target_customer: string | null;
          updated_at: string;
          website_live_url: string;
          website_preview_url: string;
        };
        ComputedFields: never;
        Insert: {
          activation_definition?: string | null;
          channels?: string[];
          created_at?: string;
          created_by?: string | null;
          customer_type: Database["public"]["Enums"]["customer_type"];
          description?: string;
          entry_path?: Database["public"]["Enums"]["entry_path"];
          existing_website_url?: string | null;
          goal_90d?: string | null;
          google_business_url?: string | null;
          id?: string;
          name: string;
          plan?: Database["public"]["Enums"]["company_plan"];
          sector?: Database["public"]["Enums"]["sector_pack"];
          slug: string;
          social_handles?: NonNullable<Json>;
          stage?: Database["public"]["Enums"]["stage"];
          started_at?: string;
          starting_stage?: string | null;
          target_customer?: string | null;
          updated_at?: string;
          website_live_url?: string;
          website_preview_url?: string;
        };
        Update: {
          activation_definition?: string | null;
          channels?: string[];
          created_at?: string;
          created_by?: string | null;
          customer_type?: Database["public"]["Enums"]["customer_type"];
          description?: string;
          entry_path?: Database["public"]["Enums"]["entry_path"];
          existing_website_url?: string | null;
          goal_90d?: string | null;
          google_business_url?: string | null;
          id?: string;
          name?: string;
          plan?: Database["public"]["Enums"]["company_plan"];
          sector?: Database["public"]["Enums"]["sector_pack"];
          slug?: string;
          social_handles?: NonNullable<Json>;
          stage?: Database["public"]["Enums"]["stage"];
          started_at?: string;
          starting_stage?: string | null;
          target_customer?: string | null;
          updated_at?: string;
          website_live_url?: string;
          website_preview_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      company_members: {
        Row: {
          company_id: string;
          created_at: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      company_sharing: {
        Row: {
          company_id: string;
          enabled: boolean;
          milestones: boolean;
          mrr: boolean;
          signups: boolean;
          stage: boolean;
          updated_at: string;
          visitors: boolean;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          enabled?: boolean;
          milestones?: boolean;
          mrr?: boolean;
          signups?: boolean;
          stage?: boolean;
          updated_at?: string;
          visitors?: boolean;
        };
        Update: {
          company_id?: string;
          enabled?: boolean;
          milestones?: boolean;
          mrr?: boolean;
          signups?: boolean;
          stage?: boolean;
          updated_at?: string;
          visitors?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "company_sharing_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_items: {
        Row: {
          category: string;
          company_id: string;
          created_at: string;
          due_date: string;
          id: string;
          status: Database["public"]["Enums"]["compliance_status"];
          statutory: boolean;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          company_id: string;
          created_at?: string;
          due_date: string;
          id?: string;
          status?: Database["public"]["Enums"]["compliance_status"];
          statutory?: boolean;
          title: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          company_id?: string;
          created_at?: string;
          due_date?: string;
          id?: string;
          status?: Database["public"]["Enums"]["compliance_status"];
          statutory?: boolean;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_items_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      consents: {
        Row: {
          channel: string;
          company_id: string;
          contact_id: string;
          created_at: string;
          evidence: NonNullable<Json>;
          form_id: string | null;
          id: string;
          lawful_basis: string | null;
          purpose: string;
          recorded_by: string | null;
          source: string;
          status: string;
          wording: string | null;
        };
        ComputedFields: never;
        Insert: {
          channel?: string;
          company_id: string;
          contact_id: string;
          created_at?: string;
          evidence?: NonNullable<Json>;
          form_id?: string | null;
          id?: string;
          lawful_basis?: string | null;
          purpose: string;
          recorded_by?: string | null;
          source: string;
          status: string;
          wording?: string | null;
        };
        Update: {
          channel?: string;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          evidence?: NonNullable<Json>;
          form_id?: string | null;
          id?: string;
          lawful_basis?: string | null;
          purpose?: string;
          recorded_by?: string | null;
          source?: string;
          status?: string;
          wording?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consents_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consents_form_id_fkey";
            columns: ["form_id"];
            isOneToOne: false;
            referencedRelation: "forms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consents_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          company_id: string;
          created_at: string;
          email: string;
          id: string;
          kind: Database["public"]["Enums"]["contact_kind"];
          last_contact_at: string | null;
          name: string;
          source: string;
          value: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          email?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["contact_kind"];
          last_contact_at?: string | null;
          name: string;
          source?: string;
          value?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          email?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["contact_kind"];
          last_contact_at?: string | null;
          name?: string;
          source?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      credit_config: {
        Row: {
          credit_value_gbp: number;
          fx_gbp: number;
          id: boolean;
          markup: number;
          plan_expiry: string;
          topup_expiry: string;
          transcription_usd_per_minute: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          credit_value_gbp?: number;
          fx_gbp?: number;
          id?: boolean;
          markup?: number;
          plan_expiry?: string;
          topup_expiry?: string;
          transcription_usd_per_minute?: number;
          updated_at?: string;
        };
        Update: {
          credit_value_gbp?: number;
          fx_gbp?: number;
          id?: boolean;
          markup?: number;
          plan_expiry?: string;
          topup_expiry?: string;
          transcription_usd_per_minute?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          amount: number;
          bucket: Database["public"]["Enums"]["credit_bucket"] | null;
          cohort_id: string | null;
          company_id: string;
          created_at: string;
          entry_type: Database["public"]["Enums"]["ledger_entry_type"];
          expires_at: string | null;
          id: string;
          idempotency_key: string | null;
          lot_id: string | null;
          note: string;
          run_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          bucket?: Database["public"]["Enums"]["credit_bucket"] | null;
          cohort_id?: string | null;
          company_id: string;
          created_at?: string;
          entry_type: Database["public"]["Enums"]["ledger_entry_type"];
          expires_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          lot_id?: string | null;
          note?: string;
          run_id?: string | null;
        };
        Update: {
          amount?: number;
          bucket?: Database["public"]["Enums"]["credit_bucket"] | null;
          cohort_id?: string | null;
          company_id?: string;
          created_at?: string;
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"];
          expires_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          lot_id?: string | null;
          note?: string;
          run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "credit_ledger_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_ledger_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_ledger_lot_id_fkey";
            columns: ["lot_id"];
            isOneToOne: false;
            referencedRelation: "credit_ledger";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_ledger_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      document_versions: {
        Row: {
          company_id: string;
          content: string;
          created_at: string;
          document_id: string;
          id: string;
          run_id: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          content: string;
          created_at?: string;
          document_id: string;
          id?: string;
          run_id?: string | null;
          version: number;
        };
        Update: {
          company_id?: string;
          content?: string;
          created_at?: string;
          document_id?: string;
          id?: string;
          run_id?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          outcomes: Json | null;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          outcomes?: Json | null;
          title: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          outcomes?: Json | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      email_messages: {
        Row: {
          body: string;
          company_id: string;
          created_at: string;
          direction: Database["public"]["Enums"]["email_direction"];
          id: string;
          thread_id: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          company_id: string;
          created_at?: string;
          direction: Database["public"]["Enums"]["email_direction"];
          id?: string;
          thread_id: string;
        };
        Update: {
          body?: string;
          company_id?: string;
          created_at?: string;
          direction?: Database["public"]["Enums"]["email_direction"];
          id?: string;
          thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_messages_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "email_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      email_threads: {
        Row: {
          address: string;
          company_id: string;
          contact_name: string;
          created_at: string;
          id: string;
          mode: Database["public"]["Enums"]["email_mode"];
          subject: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string;
          company_id: string;
          contact_name?: string;
          created_at?: string;
          id?: string;
          mode: Database["public"]["Enums"]["email_mode"];
          subject: string;
        };
        Update: {
          address?: string;
          company_id?: string;
          contact_name?: string;
          created_at?: string;
          id?: string;
          mode?: Database["public"]["Enums"]["email_mode"];
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_threads_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      evidence_items: {
        Row: {
          company_id: string;
          created_at: string;
          data: NonNullable<Json>;
          id: string;
          status: Database["public"]["Enums"]["assumption_status"] | null;
          title: string;
          type: Database["public"]["Enums"]["evidence_type"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          data?: NonNullable<Json>;
          id?: string;
          status?: Database["public"]["Enums"]["assumption_status"] | null;
          title: string;
          type: Database["public"]["Enums"]["evidence_type"];
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          data?: NonNullable<Json>;
          id?: string;
          status?: Database["public"]["Enums"]["assumption_status"] | null;
          title?: string;
          type?: Database["public"]["Enums"]["evidence_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evidence_items_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      extracted_items: {
        Row: {
          at_seconds: number | null;
          capture_id: string;
          company_id: string;
          confidence: number;
          contact_id: string | null;
          contact_name: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          department: Database["public"]["Enums"]["pillar"] | null;
          due_date: string | null;
          id: string;
          kind: string;
          match_task_id: string | null;
          owner: string | null;
          owner_id: string | null;
          owner_name: string | null;
          quote: string | null;
          routed: NonNullable<Json>;
          run_id: string | null;
          sensitive: boolean;
          shared: boolean;
          status: string;
          text: string;
        };
        ComputedFields: never;
        Insert: {
          at_seconds?: number | null;
          capture_id: string;
          company_id: string;
          confidence: number;
          contact_id?: string | null;
          contact_name?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          department?: Database["public"]["Enums"]["pillar"] | null;
          due_date?: string | null;
          id?: string;
          kind: string;
          match_task_id?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          owner_name?: string | null;
          quote?: string | null;
          routed?: NonNullable<Json>;
          run_id?: string | null;
          sensitive?: boolean;
          shared?: boolean;
          status?: string;
          text: string;
        };
        Update: {
          at_seconds?: number | null;
          capture_id?: string;
          company_id?: string;
          confidence?: number;
          contact_id?: string | null;
          contact_name?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          department?: Database["public"]["Enums"]["pillar"] | null;
          due_date?: string | null;
          id?: string;
          kind?: string;
          match_task_id?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          owner_name?: string | null;
          quote?: string | null;
          routed?: NonNullable<Json>;
          run_id?: string | null;
          sensitive?: boolean;
          shared?: boolean;
          status?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extracted_items_capture_id_fkey";
            columns: ["capture_id"];
            isOneToOne: false;
            referencedRelation: "captures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extracted_items_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extracted_items_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extracted_items_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extracted_items_match_task_id_fkey";
            columns: ["match_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extracted_items_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extracted_items_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          body: string;
          capture_id: string | null;
          company_id: string;
          contact_id: string | null;
          created_at: string;
          id: string;
          sentiment: string | null;
          source: string;
          theme: string | null;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          capture_id?: string | null;
          company_id: string;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          sentiment?: string | null;
          source: string;
          theme?: string | null;
        };
        Update: {
          body?: string;
          capture_id?: string | null;
          company_id?: string;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          sentiment?: string | null;
          source?: string;
          theme?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_capture_id_fkey";
            columns: ["capture_id"];
            isOneToOne: false;
            referencedRelation: "captures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feedback_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feedback_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      forms: {
        Row: {
          ask_phone: boolean;
          company_id: string;
          created_at: string;
          enabled: boolean;
          id: string;
          intro: string;
          marketing_wording: string;
          name: string;
          privacy_url: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          ask_phone?: boolean;
          company_id: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          intro?: string;
          marketing_wording?: string;
          name?: string;
          privacy_url?: string | null;
          updated_at?: string;
        };
        Update: {
          ask_phone?: boolean;
          company_id?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          intro?: string;
          marketing_wording?: string;
          name?: string;
          privacy_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "forms_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      gate_comments: {
        Row: {
          author_id: string;
          body: string;
          company_id: string;
          created_at: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          author_id?: string;
          body: string;
          company_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gate_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gate_comments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      grants: {
        Row: {
          amount: string;
          company_id: string;
          created_at: string;
          deadline: string | null;
          id: string;
          name: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          amount?: string;
          company_id: string;
          created_at?: string;
          deadline?: string | null;
          id?: string;
          name: string;
          status?: string;
        };
        Update: {
          amount?: string;
          company_id?: string;
          created_at?: string;
          deadline?: string | null;
          id?: string;
          name?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grants_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      hq_layouts: {
        Row: {
          layout: NonNullable<Json>;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          layout: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          layout?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hq_layouts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      hub_pages: {
        Row: {
          bio: string;
          company_id: string;
          enabled: boolean;
          headline: string;
          links: NonNullable<Json>;
          show_form: boolean;
          show_socials: boolean;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bio?: string;
          company_id: string;
          enabled?: boolean;
          headline?: string;
          links?: NonNullable<Json>;
          show_form?: boolean;
          show_socials?: boolean;
          slug: string;
          updated_at?: string;
        };
        Update: {
          bio?: string;
          company_id?: string;
          enabled?: boolean;
          headline?: string;
          links?: NonNullable<Json>;
          show_form?: boolean;
          show_socials?: boolean;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hub_pages_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      ideas: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          evidence_item_id: string | null;
          evidence_plan: string | null;
          id: string;
          source_item_id: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          evidence_item_id?: string | null;
          evidence_plan?: string | null;
          id?: string;
          source_item_id?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          evidence_item_id?: string | null;
          evidence_plan?: string | null;
          id?: string;
          source_item_id?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ideas_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ideas_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ideas_evidence_item_id_fkey";
            columns: ["evidence_item_id"];
            isOneToOne: false;
            referencedRelation: "evidence_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ideas_source_item_id_fkey";
            columns: ["source_item_id"];
            isOneToOne: false;
            referencedRelation: "extracted_items";
            referencedColumns: ["id"];
          },
        ];
      };
      investors: {
        Row: {
          company_id: string;
          created_at: string;
          firm: string;
          id: string;
          name: string;
          notes: string;
          stage: Database["public"]["Enums"]["investor_stage"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          firm?: string;
          id?: string;
          name: string;
          notes?: string;
          stage?: Database["public"]["Enums"]["investor_stage"];
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          firm?: string;
          id?: string;
          name?: string;
          notes?: string;
          stage?: Database["public"]["Enums"]["investor_stage"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investors_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      job_types: {
        Row: {
          cap_credits: number;
          estimate_credits: number;
          job_type: string;
          label: string;
          pillar: Database["public"]["Enums"]["pillar"];
          tier: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cap_credits: number;
          estimate_credits: number;
          job_type: string;
          label: string;
          pillar: Database["public"]["Enums"]["pillar"];
          tier: string;
          updated_at?: string;
        };
        Update: {
          cap_credits?: number;
          estimate_credits?: number;
          job_type?: string;
          label?: string;
          pillar?: Database["public"]["Enums"]["pillar"];
          tier?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          campaign: string;
          channel: string;
          company_id: string;
          contact_id: string;
          created_at: string;
          form_id: string | null;
          id: string;
          link_id: string | null;
          message: string;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          campaign?: string;
          channel?: string;
          company_id: string;
          contact_id: string;
          created_at?: string;
          form_id?: string | null;
          id?: string;
          link_id?: string | null;
          message?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          campaign?: string;
          channel?: string;
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          form_id?: string | null;
          id?: string;
          link_id?: string | null;
          message?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_form_id_fkey";
            columns: ["form_id"];
            isOneToOne: false;
            referencedRelation: "forms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_link_id_fkey";
            columns: ["link_id"];
            isOneToOne: false;
            referencedRelation: "link_stats";
            referencedColumns: ["link_id"];
          },
          {
            foreignKeyName: "leads_link_id_fkey";
            columns: ["link_id"];
            isOneToOne: false;
            referencedRelation: "tracked_links";
            referencedColumns: ["id"];
          },
        ];
      };
      link_clicks: {
        Row: {
          clicked_at: string;
          company_id: string;
          country: string | null;
          device: string;
          id: number;
          link_id: string;
          referrer_host: string | null;
        };
        ComputedFields: never;
        Insert: {
          clicked_at?: string;
          company_id: string;
          country?: string | null;
          device?: string;
          id?: never;
          link_id: string;
          referrer_host?: string | null;
        };
        Update: {
          clicked_at?: string;
          company_id?: string;
          country?: string | null;
          device?: string;
          id?: never;
          link_id?: string;
          referrer_host?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "link_clicks_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "link_clicks_link_id_fkey";
            columns: ["link_id"];
            isOneToOne: false;
            referencedRelation: "link_stats";
            referencedColumns: ["link_id"];
          },
          {
            foreignKeyName: "link_clicks_link_id_fkey";
            columns: ["link_id"];
            isOneToOne: false;
            referencedRelation: "tracked_links";
            referencedColumns: ["id"];
          },
        ];
      };
      media_assets: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          job_id: string | null;
          kind: Database["public"]["Enums"]["media_kind"];
          reason: string | null;
          status: Database["public"]["Enums"]["media_status"];
          title: string;
          url: string | null;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          job_id?: string | null;
          kind: Database["public"]["Enums"]["media_kind"];
          reason?: string | null;
          status?: Database["public"]["Enums"]["media_status"];
          title: string;
          url?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          job_id?: string | null;
          kind?: Database["public"]["Enums"]["media_kind"];
          reason?: string | null;
          status?: Database["public"]["Enums"]["media_status"];
          title?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_assets_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "agent_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      memory_facts: {
        Row: {
          approved_by: string | null;
          company_id: string;
          created_at: string;
          fact: string;
          id: string;
          source_item_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          approved_by?: string | null;
          company_id: string;
          created_at?: string;
          fact: string;
          id?: string;
          source_item_id?: string | null;
        };
        Update: {
          approved_by?: string | null;
          company_id?: string;
          created_at?: string;
          fact?: string;
          id?: string;
          source_item_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "memory_facts_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memory_facts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memory_facts_source_item_id_fkey";
            columns: ["source_item_id"];
            isOneToOne: false;
            referencedRelation: "extracted_items";
            referencedColumns: ["id"];
          },
        ];
      };
      metrics_daily: {
        Row: {
          activated: number;
          company_id: string;
          date: string;
          mrr: number;
          paying_customers: number;
          signups: number;
          visitors: number;
        };
        ComputedFields: never;
        Insert: {
          activated?: number;
          company_id: string;
          date: string;
          mrr?: number;
          paying_customers?: number;
          signups?: number;
          visitors?: number;
        };
        Update: {
          activated?: number;
          company_id?: string;
          date?: string;
          mrr?: number;
          paying_customers?: number;
          signups?: number;
          visitors?: number;
        };
        Relationships: [
          {
            foreignKeyName: "metrics_daily_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      model_prices: {
        Row: {
          input_per_mtok: number;
          model: string;
          output_per_mtok: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          input_per_mtok: number;
          model: string;
          output_per_mtok: number;
          updated_at?: string;
        };
        Update: {
          input_per_mtok?: number;
          model?: string;
          output_per_mtok?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_admin: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string;
          id: string;
          is_admin?: boolean;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          is_admin?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      response_policies: {
        Row: {
          category: string;
          company_id: string;
          mode: Database["public"]["Enums"]["response_mode"];
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          company_id: string;
          mode?: Database["public"]["Enums"]["response_mode"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          category?: string;
          company_id?: string;
          mode?: Database["public"]["Enums"]["response_mode"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "response_policies_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "response_policies_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      response_settings: {
        Row: {
          company_id: string;
          disclosure_on_approved: boolean;
          disclosure_text: string;
          policy_reviewed_at: string | null;
          policy_reviewed_by: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          disclosure_on_approved?: boolean;
          disclosure_text?: string;
          policy_reviewed_at?: string | null;
          policy_reviewed_by?: string | null;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          disclosure_on_approved?: boolean;
          disclosure_text?: string;
          policy_reviewed_at?: string | null;
          policy_reviewed_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "response_settings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "response_settings_policy_reviewed_by_fkey";
            columns: ["policy_reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      routines: {
        Row: {
          cadence: Database["public"]["Enums"]["routine_cadence"];
          company_id: string;
          created_at: string;
          credits: number;
          enabled: boolean;
          id: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cadence: Database["public"]["Enums"]["routine_cadence"];
          company_id: string;
          created_at?: string;
          credits: number;
          enabled?: boolean;
          id?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          cadence?: Database["public"]["Enums"]["routine_cadence"];
          company_id?: string;
          created_at?: string;
          credits?: number;
          enabled?: boolean;
          id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "routines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      site_versions: {
        Row: {
          company_id: string;
          id: string;
          preview_url: string | null;
          published_at: string;
          summary: string;
          version: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          id?: string;
          preview_url?: string | null;
          published_at?: string;
          summary: string;
          version: string;
        };
        Update: {
          company_id?: string;
          id?: string;
          preview_url?: string | null;
          published_at?: string;
          summary?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_versions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      social_posts: {
        Row: {
          angle: string;
          approval_id: string | null;
          channel: Database["public"]["Enums"]["social_channel"];
          company_id: string;
          created_at: string;
          id: string;
          metrics: NonNullable<Json>;
          scheduled_for: string | null;
          status: Database["public"]["Enums"]["post_status"];
          text: string;
        };
        ComputedFields: never;
        Insert: {
          angle?: string;
          approval_id?: string | null;
          channel: Database["public"]["Enums"]["social_channel"];
          company_id: string;
          created_at?: string;
          id?: string;
          metrics?: NonNullable<Json>;
          scheduled_for?: string | null;
          status?: Database["public"]["Enums"]["post_status"];
          text: string;
        };
        Update: {
          angle?: string;
          approval_id?: string | null;
          channel?: Database["public"]["Enums"]["social_channel"];
          company_id?: string;
          created_at?: string;
          id?: string;
          metrics?: NonNullable<Json>;
          scheduled_for?: string | null;
          status?: Database["public"]["Enums"]["post_status"];
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "social_posts_approval_id_fkey";
            columns: ["approval_id"];
            isOneToOne: false;
            referencedRelation: "approvals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "social_posts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      stage_gates: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          company_id: string;
          criteria: NonNullable<Json>;
          id: string;
          stage: Database["public"]["Enums"]["stage"];
          status: Database["public"]["Enums"]["gate_status"];
          target_date: string | null;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          company_id: string;
          criteria?: NonNullable<Json>;
          id?: string;
          stage: Database["public"]["Enums"]["stage"];
          status?: Database["public"]["Enums"]["gate_status"];
          target_date?: string | null;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          company_id?: string;
          criteria?: NonNullable<Json>;
          id?: string;
          stage?: Database["public"]["Enums"]["stage"];
          status?: Database["public"]["Enums"]["gate_status"];
          target_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stage_gates_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stage_gates_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          actor: Database["public"]["Enums"]["task_actor"];
          assignee_id: string | null;
          company_id: string;
          completed_at: string | null;
          created_at: string;
          due: string | null;
          estimated_credits: number;
          id: string;
          key: boolean;
          pillar: Database["public"]["Enums"]["pillar"];
          proof: Json | null;
          source_item_id: string | null;
          stage: Database["public"]["Enums"]["stage"] | null;
          status: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          actor?: Database["public"]["Enums"]["task_actor"];
          assignee_id?: string | null;
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          due?: string | null;
          estimated_credits?: number;
          id?: string;
          key?: boolean;
          pillar: Database["public"]["Enums"]["pillar"];
          proof?: Json | null;
          source_item_id?: string | null;
          stage?: Database["public"]["Enums"]["stage"] | null;
          status?: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          actor?: Database["public"]["Enums"]["task_actor"];
          assignee_id?: string | null;
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          due?: string | null;
          estimated_credits?: number;
          id?: string;
          key?: boolean;
          pillar?: Database["public"]["Enums"]["pillar"];
          proof?: Json | null;
          source_item_id?: string | null;
          stage?: Database["public"]["Enums"]["stage"] | null;
          status?: Database["public"]["Enums"]["task_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_source_item_id_fkey";
            columns: ["source_item_id"];
            isOneToOne: false;
            referencedRelation: "extracted_items";
            referencedColumns: ["id"];
          },
        ];
      };
      team_invites: {
        Row: {
          company_id: string;
          created_at: string;
          email: string;
          id: string;
          invited_by: string | null;
          role: Database["public"]["Enums"]["member_role"];
          status: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          email: string;
          id?: string;
          invited_by?: string | null;
          role: Database["public"]["Enums"]["member_role"];
          status?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          email?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_invites_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tracked_links: {
        Row: {
          archived: boolean;
          campaign: string;
          campaign_id: string | null;
          channel: string;
          code: string;
          company_id: string;
          content: string | null;
          created_at: string;
          created_by: string | null;
          created_by_sol: boolean;
          destination: string;
          id: string;
          label: string;
          medium: string;
          spend_gbp: number | null;
        };
        ComputedFields: never;
        Insert: {
          archived?: boolean;
          campaign?: string;
          campaign_id?: string | null;
          channel: string;
          code: string;
          company_id: string;
          content?: string | null;
          created_at?: string;
          created_by?: string | null;
          created_by_sol?: boolean;
          destination: string;
          id?: string;
          label: string;
          medium?: string;
          spend_gbp?: number | null;
        };
        Update: {
          archived?: boolean;
          campaign?: string;
          campaign_id?: string | null;
          channel?: string;
          code?: string;
          company_id?: string;
          content?: string | null;
          created_at?: string;
          created_by?: string | null;
          created_by_sol?: boolean;
          destination?: string;
          id?: string;
          label?: string;
          medium?: string;
          spend_gbp?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tracked_links_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tracked_links_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      transcripts: {
        Row: {
          capture_id: string;
          company_id: string;
          created_at: string;
          provider: string;
          segments: NonNullable<Json>;
          text: string;
        };
        ComputedFields: never;
        Insert: {
          capture_id: string;
          company_id: string;
          created_at?: string;
          provider: string;
          segments?: NonNullable<Json>;
          text: string;
        };
        Update: {
          capture_id?: string;
          company_id?: string;
          created_at?: string;
          provider?: string;
          segments?: NonNullable<Json>;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transcripts_capture_id_fkey";
            columns: ["capture_id"];
            isOneToOne: true;
            referencedRelation: "captures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transcripts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      user_preferences: {
        Row: {
          ad_threshold: number;
          explanation: string;
          outreach_threshold: number;
          publishing: boolean;
          signup_drop: number;
          slack: boolean;
          theme: string;
          updated_at: string;
          user_id: string;
          whatsapp: boolean;
        };
        ComputedFields: never;
        Insert: {
          ad_threshold?: number;
          explanation?: string;
          outreach_threshold?: number;
          publishing?: boolean;
          signup_drop?: number;
          slack?: boolean;
          theme?: string;
          updated_at?: string;
          user_id?: string;
          whatsapp?: boolean;
        };
        Update: {
          ad_threshold?: number;
          explanation?: string;
          outreach_threshold?: number;
          publishing?: boolean;
          signup_drop?: number;
          slack?: boolean;
          theme?: string;
          updated_at?: string;
          user_id?: string;
          whatsapp?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      voice_edit_events: {
        Row: {
          approval_id: string | null;
          channel: string;
          company_id: string;
          created_at: string;
          edited_by: string | null;
          final: string;
          id: string;
          original: string;
          used_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          approval_id?: string | null;
          channel: string;
          company_id: string;
          created_at?: string;
          edited_by?: string | null;
          final: string;
          id?: string;
          original: string;
          used_at?: string | null;
        };
        Update: {
          approval_id?: string | null;
          channel?: string;
          company_id?: string;
          created_at?: string;
          edited_by?: string | null;
          final?: string;
          id?: string;
          original?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "voice_edit_events_approval_id_fkey";
            columns: ["approval_id"];
            isOneToOne: false;
            referencedRelation: "approvals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voice_edit_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voice_edit_events_edited_by_fkey";
            columns: ["edited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      voice_examples: {
        Row: {
          added_by: string | null;
          body: string;
          channel: string;
          company_id: string;
          created_at: string;
          id: string;
          situation: string;
        };
        ComputedFields: never;
        Insert: {
          added_by?: string | null;
          body: string;
          channel?: string;
          company_id: string;
          created_at?: string;
          id?: string;
          situation: string;
        };
        Update: {
          added_by?: string | null;
          body?: string;
          channel?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          situation?: string;
        };
        Relationships: [
          {
            foreignKeyName: "voice_examples_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voice_examples_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      voice_profiles: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          avoid_phrases: string[];
          changes: string | null;
          channel_variants: NonNullable<Json>;
          company_id: string;
          created_at: string;
          created_by: string | null;
          emoji: string;
          id: string;
          reading_level: string;
          run_id: string | null;
          sign_off: string | null;
          source: string;
          spelling: string;
          status: Database["public"]["Enums"]["voice_status"];
          summary: string;
          tone_rules: NonNullable<Json>;
          traits: string[];
          use_phrases: string[];
          version: number;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          avoid_phrases?: string[];
          changes?: string | null;
          channel_variants?: NonNullable<Json>;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          emoji?: string;
          id?: string;
          reading_level?: string;
          run_id?: string | null;
          sign_off?: string | null;
          source: string;
          spelling?: string;
          status?: Database["public"]["Enums"]["voice_status"];
          summary?: string;
          tone_rules?: NonNullable<Json>;
          traits?: string[];
          use_phrases?: string[];
          version: number;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          avoid_phrases?: string[];
          changes?: string | null;
          channel_variants?: NonNullable<Json>;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          emoji?: string;
          id?: string;
          reading_level?: string;
          run_id?: string | null;
          sign_off?: string | null;
          source?: string;
          spelling?: string;
          status?: Database["public"]["Enums"]["voice_status"];
          summary?: string;
          tone_rules?: NonNullable<Json>;
          traits?: string[];
          use_phrases?: string[];
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "voice_profiles_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voice_profiles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voice_profiles_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voice_profiles_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      voice_sources: {
        Row: {
          added_by: string | null;
          company_id: string;
          content: string;
          created_at: string;
          id: string;
          kind: string;
        };
        ComputedFields: never;
        Insert: {
          added_by?: string | null;
          company_id: string;
          content: string;
          created_at?: string;
          id?: string;
          kind: string;
        };
        Update: {
          added_by?: string | null;
          company_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "voice_sources_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voice_sources_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      company_credit_balance: {
        Row: {
          balance: number | null;
          cohort_balance: number | null;
          company_id: string;
          held: number | null;
          plan_balance: number | null;
          topup_balance: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "credit_ledger_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      current_consents: {
        Row: {
          channel: string;
          company_id: string;
          contact_id: string;
          created_at: string;
          id: string;
          lawful_basis: string | null;
          purpose: string;
          source: string;
          status: string;
          wording: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "consents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consents_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      link_stats: {
        Row: {
          clicks: number | null;
          clicks_7d: number | null;
          company_id: string;
          leads: number | null;
          link_id: string;
        };
        ComputedFields: never;
        Insert: {
          clicks?: never;
          clicks_7d?: never;
          company_id?: string | null;
          leads?: never;
          link_id?: string | null;
        };
        Update: {
          clicks?: never;
          clicks_7d?: never;
          company_id?: string | null;
          leads?: never;
          link_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tracked_links_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      accept_all_items: { Args: { p_capture: string }; Returns: number };
      accept_invites: { Args: Record<PropertyKey, never>; Returns: number };
      adopt_voice_profile: {
        Args: { p_approved_by: string; p_profile: string };
        Returns: undefined;
      };
      append_run_step: { Args: { p_run: string; p_step: Json }; Returns: undefined };
      approve_gate: { Args: { p_gate: string }; Returns: Database["public"]["Enums"]["stage"] };
      ask_why: { Args: { p_approval: string }; Returns: undefined };
      attribution: {
        Args: { p_company: string; p_since?: string };
        Returns: {
          campaign: string;
          channel: string;
          clicks: number;
          cost_per_lead_credits: number;
          cost_per_lead_gbp: number;
          customers: number;
          leads: number;
          spend_gbp: number;
        }[];
      };
      begin_chat_turn: { Args: { p_company: string; p_content: string }; Returns: string };
      capture_estimate: { Args: { p_duration_seconds?: number }; Returns: number };
      check_claims: { Args: { p_company: string; p_text: string }; Returns: Json };
      claim_agent_job: {
        Args: { p_job_types?: string[]; p_worker: string };
        Returns: {
          attempts: number;
          company_id: string;
          created_at: string;
          created_by: string | null;
          estimated_credits: number;
          finished_at: string | null;
          heartbeat_at: string | null;
          id: string;
          job_type: string;
          last_error: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          run_id: string | null;
          scheduled_for: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
          task_id: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "agent_jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_approval_execution: {
        Args: { p_worker: string };
        Returns: {
          action_type: Database["public"]["Enums"]["approval_action"];
          company_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          estimated_credits: number;
          executed_at: string | null;
          execution_attempts: number;
          execution_error: string | null;
          execution_result: Json | null;
          execution_run_id: string | null;
          execution_status: Database["public"]["Enums"]["execution_status"];
          id: string;
          original_payload: Json | null;
          payload: NonNullable<Json>;
          requested_by: string | null;
          run_id: string | null;
          status: Database["public"]["Enums"]["approval_status"];
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "approvals";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_commitment: {
        Args: { p_commitment: string; p_status?: string };
        Returns: undefined;
      };
      complete_task: { Args: { p_task: string }; Returns: undefined };
      create_capture: {
        Args: {
          p_audio_path?: string;
          p_company: string;
          p_consent: string;
          p_duration_seconds?: number;
          p_participants?: string[];
          p_source: string;
          p_text?: string;
          p_title?: string;
        };
        Returns: string;
      };
      create_company: {
        Args: {
          p_cohort_code?: string;
          p_customer_type: Database["public"]["Enums"]["customer_type"];
          p_description: string;
          p_entry_path?: Database["public"]["Enums"]["entry_path"];
          p_existing_website_url?: string;
          p_goal_90d?: string;
          p_google_business_url?: string;
          p_name: string;
          p_sector?: Database["public"]["Enums"]["sector_pack"];
          p_social_handles?: Json;
          p_starting_stage?: string;
          p_target_customer?: string;
        };
        Returns: string;
      };
      create_tracked_link: {
        Args: {
          p_campaign?: string;
          p_channel: string;
          p_company: string;
          p_content?: string;
          p_destination: string;
          p_label: string;
          p_medium?: string;
          p_spend_gbp?: number;
        };
        Returns: {
          archived: boolean;
          campaign: string;
          campaign_id: string | null;
          channel: string;
          code: string;
          company_id: string;
          content: string | null;
          created_at: string;
          created_by: string | null;
          created_by_sol: boolean;
          destination: string;
          id: string;
          label: string;
          medium: string;
          spend_gbp: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "tracked_links";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      credit_summary: { Args: { p_company: string }; Returns: Json };
      credits_for_usd: { Args: { p_cost_usd: number }; Returns: number };
      decide_approval: {
        Args: {
          p_approval: string;
          p_decision: Database["public"]["Enums"]["approval_status"];
          p_note?: string;
        };
        Returns: Database["public"]["Enums"]["approval_status"];
      };
      decide_extracted_item: {
        Args: { p_changes?: Json; p_decision: string; p_file_sensitive?: boolean; p_item: string };
        Returns: Json;
      };
      draft_outreach: {
        Args: { p_body: string; p_company: string; p_subject: string; p_to: string };
        Returns: string;
      };
      edit_approval: { Args: { p_approval: string; p_changes: Json }; Returns: Json };
      enqueue_job: {
        Args: {
          p_company: string;
          p_estimated_credits?: number;
          p_job_type: string;
          p_payload?: Json;
          p_task?: string;
        };
        Returns: string;
      };
      expire_credits: { Args: { p_at?: string }; Returns: number };
      follow_link: {
        Args: { p_code: string; p_country?: string; p_device?: string; p_referrer?: string };
        Returns: string;
      };
      get_form: { Args: { p_form: string }; Returns: Json };
      get_hub: { Args: { p_slug: string }; Returns: Json };
      get_public_progress: { Args: { p_slug: string }; Returns: Json };
      grant_credits: {
        Args: {
          p_amount: number;
          p_bucket: Database["public"]["Enums"]["credit_bucket"];
          p_cohort?: string;
          p_company: string;
          p_expires_at?: string;
          p_idempotency_key?: string;
          p_note: string;
        };
        Returns: string;
      };
      heartbeat_agent_job: { Args: { p_job: string; p_worker: string }; Returns: boolean };
      import_contacts: { Args: { p_company: string; p_rows: Json }; Returns: number };
      join_cohort: { Args: { p_code: string; p_company: string }; Returns: string };
      post_chat_message: { Args: { p_company: string; p_content: string }; Returns: string };
      propose_voice_profile: {
        Args: { p_company: string; p_profile: Json; p_run: string; p_source: string };
        Returns: string;
      };
      reap_stale_runs: { Args: { p_stale?: string }; Returns: number };
      record_consent: {
        Args: {
          p_basis?: string;
          p_contact: string;
          p_purpose: string;
          p_status: string;
          p_wording?: string;
        };
        Returns: undefined;
      };
      refund_run: { Args: { p_reason?: string; p_run: string }; Returns: number };
      release_hold: { Args: { p_note?: string; p_run: string }; Returns: number };
      request_ad_budget: {
        Args: { p_company: string; p_daily_budget: number; p_hard_cap: number };
        Returns: string;
      };
      reserve_credits: {
        Args: { p_amount: number; p_company: string; p_note?: string; p_run: string };
        Returns: number;
      };
      save_extraction: {
        Args: { p_capture: string; p_items: Json; p_run: string };
        Returns: number;
      };
      save_form: { Args: { p_form: string; p_patch: Json }; Returns: undefined };
      save_hub_page: { Args: { p_company: string; p_patch: Json }; Returns: undefined };
      save_transcript: {
        Args: { p_capture: string; p_provider: string; p_segments: Json; p_text: string };
        Returns: undefined;
      };
      save_voice_profile: { Args: { p_company: string; p_profile: Json }; Returns: string };
      set_idea_status: { Args: { p_idea: string; p_status: string }; Returns: undefined };
      set_lead_status: { Args: { p_lead: string; p_status: string }; Returns: undefined };
      set_response_policy: {
        Args: {
          p_category: string;
          p_company: string;
          p_mode: Database["public"]["Enums"]["response_mode"];
        };
        Returns: undefined;
      };
      settle_run: { Args: { p_cost_usd: number; p_note?: string; p_run: string }; Returns: number };
      settle_run_credits: {
        Args: { p_credits: number; p_note?: string; p_run: string };
        Returns: number;
      };
      share_extracted_item: { Args: { p_item: string; p_shared: boolean }; Returns: undefined };
      submit_lead: {
        Args: {
          p_email: string;
          p_form: string;
          p_link_code?: string;
          p_marketing?: boolean;
          p_message?: string;
          p_name: string;
          p_page?: string;
          p_phone?: string;
          p_trap?: string;
        };
        Returns: boolean;
      };
      update_capture_settings: {
        Args: { p_auto_accept?: boolean; p_company: string; p_keep_audio_days?: number };
        Returns: undefined;
      };
      update_response_settings: {
        Args: {
          p_company: string;
          p_disclosure_on_approved?: boolean;
          p_disclosure_text?: string;
          p_mark_reviewed?: boolean;
        };
        Returns: undefined;
      };
      update_tracked_link: {
        Args: { p_archived?: boolean; p_label?: string; p_link: string; p_spend_gbp?: number };
        Returns: undefined;
      };
      usd_for_credits: { Args: { p_credits: number }; Returns: number };
    };
    Enums: {
      approval_action:
        | "publish_post"
        | "send_email"
        | "ad_spend"
        | "file_document"
        | "publish_site"
        | "update_voice"
        | "update_memory";
      approval_status: "pending" | "approved" | "declined";
      assumption_status: "untested" | "testing" | "validated" | "invalidated";
      chat_sender: "founder" | "sol";
      company_plan: "starter" | "founder" | "growth";
      compliance_status: "done" | "in_progress" | "upcoming" | "overdue";
      contact_kind: "customer" | "lead";
      credit_bucket: "plan" | "cohort" | "topup";
      customer_type: "B2B" | "B2C";
      email_direction: "received" | "sent" | "draft";
      email_mode: "support" | "outreach";
      entry_path: "start_up" | "keep_going";
      evidence_type: "assumption" | "interview" | "waitlist" | "preorder";
      execution_status: "not_started" | "queued" | "executing" | "done" | "blocked" | "failed";
      gate_status: "locked" | "in_progress" | "ready" | "approved" | "imported";
      investor_stage:
        "researching" | "contacted" | "meeting" | "diligence" | "committed" | "passed";
      job_status: "queued" | "running" | "done" | "failed";
      ledger_entry_type: "grant" | "topup" | "hold" | "release" | "usage" | "refund" | "expiry";
      media_kind: "image" | "video";
      media_status: "generating" | "ready" | "failed";
      member_role: "founder" | "teammate" | "mentor" | "viewer";
      pillar: "build" | "grow" | "run" | "legal" | "raise";
      post_status: "draft" | "awaiting_approval" | "scheduled" | "published";
      response_mode: "auto_send" | "draft" | "escalate";
      routine_cadence: "daily" | "weekdays" | "weekly";
      run_status: "queued" | "running" | "succeeded" | "failed" | "needs_approval";
      sector_pack: "general" | "legal" | "finance" | "health" | "education";
      social_channel: "Instagram" | "TikTok" | "LinkedIn" | "X";
      stage: "idea" | "evidence" | "build" | "launch" | "grow";
      task_actor: "sol" | "founder" | "mentor" | "teammate";
      task_status: "todo" | "doing" | "done";
      voice_status: "proposed" | "approved" | "declined" | "superseded";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      approval_action: [
        "publish_post",
        "send_email",
        "ad_spend",
        "file_document",
        "publish_site",
        "update_voice",
        "update_memory",
      ],
      approval_status: ["pending", "approved", "declined"],
      assumption_status: ["untested", "testing", "validated", "invalidated"],
      chat_sender: ["founder", "sol"],
      company_plan: ["starter", "founder", "growth"],
      compliance_status: ["done", "in_progress", "upcoming", "overdue"],
      contact_kind: ["customer", "lead"],
      credit_bucket: ["plan", "cohort", "topup"],
      customer_type: ["B2B", "B2C"],
      email_direction: ["received", "sent", "draft"],
      email_mode: ["support", "outreach"],
      entry_path: ["start_up", "keep_going"],
      evidence_type: ["assumption", "interview", "waitlist", "preorder"],
      execution_status: ["not_started", "queued", "executing", "done", "blocked", "failed"],
      gate_status: ["locked", "in_progress", "ready", "approved", "imported"],
      investor_stage: ["researching", "contacted", "meeting", "diligence", "committed", "passed"],
      job_status: ["queued", "running", "done", "failed"],
      ledger_entry_type: ["grant", "topup", "hold", "release", "usage", "refund", "expiry"],
      media_kind: ["image", "video"],
      media_status: ["generating", "ready", "failed"],
      member_role: ["founder", "teammate", "mentor", "viewer"],
      pillar: ["build", "grow", "run", "legal", "raise"],
      post_status: ["draft", "awaiting_approval", "scheduled", "published"],
      response_mode: ["auto_send", "draft", "escalate"],
      routine_cadence: ["daily", "weekdays", "weekly"],
      run_status: ["queued", "running", "succeeded", "failed", "needs_approval"],
      sector_pack: ["general", "legal", "finance", "health", "education"],
      social_channel: ["Instagram", "TikTok", "LinkedIn", "X"],
      stage: ["idea", "evidence", "build", "launch", "grow"],
      task_actor: ["sol", "founder", "mentor", "teammate"],
      task_status: ["todo", "doing", "done"],
      voice_status: ["proposed", "approved", "declined", "superseded"],
    },
  },
} as const;
