// All tunable values for the agent service. Model IDs and cost constants live here or in the
// database's credit_config, never inline in code (CLAUDE.md rules 5 and 6).
import { hostname } from "node:os";
import { tmpdir } from "node:os";
import path from "node:path";

const env = (k: string, fallback?: string) => {
  const v = process.env[k];
  return v === undefined || v === "" ? fallback : v;
};

export type ModelTier = "routine" | "planning" | "strategy";
export type RuntimeName = "mock" | "claude";

export interface Config {
  supabaseUrl: string;
  serviceRoleKey: string;
  runtime: RuntimeName;
  models: Record<ModelTier, string>;
  workerId: string;
  pollIntervalMs: number;
  staleAfterMinutes: number;
  workspaceRoot: string;
  /** Hard ceiling for any one run, in USD, whatever the reservation allows. */
  maxRunUsd: number;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const runtime = env("AGENT_RUNTIME", "mock");
  if (runtime !== "mock" && runtime !== "claude")
    throw new Error(`AGENT_RUNTIME must be "mock" or "claude", not "${runtime}"`);
  return {
    supabaseUrl: env("SUPABASE_URL", "http://127.0.0.1:54321")!,
    serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY", "")!,
    runtime,
    models: {
      routine: env("MODEL_ROUTINE", "claude-haiku-5-5")!,
      planning: env("MODEL_PLANNING", "claude-sonnet-5-5")!,
      strategy: env("MODEL_STRATEGY", "claude-opus-5-5")!,
    },
    workerId: env("WORKER_ID", `${hostname()}-${process.pid}`)!,
    pollIntervalMs: Number(env("POLL_INTERVAL_MS", "3000")),
    staleAfterMinutes: Number(env("STALE_AFTER_MINUTES", "15")),
    workspaceRoot: env("WORKSPACE_ROOT", path.join(tmpdir(), "gumption-workspaces"))!,
    maxRunUsd: Number(env("MAX_RUN_USD", "5")),
    ...overrides,
  };
}
