// POST /functions/v1/enqueue-job { company_id, job_type, payload?, task_id?, estimated_credits? }
// Queues agent work for the signed-in founder or teammate. The estimate comes from the
// job_types catalogue (enqueue_job enforces it), and the response says what it will cost.
import { caller, cors, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const who = await caller(req);
  if (!who) return json({ error: "Sign in first" }, 401);
  let body: {
    company_id?: string;
    job_type?: string;
    payload?: Record<string, unknown>;
    task_id?: string;
    estimated_credits?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Send a JSON body" }, 400);
  }
  if (!body.company_id || !body.job_type)
    return json({ error: "company_id and job_type are required" }, 400);

  const { data: id, error } = await who.sb.rpc("enqueue_job", {
    p_company: body.company_id,
    p_job_type: body.job_type,
    p_payload: body.payload ?? {},
    ...(body.task_id ? { p_task: body.task_id } : {}),
    ...(body.estimated_credits ? { p_estimated_credits: body.estimated_credits } : {}),
  });
  if (error) return json({ error: error.message, code: error.hint ?? null }, 400);
  const { data: job } = await who.sb
    .from("agent_jobs")
    .select("id, estimated_credits, status")
    .eq("id", id)
    .single();
  return json({
    job_id: id,
    estimated_credits: job?.estimated_credits ?? null,
    status: job?.status ?? "queued",
  });
});
