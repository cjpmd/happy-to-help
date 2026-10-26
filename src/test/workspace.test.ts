import { describe, it, expect } from "vitest";
import { actionQuote, autoModeCost } from "@/lib/credits";
import {
  businessDefaults,
  checkClaims,
  unbuiltFeatures,
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
  it("flags a feature the roadmap says isn't built yet", () => {
    expect(
      checkClaims("Your weak-spots report is ready", "general", ["Weak-spots report"])[0]?.reason,
    ).toBe("Feature not built yet");
    expect(checkClaims("Your weak-spots report is ready")).toEqual([]);
  });
  it("treats roadmap titles as plain text, not patterns", () => {
    expect(checkClaims("Try C++ (beta)", "general", ["C++ (beta)"]).length).toBe(0);
    expect(checkClaims("Try a.b now", "general", ["a.b"])[0]?.phrase).toBe("a.b");
    expect(checkClaims("Try axb now", "general", ["a.b"])).toEqual([]);
  });
  it("lists unfinished roadmap outcomes as unbuilt features", () => {
    const docs = [
      {
        id: "d",
        company_id: "c",
        title: "Product roadmap",
        versions: [],
        outcomes: [
          { title: "Quiz engine", complete: true },
          { title: "Teacher dashboard", complete: false },
        ],
      },
    ];
    expect(unbuiltFeatures(docs, "c")).toEqual(["Teacher dashboard"]);
    expect(unbuiltFeatures(docs, "other")).toEqual([]);
  });
  it.each(["legal", "finance", "health", "education"] as const)(
    "uses stricter checks for %s",
    (sector) => {
      expect(checkClaims("Clinically proven", sector).length).toBe(2);
      expect(checkClaims("Clinically proven", "general").length).toBe(0);
    },
  );
  it("starts public sharing off", () => expect(defaultSharing().enabled).toBe(false));
  it("shows all six HQ cards by default", () => {
    expect(defaultLayout().map((w) => w.id)).toEqual([
      "GO / NO-GO",
      "Telemetry",
      "Vehicle",
      "Channels",
      "Overnight burn",
      "Next windows",
    ]);
    expect(defaultLayout().every((w) => w.visible)).toBe(true);
  });
  it("forecasts the cadence before activation", () => {
    expect(monthlyCost("weekdays", 40)).toBe(880);
    expect(monthlyCost("daily", 25)).toBe(750);
    expect(monthlyCost("weekly", 60)).toBe(240);
  });
});
