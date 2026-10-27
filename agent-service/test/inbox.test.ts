import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processJob } from "../src/runner.js";
import { claimNext } from "../src/worker.js";
import { mockRuntime } from "../src/runtime/mock.js";
import { processInbox } from "../src/scheduler.js";
import { drainApprovals } from "../src/executor/executor.js";
import { mockProviders } from "../src/executor/providers.js";
import { testConfig, testDb } from "./local.js";

const db = testDb();
const CROFT = "c0000000-0000-4000-8000-000000000004";

const run = async (jobType: string) =>
  processJob(
    { db, config: testConfig(), runtime: mockRuntime },
    (await claimNext(db, "test", [jobType]))!,
  );

async function receive(subject: string, body: string) {
  const { data } = await db.rpc("receive_inbound_email", {
    p_company: CROFT,
    p_from_address: `cust.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`,
    p_from_name: "Casey Brown",
    p_subject: subject,
    p_body: body,
    p_message_id: `msg_${Date.now()}_${Math.random()}`,
  });
  const { data: item } = await db.from("inbox_items").select("id").eq("thread_id", data!).single();
  return item!.id;
}

const item = async (id: string) =>
  (
    await db
      .from("inbox_items")
      .select("status, category, mode, flags, approval_id")
      .eq("id", id)
      .single()
  ).data!;

beforeAll(async () => {
  await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
  await db
    .from("inbox_items")
    .update({ status: "closed" })
    .eq("company_id", CROFT)
    .in("status", ["new", "waiting_for_budget"]);
  await db
    .from("response_settings")
    .update({ inbox_daily_cap: 1000, policy_reviewed_at: new Date().toISOString() })
    .eq("company_id", CROFT);
  await db
    .from("response_policies")
    .update({ mode: "auto_send" })
    .eq("company_id", CROFT)
    .eq("category", "booking");
  await db
    .from("voice_profiles")
    .update({ source: "manual" })
    .eq("company_id", CROFT)
    .eq("status", "approved");
});
afterAll(async () => {
  await db
    .from("response_settings")
    .update({ inbox_daily_cap: 0, policy_reviewed_at: null })
    .eq("company_id", CROFT);
  await db
    .from("response_policies")
    .update({ mode: "draft" })
    .eq("company_id", CROFT)
    .eq("category", "booking");
  await db
    .from("voice_profiles")
    .update({ source: "default" })
    .eq("company_id", CROFT)
    .eq("status", "approved");
});

describe("inbox pipeline", () => {
  it("triages, drafts and auto-sends a booking reply where the policy allows, with the disclosure", async () => {
    const id = await receive(
      "Table on Saturday",
      "Hi, can I book a table for 4 on Saturday evening?",
    );
    expect((await item(id)).status).toBe("new");
    expect(await processInbox(db)).toBeGreaterThanOrEqual(1);
    await run("inbox_triage");
    expect(await item(id)).toMatchObject({
      status: "drafting",
      category: "booking",
      mode: "auto_send",
    });
    await run("inbox_draft");
    const it1 = await item(id);
    const { data: approval } = await db
      .from("approvals")
      .select("status, execution_status, payload")
      .eq("id", it1.approval_id!)
      .single();
    expect(approval).toMatchObject({ status: "approved", execution_status: "queued" });
    expect(await drainApprovals({ db, providers: mockProviders(), workerId: "test" })).toContain(
      "done",
    );
    expect((await item(id)).status).toBe("sent");
    const { data: sent } = await db
      .from("email_messages")
      .select("body")
      .eq("direction", "sent")
      .eq("thread_id", (approval!.payload as { thread_id: string }).thread_id)
      .single();
    expect(sent!.body).toMatch(/^Hi Casey,/);
    expect(sent!.body).toContain("— Drafted with our AI assistant");
  });

  it("escalates a refund request without drafting anything", async () => {
    const id = await receive("Refund please", "My order was wrong and I'd like my money back.");
    await processInbox(db);
    await run("inbox_triage");
    expect(await item(id)).toMatchObject({
      status: "escalated",
      category: "refund_request",
      mode: "escalate",
    });
    const { count } = await db
      .from("agent_jobs")
      .select("id", { count: "exact", head: true })
      .eq("job_type", "inbox_draft")
      .eq("status", "queued");
    expect(count).toBe(0);
    const { data: chat } = await db
      .from("chat_messages")
      .select("content")
      .eq("company_id", CROFT)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(chat!.content).toMatch(/needs you: refund requests always come to you/);
  });

  it("holds an automatic reply for the founder when the voice isn't approved yet", async () => {
    await db
      .from("voice_profiles")
      .update({ source: "default" })
      .eq("company_id", CROFT)
      .eq("status", "approved");
    const id = await receive("Booking for Friday", "Could I reserve a table for 2 on Friday?");
    await processInbox(db);
    await run("inbox_triage");
    await run("inbox_draft");
    expect(await drainApprovals({ db, providers: mockProviders(), workerId: "test" })).toContain(
      "blocked",
    );
    const it3 = await item(id);
    expect(it3.status).toBe("awaiting_approval");
    const { data: approval } = await db
      .from("approvals")
      .select("status, payload")
      .eq("id", it3.approval_id!)
      .single();
    expect(approval!.status).toBe("pending");
    expect((approval!.payload as { held_reason: string }).held_reason).toMatch(
      /approved its voice/,
    );
    await db
      .from("voice_profiles")
      .update({ source: "manual" })
      .eq("company_id", CROFT)
      .eq("status", "approved");
  });

  it("keeps to the daily budget and tells the founder once", async () => {
    await db.from("response_settings").update({ inbox_daily_cap: 1 }).eq("company_id", CROFT);
    const a = await receive("Question", "Do you deliver to Dundee?");
    const b = await receive("Another", "Are you open on Sundays?");
    expect(await processInbox(db)).toBe(0);
    expect((await item(a)).status).toBe("waiting_for_budget");
    expect((await item(b)).status).toBe("waiting_for_budget");
    await processInbox(db);
    const { count } = await db
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("company_id", CROFT)
      .like("content", "Today's inbox budget%");
    expect(count).toBe(1);
  });
});
