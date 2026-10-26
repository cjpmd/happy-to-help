// The clock (Phase 8). Each minute the worker asks what's due in UK time and queues it, once:
// routines (including the 07:00 morning brief), the nightly loop, the weekly voice review,
// credit expiry, and the next step of any Auto Mode session. claim_schedule makes each firing
// happen once per company and period even with several workers.
import type { Db } from "./db/client.js";
import type { Json } from "./db/types.js";
import {
  NIGHTLY_AT,
  VOICE_REVIEW_AT,
  localTime,
  pickNextTask,
  routineDue,
  type Cadence,
} from "../../src/lib/schedule.js";

async function claim(
  db: Db,
  kind: string,
  company: string | null,
  ref: string | null,
  period: string,
) {
  // Global firings (credit expiry) have no company; nulls are passed explicitly.
  const { data, error } = await db.rpc("claim_schedule", {
    p_kind: kind,
    p_company: company,
    p_ref: ref,
    p_period: period,
  } as unknown as { p_kind: string; p_company: string; p_ref: string; p_period: string });
  if (error) throw new Error(`claim_schedule: ${error.message}`);
  return data === true;
}

async function queue(
  db: Db,
  company: string,
  jobType: string,
  payload: Record<string, unknown>,
  estimate: number,
  taskId?: string,
) {
  const { data, error } = await db
    .from("agent_jobs")
    .insert({
      company_id: company,
      job_type: jobType,
      payload: payload as { [k: string]: Json },
      estimated_credits: estimate,
      ...(taskId ? { task_id: taskId } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(`queue ${jobType}: ${error.message}`);
  return data.id;
}

export interface SchedulerResult {
  routines: number;
  nightly: number;
  voice: number;
  expired: boolean;
  autoSteps: number;
}

export async function runScheduler(db: Db, now = new Date()): Promise<SchedulerResult> {
  const out: SchedulerResult = { routines: 0, nightly: 0, voice: 0, expired: false, autoSteps: 0 };
  const t = localTime(now);

  // Routines the team switched on.
  const { data: routines } = await db
    .from("routines")
    .select("id, company_id, title, cadence, credits, job_type, run_at")
    .eq("enabled", true);
  for (const r of routines ?? []) {
    const { due, period } = routineDue(r.cadence as Cadence, r.run_at, now);
    if (!due || !(await claim(db, "routine", r.company_id, r.id, period))) continue;
    await queue(
      db,
      r.company_id,
      r.job_type,
      { title: r.title, routine_id: r.id, scheduled: true },
      r.credits,
    );
    await db.from("routines").update({ last_run_at: now.toISOString() }).eq("id", r.id);
    out.routines++;
  }

  // The nightly loop and weekly voice review, where switched on.
  const { data: automation } = await db
    .from("company_automation")
    .select("company_id, nightly_enabled, nightly_cap_credits, voice_review_enabled");
  for (const a of automation ?? []) {
    if (
      a.nightly_enabled &&
      a.nightly_cap_credits > 0 &&
      routineDue("daily", NIGHTLY_AT, now).due
    ) {
      if (await claim(db, "nightly", a.company_id, null, t.date)) {
        const [{ data: company }, { data: tasks }] = await Promise.all([
          db.from("companies").select("stage").eq("id", a.company_id).single(),
          db
            .from("tasks")
            .select("id, title, status, actor, key, stage, due")
            .eq("company_id", a.company_id),
        ]);
        const task = pickNextTask(tasks ?? [], company?.stage ?? "idea", t.date);
        if (task) {
          await queue(
            db,
            a.company_id,
            "nightly",
            { title: task.title, max_credits: a.nightly_cap_credits },
            Math.min(150, a.nightly_cap_credits),
            task.id,
          );
          out.nightly++;
        }
      }
    }
    if (
      a.voice_review_enabled &&
      t.weekday === 1 &&
      routineDue("daily", VOICE_REVIEW_AT, now).due
    ) {
      if (await claim(db, "voice_update", a.company_id, null, t.week)) {
        const { count } = await db
          .from("voice_edit_events")
          .select("id", { count: "exact", head: true })
          .eq("company_id", a.company_id)
          .is("used_at", null);
        // Not worth a run (or credits) without a few edits to learn from.
        if ((count ?? 0) >= 3) {
          await queue(
            db,
            a.company_id,
            "voice_update",
            { title: "Weekly voice review", scheduled: true },
            80,
          );
          out.voice++;
        }
      }
    }
  }

  // Credit expiry, once a day.
  if (await claim(db, "expire_credits", null, null, t.date)) {
    // Always the database's own clock: a clock passed in (tests, catch-up) must never expire
    // credits early.
    await db.rpc("expire_credits", {});
    out.expired = true;
  }

  out.autoSteps = await advanceAutoMode(db, now);
  return out;
}

/**
 * Auto Mode: one step at a time until the time is up or the cap is spent. Spending is what the
 * session's runs actually charged.
 */
export async function advanceAutoMode(db: Db, now = new Date()) {
  const { data: sessions, error } = await db
    .from("auto_sessions")
    .select("id, company_id, ends_at, cap_credits, steps")
    .eq("status", "running");
  if (error) throw new Error(`auto sessions: ${error.message}`);
  let started = 0;
  for (const s of sessions ?? []) {
    const { data: jobs, error: jobsError } = await db
      .from("agent_jobs")
      // Two foreign keys link jobs and runs; this is the job's own run.
      .select("id, status, run_id, agent_runs!agent_jobs_run_id_fkey(credits_charged)")
      .eq("company_id", s.company_id)
      .eq("job_type", "auto_mode")
      .eq("payload->>auto_session", s.id);
    if (jobsError) throw new Error(`auto steps: ${jobsError.message}`);
    const spent = (jobs ?? []).reduce(
      (n, j) => n + ((j.agent_runs as { credits_charged: number } | null)?.credits_charged ?? 0),
      0,
    );
    const busy = (jobs ?? []).some((j) => j.status === "queued" || j.status === "running");
    const timeUp = now >= new Date(s.ends_at);
    const capHit = spent >= s.cap_credits;
    if ((timeUp || capHit) && !busy) {
      await db
        .from("auto_sessions")
        .update({
          status: capHit ? "cap_reached" : "finished",
          spent_credits: spent,
          finished_at: now.toISOString(),
        })
        .eq("id", s.id)
        .eq("status", "running");
      await db.from("chat_messages").insert({
        company_id: s.company_id,
        sender: "sol",
        content: `Auto Mode ${capHit ? "reached its credit cap" : "finished"}: ${s.steps} ${s.steps === 1 ? "step" : "steps"}, ${spent} credits. Anything that needs your GO is in GO / NO-GO.`,
      });
      continue;
    }
    await db.from("auto_sessions").update({ spent_credits: spent }).eq("id", s.id);
    if (busy || timeUp || capHit) continue;
    const remaining = s.cap_credits - spent;
    await queue(
      db,
      s.company_id,
      "auto_mode",
      { title: `Auto Mode step ${s.steps + 1}`, auto_session: s.id, max_credits: remaining },
      Math.min(150, remaining),
    );
    await db
      .from("auto_sessions")
      .update({ steps: s.steps + 1 })
      .eq("id", s.id);
    started++;
  }
  return started;
}
