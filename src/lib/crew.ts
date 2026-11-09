// The crew: Sol and the named agents who do the company's work (docs/CREW.md, CREW-PHASES
// Phase 20). Shapes match the agent_catalogue, agents, agent_autonomy and
// autonomy_action_types tables. Pure helpers only; the demo store uses them to seed a crew the
// same way the database does (private.seed_crew, private.start_level, private.attribute_runs).
import type { AgentRun, Pillar, Plan, Stage } from "./types";

export type CrewPillar = "hq" | "build" | "grow" | "customers" | "run" | "legal" | "raise" | "meta";
export type AgentStatus = "active" | "standing_by" | "paused" | "locked";
export type ModelTier = "routine" | "planning" | "strategy";
export type EntryPath = "start_up" | "keep_going";

export interface OutcomeMetric {
  key: string;
  label: string;
}

/** What a standing-by agent needs before it can work, and where to go to sort it (D103). */
export interface AgentNeeds {
  label: string;
  action: string | null;
  route: string | null;
}

export interface ActionType {
  key: string;
  label: string;
  external: boolean;
  customer_facing: boolean;
  public_statement: boolean;
  money: boolean;
  legal: boolean;
  max_level: number;
}

export interface CatalogueEntry {
  key: string;
  name: string;
  role: string;
  crew_pillar: CrewPillar;
  summary: string;
  outcome_metric: OutcomeMetric;
  model_tier: ModelTier;
  job_types: string[];
  budget_per_run_credits: number;
  budget_per_month_credits: number | null;
  start_autonomy: Record<string, number>;
  entry_paths: EntryPath[];
  from_stage: Stage;
  min_plan: Plan;
  minutes_per_outcome: number;
  engine: boolean;
  needs: AgentNeeds | null;
  sort: number;
}

export interface CrewAgent {
  id: string;
  company_id: string;
  catalogue_key: string | null;
  name: string;
  role: string;
  crew_pillar: CrewPillar;
  outcome_metric: OutcomeMetric;
  model_tier: ModelTier;
  budget_per_run_credits: number;
  budget_per_month_credits: number | null;
  prompt_version: number;
  skills_version: number;
  status: AgentStatus;
}

export interface AgentAutonomy {
  agent_id: string;
  company_id: string;
  action_type: string;
  level: number;
  mentor_hold_level: number | null;
  hold_reason: string | null;
  held_at: string | null;
  release_requested_at: string | null;
}

/** Start level for one action type (D96): never above the type's ceiling, and at most L2 for
 *  anything external or customer-facing. Mirrors private.start_level. */
export function startLevel(start: number, t: ActionType): number {
  return Math.min(start, t.max_level, t.external || t.customer_facing ? 2 : 3);
}

/** Adds catalogue agents to a company (as private.seed_agents does). Ids are stable for the demo. */
export function seedAgents(
  companyId: string,
  keys: string[],
  catalogue: CatalogueEntry[],
  actionTypes: ActionType[],
): { agents: CrewAgent[]; autonomy: AgentAutonomy[] } {
  const types = new Map(actionTypes.map((t) => [t.key, t]));
  const agents: CrewAgent[] = [];
  const autonomy: AgentAutonomy[] = [];
  for (const c of catalogue.filter((e) => keys.includes(e.key)).sort((a, b) => a.sort - b.sort)) {
    const id = `${companyId}-${c.key}`;
    agents.push({
      id,
      company_id: companyId,
      catalogue_key: c.key,
      name: c.name,
      role: c.role,
      crew_pillar: c.crew_pillar,
      outcome_metric: c.outcome_metric,
      model_tier: c.model_tier,
      budget_per_run_credits: c.budget_per_run_credits,
      budget_per_month_credits: c.budget_per_month_credits,
      prompt_version: 1,
      skills_version: 1,
      status: c.engine ? "active" : "standing_by",
    });
    for (const [action, start] of Object.entries(c.start_autonomy)) {
      const t = types.get(action);
      if (!t) continue;
      autonomy.push({
        agent_id: id,
        company_id: companyId,
        action_type: action,
        level: startLevel(start, t),
        mentor_hold_level: null,
        hold_reason: null,
        held_at: null,
        release_requested_at: null,
      });
    }
  }
  return { agents, autonomy };
}

const PILLAR_AGENT: Record<Pillar, string> = {
  grow: "nova",
  legal: "clara",
  run: "tilly",
  build: "sol",
  raise: "sol",
};

/** The crew member for a run without one, as private.attribute_runs and the insert trigger do
 *  for runs with no job: chat is Sol's, otherwise the pillar's Starter agent, else Sol. */
export function runAgentKey(run: Pick<AgentRun, "task" | "pillar">, has: (key: string) => boolean) {
  if (run.task === "Chat with Sol") return "sol";
  const key = PILLAR_AGENT[run.pillar];
  return has(key) ? key : "sol";
}

/** Gives each run without an agent the crew member it belongs to (demo data). */
export function attributeRuns(runs: AgentRun[], agents: CrewAgent[]): AgentRun[] {
  return runs.map((r) => {
    if (r.agent_id) return r;
    const crew = agents.filter((a) => a.company_id === r.company_id);
    const byKey = (k: string) => crew.find((a) => a.catalogue_key === k);
    const agent = byKey(runAgentKey(r, (k) => Boolean(byKey(k))));
    return agent ? { ...r, agent_id: agent.id } : r;
  });
}

/** A run's crew member, for LOG rows. */
export function runAgentName(run: Pick<AgentRun, "agent_id">, agents: CrewAgent[]): string | null {
  return agents.find((a) => a.id === run.agent_id)?.name ?? null;
}

// Roster (Phase 21) ---------------------------------------------------------------------------

/** What an agent is doing now, as crew_stats reports it. */
export type CrewActivity = "working" | "waiting" | "idle" | "paused" | "standing_by" | "locked";

/** One row of crew_stats: the figures on a crew card. Outcomes are null for agents standing by
 *  or locked, which show a call to action instead (D103). */
export interface CrewStat {
  agent_id: string;
  outcome_total: number | null;
  outcome_month: number | null;
  activity: CrewActivity;
  waiting: number;
  last_run_at: string | null;
  credits_month: number;
}

/** Sidebar order, then the meta crew. HQ is Sol's alone. */
export const PILLAR_ORDER: CrewPillar[] = [
  "build",
  "grow",
  "customers",
  "run",
  "legal",
  "raise",
  "meta",
];

export const PILLAR_LABEL: Record<CrewPillar, string> = {
  hq: "Flight director",
  build: "Build",
  grow: "Grow",
  customers: "Customers",
  run: "Run",
  legal: "Stay legal",
  raise: "Raise",
  meta: "Mission support",
};

/** The start of the month in UK time, from which "this month" counts (as crew_stats does). */
export function ukMonthStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  // Midnight on the 1st in London is 00:00 GMT or 23:00 the day before in BST; the 1st of a month
  // is in BST only from April to October.
  const bst = m >= 4 && m <= 10;
  return new Date(Date.UTC(y, m - 1, 1, bst ? -1 : 0));
}

interface StatsSource {
  agents: CrewAgent[];
  agent_runs: AgentRun[];
  approvals: {
    company_id: string;
    run_id: string | null;
    action_type: string;
    status: string;
    created_at: string;
    execution_status?: string;
    executed_at?: string | null;
  }[];
  leads: { company_id: string; created_at: string }[];
  inbox_items: { company_id: string; status: string; created_at: string }[];
}

/**
 * The demo store's version of crew_stats. It counts the same things from the demo's data; a few
 * sources the demo doesn't hold (memory facts, error events) count as none.
 */
export function demoCrewStats(db: StatsSource, companyId: string, now: Date): CrewStat[] {
  const month = ukMonthStart(now).getTime();
  const inMonth = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() >= month;
  const runs = db.agent_runs.filter((r) => r.company_id === companyId);
  const approvals = db.approvals.filter((a) => a.company_id === companyId);
  const runAgent = new Map(runs.map((r) => [r.id, r.agent_id]));
  const when = (r: AgentRun) => r.started_at ?? r.finished_at;

  return db.agents
    .filter((a) => a.company_id === companyId)
    .map((a) => {
      const mine = runs.filter((r) => r.agent_id === a.id);
      const count = (dates: (string | null | undefined)[]) => ({
        total: dates.length,
        month: dates.filter(inMonth).length,
      });
      const outcomes = (() => {
        switch (a.outcome_metric.key) {
          case "posts_published":
            return count(
              approvals
                .filter(
                  (p) =>
                    p.action_type === "publish_post" &&
                    p.status === "approved" &&
                    (p.execution_status ?? "done") === "done",
                )
                .map((p) => p.executed_at ?? p.created_at),
            );
          case "pieces_drafted":
            return count(
              approvals
                .filter(
                  (p) =>
                    p.run_id &&
                    runAgent.get(p.run_id) === a.id &&
                    (p.action_type === "publish_post" || p.action_type === "send_email"),
                )
                .map((p) => p.created_at),
            );
          case "leads_captured":
            return count(
              db.leads.filter((l) => l.company_id === companyId).map((l) => l.created_at),
            );
          case "messages_handled":
            return count(
              db.inbox_items
                .filter((i) => i.company_id === companyId && i.status !== "new")
                .map((i) => i.created_at),
            );
          case "issues_caught":
            return count(runs.filter((r) => r.status === "failed").map(when));
          case "facts_added":
          case "brand_guide_approved":
          case "assumptions_tested":
          case "deadlines_tracked":
          case "policies_current":
          case "actions_routed":
          case "campaigns_live":
            return { total: 0, month: 0 };
          default:
            return count(
              mine
                .filter((r) => r.status === "succeeded" || r.status === "needs_approval")
                .map(when),
            );
        }
      })();
      const waiting = approvals.filter(
        (p) => p.status === "pending" && p.run_id && runAgent.get(p.run_id) === a.id,
      ).length;
      const noFigures = a.status === "standing_by" || a.status === "locked";
      const activity: CrewActivity =
        a.status !== "active"
          ? a.status
          : mine.some((r) => r.status === "running")
            ? "working"
            : waiting > 0
              ? "waiting"
              : "idle";
      const last = mine
        .map(when)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1);
      return {
        agent_id: a.id,
        outcome_total: noFigures ? null : outcomes.total,
        outcome_month: noFigures ? null : outcomes.month,
        activity,
        waiting,
        last_run_at: last ?? null,
        credits_month: mine
          .filter((r) => inMonth(when(r)))
          .reduce((n, r) => n + r.credits_charged, 0),
      };
    });
}

export interface RosterEntry {
  agent: CrewAgent;
  stat: CrewStat | undefined;
  catalogue: CatalogueEntry | undefined;
}

/** Sol, the active crew by pillar, and everyone joining later (standing by, then locked). */
export function roster(
  agents: CrewAgent[],
  stats: CrewStat[],
  catalogue: CatalogueEntry[],
  companyId: string,
) {
  const byStat = new Map(stats.map((s) => [s.agent_id, s]));
  const byKey = new Map(catalogue.map((c) => [c.key, c]));
  const sortOf = (a: CrewAgent) => byKey.get(a.catalogue_key ?? "")?.sort ?? 999;
  const entries: RosterEntry[] = agents
    .filter((a) => a.company_id === companyId)
    .sort((a, b) => sortOf(a) - sortOf(b))
    .map((agent) => ({
      agent,
      stat: byStat.get(agent.id),
      catalogue: byKey.get(agent.catalogue_key ?? ""),
    }));
  const sol = entries.find((e) => e.agent.crew_pillar === "hq") ?? null;
  const onDuty = (e: RosterEntry) => e.agent.status === "active" || e.agent.status === "paused";
  const crew = entries.filter((e) => e.agent.crew_pillar !== "hq");
  return {
    sol,
    pillars: PILLAR_ORDER.map((pillar) => ({
      pillar,
      entries: crew.filter((e) => e.agent.crew_pillar === pillar && onDuty(e)),
    })).filter((g) => g.entries.length > 0),
    joining: [
      ...crew.filter((e) => e.agent.status === "standing_by"),
      ...crew.filter((e) => e.agent.status === "locked"),
    ],
    working: crew.filter((e) => e.stat?.activity === "working").length,
    /** Approvals waiting from the crew's runs (not the number of agents waiting). */
    waiting: entries.reduce((n, e) => n + (e.stat?.waiting ?? 0), 0),
    onDuty: crew.filter(onDuty).length,
  };
}

/** Short status label for a crew card. */
export function activityLabel(a: CrewActivity): string {
  return {
    working: "Working",
    waiting: "Waiting for you",
    idle: "Idle",
    paused: "Paused",
    standing_by: "Standing by",
    locked: "Locked",
  }[a];
}

/** "2 h ago", "3 days ago", "just now". */
export function sinceLabel(iso: string | null, now: Date): string {
  if (!iso) return "No runs yet";
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

/** The level shown on a crew card: the highest level among the agent's external actions (what
 *  the founder cares about: does it act on its own outside the company?), else among its internal
 *  ones. Null if it has none. */
export function topLevel(
  agentId: string,
  autonomy: AgentAutonomy[],
  actionTypes: ActionType[] = [],
): number | null {
  const mine = autonomy.filter((x) => x.agent_id === agentId);
  if (!mine.length) return null;
  const external = new Set(
    actionTypes.filter((t) => t.external || t.customer_facing).map((t) => t.key),
  );
  const outward = mine.filter((x) => external.has(x.action_type));
  return Math.max(...(outward.length ? outward : mine).map((x) => x.level));
}

export interface AgentSettingsChange {
  budget_per_run_credits?: number;
  budget_per_month_credits?: number | null;
  paused?: boolean;
}

/** The demo's update_agent_settings: the same limits and status rules as the database. */
export function applyAgentSettings(
  agents: CrewAgent[],
  catalogue: CatalogueEntry[],
  agentId: string,
  ch: AgentSettingsChange,
): { agents: CrewAgent[] } | { error: string } {
  const a = agents.find((x) => x.id === agentId);
  if (!a) return { error: "That crew member wasn't found" };
  const cat = catalogue.find((c) => c.key === a.catalogue_key);
  const maxRun = cat?.budget_per_run_credits ?? a.budget_per_run_credits;
  const next = { ...a };
  if (ch.budget_per_run_credits !== undefined) {
    const v = ch.budget_per_run_credits;
    if (!Number.isInteger(v) || v < 1 || v > maxRun)
      return { error: `The limit per run must be between 1 and ${maxRun} credits` };
    next.budget_per_run_credits = v;
  }
  if (ch.budget_per_month_credits !== undefined) {
    const v = ch.budget_per_month_credits;
    if (v !== null && (!Number.isInteger(v) || v < 1))
      return { error: "The monthly cap must be at least 1 credit, or empty for none" };
    next.budget_per_month_credits = v;
  }
  if (ch.paused !== undefined) {
    if (a.status === "locked") return { error: `${a.name} isn't part of your plan` };
    next.status = ch.paused ? "paused" : (cat?.engine ?? true) ? "active" : "standing_by";
  }
  return { agents: agents.map((x) => (x.id === agentId ? next : x)) };
}
