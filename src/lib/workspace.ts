import type { Company, Task } from "./types";
/** The HQ grid's cards (docs/DESIGN.md section 4). Founders can hide and reorder them. */
export const WIDGETS = [
  "GO / NO-GO",
  "Telemetry",
  "Vehicle",
  "Channels",
  "Overnight burn",
  "Next windows",
  "Evidence",
  "Leads",
  "Inbox",
  "Response times",
  "Campaigns",
] as const;
export type Widget = (typeof WIDGETS)[number];
export type Sector = "general" | "legal" | "finance" | "health" | "education";
export interface LayoutItem {
  id: Widget;
  visible: boolean;
}
/**
 * The six cards a company's HQ starts with (Phase 10): Start up companies proving demand see
 * their evidence; once building, the vehicle; Keep going companies see leads, campaigns, the
 * inbox and response times.
 */
export function dashboardCards(company?: Pick<Company, "entry_path" | "stage">): Widget[] {
  if (company?.entry_path === "keep_going")
    return ["GO / NO-GO", "Leads", "Inbox", "Response times", "Campaigns", "Telemetry"];
  if (company && (company.stage === "idea" || company.stage === "evidence"))
    return ["GO / NO-GO", "Evidence", "Telemetry", "Channels", "Overnight burn", "Next windows"];
  return ["GO / NO-GO", "Telemetry", "Vehicle", "Channels", "Overnight burn", "Next windows"];
}
export const defaultLayout = (company?: Pick<Company, "entry_path" | "stage">): LayoutItem[] =>
  dashboardCards(company).map((id) => ({ id, visible: true }));

/** A saved layout, if it has exactly this company's cards; otherwise the company's default. */
export function layoutFor(
  saved: LayoutItem[] | undefined,
  company?: Pick<Company, "entry_path" | "stage">,
): LayoutItem[] {
  const ids = dashboardCards(company);
  if (saved && saved.length === ids.length && saved.every((x) => ids.includes(x.id))) return saved;
  return defaultLayout(company);
}

/** Saved layouts may hold any of the cards, each once. */
export function isLayout(value: unknown): value is LayoutItem[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= WIDGETS.length &&
    value.every(
      (x) =>
        !!x &&
        typeof x === "object" &&
        (WIDGETS as readonly string[]).includes((x as LayoutItem).id) &&
        typeof (x as LayoutItem).visible === "boolean",
    ) &&
    new Set(value.map((x) => (x as LayoutItem).id)).size === value.length
  );
}
export interface Routine {
  id: string;
  company_id: string;
  title: string;
  cadence: "daily" | "weekdays" | "weekly";
  credits: number;
  enabled: boolean;
  /** The job it runs, and when (UK time). Phase 8. */
  job_type?: string;
  run_at?: string;
  last_run_at?: string | null;
}
export interface CompanyDocument {
  id: string;
  company_id: string;
  title: string;
  versions: { version: number; content: string; date: string }[];
  outcomes?: { title: string; complete: boolean }[];
}
export interface MediaAsset {
  id: string;
  company_id: string;
  kind: "image" | "video";
  title: string;
  status: "generating" | "ready" | "failed";
  url?: string | undefined;
  reason?: string | undefined;
}
export interface EmailThread {
  id: string;
  company_id: string;
  subject: string;
  name: string;
  address: string;
  mode: "support" | "outreach";
  messages: { direction: "received" | "sent"; text: string; date: string }[];
}
export interface AdAccount {
  company_id: string;
  status: "not_connected" | "demo" | "connected";
  daily_budget: number;
  hard_cap: number;
  spend: number;
  clicks: number;
  signups: number;
}
export interface Preferences {
  explanation: "brief" | "more";
  adThreshold: number;
  outreachThreshold: number;
  publishing: boolean;
  signupDrop: number;
  whatsapp: boolean;
  slack: boolean;
}
export interface Sharing {
  enabled: boolean;
  stage: boolean;
  milestones: boolean;
  visitors: boolean;
  signups: boolean;
  mrr: boolean;
}
export interface TeamInvite {
  id: string;
  company_id: string;
  email: string;
  role: "founder" | "teammate" | "mentor" | "viewer";
  status: "invited" | "active";
}
export interface Proof {
  passed: number;
  total: number;
  screenshot?: string;
  preview?: string;
  pr?: string;
}
export interface ExtendedTask extends Task {
  proof?: Proof;
}
export interface WorkspaceDB {
  routines: Routine[];
  documents: CompanyDocument[];
  media: MediaAsset[];
  emails: EmailThread[];
  ads: AdAccount[];
  tasks: ExtendedTask[];
  layouts: Record<string, LayoutItem[]>;
  preferences: Record<string, Preferences>;
  sharing: Record<string, Sharing>;
  team: TeamInvite[];
}
export const defaultPreferences = (): Preferences => ({
  explanation: "brief",
  adThreshold: 20,
  outreachThreshold: 25,
  publishing: true,
  signupDrop: 30,
  whatsapp: false,
  slack: false,
});
export const defaultSharing = (): Sharing => ({
  enabled: false,
  stage: true,
  milestones: true,
  visitors: false,
  signups: false,
  mrr: false,
});
export function businessDefaults(type: Company["customer_type"]) {
  return type === "B2B"
    ? ["LinkedIn", "Email outreach", "Trust page"]
    : ["Instagram", "TikTok", "Waitlist"];
}
export function monthlyCost(cadence: Routine["cadence"], credits: number) {
  return credits * { daily: 30, weekdays: 22, weekly: 4 }[cadence];
}
export function hasProof(proof?: Proof) {
  return (
    !!proof &&
    proof.total > 0 &&
    proof.passed === proof.total &&
    !!proof.screenshot &&
    !!proof.preview &&
    !!proof.pr
  );
}
/**
 * The claims checker for public-facing text (CLAUDE.md rule 7). The same rules run in the
 * database (private.claims_flags in supabase/migrations/*_app_rpcs.sql), which is what blocks
 * approval; keep the two in step. `unbuilt` lists features the company hasn't built yet
 * (its unfinished roadmap outcomes), which public text mustn't promise.
 */
const SIGN_OFFS = /\b(best wishes|best regards|kind regards|all the best|best of luck)\b/gi;

export function checkClaims(text: string, sector: Sector = "general", unbuilt: string[] = []) {
  const rules = [
    {
      pattern: /\b(best|number one|world.leading|most effective)\b/gi,
      reason: "Unverifiable superlative",
    },
    {
      pattern: /\b(guarantee\w*|will improve|double your|100% success|cuts bills)\b/gi,
      reason: "Promises results",
    },
  ];
  if (sector !== "general")
    rules.push({
      pattern: /\b(actually works|proven|clinically|risk.free|approved|certified)\b/gi,
      reason: "Regulated claim needs supporting evidence",
    });
  for (const feature of unbuilt.map((f) => f.trim()).filter(Boolean))
    rules.push({
      pattern: new RegExp(`\\b(${feature.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")})\\b`, "gi"),
      reason: "Feature not built yet",
    });
  // Sign-offs aren't claims ("Best wishes"). Blanked to the same length, so positions hold.
  const checked = text.replace(SIGN_OFFS, (m) => " ".repeat(m.length));
  return rules
    .flatMap((r) =>
      Array.from(checked.matchAll(r.pattern), (m) => ({
        phrase: m[0],
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
        reason: r.reason,
      })),
    )
    .sort((a, b) => a.start - b.start);
}

/** A company's unfinished roadmap outcomes: features public text mustn't promise yet. */
export function unbuiltFeatures(documents: CompanyDocument[], companyId: string): string[] {
  return (
    documents
      .find((d) => d.company_id === companyId && d.title === "Product roadmap")
      ?.outcomes?.filter((o) => !o.complete)
      .map((o) => o.title) ?? []
  );
}

export function workspaceSeed(companies: Company[], tasks: Task[]): WorkspaceDB {
  return {
    layouts: {},
    preferences: {},
    sharing: {},
    team: [],
    // Seeded "done" tasks without a recorded completion are shown as still in progress.
    tasks: tasks.map((t) => ({
      ...t,
      status: t.status === "done" && !t.completed_at ? "doing" : t.status,
    })),
    routines: companies.flatMap((c) => [
      {
        id: `${c.id}-brief`,
        company_id: c.id,
        title: "Morning brief",
        cadence: "daily" as const,
        credits: 25,
        enabled: false,
      },
      {
        id: `${c.id}-social`,
        company_id: c.id,
        title: c.customer_type === "B2B" ? "Post to LinkedIn" : "Draft Instagram post",
        cadence: "weekdays" as const,
        credits: 40,
        enabled: false,
      },
      {
        id: `${c.id}-investor`,
        company_id: c.id,
        title: "Weekly investor update",
        cadence: "weekly" as const,
        credits: 60,
        enabled: false,
      },
    ]),
    documents: companies.flatMap((c) =>
      [
        "Company profile",
        "Product roadmap",
        "Brand & voice guide",
        "Privacy policy",
        "Pitch one-pager",
      ].map((title, i) => ({
        id: `${c.id}-doc-${i}`,
        company_id: c.id,
        title,
        versions: [
          {
            version: 1,
            content:
              i === 0
                ? `${c.name}\n\n${c.description}\n\nTarget customer: ${c.target_customer ?? c.customer_type}.\n90-day goal: ${c.goal_90d ?? "Validate demand with customer interviews"}.`
                : i === 1
                  ? "Outcomes for the next release. Prioritised using customer interviews."
                  : i === 2
                    ? "Voice: clear, encouraging and honest. Avoid guarantees and unsupported claims."
                    : i === 3
                      ? "DRAFT — requires legal review.\n\nWe collect contact details with consent for beta access. We do not sell personal data. Retention periods, lawful bases, rights and contact details must be confirmed before publication."
                      : `${c.name}\n\n${c.description}\n\nProblem, solution and early evidence: see the company evidence board. Funding ask has not been set.`,
            date: "2026-10-21",
          },
        ],
        ...(i === 1
          ? {
              outcomes: (c.id !== "c1"
                ? []
                : [
                    "Quiz engine",
                    "Waitlist",
                    "Daily streaks",
                    "Pricing page",
                    "Teacher dashboard",
                    "Weak-spots report",
                    "Accessibility review",
                    "Beta launch",
                  ]
              ).map((title, j) => ({ title, complete: j < 2 })),
            }
          : {}),
      })),
    ),
    media: [],
    emails: companies
      .filter((c) => c.id === "c1")
      .flatMap((c) => [
        {
          id: `${c.id}-mail-1`,
          company_id: c.id,
          subject: "Classroom beta access",
          name: "Ms Khan",
          address: "teacher@example.com",
          mode: "support" as const,
          messages: [
            {
              direction: "received" as const,
              text: `Could we try ${c.name} with our S5 class? What information do you collect?`,
              date: "2026-10-21",
            },
            {
              direction: "sent" as const,
              text: "Thanks for your interest. We are reviewing the classroom beta and privacy requirements before inviting schools.",
              date: "2026-10-21",
            },
          ],
        },
        {
          id: `${c.id}-mail-2`,
          company_id: c.id,
          subject: "Pilot invitation draft",
          name: "School pilot batch",
          address: "5 reviewed contacts",
          mode: "outreach" as const,
          messages: [
            {
              direction: "sent" as const,
              text: "Draft only — not sent. Would your team be interested in a short conversation about the pilot?",
              date: "2026-10-21",
            },
          ],
        },
      ]),
    ads: companies.map((c) =>
      c.id === "c1"
        ? {
            company_id: c.id,
            status: "demo",
            daily_budget: 6,
            hard_cap: 50,
            spend: 30,
            clicks: 122,
            signups: 20,
          }
        : {
            company_id: c.id,
            status: "not_connected",
            daily_budget: 0,
            hard_cap: 50,
            spend: 0,
            clicks: 0,
            signups: 0,
          },
    ),
  };
}
