import { describe, expect, it } from "vitest";
import { drainApprovals } from "../src/executor/executor.js";
import { mockProviders } from "../src/executor/providers.js";
import { checkRules } from "../src/executor/rules.js";
import { syncAds } from "../src/ads.js";
import { testDb } from "./local.js";

const db = testDb();
const HARBOUR = "c0000000-0000-4000-8000-000000000005";
const RORY = "a0000000-0000-4000-8000-000000000006";
const RUN = Date.now().toString(36).slice(-6);
let n = 0;

/** What propose_ad_launch makes, with the founder's GO already given. */
async function approvedLaunch(budget: number) {
  const { data: link } = await db
    .from("tracked_links")
    .insert({
      company_id: HARBOUR,
      code: `ad${RUN}${n++}`,
      destination: "https://harbourbakes.example",
      label: "Spring ad",
      channel: "meta",
    })
    .select("id")
    .single();
  const { data: ad } = await db
    .from("ad_campaigns")
    .insert({
      company_id: HARBOUR,
      platform: "meta",
      name: `Spring ${RUN}`,
      creative: "Fresh sourdough every morning.",
      daily_budget: budget,
      link_id: link!.id,
    })
    .select("id")
    .single();
  const { data: a } = await db
    .from("approvals")
    .insert({
      company_id: HARBOUR,
      action_type: "launch_ad",
      payload: {
        ad_campaign_id: ad!.id,
        platform: "meta",
        name: "Spring",
        daily_budget: budget,
        hard_cap: 50,
        monthly_cap: 300,
        creative: "Fresh sourdough every morning.",
      },
      estimated_credits: 10,
      requested_by: RORY,
      status: "approved",
      decided_by: RORY,
      decided_at: new Date().toISOString(),
      execution_status: "queued",
    })
    .select("id")
    .single();
  await db.from("ad_campaigns").update({ approval_id: a!.id }).eq("id", ad!.id);
  return { ad: ad!.id, link: link!.id };
}
const status = async (id: string) =>
  (
    await db
      .from("ad_campaigns")
      .select("status, external_id, spend, paused_reason")
      .eq("id", id)
      .single()
  ).data!;

describe("paid ads", () => {
  it("launches nothing while paid ads are switched off", async () => {
    const { ad } = await approvedLaunch(10);
    expect(
      await drainApprovals({ db, providers: mockProviders(), workerId: "test", adsEnabled: false }),
    ).toEqual(["blocked"]);
    expect(await status(ad)).toMatchObject({ status: "declined", external_id: null });
  });

  it("launches with a GO, brings spend into the ad's link, and pauses at the monthly cap", async () => {
    await db.from("ad_accounts").upsert({ company_id: HARBOUR, monthly_cap: 300 });
    const { ad, link } = await approvedLaunch(10);
    expect(
      await drainApprovals({ db, providers: mockProviders(), workerId: "test", adsEnabled: true }),
    ).toEqual(["done"]);
    expect((await status(ad)).status).toBe("active");

    const r = await syncAds(db, async () => mockProviders());
    expect(r.synced).toBeGreaterThanOrEqual(1);
    expect(Number((await status(ad)).spend)).toBe(8);
    const { data: l } = await db.from("tracked_links").select("spend_gbp").eq("id", link).single();
    expect(Number(l!.spend_gbp)).toBe(8);

    await db.from("ad_accounts").update({ monthly_cap: 5 }).eq("company_id", HARBOUR);
    expect((await syncAds(db, async () => mockProviders())).capped).toBe(1);
    expect(await status(ad)).toMatchObject({
      status: "paused",
      paused_reason: "Monthly ad cap reached",
    });
    const { data: chat } = await db
      .from("chat_messages")
      .select("content")
      .eq("company_id", HARBOUR)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(chat!.content).toMatch(/reached your cap of £5/);
    await db
      .from("ad_accounts")
      .update({ monthly_cap: 300, paused_reason: null })
      .eq("company_id", HARBOUR);
  });

  it("only a founder launches, within the caps", () => {
    const rules = { adThreshold: 0, outreachThreshold: 50, publishing: true };
    const a = { action_type: "launch_ad" as const, payload: { daily_budget: 20, hard_cap: 50 } };
    expect(checkRules({ ...a, deciderRole: "mentor" }, rules).ok).toBe(false);
    expect(checkRules({ ...a, deciderRole: "founder" }, rules).ok).toBe(true);
    expect(
      checkRules(
        { ...a, payload: { daily_budget: 60, hard_cap: 50 }, deciderRole: "founder" },
        rules,
      ).ok,
    ).toBe(false);
    expect(
      checkRules(
        { ...a, payload: { daily_budget: 150, hard_cap: 200 }, deciderRole: "founder" },
        rules,
      ).ok,
    ).toBe(false);
  });
});
