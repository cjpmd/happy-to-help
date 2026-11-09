// POST /functions/v1/chat { company_id, message } → server-sent events:
//   event: start  { message_id, run_id, model }
//   event: delta  { text }            (Sol's reply as it's written)
//   event: done   { reply_id, credits }
//   event: error  { error }
//
// Each turn is a run with the usual credit flow (CLAUDE.md rule 3): reserve, stream, settle the
// actual cost, refund if the platform fails. The smallest model by default, mid-tier when the
// founder asks for planning (SPEC C). Without ANTHROPIC_API_KEY (or with CHAT_MOCK=1) it streams
// the demo's replies at no cost to us.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { caller, cors, json, readJson, reportEdgeError, serviceClient } from "../_shared/http.ts";
import {
  chatSystemPrompt,
  chatTier,
  chunks,
  costUsd,
  mockReply,
  reservation,
  sse,
  type Tier,
} from "../_shared/logic.ts";

const MODELS: Record<Tier, string> = {
  routine: Deno.env.get("MODEL_ROUTINE") ?? "claude-haiku-5-5",
  planning: Deno.env.get("MODEL_PLANNING") ?? "claude-sonnet-5-5",
  strategy: Deno.env.get("MODEL_STRATEGY") ?? "claude-opus-5-5",
};
const HISTORY = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const who = await caller(req);
  if (!who) return json({ error: "Sign in first" }, 401);
  const body = await readJson<{ company_id?: string; message?: string }>(req);
  if (body instanceof Response) return body;
  const companyId = body.company_id ?? "";
  const message = (body.message ?? "").trim();

  // As the caller: may they chat for this company? Records their message.
  const begin = await who.sb.rpc("begin_chat_turn", { p_company: companyId, p_content: message });
  if (begin.error) return json({ error: begin.error.message }, 400);
  const messageId = begin.data as string;

  const svc = serviceClient();
  const tier = chatTier(message);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const mock = !apiKey || Deno.env.get("CHAT_MOCK") === "1";
  const model = MODELS[tier];

  const [{ data: jt }, { data: summary }] = await Promise.all([
    svc.from("job_types").select("estimate_credits, cap_credits").eq("job_type", "chat").single(),
    svc.rpc("credit_summary", { p_company: companyId }),
  ]);
  const estimate = (jt?.estimate_credits ?? 10) * (tier === "planning" ? 3 : 1);
  const cap = (jt?.cap_credits ?? 30) * (tier === "planning" ? 3 : 1);
  const s = summary as { balance: number; cohort_headroom: number } | null;
  const reserve = reservation(estimate, cap, (s?.balance ?? 0) + (s?.cohort_headroom ?? 0));
  if (reserve === null) {
    await svc.from("chat_messages").insert({
      company_id: companyId,
      sender: "sol",
      content: `I need about ${estimate} credits to reply and your balance is too low. Top up in Billing and ask me again.`,
    });
    return json({ error: "Not enough credits", code: "insufficient_credits" }, 402);
  }

  // Chat is Sol's (Phase 20): the run records the crew member that did it.
  const { data: solId } = await svc.rpc("agent_for_job", {
    p_company: companyId,
    p_job_type: "chat",
  });
  const { data: run, error: runError } = await svc
    .from("agent_runs")
    .insert({
      company_id: companyId,
      agent_id: solId ?? null,
      task: "Chat with Sol",
      pillar: "run",
      model: mock ? `${model} (mock)` : model,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runError || !run) return json({ error: "Couldn't start the run" }, 500);
  const held = await svc.rpc("reserve_credits", {
    p_company: companyId,
    p_run: run.id,
    p_amount: reserve,
    p_note: "Hold for chat",
  });
  if (held.error) {
    await svc
      .from("agent_runs")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return json({ error: held.error.message, code: "insufficient_credits" }, 402);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)));
      send("start", { message_id: messageId, run_id: run.id, model });
      let reply = "";
      try {
        let cost = 0;
        let usage = { input_tokens: 0, output_tokens: 0 };
        if (mock) {
          reply = mockReply(message);
          for (const c of chunks(reply)) {
            send("delta", { text: c });
            await new Promise((r) => setTimeout(r, 25));
          }
        } else {
          const [{ data: company }, { data: docs }, { data: history }] = await Promise.all([
            svc
              .from("companies")
              .select("name, description, stage, customer_type, goal_90d")
              .eq("id", companyId)
              .single(),
            svc.from("documents").select("id, title, outcomes").eq("company_id", companyId),
            svc
              .from("chat_messages")
              .select("sender, content")
              .eq("company_id", companyId)
              .order("created_at", { ascending: false })
              .limit(HISTORY),
          ]);
          const voiceDoc = (docs ?? []).find((d) => d.title === "Brand & voice guide");
          const { data: voice } = voiceDoc
            ? await svc
                .from("document_versions")
                .select("content")
                .eq("document_id", voiceDoc.id)
                .order("version", { ascending: false })
                .limit(1)
                .maybeSingle()
            : { data: null };
          const roadmap = (docs ?? []).find((d) => d.title === "Product roadmap");
          const unbuilt = ((roadmap?.outcomes ?? []) as { title: string; complete: boolean }[])
            .filter((o) => !o.complete)
            .map((o) => o.title);
          // The history ends with the founder's new message; the API wants alternating turns.
          const messages: Anthropic.MessageParam[] = [];
          for (const m of (history ?? []).reverse()) {
            const role = m.sender === "sol" ? "assistant" : "user";
            const last = messages.at(-1);
            if (last && last.role === role)
              last.content = `${last.content as string}\n\n${m.content}`;
            else messages.push({ role, content: m.content });
          }
          while (messages[0]?.role === "assistant") messages.shift();

          const client = new Anthropic({ apiKey });
          const response = client.messages.stream({
            model,
            max_tokens: tier === "planning" ? 4000 : 1200,
            output_config: { effort: tier === "planning" ? "medium" : "low" },
            system: [
              {
                type: "text",
                text: chatSystemPrompt({
                  company: company!,
                  voice: voice?.content ?? null,
                  unbuilt,
                }),
                cache_control: { type: "ephemeral" },
              },
            ],
            messages,
          });
          for await (const event of response) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              reply += event.delta.text;
              send("delta", { text: event.delta.text });
            }
          }
          const final = await response.finalMessage();
          if (final.stop_reason === "refusal" && !reply)
            reply = "I can't help with that one. Could you put it another way?";
          usage = {
            input_tokens: final.usage.input_tokens,
            output_tokens: final.usage.output_tokens,
          };
          const { data: price } = await svc
            .from("model_prices")
            .select("input_per_mtok, output_per_mtok")
            .eq("model", model)
            .maybeSingle();
          cost = price
            ? costUsd(final.usage, {
                input_per_mtok: Number(price.input_per_mtok),
                output_per_mtok: Number(price.output_per_mtok),
              })
            : 0;
        }
        const { data: reply_row } = await svc
          .from("chat_messages")
          .insert({ company_id: companyId, sender: "sol", content: reply.trim() || "…" })
          .select("id")
          .single();
        const { data: credits } = await svc.rpc("settle_run", {
          p_run: run.id,
          // The mock costs nothing in API terms; charge the estimate's worth so the demo flow is real.
          p_cost_usd: mock
            ? Number((await svc.rpc("usd_for_credits", { p_credits: estimate })).data ?? 0)
            : cost,
          p_note: "Chat with Sol",
        });
        await svc
          .from("agent_runs")
          .update({
            status: "succeeded",
            finished_at: new Date().toISOString(),
            usage,
            steps: [{ tool: "reply", summary: reply.slice(0, 160), credits: credits ?? 0 }],
          })
          .eq("id", run.id);
        send("done", { reply_id: reply_row?.id ?? null, credits: credits ?? 0 });
      } catch (e) {
        // The platform failed: give everything back and say so.
        await svc.rpc("refund_run", { p_run: run.id, p_reason: "chat failed" });
        await svc
          .from("agent_runs")
          .update({ status: "failed", finished_at: new Date().toISOString() })
          .eq("id", run.id);
        await svc.from("chat_messages").insert({
          company_id: companyId,
          sender: "sol",
          content: "Sorry, I couldn't reply just then. Nothing was charged. Please try again.",
        });
        await reportEdgeError("chat", e, { company: companyId, run: run.id });
        // People see a plain message; the details go to error monitoring.
        send("error", { error: "Sol couldn't reply just then. Nothing was charged." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
});
