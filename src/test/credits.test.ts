import { describe, it, expect } from "vitest";
import { PLANS, TOP_UPS, LAUNCH_PACK, creditBalance, isLowBalance } from "@/lib/credits";
import type { LedgerEntry } from "@/lib/types";

describe("pricing", () => {
  it("plans match agreed prices and credits", () => {
    expect(PLANS.starter).toMatchObject({ priceGbp: 29, credits: 1500 });
    expect(PLANS.founder).toMatchObject({ priceGbp: 79, credits: 5000 });
    expect(PLANS.growth).toMatchObject({ priceGbp: 149, credits: 12000 });
  });
  it("top-ups and Launch Pack", () => {
    expect(TOP_UPS.map((t) => [t.priceGbp, t.credits])).toEqual([[10, 500], [25, 1300], [50, 2800]]);
    expect(LAUNCH_PACK).toEqual({ priceGbp: 49, credits: 10000 });
  });
});

describe("credits", () => {
  const e = (amount: number, company_id = "c1"): LedgerEntry => ({ id: String(Math.random()), company_id, entry_type: "usage", amount, run_id: null, note: "", created_at: "" });
  it("balance sums ledger for one company only", () => {
    expect(creditBalance([e(5000), e(-120), e(120), e(-300), e(999, "c2")], "c1")).toBe(4700);
  });
  it("low balance below 20% of plan allowance", () => {
    expect(isLowBalance(999, "founder")).toBe(true);
    expect(isLowBalance(1000, "founder")).toBe(false);
  });
});
