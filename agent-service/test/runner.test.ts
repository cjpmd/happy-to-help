import { beforeAll, describe, expect, it } from "vitest";
import { processJob } from "../src/runner.js";
import { claimNext, drain } from "../src/worker.js";
import { mockRuntime } from "../src/runtime/mock.js";
import { AISHA, CROFT, STUDYBUDDY, balance, enqueue, testConfig, testDb } from "./local.js";

const db = testDb();
const config = testConfig();
const deps = { db, config, runtime: mockRuntime };

beforeAll(async () => {
  // Nothing else should be queued for the job types these tests claim.
  await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
});

describe("running a job", () => {
  it("reserves, runs, proposes, settles and records the steps", async () => {
    const before = await balance(db, STUDYBUDDY);
    await enqueue(db, STUDYBUDDY, "social_post", { title: "Write today's post" });
    const job = await claimNext(db, "test", ["social_post"]);
    expect(job?.status).toBe("running");
    const res = await processJob(deps, job!);
    expect(res.outcome).toBe("done");
    expect(res.approvals).toBe(1);
    const { data: run } = await db.from("agent_runs").select("*").eq("id", res.runId!).single();
    expect(run!.status).toBe("needs_approval");
    expect((run!.steps as { tool: string }[]).map((s) => s.tool)).toContain("propose_post");
    expect(run!.credits_charged).toBe(res.charged);
    expect(res.charged).toBeGreaterThan(0);
    expect(res.charged).toBeLessThanOrEqual(120);
    expect(await balance(db, STUDYBUDDY)).toBe(before - res.charged!);
    const { data: held } = await db.rpc("credit_summary", { p_company: STUDYBUDDY });
    // Only the seed's still-running investor run holds anything.
    expect((held as { held: number }).held).toBe(80);
    const { data: post } = await db
      .from("social_posts")
      .select("status")
      .eq(
        "approval_id",
        (await db.from("approvals").select("id").eq("run_id", res.runId!).single()).data!.id,
      )
      .single();
    expect(post!.status).toBe("awaiting_approval");
    const { data: j } = await db.from("agent_jobs").select("status").eq("id", job!.id).single();
    expect(j!.status).toBe("done");
  });

  it("answers chat as Sol", async () => {
    const { data: msg } = await db
      .from("chat_messages")
      .insert({
        company_id: STUDYBUDDY,
        sender: "founder",
        author_id: AISHA,
        content: "How is the waitlist doing?",
      })
      .select("id")
      .single();
    await enqueue(db, STUDYBUDDY, "chat", { message_id: msg!.id });
    expect(await drain({ ...deps, types: ["chat"] })).toBe(1);
    const { data: last } = await db
      .from("chat_messages")
      .select("sender, content")
      .eq("company_id", STUDYBUDDY)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(last!.sender).toBe("sol");
    expect(last!.content).toMatch(/signups/);
  });

  it("refunds a platform failure, retries once, then escalates without charging", async () => {
    const before = await balance(db, STUDYBUDDY);
    const queued = await enqueue(db, STUDYBUDDY, "task", { title: "This will fail" });
    const first = await processJob(deps, (await claimNext(db, "test", ["task"]))!);
    expect(first.outcome).toBe("retry");
    // Make the retry due now.
    await db
      .from("agent_jobs")
      .update({ scheduled_for: new Date().toISOString() })
      .eq("id", queued.id);
    const second = await processJob(deps, (await claimNext(db, "test", ["task"]))!);
    expect(second.outcome).toBe("failed");
    expect(await balance(db, STUDYBUDDY)).toBe(before);
    const { data: job } = await db
      .from("agent_jobs")
      .select("status, attempts")
      .eq("id", queued.id)
      .single();
    expect(job).toEqual({ status: "failed", attempts: 2 });
    const { data: runs } = await db
      .from("agent_runs")
      .select("status, credits_charged")
      .eq("job_id", queued.id);
    expect(runs).toHaveLength(2);
    expect(runs!.every((r) => r.status === "failed" && r.credits_charged === 0)).toBe(true);
    const { data: msg } = await db
      .from("chat_messages")
      .select("content")
      .eq("company_id", STUDYBUDDY)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(msg!.content).toMatch(/after 2 tries.*Nothing was charged/);
  });

  it("doesn't start work the balance can't cover", async () => {
    await enqueue(db, CROFT, "task", { title: "Big build" }, 999999);
    const res = await processJob(deps, (await claimNext(db, "test", ["task"]))!);
    expect(res.outcome).toBe("insufficient_credits");
    expect(res.runId).toBeUndefined();
  });

  it("never gives the same job to two workers", async () => {
    await enqueue(db, STUDYBUDDY, "media_image", { title: "Hero image" });
    const [a, b] = await Promise.all([
      claimNext(db, "w1", ["media_image"]),
      claimNext(db, "w2", ["media_image"]),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    await processJob(deps, (a ?? b)!);
  });

  it("recovers a run a crashed worker left running, and refunds its hold", async () => {
    // Seed run r8 has been 'running' with an 80-credit hold and no job (bug B8).
    const before = await balance(db, STUDYBUDDY);
    const { data: n } = await db.rpc("reap_stale_runs", { p_stale: "1 minute" });
    expect(n).toBeGreaterThanOrEqual(1);
    const { data: r8 } = await db
      .from("agent_runs")
      .select("status")
      .eq("id", "e0000000-0000-4000-8000-000000000008")
      .single();
    expect(r8!.status).toBe("failed");
    expect(await balance(db, STUDYBUDDY)).toBe(before + 80);
  });
});
