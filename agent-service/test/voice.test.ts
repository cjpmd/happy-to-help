import { describe, expect, it } from "vitest";
import { checkAutoSend } from "../src/executor/rules.js";
import { drainApprovals } from "../src/executor/executor.js";
import { mockProviders } from "../src/executor/providers.js";
import { processJob } from "../src/runner.js";
import { claimNext } from "../src/worker.js";
import { mockRuntime } from "../src/runtime/mock.js";
import { enqueue, testConfig, testDb } from "./local.js";
import type { Json } from "../src/db/types.js";

const db = testDb();
const HARBOUR = "c0000000-0000-4000-8000-000000000005";
const RORY = "a0000000-0000-4000-8000-000000000006";
const ready = {
  category: "general_enquiry",
  triage: {},
  policyMode: "auto_send" as const,
  voiceApproved: true,
  policyReviewed: true,
};

describe("automatic reply rules", () => {
  it("sends only when the policy, the voice and the review all allow it", () => {
    expect(checkAutoSend(ready)).toEqual({ ok: true });
    expect(checkAutoSend({ ...ready, policyMode: "draft" })).toMatchObject({ ok: false });
    expect(checkAutoSend({ ...ready, voiceApproved: false })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/approved its voice/),
    });
    expect(checkAutoSend({ ...ready, policyReviewed: false })).toMatchObject({ ok: false });
  });
  it("always escalates money, legal threats, safety, vulnerability, data requests and unverifiable claims", () => {
    expect(checkAutoSend({ ...ready, category: "refund_request" })).toMatchObject({
      ok: false,
      needsFounder: true,
    });
    expect(checkAutoSend({ ...ready, category: "legal_threat" })).toMatchObject({ ok: false });
    for (const flag of [
      "money",
      "legal",
      "safety",
      "vulnerable",
      "data_request",
      "unverified_claim",
    ])
      expect(checkAutoSend({ ...ready, triage: { [flag]: true } })).toMatchObject({
        ok: false,
        needsFounder: true,
      });
  });
});

describe("voice analysis", () => {
  it("proposes a voice from the company's writing; GO adopts it", async () => {
    await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
    await enqueue(db, HARBOUR, "voice_analysis", {});
    const res = await processJob(
      { db, config: testConfig(), runtime: mockRuntime },
      (await claimNext(db, "test", ["voice_analysis"]))!,
    );
    expect(res.approvals).toBe(1);
    const { data: proposal } = await db
      .from("voice_profiles")
      .select("id, status, source, sign_off, use_phrases")
      .eq("company_id", HARBOUR)
      .eq("status", "proposed")
      .single();
    expect(proposal).toMatchObject({ source: "analysis", sign_off: "Best wishes" });
    expect(proposal!.use_phrases).toContain("fresh from the oven");
    const { data: before } = await db
      .from("voice_profiles")
      .select("source")
      .eq("company_id", HARBOUR)
      .eq("status", "approved")
      .single();
    expect(before!.source).toBe("default");

    await db
      .from("approvals")
      .update({
        status: "approved",
        decided_by: RORY,
        decided_at: new Date().toISOString(),
        execution_status: "queued",
      })
      .eq("company_id", HARBOUR)
      .eq("action_type", "update_voice")
      .eq("status", "pending");
    expect(await drainApprovals({ db, providers: mockProviders(), workerId: "test" })).toEqual([
      "done",
    ]);
    const { data: after } = await db
      .from("voice_profiles")
      .select("id, source")
      .eq("company_id", HARBOUR)
      .eq("status", "approved")
      .single();
    expect(after).toEqual({ id: proposal!.id, source: "analysis" });
  });
});

describe("replies from Sol", () => {
  async function approvedReply(
    payload: Record<string, unknown>,
    decidedBy: string | null,
    runId: string | null,
  ) {
    const { data } = await db
      .from("approvals")
      .insert({
        company_id: HARBOUR,
        run_id: runId,
        action_type: "send_email",
        payload: payload as { [k: string]: Json },
        estimated_credits: 5,
        status: "approved",
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        execution_status: "queued",
      })
      .select("id")
      .single();
    return data!.id;
  }

  it("never auto-sends a reply to a refund request, whatever the policy", async () => {
    const id = await approvedReply(
      {
        to: "fiona.reid@example.com",
        subject: "Re: refund",
        body: "Sorted!",
        auto_send: true,
        triage: { category: "refund_request" },
      },
      null,
      null,
    );
    expect(await drainApprovals({ db, providers: mockProviders(), workerId: "test" })).toEqual([
      "blocked",
    ]);
    // It isn't sent: it waits for the founder's GO, with the reason (Phase 14).
    const { data } = await db.from("approvals").select("status, payload").eq("id", id).single();
    expect(data!.status).toBe("pending");
    expect((data!.payload as { held_reason: string; auto_send: boolean }).held_reason).toMatch(
      /always go to you/,
    );
    expect((data!.payload as { auto_send: boolean }).auto_send).toBe(false);
  });

  it("adds the AI disclosure to replies Sol drafted", async () => {
    const { data: run } = await db
      .from("agent_runs")
      .select("id")
      .eq("company_id", HARBOUR)
      .limit(1)
      .single();
    const { data: thread } = await db
      .from("email_threads")
      .select("id")
      .eq("company_id", HARBOUR)
      .limit(1)
      .single();
    await approvedReply(
      {
        to: "ahmed.khan@example.com",
        subject: "Re: Breakfast",
        body: "Yes, we can do Friday.",
        thread_id: thread!.id,
      },
      RORY,
      run!.id,
    );
    expect(await drainApprovals({ db, providers: mockProviders(), workerId: "test" })).toEqual([
      "done",
    ]);
    const { data: last } = await db
      .from("email_messages")
      .select("body")
      .eq("thread_id", thread!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(last!.body).toBe("Yes, we can do Friday.\n\n— Drafted with our AI assistant");
  });
});
