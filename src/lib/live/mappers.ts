// Turns Supabase rows into the store's shapes (src/lib/types.ts, src/lib/workspace.ts), so
// components work the same on the demo and live stores. Pure functions, tested in
// src/test/liveMappers.test.ts.
import type { Database, Tables } from "@/integrations/supabase/types";
import type * as T from "../types";
import type {
  AdAccount,
  CompanyDocument,
  EmailThread,
  ExtendedTask,
  LayoutItem,
  MediaAsset,
  Preferences,
  Proof,
  Routine,
  Sharing,
  TeamInvite,
} from "../workspace";
import { defaultPreferences, defaultSharing, isLayout } from "../workspace";
import type * as V from "../voicePolicy";
import type * as K from "../capture";
import type * as L from "../links";

type Row<K extends keyof Database["public"]["Tables"]> = Tables<K>;

const undef = <V>(v: V | null): V | undefined => (v === null ? undefined : v);

export function mapProfile(
  p: Row<"profiles">,
  opts: { mentor: boolean } = { mentor: false },
): T.Profile {
  return {
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    role: p.is_admin ? "admin" : opts.mentor ? "mentor" : "founder",
  };
}

export function mapCompany(c: Row<"companies">): T.Company {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    customer_type: c.customer_type,
    stage: c.stage,
    plan: c.plan,
    sector: c.sector,
    channels: c.channels,
    website_live_url: c.website_live_url,
    website_preview_url: c.website_preview_url,
    created_by: c.created_by ?? "",
    started_at: c.started_at,
    starting_stage: c.starting_stage,
    existing_website_url: c.existing_website_url,
    entry_path: c.entry_path,
    social_handles: c.social_handles as Record<string, string>,
    google_business_url: c.google_business_url,
    ...(c.target_customer ? { target_customer: c.target_customer } : {}),
    ...(c.goal_90d ? { goal_90d: c.goal_90d } : {}),
  };
}

export function mapGate(g: Row<"stage_gates">): T.StageGate {
  return {
    id: g.id,
    company_id: g.company_id,
    stage: g.stage,
    // jsonb array of { label, current, target }, checked by the column's constraint.
    criteria: g.criteria as unknown as T.GateCriterion[],
    status: g.status,
    approved_by: g.approved_by,
    approved_at: g.approved_at,
    target_date: g.target_date,
  };
}

export function mapEvidence(e: Row<"evidence_items">): T.EvidenceItem {
  return {
    id: e.id,
    company_id: e.company_id,
    type: e.type,
    title: e.title,
    data: e.data as Record<string, unknown>,
    status: e.status,
  };
}

export function mapTask(t: Row<"tasks">): ExtendedTask {
  return {
    id: t.id,
    company_id: t.company_id,
    pillar: t.pillar,
    title: t.title,
    status: t.status,
    estimated_credits: t.estimated_credits,
    key: t.key,
    actor: t.actor,
    completed_at: t.completed_at,
    ...(t.due ? { due: t.due } : {}),
    ...(t.stage ? { stage: t.stage } : {}),
    // jsonb { passed, total, screenshot, preview, pr }.
    ...(t.proof ? { proof: t.proof as unknown as Proof } : {}),
  };
}

export function mapRun(r: Row<"agent_runs">): T.AgentRun {
  return {
    id: r.id,
    company_id: r.company_id,
    task_id: r.task_id,
    task: r.task,
    pillar: r.pillar,
    model: r.model,
    status: r.status,
    started_at: r.started_at,
    finished_at: r.finished_at,
    cost_usd: Number(r.cost_usd),
    credits_charged: r.credits_charged,
    // jsonb written by the agent service in these shapes.
    usage: r.usage as unknown as T.AgentRun["usage"],
    steps: r.steps as unknown as T.RunStep[],
  };
}

export function mapApproval(a: Row<"approvals">): T.Approval {
  // The payload's shape depends on action_type (ApprovalPayloads); the agent and RPCs write it.
  return {
    id: a.id,
    company_id: a.company_id,
    run_id: a.run_id,
    action_type: a.action_type,
    payload: a.payload,
    estimated_credits: a.estimated_credits,
    status: a.status,
    decided_by: a.decided_by,
    decided_at: a.decided_at,
    created_at: a.created_at,
    requested_by: a.requested_by,
    execution_status: a.execution_status,
    execution_error: a.execution_error,
    executed_at: a.executed_at,
    decision_note: a.decision_note,
  } as unknown as T.Approval;
}

export function mapEvent(e: Row<"activity_events">): T.ActivityEvent {
  return {
    id: e.id,
    company_id: e.company_id,
    type: e.type,
    summary: e.summary,
    created_at: e.created_at,
  };
}

export function mapLedger(l: Row<"credit_ledger">): T.LedgerEntry {
  return {
    id: l.id,
    company_id: l.company_id,
    entry_type: l.entry_type,
    amount: l.amount,
    run_id: l.run_id,
    note: l.note,
    created_at: l.created_at,
  };
}

export function mapChat(m: Row<"chat_messages">): T.ChatMessage {
  return {
    id: m.id,
    company_id: m.company_id,
    sender: m.sender,
    content: m.content,
    created_at: m.created_at,
  };
}

export function mapComment(c: Row<"gate_comments">, authorName?: string | null): T.GateComment {
  return {
    id: c.id,
    company_id: c.company_id,
    author: authorName || "Someone",
    text: c.body,
    created_at: c.created_at,
  };
}

export function mapInvestor(i: Row<"investors">): T.Investor {
  return {
    id: i.id,
    company_id: i.company_id,
    name: i.name,
    firm: i.firm,
    stage: i.stage,
    notes: i.notes,
  };
}

export function mapPost(p: Row<"social_posts">): T.SocialPost {
  const metrics = p.metrics as { clicks?: number; signups?: number };
  return {
    id: p.id,
    company_id: p.company_id,
    channel: p.channel,
    text: p.text,
    angle: p.angle,
    status: p.status,
    scheduled_for: p.scheduled_for ?? p.created_at,
    metrics: { clicks: metrics.clicks ?? 0, signups: metrics.signups ?? 0 },
  };
}

export function mapCompliance(c: Row<"compliance_items">): T.ComplianceItem {
  return {
    id: c.id,
    company_id: c.company_id,
    title: c.title,
    category: c.category,
    due_date: c.due_date,
    status: c.status,
    statutory: c.statutory,
  };
}

export function mapMetrics(m: Row<"metrics_daily">): T.MetricsDaily {
  return {
    company_id: m.company_id,
    date: m.date,
    visitors: m.visitors,
    signups: m.signups,
    paying_customers: m.paying_customers,
    mrr: Number(m.mrr),
    activated: m.activated,
  };
}

export function mapContact(c: Row<"contacts">): T.Contact {
  return {
    id: c.id,
    company_id: c.company_id,
    name: c.name,
    email: c.email,
    kind: c.kind,
    value: c.value,
    last: c.last_contact_at ?? c.created_at,
    source: c.source,
  };
}

export function mapDocuments(
  docs: Row<"documents">[],
  versions: Row<"document_versions">[],
): CompanyDocument[] {
  return docs.map((d) => ({
    id: d.id,
    company_id: d.company_id,
    title: d.title,
    versions: versions
      .filter((v) => v.document_id === d.id)
      .sort((a, b) => a.version - b.version)
      .map((v) => ({ version: v.version, content: v.content, date: v.created_at })),
    // jsonb array of { title, complete } for the product roadmap.
    ...(d.outcomes ? { outcomes: d.outcomes as CompanyDocument["outcomes"] & object } : {}),
  }));
}

export function mapEmails(
  threads: Row<"email_threads">[],
  messages: Row<"email_messages">[],
): EmailThread[] {
  return threads.map((t) => ({
    id: t.id,
    company_id: t.company_id,
    subject: t.subject,
    name: t.contact_name,
    address: t.address,
    mode: t.mode,
    messages: messages
      .filter((m) => m.thread_id === t.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => ({
        // A draft is shown as Sol's side of the thread, marked as not sent in its text.
        direction: m.direction === "received" ? ("received" as const) : ("sent" as const),
        text: m.direction === "draft" ? `Draft only — not sent. ${m.body}` : m.body,
        date: m.created_at,
      })),
  }));
}

export function mapRoutine(r: Row<"routines">): Routine {
  return {
    id: r.id,
    company_id: r.company_id,
    title: r.title,
    cadence: r.cadence,
    credits: r.credits,
    enabled: r.enabled,
    job_type: r.job_type,
    run_at: r.run_at,
    last_run_at: r.last_run_at,
  };
}

export function mapMedia(m: Row<"media_assets">): MediaAsset {
  return {
    id: m.id,
    company_id: m.company_id,
    kind: m.kind,
    title: m.title,
    status: m.status,
    url: undef(m.url),
    reason: undef(m.reason),
  };
}

export function mapAd(a: Row<"ad_accounts">): AdAccount {
  return {
    company_id: a.company_id,
    status:
      a.status === "not_connected" ? "not_connected" : a.status === "demo" ? "demo" : "connected",
    daily_budget: Number(a.daily_budget),
    hard_cap: Number(a.hard_cap),
    spend: Number(a.spend),
    clicks: a.clicks,
    signups: a.signups,
  };
}

export function mapPreferences(p: Row<"user_preferences"> | undefined): Preferences {
  if (!p) return defaultPreferences();
  return {
    explanation: p.explanation === "more" ? "more" : "brief",
    adThreshold: p.ad_threshold,
    outreachThreshold: p.outreach_threshold,
    publishing: p.publishing,
    signupDrop: p.signup_drop,
    whatsapp: p.whatsapp,
    slack: p.slack,
  };
}

/** Preferences back into user_preferences columns, for an upsert. */
export function preferencesRow(p: Preferences) {
  return {
    explanation: p.explanation,
    ad_threshold: p.adThreshold,
    outreach_threshold: p.outreachThreshold,
    publishing: p.publishing,
    signup_drop: p.signupDrop,
    whatsapp: p.whatsapp,
    slack: p.slack,
  };
}

export function mapLayout(l: Row<"hq_layouts"> | undefined): LayoutItem[] | undefined {
  const value = l?.layout as unknown;
  return isLayout(value) ? value : undefined;
}

export function mapSharing(s: Row<"company_sharing"> | undefined): Sharing {
  if (!s) return defaultSharing();
  return {
    enabled: s.enabled,
    stage: s.stage,
    milestones: s.milestones,
    visitors: s.visitors,
    signups: s.signups,
    mrr: s.mrr,
  };
}

export function mapInvite(i: Row<"team_invites">): TeamInvite {
  return {
    id: i.id,
    company_id: i.company_id,
    email: i.email,
    role: i.role,
    status: i.status === "accepted" ? "active" : "invited",
  };
}

export function mapGrant(g: Row<"grants">): T.Grant {
  return {
    id: g.id,
    company_id: g.company_id,
    name: g.name,
    amount: g.amount,
    deadline: g.deadline,
    status: g.status,
  };
}

export function mapSiteVersion(v: Row<"site_versions">): T.SiteVersion {
  return {
    id: v.id,
    company_id: v.company_id,
    version: v.version,
    summary: v.summary,
    preview_url: v.preview_url,
    published_at: v.published_at,
  };
}

export function mapVoiceProfile(v: Row<"voice_profiles">): V.VoiceProfile {
  // Columns are checked by the table's constraints; the jsonb maps are { key: text }.
  return {
    id: v.id,
    company_id: v.company_id,
    version: v.version,
    status: v.status,
    source: v.source as V.VoiceSource,
    summary: v.summary,
    traits: v.traits,
    use_phrases: v.use_phrases,
    avoid_phrases: v.avoid_phrases,
    reading_level: v.reading_level as V.VoiceProfile["reading_level"],
    spelling: v.spelling === "US" ? "US" : "UK",
    sign_off: v.sign_off,
    emoji: v.emoji as V.VoiceProfile["emoji"],
    channel_variants: v.channel_variants as Record<string, string>,
    tone_rules: v.tone_rules as Record<string, string>,
    changes: v.changes,
    created_at: v.created_at,
  };
}

export function mapVoiceExample(e: Row<"voice_examples">): V.VoiceExample {
  return {
    id: e.id,
    company_id: e.company_id,
    situation: e.situation as V.Situation,
    channel: e.channel as V.VoiceExample["channel"],
    body: e.body,
    created_at: e.created_at,
  };
}

export function mapPolicy(p: Row<"response_policies">): V.ResponsePolicy {
  return { company_id: p.company_id, category: p.category as V.PolicyCategory, mode: p.mode };
}

export function mapResponseSettings(s: Row<"response_settings">): V.ResponseSettings {
  return {
    company_id: s.company_id,
    disclosure_text: s.disclosure_text,
    disclosure_on_approved: s.disclosure_on_approved,
    policy_reviewed_at: s.policy_reviewed_at,
    inbox_daily_cap: s.inbox_daily_cap,
  };
}

export function mapCapture(c: Row<"captures">): K.Capture {
  return {
    id: c.id,
    company_id: c.company_id,
    source: c.source as K.CaptureSource,
    title: c.title,
    participants: c.participants,
    status: c.status as K.CaptureStatus,
    duration_seconds: c.duration_seconds,
    created_by: c.created_by,
    created_at: c.created_at,
    error: c.error,
  };
}

export function mapItem(i: Row<"extracted_items">): K.ExtractedItem {
  // Text columns checked by the table's constraints.
  return {
    id: i.id,
    capture_id: i.capture_id,
    company_id: i.company_id,
    kind: i.kind as K.ItemKind,
    text: i.text,
    confidence: Number(i.confidence),
    status: i.status as K.ExtractedItem["status"],
    match_task_id: i.match_task_id,
    contact_id: i.contact_id,
    shared: i.shared,
    routed: i.routed as Record<string, unknown>,
    sensitive: i.sensitive,
    ...(i.owner ? { owner: i.owner as K.Owner } : {}),
    ...(i.owner_name ? { owner_name: i.owner_name } : {}),
    ...(i.due_date ? { due_date: i.due_date } : {}),
    ...(i.department ? { department: i.department } : {}),
    ...(i.contact_name ? { contact_name: i.contact_name } : {}),
    ...(i.quote ? { quote: i.quote } : {}),
    ...(i.at_seconds !== null ? { at_seconds: i.at_seconds } : {}),
  };
}

export function mapIdea(i: Row<"ideas">): K.Idea {
  return {
    id: i.id,
    company_id: i.company_id,
    title: i.title,
    status: i.status as K.Idea["status"],
    evidence_plan: i.evidence_plan,
    created_at: i.created_at,
  };
}

export function mapCommitment(c: Row<"commitments">): K.Commitment {
  return {
    id: c.id,
    company_id: c.company_id,
    to_name: c.to_name,
    contact_id: c.contact_id,
    what: c.what,
    due_date: c.due_date,
    status: c.status as K.Commitment["status"],
    followup_draft: c.followup_draft,
    created_at: c.created_at,
  };
}

export function mapHub(h: Row<"hub_pages">): L.HubPage {
  return {
    company_id: h.company_id,
    slug: h.slug,
    enabled: h.enabled,
    headline: h.headline,
    bio: h.bio,
    // jsonb array of { label, url }, checked by save_hub_page.
    links: h.links as unknown as L.HubLink[],
    show_form: h.show_form,
    show_socials: h.show_socials,
  };
}

export function mapForm(f: Row<"forms">): L.LeadForm {
  return {
    id: f.id,
    company_id: f.company_id,
    name: f.name,
    intro: f.intro,
    ask_phone: f.ask_phone,
    marketing_wording: f.marketing_wording,
    privacy_url: f.privacy_url,
    enabled: f.enabled,
  };
}

export function mapLink(l: Row<"tracked_links">): L.TrackedLink {
  return {
    id: l.id,
    company_id: l.company_id,
    code: l.code,
    destination: l.destination,
    label: l.label,
    channel: l.channel,
    medium: l.medium,
    campaign: l.campaign,
    content: l.content,
    spend_gbp: l.spend_gbp === null ? null : Number(l.spend_gbp),
    created_by_sol: l.created_by_sol,
    archived: l.archived,
    created_at: l.created_at,
  };
}

export function mapLead(l: Row<"leads">): L.Lead {
  return {
    id: l.id,
    company_id: l.company_id,
    contact_id: l.contact_id,
    link_id: l.link_id,
    channel: l.channel,
    campaign: l.campaign,
    message: l.message,
    status: l.status as L.Lead["status"],
    created_at: l.created_at,
  };
}
