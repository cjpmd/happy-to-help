import type { ToolContext } from "../tools.js";

export interface RunStep {
  tool: string;
  summary: string;
  credits: number;
}

export interface RunRequest {
  jobType: string;
  prompt: string;
  model: string;
  /** The company workspace: CLAUDE.md, .claude/skills and data/. */
  cwd: string;
  skills: string[];
  /** Short tool names the job may use. */
  tools: string[];
  maxBudgetUsd: number;
  /** The job's usual cost in USD (the mock runtime charges about this). */
  estimateUsd: number;
  maxTurns: number;
  ctx: ToolContext;
  input: { title?: string; message?: string; target?: string };
  /** Called after every tool use, for the audit trail. */
  onStep: (step: RunStep) => Promise<void>;
}

export interface RunOutcome {
  /** success; budget = stopped at maxBudgetUsd; turns = stopped at maxTurns; error = the platform failed. */
  status: "success" | "budget" | "turns" | "error";
  costUsd: number;
  usage: { input_tokens: number; output_tokens: number };
  /** The model's final text (its summary, or the chat reply). */
  text: string;
  error?: string;
}

export interface AgentRuntime {
  name: string;
  run(req: RunRequest): Promise<RunOutcome>;
}
