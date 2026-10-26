// Loads the signed-in user's data from Supabase into the store's shape. Row-level security
// decides which rows come back: the user's companies, and their cohort's companies for
// mentors. Each group can be reloaded on its own when Realtime reports a change.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { DB } from "../storeContext";
import * as M from "./mappers";

type Client = SupabaseClient<Database>;
type Loader = (sb: Client, userId: string) => Promise<Partial<DB>>;

/** How many of the newest rows to load from the long, append-only tables. */
const RECENT = 500;

function must<D>(res: { data: D | null; error: { message: string } | null }, what: string): D {
  if (res.error) throw new Error(`Couldn't load ${what}: ${res.error.message}`);
  return res.data as D;
}

export const loaders = {
  people: async (sb, userId) => {
    const [profiles, companies, members, cohorts, cohortCompanies, cohortMentors] =
      await Promise.all([
        sb.from("profiles").select("*"),
        sb.from("companies").select("*").order("created_at"),
        sb.from("company_members").select("*"),
        sb.from("cohorts").select("id, name, institution, credit_pool"),
        sb.from("cohort_companies").select("*"),
        sb.from("cohort_mentors").select("*"),
      ]);
    const memberRows = must(members, "memberships");
    const mentorRows = must(cohortMentors, "cohort mentors");
    const isMentor = (id: string) =>
      mentorRows.some((m) => m.user_id === id) ||
      memberRows.some((m) => m.user_id === id && m.role === "mentor");
    void userId;
    return {
      profiles: must(profiles, "people").map((p) => M.mapProfile(p, { mentor: isMentor(p.id) })),
      companies: must(companies, "companies").map(M.mapCompany),
      company_members: memberRows.map((m) => ({
        company_id: m.company_id,
        user_id: m.user_id,
        role: m.role,
      })),
      cohorts: must(cohorts, "cohorts"),
      cohort_companies: must(cohortCompanies, "cohort places").map((c) => ({
        cohort_id: c.cohort_id,
        company_id: c.company_id,
        credit_cap: c.credit_cap,
      })),
      cohort_mentors: mentorRows.map((m) => ({ cohort_id: m.cohort_id, user_id: m.user_id })),
    };
  },
  stage_gates: async (sb) => ({
    stage_gates: must(await sb.from("stage_gates").select("*"), "gates").map(M.mapGate),
  }),
  gate_comments: async (sb) => ({
    gate_comments: must(
      await sb.from("gate_comments").select("*, author:profiles(full_name)").order("created_at"),
      "comments",
    ).map((c) => M.mapComment(c, c.author?.full_name)),
  }),
  evidence_items: async (sb) => ({
    evidence_items: must(await sb.from("evidence_items").select("*"), "evidence").map(
      M.mapEvidence,
    ),
  }),
  tasks: async (sb) => ({
    tasks: must(await sb.from("tasks").select("*").order("created_at"), "tasks").map(M.mapTask),
  }),
  agent_runs: async (sb) => ({
    agent_runs: must(
      await sb
        .from("agent_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(RECENT),
      "runs",
    ).map(M.mapRun),
  }),
  approvals: async (sb) => ({
    approvals: must(
      await sb.from("approvals").select("*").order("created_at", { ascending: false }),
      "approvals",
    ).map(M.mapApproval),
  }),
  activity_events: async (sb) => ({
    activity_events: must(
      await sb
        .from("activity_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(RECENT),
      "activity",
    ).map(M.mapEvent),
  }),
  credit_ledger: async (sb) => ({
    credit_ledger: must(
      await sb.from("credit_ledger").select("*").order("created_at"),
      "ledger",
    ).map(M.mapLedger),
  }),
  chat_messages: async (sb) => ({
    chat_messages: must(
      await sb
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(RECENT),
      "chat",
    )
      .map(M.mapChat)
      .reverse(),
  }),
  job_types: async (sb) => ({
    job_types: must(
      await sb.from("job_types").select("job_type, label, estimate_credits, cap_credits"),
      "job estimates",
    ),
  }),
  investors: async (sb) => ({
    investors: must(await sb.from("investors").select("*").order("created_at"), "investors").map(
      M.mapInvestor,
    ),
  }),
  social_posts: async (sb) => ({
    social_posts: must(await sb.from("social_posts").select("*"), "posts").map(M.mapPost),
  }),
  compliance_items: async (sb) => ({
    compliance_items: must(await sb.from("compliance_items").select("*"), "compliance").map(
      M.mapCompliance,
    ),
  }),
  metrics_daily: async (sb) => ({
    metrics_daily: must(
      await sb
        .from("metrics_daily")
        .select("*")
        .gte("date", new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10))
        .order("date"),
      "metrics",
    ).map(M.mapMetrics),
  }),
  contacts: async (sb) => ({
    contacts: must(await sb.from("contacts").select("*"), "contacts").map(M.mapContact),
  }),
  grants: async (sb) => ({
    grants: must(await sb.from("grants").select("*"), "grants").map(M.mapGrant),
  }),
  site_versions: async (sb) => ({
    site_versions: must(
      await sb.from("site_versions").select("*").order("published_at", { ascending: false }),
      "site versions",
    ).map(M.mapSiteVersion),
  }),
  documents: async (sb) => {
    const [docs, versions] = await Promise.all([
      sb.from("documents").select("*").order("created_at"),
      sb.from("document_versions").select("*"),
    ]);
    return { documents: M.mapDocuments(must(docs, "documents"), must(versions, "versions")) };
  },
  emails: async (sb) => {
    const [threads, messages] = await Promise.all([
      sb.from("email_threads").select("*").order("created_at", { ascending: false }),
      sb.from("email_messages").select("*"),
    ]);
    return { emails: M.mapEmails(must(threads, "email"), must(messages, "email messages")) };
  },
  routines: async (sb) => ({
    routines: must(await sb.from("routines").select("*").order("created_at"), "routines").map(
      M.mapRoutine,
    ),
  }),
  media: async (sb) => ({
    media: must(
      await sb.from("media_assets").select("*").order("created_at", { ascending: false }),
      "media",
    ).map(M.mapMedia),
  }),
  ads: async (sb) => ({
    ads: must(await sb.from("ad_accounts").select("*"), "ads").map(M.mapAd),
  }),
  voice: async (sb) => {
    const [profiles, examples, policies, settings] = await Promise.all([
      sb.from("voice_profiles").select("*").order("version"),
      sb.from("voice_examples").select("*").order("created_at"),
      sb.from("response_policies").select("*"),
      sb.from("response_settings").select("*"),
    ]);
    return {
      voice_profiles: must(profiles, "voice").map(M.mapVoiceProfile),
      voice_examples: must(examples, "voice examples").map(M.mapVoiceExample),
      response_policies: must(policies, "reply policy").map(M.mapPolicy),
      response_settings: must(settings, "reply settings").map(M.mapResponseSettings),
    };
  },
  settings: async (sb, userId) => {
    const [prefs, layout, sharing, invites] = await Promise.all([
      sb.from("user_preferences").select("*").maybeSingle(),
      sb.from("hq_layouts").select("*").maybeSingle(),
      sb.from("company_sharing").select("*"),
      sb.from("team_invites").select("*").order("created_at"),
    ]);
    const savedLayout = M.mapLayout(must(layout, "layout") ?? undefined);
    return {
      preferences: { [userId]: M.mapPreferences(must(prefs, "preferences") ?? undefined) },
      layouts: savedLayout ? { [userId]: savedLayout } : {},
      sharing: Object.fromEntries(
        must(sharing, "sharing").map((s) => [s.company_id, M.mapSharing(s)]),
      ),
      team: must(invites, "invites").map(M.mapInvite),
    };
  },
} satisfies Record<string, Loader>;

export type Group = keyof typeof loaders;

/** Which group to reload when Realtime reports a change to a table. */
export const TABLE_GROUPS: Partial<Record<keyof Database["public"]["Tables"], Group>> = {
  companies: "people",
  approvals: "approvals",
  agent_jobs: "agent_runs",
  agent_runs: "agent_runs",
  activity_events: "activity_events",
  chat_messages: "chat_messages",
  credit_ledger: "credit_ledger",
  tasks: "tasks",
  stage_gates: "stage_gates",
  social_posts: "social_posts",
  media_assets: "media",
  document_versions: "documents",
  email_messages: "emails",
  job_types: "job_types",
  voice_profiles: "voice",
  response_policies: "voice",
};

export async function loadGroups(sb: Client, userId: string, groups: Group[]) {
  const parts = await Promise.all(groups.map((g) => loaders[g](sb, userId)));
  return Object.assign({}, ...parts) as Partial<DB>;
}

export const ALL_GROUPS = Object.keys(loaders) as Group[];

/** The store before anything has loaded. */
export function emptyDb(): DB {
  return {
    profiles: [],
    companies: [],
    approvals: [],
    agent_runs: [],
    activity_events: [],
    credit_ledger: [],
    chat_messages: [],
    stage_gates: [],
    investors: [],
    gate_comments: [],
    company_members: [],
    evidence_items: [],
    social_posts: [],
    compliance_items: [],
    metrics_daily: [],
    contacts: [],
    grants: [],
    site_versions: [],
    cohorts: [],
    cohort_companies: [],
    cohort_mentors: [],
    job_types: [],
    voice_profiles: [],
    voice_examples: [],
    response_policies: [],
    response_settings: [],
    routines: [],
    documents: [],
    media: [],
    emails: [],
    ads: [],
    tasks: [],
    layouts: {},
    preferences: {},
    sharing: {},
    team: [],
  };
}
