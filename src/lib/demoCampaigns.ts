// The demo's campaign flow: the same steps as the agent and executor (Phase 15) on the in-memory
// store. Plan → founder GO → assets drafted, each waiting for its own GO; ads are exported for the
// founder to launch. Pure; tested in src/test/demoCampaigns.test.ts.
import type { Approval } from "./types";
import type { Campaign, CampaignAsset, DB } from "./storeContext";
import { plainAsset, plainPlan } from "./campaigns";

type Ctx = { now: Date; uid: (p: string) => string };

const SOCIAL: Record<string, "Instagram" | "TikTok" | "LinkedIn" | "X"> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X",
};

/** Sol proposes a plan towards the goal; it waits for a founder's GO. */
export function demoPlanCampaign(db: DB, companyId: string, goal: string, ctx: Ctx): DB {
  const company = db.companies.find((c) => c.id === companyId);
  if (!company || !goal.trim()) return db;
  const channels = [
    ...(company.channels ?? [])
      .map((c) => c.toLowerCase())
      .filter((c) => c in SOCIAL)
      .slice(0, 2),
    "email",
  ];
  const p = plainPlan({
    goal: goal.trim(),
    channels,
    customerType: company.customer_type,
    today: ctx.now.toISOString().slice(0, 10),
    paid: false,
  });
  const id = ctx.uid("camp");
  const approvalId = ctx.uid("a");
  const campaign: Campaign = {
    id,
    company_id: companyId,
    name: p.name,
    goal: goal.trim(),
    metric: p.metric,
    target: p.target,
    audience: p.audience,
    channels,
    budget_credits: 200,
    budget_gbp: null,
    starts_on: p.starts_on,
    ends_on: p.ends_on,
    status: "proposed",
    plan: p.plan,
    created_at: ctx.now.toISOString(),
  };
  const approval: Approval = {
    id: approvalId,
    company_id: companyId,
    run_id: null,
    action_type: "approve_campaign",
    payload: {
      campaign_id: id,
      name: p.name,
      goal: goal.trim(),
      target: `${p.target} ${p.metric}`,
      channels: channels.join(", "),
      dates: `${p.starts_on} to ${p.ends_on}`,
      budget: "Up to 200 credits",
      reason: p.plan.rationale,
    },
    estimated_credits: 0,
    status: "pending",
    created_at: ctx.now.toISOString(),
  };
  return {
    ...db,
    campaigns: [campaign, ...db.campaigns],
    campaign_results: [
      { campaign_id: id, clicks: 0, leads: 0, customers: 0 },
      ...db.campaign_results,
    ],
    approvals: [approval, ...db.approvals],
  };
}

/** What a decision on a campaign approval does to the campaign and its assets. */
export function demoCampaignDecided(db: DB, a: Approval, approved: boolean, ctx: Ctx): DB {
  if (a.action_type === "approve_campaign") {
    const id = a.payload.campaign_id;
    if (!approved)
      return {
        ...db,
        campaigns: db.campaigns.map((c) => (c.id === id ? { ...c, status: "declined" } : c)),
      };
    return draftAssets(db, id, ctx);
  }
  const assetId =
    a.action_type === "publish_post" || a.action_type === "send_email"
      ? a.payload.campaign_asset_id
      : undefined;
  if (!assetId) return db;
  const done = a.action_type === "send_email" ? "sent" : "scheduled";
  return {
    ...db,
    campaign_assets: db.campaign_assets.map((x) =>
      x.id === assetId ? { ...x, status: approved ? done : "declined" } : x,
    ),
  };
}

function draftAssets(db: DB, id: string, ctx: Ctx): DB {
  const c = db.campaigns.find((x) => x.id === id);
  const company = c && db.companies.find((x) => x.id === c.company_id);
  if (!c || !company) return db;
  const optedIn = db.contacts.filter(
    (ct) =>
      ct.company_id === c.company_id &&
      db.current_consents.some(
        (s) => s.contact_id === ct.id && s.purpose === "marketing" && s.status === "granted",
      ),
  );
  const assets: CampaignAsset[] = [];
  const approvals: Approval[] = [];
  const add = (asset: Omit<CampaignAsset, "id" | "campaign_id" | "company_id">) => {
    const row = { ...asset, id: ctx.uid("asset"), campaign_id: id, company_id: c.company_id };
    assets.push(row);
    return row;
  };
  const base = { company_id: c.company_id, run_id: null, status: "pending" as const };
  for (const channel of c.channels) {
    if (channel === "email") {
      // PECR: marketing email only to people who opted in.
      if (!optedIn.length) continue;
      const copy = plainAsset("email", company.name, c.goal, 0);
      const approvalId = ctx.uid("a");
      const row = add({
        kind: "email",
        channel,
        ...copy,
        scheduled_for: null,
        status: "awaiting_approval",
        approval_id: approvalId,
      });
      approvals.push({
        ...base,
        id: approvalId,
        action_type: "send_email",
        payload: {
          to: optedIn.map((x) => x.email).join(", "),
          subject: copy.title,
          body: copy.body,
          outreach: true,
          campaign_asset_id: row.id,
          reason: `Campaign: ${c.name}`,
        },
        estimated_credits: 5,
        created_at: ctx.now.toISOString(),
      });
      continue;
    }
    const social = SOCIAL[channel];
    if (!social) continue;
    for (let n = 0; n < 2; n++) {
      const copy = plainAsset("social_post", company.name, c.goal, n);
      const when = new Date(
        Date.parse(`${c.starts_on}T09:00:00Z`) + n * 3 * 86_400_000,
      ).toISOString();
      const approvalId = ctx.uid("a");
      const row = add({
        kind: "social_post",
        channel,
        ...copy,
        scheduled_for: when,
        status: "awaiting_approval",
        approval_id: approvalId,
      });
      approvals.push({
        ...base,
        id: approvalId,
        action_type: "publish_post",
        payload: {
          channel: social,
          text: copy.body,
          scheduled_for: when,
          campaign_asset_id: row.id,
          reason: `Campaign: ${c.name}`,
        },
        estimated_credits: 3,
        created_at: ctx.now.toISOString(),
      });
    }
  }
  return {
    ...db,
    campaigns: db.campaigns.map((x) => (x.id === id ? { ...x, status: "ready" } : x)),
    campaign_assets: [...db.campaign_assets, ...assets],
    approvals: [...approvals, ...db.approvals],
  };
}

/** Cancel: pending asset approvals are declined; nothing else goes out. */
export function demoCancelCampaign(db: DB, id: string, decidedBy: string, ctx: Ctx): DB {
  const assetIds = new Set(db.campaign_assets.filter((x) => x.campaign_id === id).map((x) => x.id));
  const belongs = (a: Approval) =>
    (a.action_type === "approve_campaign" && a.payload.campaign_id === id) ||
    ((a.action_type === "publish_post" || a.action_type === "send_email") &&
      !!a.payload.campaign_asset_id &&
      assetIds.has(a.payload.campaign_asset_id));
  return {
    ...db,
    campaigns: db.campaigns.map((c) => (c.id === id ? { ...c, status: "cancelled" } : c)),
    approvals: db.approvals.map((a) =>
      a.status === "pending" && belongs(a)
        ? {
            ...a,
            status: "declined",
            decided_by: decidedBy,
            decided_at: ctx.now.toISOString(),
            decision_note: "Campaign cancelled",
          }
        : a,
    ),
  };
}
