/**
 * Single boundary for all AI agent calls from the app (CLAUDE.md conventions).
 *
 * Live mode (Supabase configured): work is queued through the enqueue-job Edge Function and
 * picked up by the agent service; Sol chat streams from the chat Edge Function. Every call
 * reserves, settles and refunds credits on the server.
 * Demo mode: canned replies and simulated work, as before.
 */
import { getSupabase, isLiveMode } from "@/integrations/supabase/client";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TASK_CREDITS: Record<string, number> = {
  social_post: 40,
  email: 30,
  landing_page: 600,
  site_change: 150,
  compliance_doc: 120,
  investor_research: 200,
  interview_synthesis: 80,
  ad_campaign: 90,
};

/** Live job estimates from the job_types table, cached once loaded. */
let liveEstimates: Record<string, number> | null = null;
export function setLiveEstimates(estimates: Record<string, number>) {
  liveEstimates = estimates;
}

/** Thrown when the server refuses agent work; the message is written for people. */
export class AgentError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

async function functionUrl(name: string) {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AgentError("Sign in first", "not_signed_in");
  const base = import.meta.env.VITE_SUPABASE_URL!.replace(/\/$/, "");
  return {
    url: `${base}/functions/v1/${name}`,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      "Content-Type": "application/json",
    },
  };
}

/** Reads a server-sent event stream, calling `onEvent` for each event. */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: unknown) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.*)$/m.exec(raw)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(raw)?.[1];
      onEvent(event, data ? JSON.parse(data) : null);
    }
  }
}

/**
 * Sends a message to Sol. Live: streams the reply (onDelta gets each piece) and resolves with
 * the whole reply once it's saved. Demo: a canned reply after a pause.
 */
export async function sendChatMessage(
  companyId: string,
  text: string,
  onDelta?: (text: string) => void,
): Promise<{ reply: string }> {
  if (isLiveMode) {
    const { url, headers } = await functionUrl("chat");
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ company_id: companyId, message: text }),
    });
    if (!res.ok || !res.body) {
      const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      throw new AgentError(err.error ?? "Sol couldn't reply", err.code ?? null);
    }
    let reply = "";
    let failure: string | null = null;
    await readSse(res.body, (event, data) => {
      const d = data as { text?: string; error?: string };
      if (event === "delta" && d.text) {
        reply += d.text;
        onDelta?.(d.text);
      } else if (event === "error") failure = d.error ?? "Chat failed";
    });
    if (failure) throw new AgentError(failure);
    return { reply };
  }
  await wait(900);
  const t = text.toLowerCase();
  let reply =
    "Got it. I'll add that to tonight's plan and have a draft ready for your approval by the morning.";
  if (t.includes("waitlist") || t.includes("signup"))
    reply =
      "Signups are up 18% week on week, mostly from the TikTok revision-hack posts. I'd suggest doubling down there tonight.";
  else if (t.includes("ad") || t.includes("spend"))
    reply =
      "I've proposed a £30 test on Instagram aimed at S5 students in Scotland. It's waiting in your approvals.";
  else if (t.includes("legal") || t.includes("privacy"))
    reply =
      "Your privacy policy is drafted and the ICO fee is due on 14 Nov 2026. I can file it once you approve.";
  onDelta?.(reply);
  return { reply };
}

/** Queues agent work. Resolves with the job id and the server's estimate. */
export async function enqueueJob(
  companyId: string,
  jobType: string,
  payload: Record<string, unknown> = {},
  taskId?: string,
  estimatedCredits?: number,
): Promise<{ jobId: string; estimatedCredits: number }> {
  if (!isLiveMode) {
    await wait(400);
    return {
      jobId: `job_${Date.now()}`,
      estimatedCredits: estimatedCredits ?? estimateTaskCredits(jobType),
    };
  }
  const { data, error } = await getSupabase().functions.invoke<{
    job_id: string;
    estimated_credits: number;
  }>("enqueue-job", {
    body: {
      company_id: companyId,
      job_type: jobType,
      payload,
      ...(taskId ? { task_id: taskId } : {}),
      ...(estimatedCredits ? { estimated_credits: estimatedCredits } : {}),
    },
  });
  if (error || !data) {
    // functions.invoke wraps non-2xx responses; the body has the server's message.
    const ctx = (error as { context?: Response } | null)?.context;
    const body = ctx ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null;
    throw new AgentError(body?.error ?? error?.message ?? "Couldn't queue the work");
  }
  return { jobId: data.job_id, estimatedCredits: data.estimated_credits };
}

export async function runTask(
  companyId: string,
  taskId: string,
): Promise<{ runId: string; status: "queued" }> {
  const { jobId } = await enqueueJob(companyId, "task", {}, taskId);
  return { runId: jobId, status: "queued" };
}

export function estimateTaskCredits(taskType: string): number {
  return liveEstimates?.[taskType] ?? TASK_CREDITS[taskType] ?? 100;
}

export async function simulateWork(
  kind: string,
  title: string,
): Promise<{ success: boolean; url?: string; reason?: string }> {
  await wait(1800);
  if (title.toLowerCase().includes("fail"))
    return { success: false, reason: "Demo provider timeout. Try again with a new prompt." };
  return {
    success: true,
    ...(kind === "image"
      ? { url: "/media/revision.svg" }
      : kind === "video"
        ? { url: "/media/revision.svg" }
        : {}),
  };
}
