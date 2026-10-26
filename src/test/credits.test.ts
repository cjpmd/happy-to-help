import { describe, it, expect } from "vitest";
import {
  PLANS,
  TOP_UPS,
  LAUNCH_PACK,
  creditBalance,
  demoCreditSummary,
  isLowBalance,
} from "@/lib/credits";
import type { LedgerEntry } from "@/lib/types";

describe("pricing", () => {
  it("plans match agreed prices and credits", () => {
    expect(PLANS.starter).toMatchObject({ priceGbp: 29, credits: 1500 });
    expect(PLANS.founder).toMatchObject({ priceGbp: 79, credits: 5000 });
    expect(PLANS.growth).toMatchObject({ priceGbp: 149, credits: 12000 });
  });
  it("top-ups and Launch Pack", () => {
    expect(TOP_UPS.map((t) => [t.priceGbp, t.credits])).toEqual([
      [10, 500],
      [25, 1300],
      [50, 2800],
    ]);
    expect(LAUNCH_PACK).toEqual({ priceGbp: 49, credits: 10000 });
  });
});

describe("credits", () => {
  const e = (amount: number, company_id = "c1"): LedgerEntry => ({
    id: String(Math.random()),
    company_id,
    entry_type: "usage",
    amount,
    run_id: null,
    note: "",
    created_at: "",
  });
  it("balance sums ledger for one company only", () => {
    expect(creditBalance([e(5000), e(-120), e(120), e(-300), e(999, "c2")], "c1")).toBe(4700);
  });
  it("low balance below 20% of plan allowance", () => {
    expect(isLowBalance(999, "founder")).toBe(true);
    expect(isLowBalance(1000, "founder")).toBe(false);
  });
});

describe("demo credit summary", () => {
  const row = (entry_type: import("@/lib/types").LedgerType, amount: number) => ({
    id: entry_type + amount,
    company_id: "c",
    entry_type,
    amount,
    run_id: null,
    note: "",
    created_at: "2026-10-01",
  });
  it("spends plan credits before top-ups and shows holds", () => {
    const s = demoCreditSummary(
      [row("grant", 1000), row("topup", 500), row("usage", -1200), row("hold", -100)],
      "c",
    );
    expect(s).toMatchObject({ balance: 200, held: 100, plan: 0, topup: 200 });
  });
  it("leaves top-ups untouched while plan credits last", () => {
    expect(
      demoCreditSummary([row("grant", 1000), row("topup", 500), row("usage", -300)], "c"),
    ).toMatchObject({ plan: 700, topup: 500 });
  });
});
