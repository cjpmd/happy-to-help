import { describe, expect, it } from "vitest";
import { drainApprovals } from "../src/executor/executor.js";
import { mockProviders } from "../src/executor/providers.js";
import { AISHA, STUDYBUDDY, balance, testDb } from "./local.js";
import type { Json } from "../src/db/types.js";

const db = testDb();
const MORAG = "a0000000-0000-4000-8000-000000000002"; // cohort mentor
const deps = { db, providers: mockProviders(), workerId: "test" };

/** An approval as if it had just been approved (decide_approval needs a signed-in user). */
async function approved(action: string, payload: Record<string, unknown>, by = AISHA, credits = 5) {
  const { data, error } = await db
    .from("approvals")
    .insert({
      company_id: STUDYBUDDY,
      action_type: action as "publish_post",
      payload: payload as { [key: string]: Json },
      estimated_credits: credits,
      status: "approved",
      decided_by: by,
      decided_at: new Date().toISOString(),
      execution_status: "queued",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
const state = async (id: string) =>
  (
    await db
      .from("approvals")
      .select("execution_status, execution_error, execution_result")
      .eq("id", id)
      .single()
  ).data!;

describe("approvals executor", () => {
  it("publishes an approved post, charges its credits and records the outcome", async () => {
    const before = await balance(db, STUDYBUDDY);
    const id = await approved("publish_post", {
      channel: "TikTok",
      text: "Ten minutes of revision a day.",
      angle: "Revision hack",
    });
    expect(await drainApprovals(deps)).toEqual(["done"]);
    const s = await state(id);
    expect(s.execution_status).toBe("done");
    expect((s.execution_result as { external_id: string }).external_id).toMatch(/^mock_post_/);
    expect(await balance(db, STUDYBUDDY)).toBe(before - 5);
    const { data: post } = await db
      .from("social_posts")
      .select("status")
      .eq("approval_id", id)
      .single();
    expect(post!.status).toBe("published");
    const { data: ev } = await db
      .from("activity_events")
      .select("summary")
      .eq("company_id", STUDYBUDDY)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(ev!.summary).toBe("Published TikTok post");
  });

  it("sets an ad budget a founder approved, and updates the account", async () => {
    await approved("ad_spend", {
      platform: "Meta Ads",
      daily_budget: 30,
      hard_cap: 50,
      amount_gbp: 30,
    });
    expect(await drainApprovals(deps)).toEqual(["done"]);
    const { data: ad } = await db
      .from("ad_accounts")
      .select("daily_budget, hard_cap")
      .eq("company_id", STUDYBUDDY)
      .single();
    expect(Number(ad!.daily_budget)).toBe(30);
  });

  it("blocks, without charging, an ad budget over the founder's alert that only a mentor approved", async () => {
    const before = await balance(db, STUDYBUDDY);
    const id = await approved(
      "ad_spend",
      { platform: "Meta Ads", daily_budget: 40, hard_cap: 50, amount_gbp: 40 },
      MORAG,
    );
    expect(await drainApprovals(deps)).toEqual(["blocked"]);
    expect((await state(id)).execution_error).toMatch(/founder must give the GO/);
    expect(await balance(db, STUDYBUDDY)).toBe(before);
    const { data: msg } = await db
      .from("chat_messages")
      .select("content")
      .eq("company_id", STUDYBUDDY)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(msg!.content).toMatch(/Nothing was charged/);
  });

  it("blocks a post a mentor approved when the founder asked to approve publishing", async () => {
    const id = await approved(
      "publish_post",
      { channel: "X", text: "A small update from the team." },
      MORAG,
    );
    expect(await drainApprovals(deps)).toEqual(["blocked"]);
    expect((await state(id)).execution_error).toMatch(/approve publishing themselves/);
  });

  it("re-checks claims before acting", async () => {
    const id = await approved("publish_post", {
      channel: "X",
      text: "The best revision app in Scotland",
    });
    expect(await drainApprovals(deps)).toEqual(["blocked"]);
    expect((await state(id)).execution_error).toMatch(/claims check now flags "best"/);
  });

  it("refunds a provider failure, retries once, then fails and tells the founder", async () => {
    const before = await balance(db, STUDYBUDDY);
    const id = await approved("send_email", {
      to: "s.khan@example.com",
      subject: "Hello",
      body: "Thanks! [provider-fail]",
    });
    expect(await drainApprovals(deps)).toEqual(["retry", "failed"]);
    const s = await state(id);
    expect(s.execution_status).toBe("failed");
    expect(await balance(db, STUDYBUDDY)).toBe(before);
    const { data: runs } = await db
      .from("approvals")
      .select("execution_attempts")
      .eq("id", id)
      .single();
    expect(runs!.execution_attempts).toBe(2);
  });

  it("sends an approved reply and adds it to the thread", async () => {
    const { data: thread } = await db
      .from("email_threads")
      .select("id")
      .eq("company_id", STUDYBUDDY)
      .eq("mode", "support")
      .limit(1)
      .single();
    await approved("send_email", {
      to: "s.khan@example.com",
      subject: "Re: Classroom beta",
      body: "We'd love to have your class.",
      thread_id: thread!.id,
    });
    expect(await drainApprovals(deps)).toEqual(["done"]);
    const { data: last } = await db
      .from("email_messages")
      .select("direction, body")
      .eq("thread_id", thread!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(last).toEqual({ direction: "sent", body: "We'd love to have your class." });
  });
});
