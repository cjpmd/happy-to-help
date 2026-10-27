import { describe, expect, it } from "vitest";
import { demoDb } from "@/lib/demoDb";
import { demoCampaignDecided, demoCancelCampaign, demoPlanCampaign } from "@/lib/demoCampaigns";
import { campaignCheck } from "@/lib/campaigns";
import type { DB } from "@/lib/storeContext";

const ctx = {
  now: new Date("2026-10-21T09:00:00Z"),
  uid: (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
};
const C = "c5";

function withChannels(db: DB, optIn: boolean): DB {
  const contact = db.contacts.find((c) => c.company_id === C)!;
  return {
    ...db,
    companies: db.companies.map((c) =>
      c.id === C ? { ...c, channels: ["Instagram", "LinkedIn"] } : c,
    ),
    current_consents: optIn
      ? [
          ...db.current_consents.filter((s) => s.contact_id !== contact.id),
          {
            contact_id: contact.id,
            purpose: "marketing",
            status: "granted",
            lawful_basis: "consent",
          },
        ]
      : db.current_consents.filter(
          (s) =>
            !(
              s.purpose === "marketing" &&
              db.contacts.some((c) => c.id === s.contact_id && c.company_id === C)
            ),
        ),
  };
}

describe("demo campaigns", () => {
  it("proposes a plan that waits for a founder's GO", () => {
    const db = demoPlanCampaign(withChannels(demoDb(), true), C, "20 bookings for spring", ctx);
    const c = db.campaigns[0]!;
    expect(c).toMatchObject({ status: "proposed", channels: ["instagram", "linkedin", "email"] });
    const a = db.approvals[0]!;
    expect(a).toMatchObject({ action_type: "approve_campaign", status: "pending" });
  });

  it("drafts each asset for its own GO once the plan is approved", () => {
    let db = demoPlanCampaign(withChannels(demoDb(), true), C, "20 bookings for spring", ctx);
    db = demoCampaignDecided(db, db.approvals[0]!, true, ctx);
    const assets = db.campaign_assets;
    expect(db.campaigns[0]!.status).toBe("ready");
    expect(assets.filter((a) => a.kind === "social_post")).toHaveLength(4);
    expect(assets.filter((a) => a.kind === "email")).toHaveLength(1);
    expect(assets.every((a) => a.status === "awaiting_approval")).toBe(true);
    for (const a of assets) expect(campaignCheck(a.body)).toEqual([]);
    const post = db.approvals.find((x) => x.id === assets[0]!.approval_id)!;
    db = demoCampaignDecided(db, post, true, ctx);
    expect(db.campaign_assets.find((x) => x.id === assets[0]!.id)!.status).toBe("scheduled");
  });

  it("drafts no campaign email when nobody opted in (PECR)", () => {
    let db = demoPlanCampaign(withChannels(demoDb(), false), C, "More enquiries", ctx);
    db = demoCampaignDecided(db, db.approvals[0]!, true, ctx);
    expect(db.campaign_assets.some((a) => a.kind === "email")).toBe(false);
  });

  it("a NO-GO declines the plan, and cancelling declines what's pending", () => {
    const planned = demoPlanCampaign(withChannels(demoDb(), true), C, "More enquiries", ctx);
    expect(
      demoCampaignDecided(planned, planned.approvals[0]!, false, ctx).campaigns[0]!.status,
    ).toBe("declined");
    let db = demoCampaignDecided(planned, planned.approvals[0]!, true, ctx);
    db = demoCancelCampaign(db, db.campaigns[0]!.id, "u1", ctx);
    expect(db.campaigns[0]!.status).toBe("cancelled");
    const ids = new Set(db.campaign_assets.map((a) => a.approval_id));
    expect(db.approvals.filter((a) => ids.has(a.id)).every((a) => a.status === "declined")).toBe(
      true,
    );
  });
});
