import { describe, expect, it } from "vitest";
import { AISHA, STUDYBUDDY, adminClient, clientAs } from "./local";

describe("credits engine through the API", () => {
  it("founders read their credit summary; the seed balances by bucket", async () => {
    const sb = await clientAs(AISHA);
    const { data, error } = await sb.rpc("credit_summary", { p_company: STUDYBUDDY });
    expect(error).toBeNull();
    const s = data as { balance: number; held: number; plan: number; topup: number };
    // Other tests may have spent credits, so compare with the ledger rather than a fixed number.
    const { data: rows } = await sb
      .from("credit_ledger")
      .select("amount")
      .eq("company_id", STUDYBUDDY);
    expect(s.balance).toBe(rows!.reduce((n, r) => n + r.amount, 0));
    expect(s.balance).toBeLessThanOrEqual(5995);
    // The seed's still-running investor run holds 80.
    expect(s.held).toBe(80);
    // 5,000 plan credits were used first; the rest is Launch Pack credit.
    expect(s.plan).toBe(0);
    expect(s.topup).toBe(s.balance);
  });

  it("only the service role can move credits", async () => {
    const sb = await clientAs(AISHA);
    const res = await sb.rpc(
      "grant_credits" as never,
      {
        p_company: STUDYBUDDY,
        p_amount: 100,
        p_bucket: "topup",
        p_note: "x",
      } as never,
    );
    expect(res.error).not.toBeNull();
    const admin = adminClient();
    const { data: cfg } = await admin.from("credit_config").select("*").single();
    expect(Number(cfg?.fx_gbp)).toBe(0.75);
    expect(Number(cfg?.markup)).toBe(3);
  });
});
