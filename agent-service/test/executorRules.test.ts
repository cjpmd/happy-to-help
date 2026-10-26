import { describe, expect, it } from "vitest";
import { checkRules, recipients, type FounderRules } from "../src/executor/rules.js";

const founder: FounderRules = { adThreshold: 20, outreachThreshold: 25, publishing: true };
const ad = (daily: number, cap: number, deciderRole: "founder" | "mentor" = "founder") =>
  checkRules(
    {
      action_type: "ad_spend",
      payload: { daily_budget: daily, hard_cap: cap, platform: "Meta" },
      deciderRole,
    },
    founder,
  );

describe("executor rules", () => {
  it("lets a founder set an ad budget within its cap", () =>
    expect(ad(15, 50)).toEqual({ ok: true }));
  it("never goes over the hard cap", () =>
    expect(ad(60, 50)).toMatchObject({ ok: false, needsFounder: false }));
  it("never goes over the platform's daily maximum", () =>
    expect(ad(80, 150)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/capped at £100/),
    }));
  it("escalates ad budgets over the founder's alert to a founder", () => {
    expect(ad(30, 50, "mentor")).toMatchObject({ ok: false, needsFounder: true });
    expect(ad(30, 50, "founder")).toEqual({ ok: true });
    expect(ad(15, 50, "mentor")).toEqual({ ok: true });
  });
  it("escalates big outreach batches and refuses huge ones", () => {
    const send = (to: string, deciderRole: "founder" | "mentor") =>
      checkRules(
        {
          action_type: "send_email",
          payload: { to, subject: "Hi", body: "Hello", outreach: true },
          deciderRole,
        },
        founder,
      );
    expect(send("30 reviewed contacts", "mentor")).toMatchObject({ ok: false, needsFounder: true });
    expect(send("30 reviewed contacts", "founder")).toEqual({ ok: true });
    expect(send("60 reviewed contacts", "founder")).toMatchObject({
      ok: false,
      needsFounder: false,
    });
    expect(send("a@example.com, b@example.com", "mentor")).toEqual({ ok: true });
  });
  it("keeps publishing for founders when they asked to approve it themselves", () => {
    const post = (deciderRole: "founder" | "mentor", publishing: boolean) =>
      checkRules(
        { action_type: "publish_post", payload: { channel: "X", text: "Hi" }, deciderRole },
        { ...founder, publishing },
      );
    expect(post("mentor", true)).toMatchObject({ ok: false, needsFounder: true });
    expect(post("mentor", false)).toEqual({ ok: true });
    expect(post("founder", true)).toEqual({ ok: true });
  });
  it("refuses anything not decided by a founder or mentor", () =>
    expect(
      checkRules({ action_type: "file_document", payload: {}, deciderRole: "teammate" }, founder),
    ).toMatchObject({ ok: false }));
  it("counts recipients from addresses or a stated number", () => {
    expect(recipients("a@example.com; Bob <b@example.com>").count).toBe(2);
    expect(recipients("9 new waitlist signups").count).toBe(9);
    expect(recipients("Ms Khan").count).toBe(1);
  });
});
