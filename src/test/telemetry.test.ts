import { describe, expect, it } from "vitest";
import { costPerSignup, funnel, pencePerCredit, trends } from "@/lib/telemetry";
import type { Approval, MetricsDaily, SocialPost } from "@/lib/types";

const day = (i: number, v: Partial<MetricsDaily> = {}): MetricsDaily => ({
  company_id: "c",
  date: `2026-10-${String(i).padStart(2, "0")}`,
  visitors: 100,
  signups: 10,
  paying_customers: i,
  mrr: i * 5,
  activated: 4,
  ...v,
});
const metrics = [day(3), day(1), day(2), { ...day(2), company_id: "other", visitors: 999 }];

describe("telemetry trends", () => {
  it("sums visitors and signups and takes the latest paying and MRR", () => {
    const t = trends(metrics, "c", 30);
    expect(t.map((x) => [x.key, x.total])).toEqual([
      ["visitors", 300],
      ["signups", 30],
      ["paying_customers", 3],
      ["mrr", 15],
    ]);
    expect(t[0]?.points.map((p) => p.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });
  it("keeps only the last N days", () => {
    expect(trends(metrics, "c", 2)[0]?.total).toBe(200);
  });
});

describe("funnel", () => {
  it("converts each step from the one before", () => {
    const f = funnel(metrics, "c", 30, false);
    expect(f.map((s) => [s.label, s.value, s.conversion])).toEqual([
      ["Visitors", 300, null],
      ["Signups", 30, 10],
      ["Activated", 12, 40],
      ["Paying", 3, 25],
    ]);
    expect(f[2]?.sample).toBe(true);
    expect(funnel(metrics, "c", 30, true)[2]?.sample).toBe(false);
  });
  it("has no conversion after an empty step", () => {
    expect(funnel([day(1, { visitors: 0, signups: 0 })], "c", 30, false)[1]?.conversion).toBe(null);
  });
});

describe("cost per signup", () => {
  it("values credits at the plan's price per credit", () => {
    expect(pencePerCredit("founder")).toBeCloseTo(1.58);
    expect(pencePerCredit("starter")).toBeCloseTo(1.9333, 3);
  });
  const post = (
    channel: SocialPost["channel"],
    signups: number,
    status: SocialPost["status"] = "published",
  ): SocialPost => ({
    id: channel + signups,
    company_id: "c",
    channel,
    text: "",
    angle: "",
    status,
    scheduled_for: "2026-10-01",
    metrics: { clicks: 0, signups },
  });
  const approved = (channel: "TikTok" | "Instagram", credits: number): Approval => ({
    id: channel,
    company_id: "c",
    run_id: null,
    action_type: "publish_post",
    payload: { channel, text: "" },
    estimated_credits: credits,
    status: "approved",
    created_at: "2026-10-01",
  });
  it("has three cost columns per channel", () => {
    const rows = costPerSignup(
      { id: "c", plan: "founder" },
      [post("TikTok", 20), post("TikTok", 0, "draft"), post("Instagram", 5)],
      [approved("TikTok", 40), approved("Instagram", 40)],
      { status: "demo", spend: 30, signups: 20 },
    );
    const tiktok = rows.find((r) => r.channel === "TikTok")!;
    expect(tiktok.adPerSignup).toBe(0);
    expect(tiktok.creditsPerSignup).toBe(2);
    expect(tiktok.allInPerSignup).toBeCloseTo((40 * 0.0158) / 20);
    const meta = rows.find((r) => r.channel === "Meta ads")!;
    expect(meta.adPerSignup).toBe(1.5);
    expect(meta.creditsPerSignup).toBe(0);
    expect(meta.allInPerSignup).toBe(1.5);
  });
  it("leaves out ads that aren't connected and shows no per-signup cost with no signups", () => {
    const rows = costPerSignup({ id: "c", plan: "founder" }, [post("TikTok", 0)], [], {
      status: "not_connected",
      spend: 30,
      signups: 20,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.allInPerSignup).toBe(null);
  });
});
