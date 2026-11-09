// The crew member a job runs as (Phase 20, docs/CREW-PHASES.md; DECISIONS D89, D91, D105).
// Each job is run by one agent: its identity shapes the workspace, its tools narrow the job's,
// and its caps limit what the run may reserve. Paused and locked agents don't run.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db/client.js";
import { must } from "./db/client.js";
import type { Tables } from "./db/types.js";

export type CrewAgent = Pick<
  Tables<"agents">,
  | "id"
  | "company_id"
  | "catalogue_key"
  | "name"
  | "role"
  | "status"
  | "style_ref"
  | "tools"
  | "skills"
  | "budget_per_run_credits"
  | "budget_per_month_credits"
>;

const COLUMNS =
  "id, company_id, catalogue_key, name, role, status, style_ref, tools, skills, budget_per_run_credits, budget_per_month_credits";

const PROMPTS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The agent for a job: the one it names, else the database's rule (agent_for_job). */
export async function agentForJob(
  db: Db,
  job: Pick<Tables<"agent_jobs">, "company_id" | "job_type" | "payload" | "agent_id">,
): Promise<CrewAgent | null> {
  const id =
    job.agent_id ??
    (must(
      await db.rpc("agent_for_job", {
        p_company: job.company_id,
        p_job_type: job.job_type,
        p_payload: job.payload ?? {},
      }),
      "agent for job",
    ) as string | null);
  if (!id) return null;
  const { data } = await db
    .from("agents")
    .select(COLUMNS)
    .eq("id", id)
    .eq("company_id", job.company_id)
    .maybeSingle();
  return data;
}

/** Why an agent can't take work right now, in words for the founder; null if it can. */
export function unavailableReason(a: Pick<CrewAgent, "name" | "status">): string | null {
  if (a.status === "paused") return `${a.name} is paused. Resume ${a.name} in Crew to run this.`;
  if (a.status === "locked")
    return `${a.name} isn't part of your plan. Upgrade in Billing to add ${a.name} to your crew.`;
  return null;
}

/** The start of the current month in UTC, from which monthly caps count. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Credits this agent's runs have been charged so far this month. */
export async function creditsThisMonth(db: Db, agentId: string, now = new Date()) {
  const { data } = await db
    .from("agent_runs")
    .select("credits_charged")
    .eq("agent_id", agentId)
    .gte("created_at", monthStart(now).toISOString());
  return (data ?? []).reduce((n, r) => n + (r.credits_charged ?? 0), 0);
}

/**
 * The most a run may reserve because of the agent's own caps (D105): its per-run cap, and what's
 * left of its monthly cap if it has one. `null` from `blocked` means the run can go ahead.
 */
export function agentLimit(
  a: Pick<CrewAgent, "name" | "budget_per_run_credits" | "budget_per_month_credits">,
  usedThisMonth: number,
  estimate: number,
): { limit: number; blocked: string | null } {
  const monthLeft =
    a.budget_per_month_credits === null
      ? Infinity
      : Math.max(0, a.budget_per_month_credits - usedThisMonth);
  const limit = Math.min(a.budget_per_run_credits, monthLeft);
  if (limit >= estimate) return { limit, blocked: null };
  if (monthLeft < estimate)
    return {
      limit,
      blocked: `${a.name} has used ${usedThisMonth} of ${a.budget_per_month_credits} credits this month, and this needs about ${estimate}. Raise ${a.name}'s monthly cap in Crew, or I'll pick it up next month.`,
    };
  return {
    limit,
    blocked: `This needs about ${estimate} credits, more than ${a.name}'s limit of ${a.budget_per_run_credits} credits a run. Raise the limit in Crew to run it.`,
  };
}

/** The job's tools, narrowed to the agent's if the agent lists any. */
export function effectiveTools(jobTools: string[], agentTools: string[]): string[] {
  if (!agentTools.length) return jobTools;
  const allowed = new Set(agentTools);
  return jobTools.filter((t) => allowed.has(t));
}

/** The job's skills plus the agent's own. */
export function effectiveSkills(jobSkills: string[], agentSkills: string[]): string[] {
  return [...new Set([...jobSkills, ...agentSkills])];
}

/** The agent's prompt file (style, rules, red lines), if it has one. */
export async function loadStylePrompt(styleRef: string): Promise<string | null> {
  // Only files under agent-service/prompts/, whatever the row says.
  const file = path.resolve(PROMPTS_ROOT, styleRef);
  if (!file.startsWith(path.join(PROMPTS_ROOT, "prompts") + path.sep)) return null;
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}
