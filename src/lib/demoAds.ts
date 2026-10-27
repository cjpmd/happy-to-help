// The demo's paid ads (Phase 19): the same rules as propose_ad_launch and pause_ad. Nothing is
// launched or spent in the demo. Pure; tested in src/test/demoAds.test.ts.
import type { Approval } from "./types";
import type { AdCampaign, DB } from "./storeContext";

type Ctx = { now: Date; uid: (p: string) => string };

export function demoProposeAdLaunch(
  db: DB,
  assetId: string,
  platform: AdCampaign["platform"],
  daily: number,
  userId: string,
  ctx: Ctx,
): { db: DB } | { error: string } {
  const a = db.campaign_assets.find((x) => x.id === assetId);
  if (!a) return { error: "Ad not found" };
  if (a.kind !== "ad") return { error: "Only ad copy can be launched as an ad" };
  const acct = db.ads.find((x) => x.company_id === a.company_id);
  const hardCap = acct?.hard_cap ?? 50;
  const monthlyCap = acct?.monthly_cap ?? 300;
  if (!(daily > 0) || daily > hardCap)
    return {
      error: `The daily budget must be more than £0 and no more than your hard cap of £${hardCap}`,
    };
  if (
    db.ad_campaigns.some(
      (x) => x.campaign_asset_id === assetId && ["pending", "active", "paused"].includes(x.status),
    )
  )
    return { error: "This ad is already launched or waiting for a GO" };
  const name = db.campaigns.find((c) => c.id === a.campaign_id)?.name ?? a.title;
  const ad: AdCampaign = {
    id: ctx.uid("ad"),
    company_id: a.company_id,
    platform,
    name,
    creative: a.body,
    status: "pending",
    daily_budget: Math.round(daily * 100) / 100,
    campaign_asset_id: a.id,
    link_id: null,
    spend: 0,
    clicks: 0,
    paused_reason: null,
    created_at: ctx.now.toISOString(),
  };
  const approval: Approval = {
    id: ctx.uid("a"),
    company_id: a.company_id,
    run_id: null,
    action_type: "launch_ad",
    payload: {
      ad_campaign_id: ad.id,
      platform,
      name,
      daily_budget: ad.daily_budget,
      hard_cap: hardCap,
      monthly_cap: monthlyCap,
      creative: a.body,
      reason: "Spends real money every day until you pause it. Capped as shown.",
    },
    estimated_credits: 10,
    status: "pending",
    requested_by: userId,
    created_at: ctx.now.toISOString(),
  };
  return {
    db: { ...db, ad_campaigns: [ad, ...db.ad_campaigns], approvals: [approval, ...db.approvals] },
  };
}

/** A GO launches the ad (in the demo, nothing is spent); a NO-GO declines it. */
export function demoAdDecided(db: DB, a: Approval, approved: boolean): DB {
  if (a.action_type !== "launch_ad") return db;
  return {
    ...db,
    ad_campaigns: db.ad_campaigns.map((x) =>
      x.id === a.payload.ad_campaign_id && x.status === "pending"
        ? { ...x, status: approved ? "active" : "declined" }
        : x,
    ),
  };
}

export function demoPauseAd(db: DB, id: string): DB {
  const ad = db.ad_campaigns.find((x) => x.id === id);
  return {
    ...db,
    ad_campaigns: db.ad_campaigns.map((x) =>
      x.id === id && (x.status === "active" || x.status === "pending")
        ? { ...x, status: "paused", paused_reason: "Paused by a founder" }
        : x,
    ),
    approvals: db.approvals.map((x) =>
      x.action_type === "launch_ad" && x.payload.ad_campaign_id === ad?.id && x.status === "pending"
        ? {
            ...x,
            status: "declined",
            decided_at: new Date().toISOString(),
            decision_note: "Paused before launch",
          }
        : x,
    ),
  };
}
