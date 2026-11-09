// Phase 20: runs belong to crew members, and the agent's status and caps are respected.
// Needs the local Supabase stack (`npx supabase start`, then `npx supabase db reset`).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { processJob } from "../src/runner.js";
import { claimNext } from "../src/worker.js";
import { mockRuntime } from "../src/runtime/mock.js";
import { STUDYBUDDY, balance, enqueue, testConfig, testDb } from "./local.js";

const db = testDb();
const deps = { db, config: testConfig(), runtime: mockRuntime };

async function agent(key: string) {
  const { data } = await db
    .from("agents")
    .select("id, status, budget_per_run_credits, budget_per_month_credits")
    .eq("company_id", STUDYBUDDY)
    .eq("catalogue_key", key)
    .single();
  return data!;
}

let nova: Awaited<ReturnType<typeof agent>>;

beforeAll(async () => {
  await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
  nova = await agent("nova");
});

afterEach(async () => {
  await db
    .from("agents")
    .update({
      status: "active",
      budget_per_run_credits: nova.budget_per_run_credits,
      budget_per_month_credits: null,
    })
    .eq("id", nova.id);
});

describe("crew runs", () => {
  it("records the crew member on the run and the job", async () => {
    const queued = await enqueue(db, STUDYBUDDY, "social_post", { title: "Crew post" });
    const job = await claimNext(db, "test", ["social_post"]);
    const res = await processJob(deps, job!);
    expect(res.outcome).toBe("done");
    const { data: run } = await db
      .from("agent_runs")
      .select("agent_id")
      .eq("id", res.runId!)
      .single();
    expect(run!.agent_id).toBe(nova.id);
    const { data: j } = await db.from("agent_jobs").select("agent_id").eq("id", queued.id).single();
    expect(j!.agent_id).toBe(nova.id);
  });

  it("doesn't run a paused agent, and charges nothing", async () => {
    await db.from("agents").update({ status: "paused" }).eq("id", nova.id);
    const before = await balance(db, STUDYBUDDY);
    await enqueue(db, STUDYBUDDY, "social_post", { title: "Paused post" });
    const job = await claimNext(db, "test", ["social_post"]);
    const res = await processJob(deps, job!);
    expect(res.outcome).toBe("failed");
    expect(res.runId).toBeUndefined();
    expect(await balance(db, STUDYBUDDY)).toBe(before);
    const { data: msg } = await db
      .from("chat_messages")
      .select("content")
      .eq("company_id", STUDYBUDDY)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(msg!.content).toMatch(/Nova is paused/);
  });

  it("never reserves more than the agent's per-run cap", async () => {
    await db.from("agents").update({ budget_per_run_credits: 45 }).eq("id", nova.id);
    await enqueue(db, STUDYBUDDY, "social_post", { title: "Capped post" });
    const job = await claimNext(db, "test", ["social_post"]);
    const res = await processJob(deps, job!);
    expect(res.outcome).toBe("done");
    expect(res.charged).toBeLessThanOrEqual(45);
    const { data: hold } = await db
      .from("credit_ledger")
      .select("amount")
      .eq("run_id", res.runId!)
      .eq("entry_type", "hold");
    expect(Math.max(...hold!.map((h) => -h.amount))).toBeLessThanOrEqual(45);
  });

  it("stops at the agent's monthly cap without creating a run", async () => {
    await db.from("agents").update({ budget_per_month_credits: 1 }).eq("id", nova.id);
    const before = await balance(db, STUDYBUDDY);
    await enqueue(db, STUDYBUDDY, "social_post", { title: "Over the month" });
    const job = await claimNext(db, "test", ["social_post"]);
    const res = await processJob(deps, job!);
    expect(res.outcome).toBe("failed");
    expect(res.runId).toBeUndefined();
    expect(await balance(db, STUDYBUDDY)).toBe(before);
  });
});
