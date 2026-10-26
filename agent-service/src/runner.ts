// Runs one claimed job end to end (CLAUDE.md rule 3, SPEC C):
//   estimate → reserve (hold) → run with maxBudgetUsd = min(task cap, balance in USD)
//   → settle the actual cost and release the rest → auto-refund if the platform failed.
// A platform failure is retried once (max_attempts, default 2), then escalated to the founder
// with a plain message. Nothing is charged for failed attempts.
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { must } from "./db/client.js";
import type { Json, Tables } from "./db/types.js";
import { jobSpec, type JobSpec } from "./jobs.js";
import type { AgentRuntime, RunOutcome, RunStep } from "./runtime/types.js";
import { loadMemoryInput, prepareWorkspace } from "./workspace.js";
import { failCapture, prepareCapture } from "./capture/prepare.js";
import { mockTranscription, type TranscriptionProvider } from "./capture/transcription.js";

export type Job = Tables<"agent_jobs">;

export interface RunnerDeps {
  db: Db;
  config: Config;
  runtime: AgentRuntime;
  /** Speech-to-text for uploaded recordings (mock unless configured). */
  transcription?: TranscriptionProvider;
  log?: (msg: string) => void;
}

export interface JobResult {
  outcome: "done" | "retry" | "failed" | "insufficient_credits";
  runId?: string;
  charged?: number;
  approvals?: number;
}

/** Minutes to wait before the next attempt. */
const backoffMinutes = (attempt: number) => Math.min(30, 2 ** attempt);

async function say(db: Db, companyId: string, content: string) {
  await db.from("chat_messages").insert({ company_id: companyId, sender: "sol", content });
}

async function event(db: Db, companyId: string, type: string, summary: string, runId?: string) {
  await db.from("activity_events").insert({
    company_id: companyId,
    type,
    summary: summary.length > 300 ? `${summary.slice(0, 297)}…` : summary,
    ...(runId ? { run_id: runId } : {}),
  });
}

async function finishJob(db: Db, job: Job, status: "done" | "failed", lastError?: string) {
  await db
    .from("agent_jobs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      locked_by: null,
      ...(lastError ? { last_error: lastError } : {}),
    })
    .eq("id", job.id);
}

function jobInput(job: Job, chatText: string | undefined) {
  const p = (job.payload ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    ...(str(p["title"]) ? { title: str(p["title"])! } : {}),
    ...(chatText ? { message: chatText } : {}),
    // Capture and follow-up jobs carry the row they're about.
    ...(str(p["target"] ?? p["capture_id"] ?? p["commitment_id"])
      ? { target: str(p["target"] ?? p["capture_id"] ?? p["commitment_id"])! }
      : {}),
  };
}

export async function processJob(deps: RunnerDeps, job: Job): Promise<JobResult> {
  const { db, config, runtime } = deps;
  const log = deps.log ?? (() => {});
  const spec: JobSpec | undefined = jobSpec(job.job_type);
  if (!spec) {
    await finishJob(db, job, "failed", `Unknown job type ${job.job_type}`);
    await event(
      db,
      job.company_id,
      "escalation",
      `Sol doesn't know how to do "${job.job_type}" yet`,
    );
    return { outcome: "failed" };
  }

  // Chat jobs carry the message's id; the agent needs its text.
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  let chatText: string | undefined;
  if (job.job_type === "chat" && typeof payload["message_id"] === "string") {
    const { data } = await db
      .from("chat_messages")
      .select("content")
      .eq("id", payload["message_id"])
      .maybeSingle();
    chatText = data?.content;
  }
  const input = jobInput(job, chatText);
  const title = input.title ?? spec.label;

  // Estimate and check the balance (plus any cohort pool) before creating anything. The
  // job_types table is the source of estimates and caps; the spec's are the fallback.
  const { data: jt } = await db
    .from("job_types")
    .select("estimate_credits, cap_credits")
    .eq("job_type", job.job_type)
    .maybeSingle();
  const estimate =
    job.estimated_credits > 0 ? job.estimated_credits : (jt?.estimate_credits ?? spec.estimate);
  const cap = Math.max(estimate, jt?.cap_credits ?? spec.cap);
  const summary = must(
    await db.rpc("credit_summary", { p_company: job.company_id }),
    "credit summary",
  ) as {
    balance: number;
    cohort_headroom: number;
  };
  const available = summary.balance + summary.cohort_headroom;
  if (available < estimate) {
    await finishJob(
      db,
      job,
      "failed",
      `Not enough credits: needs ${estimate}, ${available} available`,
    );
    await event(
      db,
      job.company_id,
      "escalation",
      `${title} is waiting for credits (needs ≈ ${estimate})`,
    );
    await say(
      db,
      job.company_id,
      `I couldn't start "${title}": it needs about ${estimate} credits and ${available} are available. Top up in Billing and I'll pick it up again.`,
    );
    return { outcome: "insufficient_credits" };
  }
  const reserve = Math.max(estimate, Math.min(cap, available));
  const model = config.models[spec.tier];

  const run = must(
    await db
      .from("agent_runs")
      .insert({
        company_id: job.company_id,
        job_id: job.id,
        task_id: job.task_id,
        task: title,
        pillar: spec.pillar,
        model: config.runtime === "mock" ? `${model} (mock)` : model,
        status: "queued",
      })
      .select("id")
      .single(),
    "create run",
  );
  await db.from("agent_jobs").update({ run_id: run.id }).eq("id", job.id);

  try {
    must(
      await db.rpc("reserve_credits", {
        p_company: job.company_id,
        p_run: run.id,
        p_amount: reserve,
        p_note: `Hold for ${title}`,
      }),
      "reserve credits",
    );
  } catch (e) {
    // Someone spent the credits between the check and the hold.
    await db
      .from("agent_runs")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", run.id);
    await finishJob(db, job, "failed", e instanceof Error ? e.message : String(e));
    await say(
      db,
      job.company_id,
      `I couldn't start "${title}": there weren't enough credits to reserve. Top up in Billing.`,
    );
    return { outcome: "insufficient_credits", runId: run.id };
  }

  const maxBudgetUsd = Math.min(
    config.maxRunUsd,
    Number(must(await db.rpc("usd_for_credits", { p_credits: reserve }), "usd for credits")),
  );
  const estimateUsd = Number(
    must(await db.rpc("usd_for_credits", { p_credits: estimate }), "usd for estimate"),
  );
  await db
    .from("agent_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", run.id);
  if (job.task_id)
    await db.from("tasks").update({ status: "doing" }).eq("id", job.task_id).eq("status", "todo");
  await event(db, job.company_id, spec.pillar, `${title}…`, run.id);
  log(
    `run ${run.id}: ${job.job_type} for ${job.company_id}, reserved ${reserve} credits ($${maxBudgetUsd})`,
  );

  const heartbeat = setInterval(() => {
    void db.rpc("heartbeat_agent_job", { p_job: job.id, p_worker: config.workerId });
  }, 60_000);
  const ws = await prepareWorkspace(
    config.workspaceRoot,
    run.id,
    await loadMemoryInput(db, job.company_id),
    spec.skills,
  );
  let outcome: RunOutcome;
  // Transcription (for uploaded recordings) runs first and is charged with the run.
  let preUsd = 0;
  try {
    if (job.job_type === "capture_process" && input.target)
      preUsd = (await prepareCapture(db, deps.transcription ?? mockTranscription, input.target))
        .costUsd;
    outcome = await runtime.run({
      jobType: job.job_type,
      prompt: spec.prompt(input),
      model,
      cwd: ws.dir,
      skills: spec.skills,
      tools: spec.tools,
      maxBudgetUsd: Math.max(0, maxBudgetUsd - preUsd),
      estimateUsd,
      maxTurns: spec.maxTurns,
      ctx: { db, companyId: job.company_id, runId: run.id },
      input,
      onStep: async (step: RunStep) => {
        await db.rpc("append_run_step", { p_run: run.id, p_step: step as unknown as Json });
      },
    });
  } catch (e) {
    outcome = {
      status: "error",
      costUsd: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
      text: "",
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearInterval(heartbeat);
    await ws.cleanup();
  }

  if (outcome.status !== "error") outcome = { ...outcome, costUsd: outcome.costUsd + preUsd };
  const now = new Date().toISOString();
  if (outcome.status === "error") {
    // The platform failed: give everything back, then retry or escalate.
    await db.rpc("refund_run", { p_run: run.id, p_reason: outcome.error ?? "run failed" });
    await db
      .from("agent_runs")
      .update({
        status: "failed",
        finished_at: now,
        usage: outcome.usage as unknown as { [key: string]: Json },
      })
      .eq("id", run.id);
    if (job.attempts < job.max_attempts) {
      await db
        .from("agent_jobs")
        .update({
          status: "queued",
          locked_by: null,
          last_error: outcome.error ?? "run failed",
          scheduled_for: new Date(Date.now() + backoffMinutes(job.attempts) * 60_000).toISOString(),
        })
        .eq("id", job.id);
      log(`run ${run.id} failed (${outcome.error}); retrying`);
      return { outcome: "retry", runId: run.id, charged: 0 };
    }
    await finishJob(db, job, "failed", outcome.error ?? "run failed");
    if (job.job_type === "capture_process" && input.target)
      await failCapture(db, input.target, outcome.error ?? "run failed");
    await event(
      db,
      job.company_id,
      "escalation",
      `${title} failed after ${job.attempts} tries — no credits used`,
      run.id,
    );
    await say(
      db,
      job.company_id,
      `I couldn't finish "${title}" after ${job.attempts} tries (${outcome.error ?? "an error on our side"}). Nothing was charged. Want me to try again later, or change the request?`,
    );
    return { outcome: "failed", runId: run.id, charged: 0 };
  }

  const charged = Number(
    must(
      await db.rpc("settle_run", { p_run: run.id, p_cost_usd: outcome.costUsd, p_note: title }),
      "settle run",
    ),
  );
  const { count: approvals } = await db
    .from("approvals")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .eq("status", "pending");
  await db
    .from("agent_runs")
    .update({
      status: approvals ? "needs_approval" : outcome.status === "success" ? "succeeded" : "failed",
      finished_at: now,
      usage: outcome.usage as unknown as { [key: string]: Json },
    })
    .eq("id", run.id);

  if (job.job_type === "chat" && outcome.text) await say(db, job.company_id, outcome.text);
  if (
    (job.job_type === "media_image" || job.job_type === "media_video") &&
    outcome.status === "success"
  )
    await db.from("media_assets").insert({
      company_id: job.company_id,
      job_id: job.id,
      kind: job.job_type === "media_image" ? "image" : "video",
      title,
      status: "ready",
      // Mock media provider until Phase 7 adds a real one.
      url: "/media/revision.svg",
    });

  if (outcome.status !== "success") {
    const why = outcome.status === "budget" ? "it reached its credit cap" : "it ran out of steps";
    await event(db, job.company_id, "escalation", `${title} stopped early: ${why}`, run.id);
    await say(
      db,
      job.company_id,
      `"${title}" stopped early because ${why} (${charged} credits used). ${outcome.text ? `Where I got to: ${outcome.text}` : ""}`.trim(),
    );
  } else if (job.job_type !== "chat") {
    await event(
      db,
      job.company_id,
      approvals ? "approval" : spec.pillar,
      approvals ? `${title}: ${approvals} waiting for your GO` : `${title}: done`,
      run.id,
    );
  }
  await finishJob(db, job, "done");
  log(`run ${run.id}: ${outcome.status}, charged ${charged} credits, ${approvals ?? 0} approvals`);
  return { outcome: "done", runId: run.id, charged, approvals: approvals ?? 0 };
}
