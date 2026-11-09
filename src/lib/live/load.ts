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
  captures: async (sb) => {
    const [captures, items, ideas, commitments, settings] = await Promise.all([
      sb.from("captures").select("*").order("created_at", { ascending: false }).limit(RECENT),
      sb.from("extracted_items").select("*").order("created_at"),
      sb.from("ideas").select("*").order("created_at", { ascending: false }),
      sb.from("commitments").select("*").order("due_date"),
      sb
        .from("capture_settings")
        .select("company_id, keep_audio_days, auto_accept_own_notes, daily_minutes_cap"),
    ]);
    return {
      captures: must(captures, "meetings").map(M.mapCapture),
      extracted_items: must(items, "meeting items").map(M.mapItem),
      ideas: must(ideas, "ideas").map(M.mapIdea),
      commitments: must(commitments, "promises").map(M.mapCommitment),
      capture_settings: must(settings, "capture settings"),
    };
  },
  links: async (sb) => {
    const [hubs, forms, links, stats, leads, consents] = await Promise.all([
      sb.from("hub_pages").select("*"),
      sb.from("forms").select("*").order("created_at"),
      sb.from("tracked_links").select("*").order("created_at", { ascending: false }),
      sb.from("link_stats").select("link_id, clicks, clicks_7d, leads"),
      sb.from("leads").select("*").order("created_at", { ascending: false }).limit(RECENT),
      sb
        .from("current_consents")
        .select("contact_id, purpose, status, lawful_basis")
        .eq("channel", "email"),
    ]);
    return {
      hub_pages: must(hubs, "hub pages").map(M.mapHub),
      forms: must(forms, "forms").map(M.mapForm),
      tracked_links: must(links, "links").map(M.mapLink),
      link_stats: must(stats, "link stats").map((x) => ({
        link_id: x.link_id ?? "",
        clicks: Number(x.clicks ?? 0),
        clicks_7d: Number(x.clicks_7d ?? 0),
        leads: Number(x.leads ?? 0),
      })),
      leads: must(leads, "leads").map(M.mapLead),
      current_consents: must(consents, "consents").map((c) => ({
        contact_id: c.contact_id ?? "",
        purpose: c.purpose as "marketing" | "service",
        status: c.status as "granted" | "withdrawn" | "not_given",
        lawful_basis: c.lawful_basis,
      })),
    };
  },
  billing: async (sb) => {
    const [subs, settings, platform] = await Promise.all([
      sb
        .from("subscriptions")
        .select("company_id, status, plan, current_period_end, cancel_at_period_end"),
      sb.from("integration_settings").select("company_id, provider, enabled, config"),
      sb.from("platform_integrations").select("provider, configured"),
    ]);
    return {
      subscriptions: must(subs, "subscription"),
      // Providers and config keys are checked by set_integration.
      integration_settings: must(settings, "integrations") as unknown as DB["integration_settings"],
      platform_integrations: must(platform, "platform integrations"),
    };
  },
  automation: async (sb) => {
    const [sessions, automation, briefs] = await Promise.all([
      sb
        .from("auto_sessions")
        .select("id, company_id, started_at, ends_at, cap_credits, spent_credits, steps, status")
        .order("started_at", { ascending: false })
        .limit(20),
      sb
        .from("company_automation")
        .select("company_id, nightly_enabled, nightly_cap_credits, voice_review_enabled"),
      sb
        .from("briefs")
        .select("company_id, brief_date, content")
        .gte("brief_date", new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)),
    ]);
    return {
      // Statuses are checked by the table's constraint.
      auto_sessions: must(sessions, "Auto Mode") as DB["auto_sessions"],
      company_automation: must(automation, "automation"),
      briefs: must(briefs, "briefs"),
    };
  },
  inbox: async (sb) => ({
    // Statuses and modes are checked by the table's constraints.
    inbox_items: must(
      await sb
        .from("inbox_items")
        .select(
          "id, company_id, thread_id, channel, contact_id, status, category, sentiment, urgency, flags, mode, reason, approval_id, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(RECENT),
      "inbox",
    ) as unknown as DB["inbox_items"],
  }),
  campaigns: async (sb) => {
    const [campaigns, assets, results, ads] = await Promise.all([
      sb
        .from("campaigns")
        .select(
          "id, company_id, name, goal, metric, target, audience, channels, budget_credits, budget_gbp, starts_on, ends_on, status, plan, created_at",
        )
        .order("starts_on", { ascending: false }),
      sb
        .from("campaign_assets")
        .select(
          "id, campaign_id, company_id, kind, channel, title, body, scheduled_for, status, approval_id",
        )
        .order("scheduled_for"),
      sb.from("campaign_results").select("campaign_id, clicks, leads, customers"),
      sb
        .from("ad_campaigns")
        .select(
          "id, company_id, platform, name, creative, status, daily_budget, campaign_asset_id, link_id, spend, clicks, paused_reason, created_at",
        )
        .order("created_at", { ascending: false }),
    ]);
    return {
      // Statuses, kinds and metrics are checked by the tables' constraints.
      campaigns: must(campaigns, "campaigns") as unknown as DB["campaigns"],
      campaign_assets: must(assets, "campaign assets") as unknown as DB["campaign_assets"],
      campaign_results: must(results, "campaign results") as unknown as DB["campaign_results"],
      // Numbers arrive as strings for numeric columns.
      ad_campaigns: must(ads, "ads").map((a) => ({
        ...a,
        daily_budget: Number(a.daily_budget),
        spend: Number(a.spend),
      })) as DB["ad_campaigns"],
    };
  },
  capture2: async (sb) => {
    const [conns, events, numbers, calls] = await Promise.all([
      sb
        .from("calendar_connections")
        .select("id, company_id, user_id, provider, account_email, status, last_synced_at"),
      sb
        .from("calendar_events")
        .select(
          "id, company_id, connection_id, series_id, title, starts_at, ends_at, meeting_url, attendees, record, bot_status, bot_note, capture_id",
        )
        .gte("ends_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
        .order("starts_at")
        .limit(RECENT),
      sb
        .from("phone_numbers")
        .select("id, company_id, number, provider, forward_to, recording_notice")
        .eq("status", "active"),
      sb
        .from("call_sessions")
        .select(
          "id, company_id, direction, from_number, contact_id, status, duration_seconds, recorded, capture_id, started_at",
        )
        .order("started_at", { ascending: false })
        .limit(RECENT),
    ]);
    return {
      // Providers and statuses are checked by the tables' constraints.
      calendar_connections: must(conns, "calendars") as unknown as DB["calendar_connections"],
      calendar_events: must(events, "meetings") as unknown as DB["calendar_events"],
      phone_numbers: must(numbers, "phone numbers") as unknown as DB["phone_numbers"],
      call_sessions: must(calls, "calls") as unknown as DB["call_sessions"],
    };
  },
  crew: async (sb) => {
    const [catalogue, types, agents, autonomy] = await Promise.all([
      sb.from("agent_catalogue").select("*").order("sort"),
      sb.from("autonomy_action_types").select("*").order("key"),
      sb.from("agents").select("*").order("created_at"),
      sb.from("agent_autonomy").select("*"),
    ]);
    return {
      agent_catalogue: must(catalogue, "crew catalogue").map(M.mapCatalogueEntry),
      autonomy_action_types: must(types, "action types"),
      agents: must(agents, "crew").map(M.mapAgent),
      agent_autonomy: must(autonomy, "crew autonomy").map(M.mapAutonomy),
    };
  },
  bots: async (sb) => {
    const [templates, bots, runs] = await Promise.all([
      sb.from("bot_templates").select("*").order("sort"),
      sb
        .from("bots")
        .select(
          "id, company_id, template, name, enabled, trigger, conditions, steps, approval_level, approved_by, cap_credits_week, enabled_at",
        )
        .order("created_at"),
      sb
        .from("bot_runs")
        .select(
          "id, bot_id, company_id, contact_id, step, status, due_at, approval_id, reason, finished_at",
        )
        .order("due_at", { ascending: false })
        .limit(RECENT),
    ]);
    return {
      // Triggers, steps, levels and statuses are written by our RPCs and checked by constraints.
      bot_templates: must(templates, "bot templates") as unknown as DB["bot_templates"],
      bots: must(bots, "bots") as unknown as DB["bots"],
      bot_runs: must(runs, "bot runs") as unknown as DB["bot_runs"],
    };
  },
  listening: async (sb) => {
    const [settings, feedback, requests] = await Promise.all([
      sb.from("listening_settings").select("*"),
      sb
        .from("feedback")
        .select("id, company_id, contact_id, source, body, rating, sentiment, created_at")
        .order("created_at", { ascending: false })
        .limit(RECENT),
      sb
        .from("feedback_requests")
        .select("id, company_id, contact_id, trigger, status, created_at, responded_at")
        .order("created_at", { ascending: false })
        .limit(RECENT),
    ]);
    return {
      listening_settings: must(settings, "listening settings").map((s) => ({
        company_id: s.company_id,
        social_comments: s.social_comments,
        reviews: s.reviews,
        feedback_requests: s.feedback_requests,
        feedback_delay_days: s.feedback_delay_days,
        last_synced_at: s.last_synced_at,
      })),
      // Sources, sentiments, triggers and statuses are checked by the tables' constraints.
      feedback: must(feedback, "feedback") as unknown as DB["feedback"],
      feedback_requests: must(requests, "feedback requests") as unknown as DB["feedback_requests"],
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
  captures: "captures",
  extracted_items: "captures",
  commitments: "captures",
  leads: "links",
  tracked_links: "links",
  subscriptions: "billing",
  integration_settings: "billing",
  auto_sessions: "automation",
  briefs: "automation",
  inbox_items: "inbox",
  campaigns: "campaigns",
  campaign_assets: "campaigns",
  listening_settings: "listening",
  feedback: "listening",
  bots: "bots",
  agents: "crew",
  agent_autonomy: "crew",
  calendar_events: "capture2",
  ad_campaigns: "campaigns",
  call_sessions: "capture2",
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
    captures: [],
    extracted_items: [],
    ideas: [],
    commitments: [],
    capture_settings: [],
    hub_pages: [],
    forms: [],
    tracked_links: [],
    link_stats: [],
    leads: [],
    current_consents: [],
    subscriptions: [],
    integration_settings: [],
    platform_integrations: [],
    auto_sessions: [],
    company_automation: [],
    briefs: [],
    inbox_items: [],
    campaigns: [],
    campaign_assets: [],
    campaign_results: [],
    listening_settings: [],
    feedback: [],
    feedback_requests: [],
    bot_templates: [],
    bots: [],
    agent_catalogue: [],
    autonomy_action_types: [],
    agents: [],
    agent_autonomy: [],
    bot_runs: [],
    calendar_connections: [],
    calendar_events: [],
    phone_numbers: [],
    call_sessions: [],
    ad_campaigns: [],
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
