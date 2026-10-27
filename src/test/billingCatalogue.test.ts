import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue } from "@/lib/billingClient";

// The prices the app shows must be the ones the database charges (billing_products).
describe("billing catalogue", () => {
  it("matches the billing_products rows in the migration", () => {
    const sql = readFileSync("supabase/migrations/20261028110000_billing.sql", "utf8");
    for (const p of catalogue()) {
      const row = new RegExp(
        `\\('${p.product}', '[a-z_]+', (?:'[a-z]+'|null), '[^']+', (\\d+), (\\d+)\\)`,
      ).exec(sql);
      expect(row, p.product).not.toBeNull();
      expect([Number(row![1]), Number(row![2])], p.product).toEqual([p.price_gbp, p.credits]);
    }
  });
});
