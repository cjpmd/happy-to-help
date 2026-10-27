import { execFileSync } from "node:child_process";
import { loadConfig, type Config } from "../src/config.js";
import { serviceClient, type Db } from "../src/db/client.js";

let cached: { url: string; key: string } | null = null;
function stack() {
  if (!cached) {
    const s = JSON.parse(
      execFileSync("npx", ["supabase", "status", "-o", "json"], { cwd: "..", encoding: "utf8" }),
    );
    cached = { url: s.API_URL, key: s.SECRET_KEY ?? s.SERVICE_ROLE_KEY };
  }
  return cached;
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  const s = stack();
  return loadConfig({
    supabaseUrl: s.url,
    serviceRoleKey: s.key,
    runtime: "mock",
    workerId: "test",
    ...overrides,
  });
}
export const testDb = (): Db => serviceClient(testConfig());

export const STUDYBUDDY = "c0000000-0000-4000-8000-000000000001";
export const CROFT = "c0000000-0000-4000-8000-000000000004";
export const AISHA = "a0000000-0000-4000-8000-000000000001";

export async function balance(db: Db, company: string) {
  const { data } = await db.rpc("credit_summary", { p_company: company });
  return (data as { balance: number }).balance;
}

/** Queues a job that only this test's worker will claim (by its unique job type filter). */
export async function enqueue(
  db: Db,
  company: string,
  jobType: string,
  payload: Record<string, string>,
  estimated = 0,
) {
  const { data, error } = await db
    .from("agent_jobs")
    .insert({
      company_id: company,
      job_type: jobType,
      payload,
      estimated_credits: estimated,
      created_by: AISHA,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
