import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoDb } from "@/lib/demoDb";
import { DEMO_BOT_TEMPLATES, demoCreateBot, demoDeleteBot, demoUpdateBot } from "@/lib/demoBots";
import type { BotStep } from "@/lib/bots";

const now = new Date("2026-10-21T09:00:00Z");

describe("demo bots", () => {
  it("has the same templates as the database", () => {
    const sql = readFileSync("supabase/migrations/20261101100000_bots.sql", "utf8");
    const keys = [...sql.matchAll(/^\('([a-z_]+)', '([^']+)',$/gm)].map((m) => [m[1], m[2]]);
    expect(keys).toEqual(DEMO_BOT_TEMPLATES.map((t) => [t.key, t.name]));
  });

  it("adds a bot switched off, once", () => {
    const r = demoCreateBot(demoDb(), "c5", "lead_follow_up", "b1");
    if ("error" in r) throw new Error(r.error);
    expect(r.db.bots[0]).toMatchObject({
      enabled: false,
      approval_level: "each",
      cap_credits_week: 50,
    });
    expect(demoCreateBot(r.db, "c5", "lead_follow_up", "b2")).toHaveProperty("error");
  });

  it("follows the same rules for wording, approval and Stripe", () => {
    let r = demoCreateBot(demoDb(), "c5", "lead_follow_up", "b1");
    if ("error" in r) throw new Error(r.error);
    const steps = r.db.bots[0]!.steps;
    const claimy = steps.map((s, i) =>
      i === 0 && s.kind === "email" ? { ...s, body: "The best bakery in Scotland, guaranteed" } : s,
    ) as BotStep[];
    expect(
      demoUpdateBot(r.db, "b1", { steps: claimy, approval_level: "approved_wording" }, "u6", now),
    ).toHaveProperty("error");
    r = demoUpdateBot(r.db, "b1", { approval_level: "approved_wording", enabled: true }, "u6", now);
    if ("error" in r) throw new Error(r.error);
    expect(r.db.bots[0]).toMatchObject({
      approval_level: "approved_wording",
      approved_by: "u6",
      enabled: true,
    });
    const reworded = steps.map((s) => (s.kind === "email" ? { ...s, body: "New words" } : s));
    r = demoUpdateBot(r.db, "b1", { steps: reworded }, "u6", now);
    if ("error" in r) throw new Error(r.error);
    expect(r.db.bots[0]).toMatchObject({ approval_level: "each", approved_by: null });
    expect(demoUpdateBot(r.db, "b1", { steps: steps.slice(0, 1) }, "u6", now)).toHaveProperty(
      "error",
    );
    const pay = demoCreateBot(r.db, "c5", "payment_reminder", "b2");
    if ("error" in pay) throw new Error(pay.error);
    expect(demoUpdateBot(pay.db, "b2", { enabled: true }, "u6", now)).toHaveProperty("error");
    expect(demoDeleteBot(pay.db, "b2").bots.map((b) => b.id)).toEqual(["b1"]);
  });
});
