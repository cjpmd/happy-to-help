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
          id: string;
          job_type: string;
          last_error: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
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
          id?: string;
          job_type: string;
          last_error?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
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
          id?: string;
          job_type?: string;
          last_error?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
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
          estimated_credits: number;
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
          estimated_credits?: number;
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
          estimated_credits?: number;
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
      companies: {
        Row: {
          activation_definition: string | null;
          channels: string[];
          created_at: string;
          created_by: string | null;
          customer_type: Database["public"]["Enums"]["customer_type"];
          description: string;
          existing_website_url: string | null;
          goal_90d: string | null;
          id: string;
          name: string;
          plan: Database["public"]["Enums"]["company_plan"];
          sector: Database["public"]["Enums"]["sector_pack"];
          slug: string;
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
          existing_website_url?: string | null;
          goal_90d?: string | null;
          id?: string;
          name: string;
          plan?: Database["public"]["Enums"]["company_plan"];
          sector?: Database["public"]["Enums"]["sector_pack"];
          slug: string;
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
          existing_website_url?: string | null;
          goal_90d?: string | null;
          id?: string;
          name?: string;
          plan?: Database["public"]["Enums"]["company_plan"];
          sector?: Database["public"]["Enums"]["sector_pack"];
          slug?: string;
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
      contacts: {
        Row: {
          company_id: string;
          created_at: string;
          email: string;
          id: string;
          kind: Database["public"]["Enums"]["contact_kind"];
          last_contact_at: string | null;
          name: string;
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
      credit_ledger: {
        Row: {
          amount: number;
          company_id: string;
          created_at: string;
          entry_type: Database["public"]["Enums"]["ledger_entry_type"];
          id: string;
          note: string;
          run_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          company_id: string;
          created_at?: string;
          entry_type: Database["public"]["Enums"]["ledger_entry_type"];
          id?: string;
          note?: string;
          run_id?: string | null;
        };
        Update: {
          amount?: number;
          company_id?: string;
          created_at?: string;
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"];
          id?: string;
          note?: string;
          run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "credit_ledger_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
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
          company_id: string;
          completed_at: string | null;
          created_at: string;
          due: string | null;
          estimated_credits: number;
          id: string;
          key: boolean;
          pillar: Database["public"]["Enums"]["pillar"];
          proof: Json | null;
          stage: Database["public"]["Enums"]["stage"] | null;
          status: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          actor?: Database["public"]["Enums"]["task_actor"];
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          due?: string | null;
          estimated_credits?: number;
          id?: string;
          key?: boolean;
          pillar: Database["public"]["Enums"]["pillar"];
          proof?: Json | null;
          stage?: Database["public"]["Enums"]["stage"] | null;
          status?: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          actor?: Database["public"]["Enums"]["task_actor"];
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          due?: string | null;
          estimated_credits?: number;
          id?: string;
          key?: boolean;
          pillar?: Database["public"]["Enums"]["pillar"];
          proof?: Json | null;
          stage?: Database["public"]["Enums"]["stage"] | null;
          status?: Database["public"]["Enums"]["task_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
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
    };
    Views: {
      company_credit_balance: {
        Row: {
          balance: number | null;
          company_id: string;
          held: number | null;
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
    };
    Functions: {
      accept_invites: { Args: Record<PropertyKey, never>; Returns: number };
      approve_gate: { Args: { p_gate: string }; Returns: Database["public"]["Enums"]["stage"] };
      ask_why: { Args: { p_approval: string }; Returns: undefined };
      check_claims: { Args: { p_company: string; p_text: string }; Returns: Json };
      complete_task: { Args: { p_task: string }; Returns: undefined };
      create_company: {
        Args: {
          p_cohort_code?: string;
          p_customer_type: Database["public"]["Enums"]["customer_type"];
          p_description: string;
          p_existing_website_url?: string;
          p_goal_90d?: string;
          p_name: string;
          p_sector?: Database["public"]["Enums"]["sector_pack"];
          p_starting_stage?: string;
          p_target_customer?: string;
        };
        Returns: string;
      };
      decide_approval: {
        Args: { p_approval: string; p_decision: Database["public"]["Enums"]["approval_status"] };
        Returns: Database["public"]["Enums"]["approval_status"];
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
      get_public_progress: { Args: { p_slug: string }; Returns: Json };
      join_cohort: { Args: { p_code: string; p_company: string }; Returns: string };
      post_chat_message: { Args: { p_company: string; p_content: string }; Returns: string };
      request_ad_budget: {
        Args: { p_company: string; p_daily_budget: number; p_hard_cap: number };
        Returns: string;
      };
    };
    Enums: {
      approval_action:
        "publish_post" | "send_email" | "ad_spend" | "file_document" | "publish_site";
      approval_status: "pending" | "approved" | "declined";
      assumption_status: "untested" | "testing" | "validated" | "invalidated";
      chat_sender: "founder" | "sol";
      company_plan: "starter" | "founder" | "growth";
      compliance_status: "done" | "in_progress" | "upcoming" | "overdue";
      contact_kind: "customer" | "lead";
      customer_type: "B2B" | "B2C";
      email_direction: "received" | "sent" | "draft";
      email_mode: "support" | "outreach";
      evidence_type: "assumption" | "interview" | "waitlist" | "preorder";
      gate_status: "locked" | "in_progress" | "ready" | "approved";
      investor_stage:
        "researching" | "contacted" | "meeting" | "diligence" | "committed" | "passed";
      job_status: "queued" | "running" | "done" | "failed";
      ledger_entry_type: "grant" | "topup" | "hold" | "release" | "usage" | "refund" | "expiry";
      media_kind: "image" | "video";
      media_status: "generating" | "ready" | "failed";
      member_role: "founder" | "teammate" | "mentor" | "viewer";
      pillar: "build" | "grow" | "run" | "legal" | "raise";
      post_status: "draft" | "awaiting_approval" | "scheduled" | "published";
      routine_cadence: "daily" | "weekdays" | "weekly";
      run_status: "queued" | "running" | "succeeded" | "failed" | "needs_approval";
      sector_pack: "general" | "legal" | "finance" | "health" | "education";
      social_channel: "Instagram" | "TikTok" | "LinkedIn" | "X";
      stage: "idea" | "evidence" | "build" | "launch" | "grow";
      task_actor: "sol" | "founder" | "mentor";
      task_status: "todo" | "doing" | "done";
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
      approval_action: ["publish_post", "send_email", "ad_spend", "file_document", "publish_site"],
      approval_status: ["pending", "approved", "declined"],
      assumption_status: ["untested", "testing", "validated", "invalidated"],
      chat_sender: ["founder", "sol"],
      company_plan: ["starter", "founder", "growth"],
      compliance_status: ["done", "in_progress", "upcoming", "overdue"],
      contact_kind: ["customer", "lead"],
      customer_type: ["B2B", "B2C"],
      email_direction: ["received", "sent", "draft"],
      email_mode: ["support", "outreach"],
      evidence_type: ["assumption", "interview", "waitlist", "preorder"],
      gate_status: ["locked", "in_progress", "ready", "approved"],
      investor_stage: ["researching", "contacted", "meeting", "diligence", "committed", "passed"],
      job_status: ["queued", "running", "done", "failed"],
      ledger_entry_type: ["grant", "topup", "hold", "release", "usage", "refund", "expiry"],
      media_kind: ["image", "video"],
      media_status: ["generating", "ready", "failed"],
      member_role: ["founder", "teammate", "mentor", "viewer"],
      pillar: ["build", "grow", "run", "legal", "raise"],
      post_status: ["draft", "awaiting_approval", "scheduled", "published"],
      routine_cadence: ["daily", "weekdays", "weekly"],
      run_status: ["queued", "running", "succeeded", "failed", "needs_approval"],
      sector_pack: ["general", "legal", "finance", "health", "education"],
      social_channel: ["Instagram", "TikTok", "LinkedIn", "X"],
      stage: ["idea", "evidence", "build", "launch", "grow"],
      task_actor: ["sol", "founder", "mentor"],
      task_status: ["todo", "doing", "done"],
    },
  },
} as const;
