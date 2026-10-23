import type {
  AgentRun,
  Approval,
  Company,
  ComplianceItem,
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
  action?: { label: string; to: string };
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
      ? { channel: "Meta ads", detail: "off", value: "", action: { label: "Set up", to: "/ads" } }
      : { channel: "Meta ads", detail: `£${ad.daily_budget}/day`, value: `${ad.clicks} clicks` },
  );
  return rows;
}
