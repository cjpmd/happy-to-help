import { createContext, useContext } from "react";
import type * as T from "./types";
import type { LayoutItem, Preferences, Routine, Sharing, WorkspaceDB } from "./workspace";
import { ACTION_COSTS, creditBalance } from "./credits";
import { checkClaims, unbuiltFeatures } from "./workspace";
import { solStatus } from "./mission";
import type { Theme, ThemePref } from "./theme";
import type * as V from "./voicePolicy";
import type * as K from "./capture";
import type * as L from "./links";

/**
 * The app's data, shaped like the Supabase tables. Two providers fill it: the demo store
 * (src/lib/store.tsx, in memory, seeded from src/lib/seed.ts) and the live store
 * (src/lib/live/LiveStoreProvider.tsx, Supabase with Realtime). Components only use the
 * hooks below, so they work the same on either.
 */
export type DB = WorkspaceDB & {
  profiles: T.Profile[];
  companies: T.Company[];
  approvals: T.Approval[];
  agent_runs: T.AgentRun[];
  activity_events: T.ActivityEvent[];
  credit_ledger: T.LedgerEntry[];
  chat_messages: T.ChatMessage[];
  stage_gates: T.StageGate[];
  investors: T.Investor[];
  gate_comments: T.GateComment[];
  company_members: T.CompanyMember[];
  evidence_items: T.EvidenceItem[];
  social_posts: T.SocialPost[];
  compliance_items: T.ComplianceItem[];
  metrics_daily: T.MetricsDaily[];
  contacts: T.Contact[];
  grants: T.Grant[];
  site_versions: T.SiteVersion[];
  cohorts: T.Cohort[];
  cohort_companies: T.CohortCompany[];
  cohort_mentors: T.CohortMentor[];
  /** Credit estimates per job type (the job_types table). */
  job_types: JobType[];
  /** Brand voice and response policy (SPEC part G). */
  voice_profiles: V.VoiceProfile[];
  voice_examples: V.VoiceExample[];
  response_policies: V.ResponsePolicy[];
  response_settings: V.ResponseSettings[];
  /** Capture from conversation (SPEC part P). Transcripts load on demand. */
  captures: K.Capture[];
  extracted_items: K.ExtractedItem[];
  ideas: K.Idea[];
  commitments: K.Commitment[];
  capture_settings: CaptureSettings[];
  /** The link layer (SPEC part H). */
  hub_pages: L.HubPage[];
  forms: L.LeadForm[];
  tracked_links: L.TrackedLink[];
  link_stats: L.LinkStat[];
  leads: L.Lead[];
  current_consents: L.ConsentState[];
  /** The company's Stripe subscription, if any (Phase 6). */
  subscriptions: Subscription[];
  /** Per-company provider switches, and what the platform has set up (Phase 7). */
  integration_settings: IntegrationSetting[];
  platform_integrations: { provider: string; configured: boolean }[];
};

export type IntegrationProvider = "resend" | "ayrshare" | "posthog";
export interface IntegrationSetting {
  company_id: string;
  provider: IntegrationProvider;
  enabled: boolean;
  config: { from_name?: string; reply_to?: string };
}

export interface Subscription {
  company_id: string;
  status: string;
  plan: T.Plan | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface CaptureSettings {
  company_id: string;
  keep_audio_days: number;
  auto_accept_own_notes: boolean;
}

export interface NewCapture {
  companyId: string;
  source: K.CaptureSource;
  /** Notes and debriefs are the founder's own voice; meetings need everyone to have known. */
  consent: "own_voice" | "participants_informed" | "platform_transcript";
  title?: string;
  text?: string;
  audio?: Blob;
  durationSeconds?: number;
  participants?: string[];
}

export interface ItemChanges {
  text?: string;
  owner?: K.Owner;
  owner_id?: string;
  owner_name?: string;
  due_date?: string;
  department?: K.Department;
}

export interface JobType {
  job_type: string;
  label: string;
  estimate_credits: number;
  cap_credits: number;
}

export type NewCompany = Omit<
  T.Company,
  "id" | "slug" | "stage" | "website_live_url" | "website_preview_url" | "plan" | "created_by"
> & { cohort_code?: string | undefined };

export interface ContactRow {
  name: string;
  email: string;
  kind: "customer" | "lead";
  value: string;
}

export interface Ctx {
  /** demo: in-memory store; live: Supabase. */
  mode: "demo" | "live";
  /** Live mode only waits for the session; demo is always signed in. */
  auth: "loading" | "signed_out" | "signed_in";
  /** True until the first load of the signed-in user's data finishes. */
  loading: boolean;
  /** "Now" for anything date-relative: the seed's fixed clock in demo mode, the real time live. */
  now: Date;
  db: DB;
  user: T.Profile;
  /** Demo only: switch to another seeded person. */
  setUserId: (id: string) => void;
  companyId: string;
  setCompanyId: (id: string) => void;
  /** Sends a magic link. Resolves to an error message, or null when sent. */
  signIn: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  solTyping: boolean;
  /** Sol's reply while it streams in (live chat). */
  chatDraft: { companyId: string; text: string } | null;
  /** Each action resolves to true when it happened; on failure it has already told the user why. */
  decideApproval: (id: string, status: "approved" | "declined") => Promise<boolean>;
  editApproval: (id: string, changes: Record<string, string>) => Promise<boolean>;
  askWhy: (id: string) => Promise<void>;
  sendChat: (companyId: string, text: string) => Promise<void>;
  approveGate: (gateId: string) => Promise<boolean>;
  addComment: (companyId: string, text: string) => Promise<boolean>;
  moveInvestor: (id: string, stage: T.InvestorStage) => Promise<boolean>;
  /** Resolves to the new company's id, or null if it couldn't be created. */
  createCompany: (c: NewCompany) => Promise<string | null>;
  /** The theme on screen, resolved from the preference. */
  theme: Theme;
  /** Light (default), dark, or match the system. */
  themePref: ThemePref;
  setThemePref: (pref: ThemePref) => void;
  /** Switches to the opposite of what's on screen (an explicit light or dark). */
  toggleTheme: () => void;
  work: (
    cid: string,
    title: string,
    cost: number,
    kind?: string,
    target?: string,
  ) => Promise<boolean>;
  saveLayout: (layout: LayoutItem[]) => void;
  updatePreferences: (patch: Partial<Preferences>) => void;
  updateSharing: (patch: Partial<Sharing>) => void;
  addRoutine: (title: string, cadence: Routine["cadence"], credits: number) => Promise<boolean>;
  toggleRoutine: (id: string) => Promise<boolean>;
  proposeBudget: (budget: number, cap: number) => Promise<boolean>;
  draftOutreach: (body: string, recipients: string) => Promise<boolean>;
  invite: (email: string, role: T.CompanyMember["role"]) => Promise<boolean>;
  markDone: (id: string) => Promise<boolean>;
  stopAuto: () => void;
  /** Adds contacts from a CSV, skipping emails already known. Resolves to how many were added. */
  importContacts: (companyId: string, rows: ContactRow[]) => Promise<number | null>;
  /** Saves website copy or past emails for the voice analysis. */
  addVoiceSource: (
    companyId: string,
    kind: "website" | "email" | "post" | "other",
    content: string,
  ) => Promise<boolean>;
  /** Asks Sol to propose a voice from the company's writing (an update_voice approval). */
  learnVoice: (companyId: string) => Promise<boolean>;
  /** A founder's direct change to the voice: a new approved version. */
  saveVoiceProfile: (companyId: string, edit: V.VoiceEdit) => Promise<boolean>;
  addVoiceExample: (companyId: string, situation: V.Situation, body: string) => Promise<boolean>;
  removeVoiceExample: (id: string) => Promise<boolean>;
  setResponsePolicy: (
    companyId: string,
    category: V.PolicyCategory,
    mode: V.ResponseMode,
  ) => Promise<boolean>;
  updateResponseSettings: (
    companyId: string,
    patch: { disclosure_text?: string; disclosure_on_approved?: boolean; mark_reviewed?: boolean },
  ) => Promise<boolean>;
  /** Resolves to the new capture's id, or null. */
  createCapture: (c: NewCapture) => Promise<string | null>;
  decideItem: (
    id: string,
    decision: "accept" | "dismiss",
    changes?: ItemChanges,
    fileSensitive?: boolean,
  ) => Promise<boolean>;
  /** Resolves to how many were accepted, or null. */
  acceptAllItems: (captureId: string) => Promise<number | null>;
  shareItem: (id: string, shared: boolean) => Promise<boolean>;
  updateCaptureSettings: (
    companyId: string,
    patch: { keep_audio_days?: number; auto_accept_own_notes?: boolean },
  ) => Promise<boolean>;
  setIdeaStatus: (id: string, status: K.Idea["status"]) => Promise<boolean>;
  completeCommitment: (id: string, status?: "done" | "cancelled") => Promise<boolean>;
  /** Credits a capture will cost: extraction plus transcription by the started minute. */
  estimateCapture: (durationSeconds?: number) => Promise<number>;
  /** Resolves to the new link, or null. */
  createLink: (companyId: string, link: L.NewLink) => Promise<L.TrackedLink | null>;
  updateLink: (
    id: string,
    patch: { label?: string; spend_gbp?: number; archived?: boolean },
  ) => Promise<boolean>;
  /** Publishing the hub page is public, so only founders can. */
  saveHubPage: (
    companyId: string,
    patch: Partial<Omit<L.HubPage, "company_id">>,
  ) => Promise<boolean>;
  saveForm: (id: string, patch: Partial<Omit<L.LeadForm, "id" | "company_id">>) => Promise<boolean>;
  setLeadStatus: (id: string, status: L.Lead["status"]) => Promise<boolean>;
  /** Records that someone opted out of marketing. */
  withdrawMarketing: (contactId: string) => Promise<boolean>;
  /** Public pages (anyone, signed in or not). */
  fetchHub: (slug: string) => Promise<L.PublicHub | null>;
  fetchForm: (id: string) => Promise<L.PublicForm | null>;
  submitLead: (s: L.LeadSubmission) => Promise<boolean>;
  /** Logs a short-link click and resolves to where it goes. */
  followLink: (code: string) => Promise<string | null>;
  /** A founder switches a provider on or off for their company. */
  setIntegration: (
    companyId: string,
    provider: IntegrationProvider,
    enabled: boolean,
    config?: IntegrationSetting["config"],
  ) => Promise<boolean>;
  /** Where short links are served. */
  shortLinkBase: string;
  /** The transcript of a capture (founders and teammates only). */
  loadTranscript: (captureId: string) => Promise<string | null>;
}

export const StoreCtx = createContext<Ctx | null>(null);

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside StoreProvider");
  return c;
}

/** The company with this id, or the selected one. Undefined only before any company exists. */
export function useMaybeCompany(id?: string) {
  const { db, companyId } = useStore();
  const cid = id ?? companyId;
  return db.companies.find((c) => c.id === cid) ?? db.companies[0];
}

export function useCompany(id?: string) {
  const c = useMaybeCompany(id);
  if (!c) throw new Error("No companies");
  return c;
}

/** Companies the user is a member of (not ones they only oversee as a cohort mentor). */
export function useMyCompanies() {
  const { db, user } = useStore();
  const ids = new Set(
    db.company_members.filter((m) => m.user_id === user.id).map((m) => m.company_id),
  );
  return db.companies.filter((c) => ids.has(c.id));
}

/** The user's role in a company: their membership, or mentor for a cohort they mentor. */
export function useCompanyRole(id?: string): T.CompanyMember["role"] | "admin" | null {
  const { db, user, companyId } = useStore();
  const cid = id ?? companyId;
  const member = db.company_members.find((m) => m.company_id === cid && m.user_id === user.id);
  if (member) return member.role;
  const cohort = db.cohort_companies.find((c) => c.company_id === cid)?.cohort_id;
  if (cohort && db.cohort_mentors.some((m) => m.cohort_id === cohort && m.user_id === user.id))
    return "mentor";
  return user.role === "admin" ? "admin" : null;
}

export function useBalance(id?: string) {
  const { db, companyId } = useStore();
  return creditBalance(db.credit_ledger, id ?? companyId);
}

export function useSolStatus(id?: string) {
  const { db, companyId, solTyping } = useStore();
  return solStatus({
    companyId: id ?? companyId,
    runs: db.agent_runs,
    approvals: db.approvals,
    events: db.activity_events,
    solTyping,
  });
}

export function labelFor(a: T.Approval) {
  switch (a.action_type) {
    case "publish_post":
      return `${a.payload.channel} post`;
    case "send_email":
      return `email "${a.payload.subject}"`;
    case "ad_spend":
      return `£${a.payload.amount_gbp} ${a.payload.platform} ad spend`;
    case "file_document":
      return `filing: ${a.payload.document}`;
    case "publish_site":
      return `site change: ${a.payload.change}`;
    case "update_voice":
      return `brand voice v${a.payload.version}`;
    case "update_memory":
      return `memory: ${a.payload.fact}`;
  }
}

/**
 * The claims check for a company's public text: its sector's rules plus the features on its
 * roadmap that aren't built yet. Always pass the company the text belongs to (bug B4).
 */
export function useClaimsCheck(companyId?: string) {
  const { db, companyId: selected } = useStore();
  const cid = companyId ?? selected;
  const sector = db.companies.find((c) => c.id === cid)?.sector;
  const unbuilt = unbuiltFeatures(db.documents, cid);
  return (text: string) => checkClaims(text, sector, unbuilt);
}

/** What the UI calls each kind of work, and the job type that does it. */
export const WORK_KINDS = {
  chat: "chat",
  social: "social_post",
  email: "email_reply",
  image: "media_image",
  video: "media_video",
  document: "document_update",
  task: "task",
  autoHour: "auto_mode",
  voice: "voice_analysis",
  capture: "capture_process",
} as const;
export type WorkKind = keyof typeof WORK_KINDS;

/** The demo's job estimates, from the same constants the demo has always used. */
export function demoJobTypes(): JobType[] {
  const est: Record<WorkKind, number> = {
    chat: ACTION_COSTS.chat,
    social: ACTION_COSTS.social,
    email: ACTION_COSTS.email,
    image: ACTION_COSTS.image,
    video: ACTION_COSTS.video,
    document: ACTION_COSTS.document,
    task: 150,
    autoHour: ACTION_COSTS.autoHour,
    voice: 150,
    capture: 40,
  };
  return (Object.keys(WORK_KINDS) as WorkKind[]).map((k) => ({
    job_type: WORK_KINDS[k],
    label: k,
    estimate_credits: est[k],
    cap_credits: est[k] * 3,
  }));
}

/** "≈ N credits" for a kind of work, before it runs (SPEC B4). */
export function useEstimate(kind: WorkKind): number {
  const { db } = useStore();
  const jt = db.job_types.find((j) => j.job_type === WORK_KINDS[kind]);
  return (
    jt?.estimate_credits ??
    demoJobTypes().find((j) => j.job_type === WORK_KINDS[kind])!.estimate_credits
  );
}

/** A person's name from their id, for "decided by" and comments. */
export function personName(db: Pick<DB, "profiles">, id: string | null | undefined) {
  if (!id) return "";
  return db.profiles.find((p) => p.id === id)?.full_name ?? "Someone";
}
