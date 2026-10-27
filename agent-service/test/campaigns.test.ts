import { describe, expect, it } from "vitest";
import { processJob } from "../src/runner.js";
import { claimNext } from "../src/worker.js";
import { mockRuntime } from "../src/runtime/mock.js";
import { drainApprovals } from "../src/executor/executor.js";
import { mockProviders } from "../src/executor/providers.js";
import { checkRules } from "../src/executor/rules.js";
import { enqueue, testConfig, testDb } from "./local.js";

const db = testDb();
const HARBOUR = "c0000000-0000-4000-8000-000000000005";
const RORY = "a0000000-0000-4000-8000-000000000006";

const run = async (jobType: string) =>
  processJob(
    { db, config: testConfig(), runtime: mockRuntime },
    (await claimNext(db, "test", [jobType]))!,
  );

const approve = (id: string) =>
  db
    .from("approvals")
    .update({
      status: "approved",
      decided_by: RORY,
      decided_at: new Date().toISOString(),
      execution_status: "queued",
    })
    .eq("id", id);

describe("campaigns", () => {
  it("goes plan → GO → assets with tracked links → GO per asset → scheduled, with results through its links", async () => {
    await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
    const goal = `More wedding cake enquiries ${Date.now()}`;
    await enqueue(db, HARBOUR, "campaign_plan", { title: "Plan a campaign", target: goal });
    expect((await run("campaign_plan")).approvals).toBe(1);
    const { data: c } = await db
      .from("campaigns")
      .select("id, status, approval_id, channels")
      .eq("goal", goal)
      .single();
    expect(c!.status).toBe("proposed");
    expect(c!.channels).toContain("email");

    await approve(c!.approval_id!);
    expect(await drainApprovals({ db, providers: mockProviders(), workerId: "test" })).toEqual([
      "done",
    ]);
    const { data: drafting } = await db.from("campaigns").select("status").eq("id", c!.id).single();
    expect(drafting!.status).toBe("drafting");

    const res = await run("campaign_assets");
    expect(res.outcome).toBe("done");
    const { data: assets } = await db
      .from("campaign_assets")
      .select("id, kind, channel, status, approval_id, link_id, body")
      .eq("campaign_id", c!.id);
    expect(assets!.length).toBeGreaterThanOrEqual(2);
    expect(assets!.every((a) => a.status === "awaiting_approval" && a.link_id)).toBe(true);
    expect(assets!.every((a) => /functions\/v1\/link\/[A-Za-z0-9]{8}$/.test(a.body))).toBe(true);
    // The email goes only to people who opted in (Fiona, in the seed).
    const email = assets!.find((a) => a.kind === "email");
    const { data: emailApproval } = await db
      .from("approvals")
      .select("payload")
      .eq("id", email!.approval_id!)
      .single();
    expect(emailApproval!.payload as { to: string; outreach: boolean }).toMatchObject({
      to: "fiona.reid@example.com",
      outreach: true,
    });

    const post = assets!.find((a) => a.kind === "social_post")!;
    await approve(post.approval_id!);
    expect(await drainApprovals({ db, providers: mockProviders(), workerId: "test" })).toEqual([
      "done",
    ]);
    const { data: after } = await db
      .from("campaign_assets")
      .select("status")
      .eq("id", post.id)
      .single();
    expect(["scheduled", "published"]).toContain(after!.status);

    // A click on the campaign's link counts in its results.
    const { data: link } = await db
      .from("tracked_links")
      .select("code")
      .eq("id", post.link_id!)
      .single();
    await db.rpc("follow_link", { p_code: link!.code });
    const { data: results } = await db
      .from("campaign_results")
      .select("clicks, leads, target")
      .eq("campaign_id", c!.id)
      .single();
    expect(results!.clicks).toBe(1);
  });

  it("only a founder approves a campaign plan", () => {
    const a = { action_type: "approve_campaign" as const, payload: {} };
    const rules = { adThreshold: 20, outreachThreshold: 25, publishing: false };
    expect(checkRules({ ...a, deciderRole: "founder" }, rules).ok).toBe(true);
    expect(checkRules({ ...a, deciderRole: "mentor" }, rules)).toMatchObject({
      ok: false,
      needsFounder: true,
    });
  });
});
