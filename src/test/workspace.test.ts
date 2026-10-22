import { describe, it, expect } from "vitest";
import { actionQuote, autoModeCost } from "@/lib/credits";
import {
  businessDefaults,
  checkClaims,
  defaultLayout,
  defaultSharing,
  hasProof,
  monthlyCost,
} from "@/lib/workspace";
describe("Founder guardrails", () => {
  it("Auto Mode only accepts 1–8 whole hours", () => {
    expect(autoModeCost(1)).toBe(150);
    expect(autoModeCost(8)).toBe(1200);
    expect(() => autoModeCost(0)).toThrow();
    expect(() => autoModeCost(9)).toThrow();
    expect(() => autoModeCost(1.5)).toThrow();
  });
  it("blocks unaffordable work and reports resulting balance", () => {
    expect(actionQuote(119, 120)).toEqual({ credits: 120, after: -1, affordable: false });
    expect(actionQuote(120, 120).affordable).toBe(true);
  });
  it("applies B2B defaults", () =>
    expect(businessDefaults("B2B")).toEqual(["LinkedIn", "Email outreach", "Trust page"]));
  it("applies B2C defaults", () =>
    expect(businessDefaults("B2C")).toEqual(["Instagram", "TikTok", "Waitlist"]));
  it("requires complete proof before marking done", () => {
    expect(
      hasProof({
        passed: 6,
        total: 6,
        screenshot: "/shot.png",
        preview: "/site/test",
        pr: "https://github.com/example/repo/pull/1",
      }),
    ).toBe(true);
    expect(
      hasProof({
        passed: 5,
        total: 6,
        screenshot: "/shot.png",
        preview: "/site/test",
        pr: "https://github.com/example/repo/pull/1",
      }),
    ).toBe(false);
    expect(hasProof()).toBe(false);
    expect(hasProof({ passed: 6, total: 6, preview: "/site/test" })).toBe(false);
  });
  it("flags unverifiable superlatives", () =>
    expect(checkClaims("The best revision app")[0]?.reason).toBe("Unverifiable superlative"));
  it("flags promises of results", () =>
    expect(checkClaims("We guarantee better results")[0]?.reason).toBe("Promises results"));
  it("flags an unbuilt feature", () =>
    expect(checkClaims("Your weak-spots report is ready")[0]?.reason).toBe(
      "Feature not built yet",
    ));
  it.each(["legal", "finance", "health", "education"] as const)(
    "uses stricter checks for %s",
    (sector) => {
      expect(checkClaims("Clinically proven", sector).length).toBe(2);
      expect(checkClaims("Clinically proven", "general").length).toBe(0);
    },
  );
  it("starts public sharing off", () => expect(defaultSharing().enabled).toBe(false));
  it("includes all fifteen dashboard widgets", () => {
    expect(defaultLayout()).toHaveLength(15);
    expect(defaultLayout().find((w) => w.id === "Media")?.visible).toBe(false);
  });
  it("forecasts the cadence before activation", () => {
    expect(monthlyCost("weekdays", 40)).toBe(880);
    expect(monthlyCost("daily", 25)).toBe(750);
    expect(monthlyCost("weekly", 60)).toBe(240);
  });
});
