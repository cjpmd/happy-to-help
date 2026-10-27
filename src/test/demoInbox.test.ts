import { describe, expect, it } from "vitest";
import { demoDb } from "@/lib/demoDb";
import { demoImport, demoProcess } from "@/lib/demoInbox";
import { parseContactsCsv } from "@/lib/voice";

const ctx = {
  now: new Date("2026-10-21T09:00:00Z"),
  uid: (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
};

describe("demo inbox", () => {
  it("starts with Harbour Bakes' waiting messages", () => {
    const db = demoDb();
    expect(db.inbox_items.filter((i) => i.company_id === "c5").length).toBeGreaterThan(0);
  });

  it("drafts a reply that waits for a GO, or escalates what must come to the founder", () => {
    const db = demoDb();
    const item = db.inbox_items.find((i) => i.company_id === "c5")!;
    const next = demoProcess(db, item.id, ctx);
    const done = next.inbox_items.find((i) => i.id === item.id)!;
    expect(["awaiting_approval", "escalated"]).toContain(done.status);
    if (done.status === "awaiting_approval") {
      const a = next.approvals.find((x) => x.id === done.approval_id)!;
      expect(a).toMatchObject({ status: "pending", action_type: "send_email" });
    }
  });
});

describe("consent-checked import", () => {
  it("reads consent columns and keeps people without evidence to service messages", () => {
    const { rows } = parseContactsCsv(
      [
        "Name,Email,Type,Marketing consent,Consent date",
        "Ann,ann@x.example,lead,yes,3 Oct 2026",
        "Bob,bob@x.example,lead,yes,",
        "Cat,cat@x.example,customer,soft,",
        "Dan,dan@x.example,lead,,",
      ].join("\n"),
    );
    expect(rows.map((r) => r.consent ?? null)).toEqual(["consent", "consent", "soft_opt_in", null]);
    expect(rows[0]!.consent_evidence).toBe("3 Oct 2026");
    expect(rows[2]!.kind).toBe("customer");
    const r = demoImport(demoDb(), "c5", rows, false, ctx);
    expect(r.result).toEqual({ added: 4, consent: 1, soft_opt_in: 0, service_only: 3 });
    expect(
      r.db.compliance_items.some((c) => c.title === "3 imported contacts can't be sent marketing"),
    ).toBe(true);
    expect(demoImport(demoDb(), "c5", rows, true, ctx).result.soft_opt_in).toBe(1);
  });
});
