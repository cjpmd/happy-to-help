import { afterAll, describe, expect, it } from "vitest";
import { advanceAutoMode, runScheduler } from "../src/scheduler.js";
import { processJob } from "../src/runner.js";
import { claimNext } from "../src/worker.js";
import { mockRuntime } from "../src/runtime/mock.js";
import { testConfig, testDb } from "./local.js";
import { localTime } from "../../src/lib/schedule.js";

const db = testDb();
const HARBOUR = "c0000000-0000-4000-8000-000000000005";
const STUDYBUDDY = "c0000000-0000-4000-8000-000000000001";

// A random Monday in a January years ahead (UK time is GMT then), so each run of these tests
// has its own periods.
const monday = (() => {
  const d = new Date(Date.UTC(2031 + Math.floor(Math.random() * 60), 0, 1));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7) + 7 * Math.floor(Math.random() * 3));
  return d;
})();
const at = (hhmmUtc: string) => new Date(`${monday.toISOString().slice(0, 10)}T${hhmmUtc}:00Z`);

async function withExpiryClaimed(now: Date) {
  // Expiring credits at a future date would expire today's real lots; claim it first.
  await db.rpc("claim_schedule", {
    p_kind: "expire_credits",
    p_period: localTime(now).date,
  } as never);
}

const run = async (jobType: string) =>
  processJob(
    { db, config: testConfig(), runtime: mockRuntime },
    (await claimNext(db, "test", [jobType]))!,
  );

afterAll(async () => {
  await db.from("routines").update({ enabled: false }).eq("company_id", HARBOUR);
  await db.from("company_automation").delete().in("company_id", [HARBOUR, STUDYBUDDY]);
  await db.from("auto_sessions").update({ status: "stopped" }).eq("status", "running");
});

describe("routines", () => {
  it("queue the morning brief once, from 07:00 UK time, and the brief reaches the founder", async () => {
    await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
    await db
      .from("routines")
      .update({ enabled: true })
      .eq("company_id", HARBOUR)
      .eq("job_type", "morning_brief");
    const early = at("06:30");
    await withExpiryClaimed(early);
    expect((await runScheduler(db, early)).routines).toBe(0);
    const now = at("08:05");
    expect((await runScheduler(db, now)).routines).toBe(1);
    expect((await runScheduler(db, now)).routines).toBe(0);
    const res = await run("morning_brief");
    expect(res.outcome).toBe("done");
    const { data: brief } = await db
      .from("briefs")
      .select("content")
      .eq("company_id", HARBOUR)
      .eq("brief_date", localTime(new Date()).date)
      .single();
    expect(brief!.content).toMatch(/^Good morning\. Here's Harbour Bakes/);
    expect(brief!.content).toMatch(/Balance: [\d,]+ credits\./);
  });
});

describe("the nightly loop", () => {
  it("works on the best open task, within the founder's cap", async () => {
    await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
    await db
      .from("company_automation")
      .upsert({ company_id: STUDYBUDDY, nightly_enabled: true, nightly_cap_credits: 90 });
    const night = at("03:30");
    await withExpiryClaimed(night);
    expect((await runScheduler(db, night)).nightly).toBe(1);
    const { data: job } = await db
      .from("agent_jobs")
      .select("task_id, estimated_credits, payload")
      .eq("company_id", STUDYBUDDY)
      .eq("job_type", "nightly")
      .eq("status", "queued")
      .single();
    expect(job!.task_id).not.toBeNull();
    expect(job!.estimated_credits).toBe(90);
    const res = await run("nightly");
    expect(res.outcome).toBe("done");
    expect(res.charged).toBeLessThanOrEqual(90);
    expect((await runScheduler(db, night)).nightly).toBe(0);
  });

  it("skips the weekly voice review when there's too little to learn from", async () => {
    await db.from("company_automation").upsert({ company_id: HARBOUR, voice_review_enabled: true });
    const morning = at("07:30");
    await withExpiryClaimed(morning);
    expect((await runScheduler(db, morning)).voice).toBe(0);
  });
});

describe("Auto Mode", () => {
  it("runs one step at a time until the cap or the time is used, then reports", async () => {
    await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
    await db
      .from("auto_sessions")
      .update({ status: "stopped" })
      .eq("company_id", STUDYBUDDY)
      .eq("status", "running");
    const { data: s } = await db
      .from("auto_sessions")
      .insert({
        company_id: STUDYBUDDY,
        started_at: new Date(Date.now() - 3_600_000).toISOString(),
        ends_at: new Date(Date.now() + 3_600_000).toISOString(),
        cap_credits: 200,
      })
      .select("id")
      .single();
    expect(await advanceAutoMode(db)).toBe(1);
    expect(await advanceAutoMode(db)).toBe(0); // a step is already queued
    const first = await run("auto_mode");
    expect(first.outcome).toBe("done");
    expect(await advanceAutoMode(db)).toBe(1);
    const { data: step2 } = await db
      .from("agent_jobs")
      .select("payload, estimated_credits")
      .eq("job_type", "auto_mode")
      .eq("status", "queued")
      .eq("payload->>auto_session", s!.id)
      .single();
    expect((step2!.payload as { max_credits: number }).max_credits).toBe(200 - first.charged!);
    await run("auto_mode");
    // Time's up: no more steps, and Sol says how it went.
    await db
      .from("auto_sessions")
      .update({ ends_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", s!.id);
    expect(await advanceAutoMode(db)).toBe(0);
    const { data: done } = await db
      .from("auto_sessions")
      .select("status, steps, spent_credits")
      .eq("id", s!.id)
      .single();
    expect(done).toMatchObject({ status: "finished", steps: 2 });
    expect(done!.spent_credits).toBeGreaterThan(0);
    expect(done!.spent_credits).toBeLessThanOrEqual(200);
  });
});
