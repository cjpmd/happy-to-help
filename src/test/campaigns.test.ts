import { describe, expect, it } from "vitest";
import { campaignCheck, capFlags, plainAsset, plainPlan, progress } from "@/lib/campaigns";

describe("CAP Code checks", () => {
  it("flags free, urgency, open-ended offers and comparisons", () => {
    expect(capFlags("Free delivery this week").map((f) => f.phrase)).toEqual(["Free"]);
    expect(capFlags("Last chance! Only 3 left")).toHaveLength(2);
    expect(capFlags("20% off all bread")).toHaveLength(1);
    expect(capFlags("20% off all bread until Sunday 2 Nov")).toHaveLength(0);
    expect(capFlags("Cheaper than the supermarket")[0]!.reason).toMatch(/3\.33/);
    expect(capFlags("Fresh sourdough every Saturday")).toEqual([]);
  });
  it("includes the claims check", () => {
    expect(campaignCheck("The best cake in town").map((f) => f.phrase)).toEqual(["best"]);
  });
});

describe("plans and progress", () => {
  it("makes a two-week plan with a tracked link per channel", () => {
    const p = plainPlan({
      goal: "More wedding cake enquiries",
      channels: ["instagram", "email"],
      customerType: "B2C",
      today: "2026-10-27",
      paid: true,
    });
    expect(p).toMatchObject({ starts_on: "2026-10-27", ends_on: "2026-11-09", target: 30 });
    expect(p.plan).toMatchObject({ posts: 2, emails: 1, ads: 1 });
  });
  it("writes copy the checks pass", () => {
    for (const k of ["social_post", "email", "ad"] as const)
      expect(
        campaignCheck(plainAsset(k, "Harbour Bakes", "More wedding cake enquiries", 0).body),
      ).toEqual([]);
  });
  it("measures progress against the target", () => {
    expect(progress({ clicks: 90, leads: 12, customers: 2 }, "leads", 30)).toEqual({
      value: 12,
      pct: 40,
    });
    expect(progress({ clicks: 90, leads: 40, customers: 2 }, "leads", 30).pct).toBe(100);
  });
});
