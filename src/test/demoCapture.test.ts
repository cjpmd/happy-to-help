import { describe, expect, it } from "vitest";
import { demoDb } from "@/lib/demoDb";
import { demoAcceptAll, demoCreateCapture, demoDecideItem, type DemoCtx } from "@/lib/demoCapture";

let n = 0;
const ctx: DemoCtx = {
  userId: "u1",
  now: new Date("2026-10-21T09:00:00Z"),
  uid: (p) => `${p}_${++n}`,
};
const note =
  "We agreed to pilot with two schools. Maybe a parents' app one day. Sol, can you draft the pilot email? We need to sort the DPA.";

function start(text = note) {
  return demoCreateCapture(
    demoDb(),
    { companyId: "c1", source: "debrief", consent: "own_voice", text },
    ctx,
  );
}

describe("demo capture", () => {
  it("reads the debrief into pending items and creates nothing yet", () => {
    const base = demoDb();
    const { db, id } = start();
    const items = db.extracted_items.filter((i) => i.capture_id === id);
    expect(items.map((i) => i.kind)).toEqual(["decision", "idea", "action", "action"]);
    expect(db.captures[0]).toMatchObject({ id, status: "review" });
    expect(db.tasks.length).toBe(base.tasks.length);
  });

  it("Accept all takes only complete items, then the founder completes the rest", () => {
    const { db, id } = start();
    const all = demoAcceptAll(db, id, ctx);
    expect(all.n).toBe(3);
    const dpa = all.db.extracted_items.find((i) => i.text.includes("DPA"))!;
    expect(dpa.status).toBe("pending");
    expect(demoDecideItem(all.db, dpa.id, "accept", {}, false, ctx)).toEqual({
      error: "Say who is doing this first",
    });
    const r = demoDecideItem(
      all.db,
      dpa.id,
      "accept",
      { owner: "founder", due_date: "2026-10-30" },
      false,
      ctx,
    );
    if ("error" in r) throw new Error(r.error);
    expect(r.db.tasks.find((t) => t.title.includes("DPA"))).toMatchObject({
      actor: "founder",
      due: "2026-10-30",
    });
    expect(r.db.captures.find((c) => c.id === id)?.status).toBe("done");
    // A Start up idea becomes a hypothesis with an evidence plan.
    expect(r.db.ideas[0]).toMatchObject({ status: "hypothesis" });
    expect(r.db.evidence_items.some((e) => e.data["source"] === "capture")).toBe(true);
    // Sol's action becomes a Sol task with its cost.
    expect(r.db.tasks.find((t) => t.title.includes("pilot email"))).toMatchObject({ actor: "sol" });
  });

  it("dismissing is final and personal items need an explicit choice", () => {
    const { db, id } = start("My dad is in hospital so I'll be out on Friday.");
    const item = db.extracted_items.find((i) => i.capture_id === id)!;
    expect(item.sensitive).toBe(true);
    expect(demoDecideItem(db, item.id, "accept", {}, false, ctx)).toMatchObject({
      error: expect.stringMatching(/personal/),
    });
    const d = demoDecideItem(db, item.id, "dismiss", {}, false, ctx);
    if ("error" in d) throw new Error(d.error);
    expect(demoDecideItem(d.db, item.id, "accept", {}, true, ctx)).toEqual({
      error: "This was already decided",
    });
  });
});
