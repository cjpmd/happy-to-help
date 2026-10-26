import type {
  ActivityEvent,
  AgentRun,
  Approval,
  Company,
  GateCriterion,
  Stage,
  StageGate,
} from "./types";

// Mission timeline helpers for the mock store. In the database these days will
// come from gate target and completed dates (see docs/STATUS.md, group 1b).

export const STAGE_ORDER: Stage[] = ["idea", "evidence", "build", "launch", "grow"];

/** Stages that end in a gate. Grow is the last stage, so it has none. */
export type GateStage = Exclude<Stage, "grow">;
export const GATE_STAGES: GateStage[] = ["idea", "evidence", "build", "launch"];

/** Default day, counted from the company's start, by which each stage's gate should pass. */
export const GATE_TARGET_DAYS: Record<GateStage, number> = {
  idea: 8,
  evidence: 18,
  build: 42,
  launch: 80,
};

/** Default criteria for a new company's gates (the seed sets its own). */
export const DEFAULT_GATE_CRITERIA: Record<GateStage, GateCriterion[]> = {
  idea: [],
  evidence: [
    { label: "Waitlist", current: 0, target: 50 },
    { label: "Interviews", current: 0, target: 8 },
  ],
  build: [{ label: "Beta users", current: 0, target: 40 }],
  launch: [],
};

const DAY_MS = 86_400_000;

export const stageLabel = (s: Stage) => s.charAt(0).toUpperCase() + s.slice(1);

/** A gate is named like a launch call for the stage it clears you into. */
const GATE_NAMES: Record<GateStage, string> = {
  idea: "Go for evidence",
  evidence: "Go for build",
  build: "Go for launch",
  launch: "Go for growth",
};
export const gateName = (stage: Stage): string => (stage === "grow" ? "Growth" : GATE_NAMES[stage]);

/** One gate per stage transition, timed from the company's start. */
export function defaultGates(
  companyId: string,
  startedAt: string,
  stage: Stage,
  criteria: Partial<Record<GateStage, GateCriterion[]>> = {},
  approvedBy: string | null = null,
): StageGate[] {
  const current = STAGE_ORDER.indexOf(stage);
  const start = new Date(startedAt).getTime();
  const onDay = (day: number) => new Date(start + day * DAY_MS).toISOString();
  return GATE_STAGES.map((s, i) => ({
    id: `${companyId}-${s}`,
    company_id: companyId,
    stage: s,
    criteria: criteria[s] ?? DEFAULT_GATE_CRITERIA[s].map((c) => ({ ...c })),
    status: i < current ? "approved" : i === current ? "in_progress" : "locked",
    approved_by: i < current ? approvedBy : null,
    approved_at: i < current ? onDay(GATE_TARGET_DAYS[s]) : null,
    target_date: onDay(GATE_TARGET_DAYS[s]),
  }));
}

const calendarDay = (date: Date | string) => Math.floor(new Date(date).getTime() / DAY_MS);

/** Calendar days (UTC) from the company's start to `date`. */
export function dayOf(company: Pick<Company, "started_at">, date: Date | string): number {
  if (!company.started_at) return 0;
  return calendarDay(date) - calendarDay(company.started_at);
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
