import { describe, expect, it } from "vitest";
import { demoDb } from "@/lib/demoDb";
import { demoAdDecided, demoPauseAd, demoProposeAdLaunch } from "@/lib/demoAds";
import type { DB } from "@/lib/storeContext";

const ctx = {
  now: new Date("2026-10-21T09:00:00Z"),
  uid: (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
};

function withAd(): DB {
  const db = demoDb();
  return {
    ...db,
    campaigns: [
      {
        id: "camp1",
        company_id: "c5",
        name: "Spring",
        goal: "More orders",
        metric: "leads",
        target: 10,
        audience: "",
        channels: ["instagram"],
        budget_credits: 100,
        budget_gbp: 50,
        starts_on: "2026-10-21",
        ends_on: "2026-11-03",
        status: "ready",
        plan: {},
        created_at: ctx.now.toISOString(),
      },
    ],
    campaign_assets: [
      {
        id: "ad1",
        campaign_id: "camp1",
        company_id: "c5",
        kind: "ad",
        channel: "meta",
        title: "Ad",
        body: "Fresh bread.",
        scheduled_for: null,
        status: "exported",
        approval_id: null,
      },
      {
        id: "post1",
        campaign_id: "camp1",
        company_id: "c5",
        kind: "social_post",
        channel: "instagram",
        title: "",
        body: "Hi",
        scheduled_for: null,
        status: "draft",
        approval_id: null,
      },
    ],
  };
}

describe("demo paid ads", () => {
  it("proposes a launch for a GO, within the hard cap, once", () => {
    const db = withAd();
    expect(demoProposeAdLaunch(db, "post1", "meta", 5, "u6", ctx)).toHaveProperty("error");
    const cap = db.ads.find((a) => a.company_id === "c5")?.hard_cap ?? 50;
    expect(demoProposeAdLaunch(db, "ad1", "meta", cap + 1, "u6", ctx)).toHaveProperty("error");
    const r = demoProposeAdLaunch(db, "ad1", "meta", 5, "u6", ctx);
    if ("error" in r) throw new Error(r.error);
    expect(r.db.ad_campaigns[0]).toMatchObject({
      status: "pending",
      name: "Spring",
      daily_budget: 5,
    });
    expect(r.db.approvals[0]).toMatchObject({ action_type: "launch_ad", status: "pending" });
    expect(demoProposeAdLaunch(r.db, "ad1", "google", 5, "u6", ctx)).toHaveProperty("error");
  });

  it("launches on a GO, declines on a NO-GO, and pauses", () => {
    const r = demoProposeAdLaunch(withAd(), "ad1", "meta", 5, "u6", ctx);
    if ("error" in r) throw new Error(r.error);
    const a = r.db.approvals[0]!;
    expect(demoAdDecided(r.db, a, false).ad_campaigns[0]!.status).toBe("declined");
    const live = demoAdDecided(r.db, a, true);
    expect(live.ad_campaigns[0]!.status).toBe("active");
    expect(demoPauseAd(live, live.ad_campaigns[0]!.id).ad_campaigns[0]).toMatchObject({
      status: "paused",
    });
  });
});
