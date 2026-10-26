import { createContext, useContext } from "react";
import type * as T from "./types";
import type { LayoutItem, Preferences, Routine, Sharing, WorkspaceDB } from "./workspace";
import { ACTION_COSTS, creditBalance } from "./credits";
import { checkClaims, unbuiltFeatures } from "./workspace";
import { solStatus } from "./mission";
import type { Theme, ThemePref } from "./theme";

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
};

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
