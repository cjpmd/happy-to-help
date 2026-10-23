import type { ActivityEvent, AgentRun, Approval, Company, Stage, StageGate } from "./types";

// Mission timeline helpers for the mock store. In the database these days will
// come from gate target and completed dates (see docs/STATUS.md, group 1b).

export const STAGE_ORDER: Stage[] = ["idea", "evidence", "build", "launch", "grow"];

/** Default day, counted from the company's start, by which each stage's gate should pass. */
export const GATE_TARGET_DAYS: Record<Stage, number> = {
  idea: 8,
  evidence: 18,
  build: 42,
  launch: 80,
  grow: 120,
};

const DAY_MS = 86_400_000;

export const stageLabel = (s: Stage) => s.charAt(0).toUpperCase() + s.slice(1);

/** A stage's gate is named after the stage it opens: passing Build's gate is the Launch gate. */
export function gateName(stage: Stage): string {
  const next = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];
  return `${stageLabel(next ?? stage)} gate`;
}

/** Whole days from the company's start to `date`. */
export function dayOf(company: Pick<Company, "started_at">, date: Date | string): number {
  if (!company.started_at) return 0;
  return Math.floor((new Date(date).getTime() - new Date(company.started_at).getTime()) / DAY_MS);
}

/** Mission elapsed time in days (T+N). */
export const missionDay = (company: Pick<Company, "started_at">, now: Date = new Date()) =>
  Math.max(0, dayOf(company, now));

/** A gate's day: its completed date if approved, otherwise its target date. */
export function gateDay(gate: StageGate, company: Pick<Company, "started_at">): number | null {
  const date =
    gate.status === "approved" ? (gate.approved_at ?? gate.target_date) : gate.target_date;
  return date ? dayOf(company, date) : null;
}

/** The gate the company is working towards now. */
export const currentGate = (gates: StageGate[]) =>
  gates.find((g) => g.status === "in_progress" || g.status === "ready");

/** The gate's headline number: its first unmet criterion, or its first criterion if all are met. */
export function gateMetric(gate: StageGate | undefined) {
  if (!gate) return undefined;
  return gate.criteria.find((c) => c.current < c.target) ?? gate.criteria[0];
}

export type SolState = "working" | "idle" | "waiting";

/** What Sol is doing for a company right now, for the header line and the avatar dot. */
export function solStatus({
  companyId,
  runs,
  approvals,
  events,
  solTyping,
}: {
  companyId: string;
  runs: AgentRun[];
  approvals: Approval[];
  events: ActivityEvent[];
  solTyping: boolean;
}): { state: SolState; summary: string; pending: number } {
  const pending = approvals.filter(
    (a) => a.company_id === companyId && a.status === "pending",
  ).length;
  const running = runs.find((r) => r.company_id === companyId && r.status === "running");
  if (solTyping) {
    const latest = events
      .filter((e) => e.company_id === companyId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return { state: "working", summary: latest?.summary ?? "Working", pending };
  }
  if (running) return { state: "working", summary: running.task, pending };
  if (pending) return { state: "waiting", summary: `${pending} waiting for your GO`, pending };
  return { state: "idle", summary: "Idle", pending };
}

/** "Good morning" in the UK until noon, "good afternoon" until 6pm, then "good evening". */
export function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", timeZone: "Europe/London" }).format(now),
  );
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
