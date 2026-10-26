import type {
  AgentRun,
  Approval,
  Company,
  ComplianceItem,
  Contact,
  EvidenceItem,
  LedgerEntry,
  MetricsDaily,
  SocialPost,
  Stage,
} from "./types";
import type { AdAccount, EmailThread, ExtendedTask } from "./workspace";
import { hasProof } from "./workspace";
import { complianceTone, type ComplianceTone } from "./compliance";
import { fmtShortDate, fmtTime } from "./format";

// Pure helpers behind the HQ cards (docs/DESIGN.md section 4). Inputs are mock
// store data for now; 1c swaps them for queries.

const DAY_MS = 86_400_000;

export type BadgeTone = "success" | "warning" | "info" | "neutral";

/**
 * A key task's badge on the flight plan card. Who did the work is worked out
 * from proof and status until tasks get an `actor` column in 1b:
 * done with full proof = Sol, verified; done without = the founder.
 */
export function taskBadge(
  task: Pick<ExtendedTask, "status" | "proof" | "estimated_credits">,
  awaitingGo = false,
): { tone: BadgeTone; text: string } {
  if (task.status === "done") {
    return hasProof(task.proof) && task.proof
      ? { tone: "success", text: `Sol · verified ${task.proof.passed}/${task.proof.total}` }
      : { tone: "success", text: "You · done" };
  }
  if (awaitingGo) return { tone: "warning", text: "Hold · awaiting GO" };
  const cost = task.estimated_credits ? ` · ≈ ${task.estimated_credits} CR` : "";
  return task.status === "doing"
    ? { tone: "info", text: `Sol · building${cost}` }
    : { tone: "neutral", text: `Up next${cost}` };
}

/** Key tasks with a pending approval on one of their runs. */
export function tasksAwaitingGo(approvals: Approval[], runs: AgentRun[]): Set<string> {
  const pendingRuns = new Set(
    approvals.filter((a) => a.status === "pending" && a.run_id).map((a) => a.run_id),
  );
  return new Set(
    runs.filter((r) => r.task_id && pendingRuns.has(r.id)).map((r) => r.task_id as string),
  );
}

/** Up to four key tasks for the current phase, in date order. */
export function phaseTasks(tasks: ExtendedTask[], companyId: string, stage: Stage) {
  return tasks
    .filter((t) => t.company_id === companyId && t.key && t.stage === stage)
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""))
    .slice(0, 4);
}

const pct = (now: number, before: number) =>
  before > 0 ? Math.round(((now - before) / before) * 100) : null;
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Telemetry for the last 7 days against the 7 before, plus 14 days of signups. */
export function telemetry(
  metrics: MetricsDaily[],
  companyId: string,
  ad: Pick<AdAccount, "status" | "spend" | "signups"> | undefined,
) {
  const days = metrics
    .filter((m) => m.company_id === companyId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);
  const last = days.slice(-7);
  const prev = days.slice(-14, -7);
  const sum = (rows: MetricsDaily[], k: "visitors" | "signups") =>
    rows.reduce((n, r) => n + r[k], 0);
  const visitors = sum(last, "visitors");
  const visitorsChange = pct(visitors, sum(prev, "visitors"));
  const signups = sum(last, "signups");
  const paying = last.at(-1)?.paying_customers ?? 0;
  const payingBefore = prev.at(-1)?.paying_customers ?? 0;
  const paid = ad && ad.status !== "not_connected" && ad.spend > 0;
  return {
    visitors,
    visitorsNote: visitorsChange === null ? null : `${signed(visitorsChange)}%`,
    signups,
    signupsNote: prev.length ? signed(signups - sum(prev, "signups")) : null,
    paying,
    payingNote: paying === 0 ? "Pre-launch" : signed(paying - payingBefore),
    costPerSignup: paid && ad.signups > 0 ? ad.spend / ad.signups : 0,
    costNote: paid ? "Paid ads" : "Organic",
    spark: days.map((d) => d.signups),
  };
}

/** Is a change good news? Only gains are shown in green. */
export const isGain = (note: string | null) => !!note && note.startsWith("+") && note !== "+0";

export interface BurnRow {
  id: string;
  time: string;
  task: string;
  credits: number;
  state: "charged" | "refunded" | "running";
}

/** Sol's runs in the 24 hours before `now`, oldest first, with the credits they used. */
export function overnightBurn(
  runs: AgentRun[],
  ledger: LedgerEntry[],
  companyId: string,
  now: Date,
  limit = 4,
): { rows: BurnRow[]; total: number; count: number } {
  const since = now.getTime() - DAY_MS;
  const refunded = new Set(
    ledger.filter((l) => l.entry_type === "refund" && l.run_id).map((l) => l.run_id),
  );
  const recent = runs
    .filter((r) => {
      const t = r.started_at ? new Date(r.started_at).getTime() : NaN;
      return r.company_id === companyId && t >= since && t <= now.getTime();
    })
    .sort((a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? ""));
  const rows = recent.map<BurnRow>((r) => ({
    id: r.id,
    time: fmtTime(r.started_at as string),
    task: r.task,
    credits: r.credits_charged,
    state: refunded.has(r.id) ? "refunded" : r.status === "running" ? "running" : "charged",
  }));
  return {
    rows: rows.slice(-limit),
    total: rows.reduce((n, r) => n + (r.state === "refunded" ? 0 : r.credits), 0),
    count: rows.length,
  };
}

export interface WindowRow {
  id: string;
  title: string;
  date: string;
  label: string;
  tone: ComplianceTone | "muted";
}

/**
 * Upcoming deadlines: open compliance items and dated tasks, soonest first.
 * Anything due within two weeks, or overdue, needs the founder (amber);
 * overdue statutory deadlines are red.
 */
export function nextWindows(
  compliance: ComplianceItem[],
  tasks: Pick<ExtendedTask, "id" | "company_id" | "title" | "status" | "due">[],
  companyId: string,
  now: Date,
  limit = 4,
): WindowRow[] {
  const soon = now.getTime() + 14 * DAY_MS;
  const rows = [
    ...compliance
      .filter((c) => c.company_id === companyId && c.status !== "done")
      .map((c) => ({ id: c.id, title: c.title, date: c.due_date, item: c })),
    ...tasks
      .filter((t) => t.company_id === companyId && t.status !== "done" && t.due)
      .map((t) => ({ id: t.id, title: t.title, date: t.due as string, item: null })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return rows.slice(0, limit).map((r) => {
    const due = new Date(r.date).getTime();
    const overdue = due < now.getTime() - DAY_MS;
    const tone: WindowRow["tone"] =
      overdue && r.item
        ? complianceTone({ ...r.item, status: "overdue" })
        : overdue || due <= soon
          ? "warning"
          : "muted";
    return { id: r.id, title: r.title, date: r.date, label: fmtShortDate(r.date), tone };
  });
}

export interface ChannelRow {
  channel: string;
  detail: string;
  value: string;
  /** A call to action instead of a figure, e.g. "Set up". */
  action?: { label: string; to: "/grow"; search: { tab: "ads" } };
}

/**
 * One row per marketing channel the company uses, plus email and Meta ads.
 * The waitlist isn't a channel here: its signups are in Telemetry.
 */
export function channelRows(
  company: Pick<Company, "id" | "channels">,
  posts: SocialPost[],
  emails: EmailThread[],
  ad: Pick<AdAccount, "status" | "daily_budget" | "clicks"> | undefined,
): ChannelRow[] {
  const mine = posts.filter((p) => p.company_id === company.id);
  const channels = (company.channels ?? []).filter((c) => c !== "Waitlist");
  const rows: ChannelRow[] = channels.map((channel) => {
    const forChannel = mine.filter((p) => p.channel === channel);
    if (forChannel.length) {
      const clicks = forChannel.reduce((n, p) => n + p.metrics.clicks, 0);
      const live = forChannel.filter((p) => p.status === "published").length;
      return { channel, detail: `${live} published`, value: `${clicks} clicks` };
    }
    return { channel, detail: "not started", value: "—" };
  });
  const toAnswer = emails.filter(
    (e) =>
      e.company_id === company.id &&
      e.mode === "support" &&
      e.messages.at(-1)?.direction === "received",
  ).length;
  rows.push({
    channel: "Email",
    detail: "support",
    value: toAnswer ? `${toAnswer} to answer` : "All answered",
  });
  rows.push(
    !ad || ad.status === "not_connected"
      ? {
          channel: "Meta ads",
          detail: "off",
          value: "",
          action: { label: "Set up", to: "/grow", search: { tab: "ads" } },
        }
      : { channel: "Meta ads", detail: `£${ad.daily_budget}/day`, value: `${ad.clicks} clicks` },
  );
  return rows;
}

const summaryWords: [BadgeTone, string][] = [
  ["success", "done"],
  ["info", "building"],
  ["warning", "awaiting GO"],
  ["neutral", "up next"],
];

/** One line for the task tiles on short screens: "2 done · 1 building · 1 awaiting GO". */
export function tileSummary(badges: { tone: BadgeTone }[]): string {
  return summaryWords
    .map(([tone, word]) => [badges.filter((b) => b.tone === tone).length, word] as const)
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}`)
    .join(" · ");
}

// Stage-aware HQ (Phase 10) --------------------------------------------------------------------

/** Threads whose latest message is from the customer: they're waiting for a reply. */
export function inboxSummary(emails: EmailThread[], companyId: string, now: Date) {
  const threads = emails.filter((t) => t.company_id === companyId);
  const waiting = threads
    .filter((t) => t.messages.at(-1)?.direction === "received")
    .map((t) => {
      const since = new Date(t.messages.at(-1)!.date).getTime();
      return {
        id: t.id,
        name: t.name || t.address,
        subject: t.subject,
        hours: Math.max(0, (now.getTime() - since) / 3_600_000),
      };
    })
    .sort((a, b) => b.hours - a.hours);
  return { waiting, total: threads.length };
}

/** Median hours from a customer's message to the first reply, over threads in the last `days`. */
export function responseTimes(emails: EmailThread[], companyId: string, now: Date, days = 30) {
  const since = now.getTime() - days * DAY_MS;
  const gaps: number[] = [];
  for (const t of emails.filter((x) => x.company_id === companyId)) {
    const msgs = [...t.messages].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]!;
      if (m.direction !== "received" || new Date(m.date).getTime() < since) continue;
      const reply = msgs
        .slice(i + 1)
        .find((r) => r.direction === "sent" && !r.text.startsWith("Draft only"));
      if (reply)
        gaps.push((new Date(reply.date).getTime() - new Date(m.date).getTime()) / 3_600_000);
    }
  }
  if (!gaps.length) return { median: null as number | null, count: 0 };
  const sorted = gaps.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { median, count: gaps.length };
}

/** "3h", "2d": how long ago or how long a wait. */
export function shortDuration(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Leads: the newest first, and how many arrived in the last 7 days. */
export function leadsSummary(contacts: Contact[], companyId: string, now: Date) {
  const leads = contacts
    .filter((c) => c.company_id === companyId && c.kind === "lead")
    .sort((a, b) => b.last.localeCompare(a.last));
  const week = leads.filter((l) => now.getTime() - new Date(l.last).getTime() <= 7 * DAY_MS).length;
  const customers = contacts.filter(
    (c) => c.company_id === companyId && c.kind === "customer",
  ).length;
  return { leads, week, customers };
}

/** The evidence board in numbers: assumptions by status, interviews, waitlist and pre-orders. */
export function evidenceSummary(items: EvidenceItem[], companyId: string) {
  const mine = items.filter((e) => e.company_id === companyId);
  const assumptions = mine.filter((e) => e.type === "assumption");
  const count = (s: EvidenceItem["status"]) => assumptions.filter((a) => a.status === s).length;
  const num = (type: EvidenceItem["type"]) =>
    mine
      .filter((e) => e.type === type)
      .reduce(
        (n, e) => n + (typeof e.data["count"] === "number" ? (e.data["count"] as number) : 0),
        0,
      );
  return {
    validated: count("validated"),
    testing: count("testing"),
    untested: count("untested"),
    invalidated: count("invalidated"),
    interviews: mine.filter((e) => e.type === "interview").length,
    waitlist: num("waitlist"),
    preorders: num("preorder"),
  };
}
