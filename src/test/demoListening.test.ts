import { describe, expect, it } from "vitest";
import { demoDb } from "@/lib/demoDb";
import { demoProcess } from "@/lib/demoInbox";
import {
  demoFeedbackRequest,
  demoListeningDecided,
  demoRequestFeedback,
  demoSubmitFeedback,
} from "@/lib/demoListening";
import type { DB } from "@/lib/storeContext";

const ctx = {
  now: new Date("2026-10-21T09:00:00Z"),
  uid: (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
};

function optedIn(db: DB, granted: boolean) {
  const ct = db.contacts.find((c) => c.company_id === "c5")!;
  return {
    ct,
    db: {
      ...db,
      current_consents: [
        ...db.current_consents.filter((s) => s.contact_id !== ct.id),
        {
          contact_id: ct.id,
          purpose: "marketing" as const,
          status: granted ? ("granted" as const) : ("not_given" as const),
          lawful_basis: granted ? "consent" : null,
        },
      ],
    },
  };
}

describe("demo listening", () => {
  it("puts reviews and comments in the inbox and drafts a public reply for a GO", () => {
    const db = demoDb();
    const review = db.inbox_items.find((i) => i.channel === "review")!;
    expect(db.inbox_items.some((i) => i.channel === "social")).toBe(true);
    const next = demoProcess(db, review.id, ctx);
    const item = next.inbox_items.find((i) => i.id === review.id)!;
    expect(item.status).toBe("awaiting_approval");
    const a = next.approvals.find((x) => x.id === item.approval_id)!;
    expect(a).toMatchObject({ action_type: "reply_public", status: "pending" });
    const sent = demoListeningDecided(next, a, true, ctx);
    expect(sent.inbox_items.find((i) => i.id === review.id)!.status).toBe("sent");
    const thread = sent.emails.find((t) => t.id === review.thread_id)!;
    expect(thread.messages.at(-1)!.direction).toBe("sent");
  });

  it("asks for feedback only from customers who opted in, once in 90 days", () => {
    const no = optedIn(demoDb(), false);
    expect(demoRequestFeedback(no.db, no.ct.id, "u", ctx)).toHaveProperty("error");
    const yes = optedIn(demoDb(), true);
    const r = demoRequestFeedback(yes.db, yes.ct.id, "u", ctx);
    if ("error" in r) throw new Error(r.error);
    expect(r.db.approvals[0]).toMatchObject({ action_type: "send_email", status: "pending" });
    expect(demoRequestFeedback(r.db, yes.ct.id, "u", ctx)).toHaveProperty("error");
  });

  it("takes one answer per link", () => {
    const yes = optedIn(demoDb(), true);
    const r = demoRequestFeedback(yes.db, yes.ct.id, "u", ctx);
    if ("error" in r) throw new Error(r.error);
    const token = r.db.feedback_requests[0]!.token!;
    expect(demoFeedbackRequest(r.db, token)).toMatchObject({
      company: "Harbour Bakes",
      done: false,
    });
    const done = demoSubmitFeedback(r.db, token, 2, "Too slow", ctx)!;
    expect(done.feedback[0]).toMatchObject({ rating: 2, sentiment: "negative", body: "Too slow" });
    expect(demoFeedbackRequest(done, token)!.done).toBe(true);
    expect(demoSubmitFeedback(done, token, 5, "", ctx)).toBeNull();
  });
});
