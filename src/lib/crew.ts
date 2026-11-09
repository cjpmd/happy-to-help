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
