import { describe, expect, it } from "vitest";
import {
  LOCKED_CATEGORIES,
  allowedModes,
  applyVoiceDecision,
  applyVoiceEdit,
  currentVoice,
  defaultPolicies,
  defaultSettings,
  defaultVoice,
  replyReadiness,
  splitList,
  type VoiceProfile,
} from "@/lib/voicePolicy";

const T = "2026-10-21T07:30:00Z";
const proposal = (cid: string, version: number): VoiceProfile => ({
  ...defaultVoice(cid, T),
  id: `p-${cid}-${version}`,
  version,
  status: "proposed",
  source: "analysis",
  summary: "Warm and local.",
});

describe("response policy", () => {
  it("starts with everything drafted except refunds and legal threats, which escalate", () => {
    const p = defaultPolicies("c1");
    expect(p).toHaveLength(10);
    for (const row of p)
      expect(row.mode).toBe(LOCKED_CATEGORIES.includes(row.category) ? "escalate" : "draft");
    expect(p.some((r) => r.mode === "auto_send")).toBe(false);
  });

  it("only lets locked categories escalate", () => {
    expect(allowedModes("refund_request")).toEqual(["escalate"]);
    expect(allowedModes("legal_threat")).toEqual(["escalate"]);
    expect(allowedModes("booking")).toContain("auto_send");
  });

  it("keeps the AI disclosure on by default", () => {
    expect(defaultSettings("c1")).toMatchObject({
      disclosure_on_approved: true,
      policy_reviewed_at: null,
    });
  });
});

describe("reply readiness", () => {
  it("needs a non-default approved voice and a reviewed policy", () => {
    const v = defaultVoice("c1", T);
    const s = defaultSettings("c1");
    expect(replyReadiness(v, s).ready).toBe(false);
    expect(replyReadiness({ ...v, source: "analysis" }, s)).toMatchObject({
      voiceApproved: true,
      policyReviewed: false,
      ready: false,
    });
    expect(replyReadiness({ ...v, source: "manual" }, { ...s, policy_reviewed_at: T }).ready).toBe(
      true,
    );
    expect(replyReadiness(undefined, undefined).ready).toBe(false);
  });
});

describe("voice decisions", () => {
  const base = [defaultVoice("c1", T), defaultVoice("c2", T), proposal("c1", 2)];

  it("GO makes the proposal current and supersedes only that company's old voice", () => {
    const next = applyVoiceDecision(base, "p-c1-2", true);
    const c1 = currentVoice(next, "c1");
    expect(c1.approved?.id).toBe("p-c1-2");
    expect(c1.proposed).toBeUndefined();
    expect(next.find((p) => p.id === "voice-c1-1")?.status).toBe("superseded");
    expect(currentVoice(next, "c2").approved?.id).toBe("voice-c2-1");
  });

  it("NO-GO declines the proposal and keeps the current voice", () => {
    const next = applyVoiceDecision(base, "p-c1-2", false);
    expect(next.find((p) => p.id === "p-c1-2")?.status).toBe("declined");
    expect(currentVoice(next, "c1").approved?.id).toBe("voice-c1-1");
  });

  it("ignores a profile that isn't a pending proposal", () => {
    expect(applyVoiceDecision(base, "voice-c1-1", true)).toBe(base);
  });

  it("a founder's edit becomes a new approved version", () => {
    const next = applyVoiceEdit(base, "c1", { sign_off: "Thanks, Rory" }, "e1", T);
    const c1 = currentVoice(next, "c1");
    expect(c1.approved).toMatchObject({
      id: "e1",
      version: 3,
      source: "manual",
      sign_off: "Thanks, Rory",
    });
    expect(next.filter((p) => p.company_id === "c1" && p.status === "approved")).toHaveLength(1);
  });
});

describe("splitList", () => {
  it("trims, drops blanks and duplicates, and caps the length", () => {
    expect(splitList(" Warm, , warm, Local ,Direct", 2)).toEqual(["Warm", "Local"]);
  });
});
