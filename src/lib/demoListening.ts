// The demo's listening (Phase 16): a few reviews and comments for Harbour Bakes, feedback, and
// the same rules as the database for feedback requests and public replies. Pure; tested in
// src/test/demoListening.test.ts.
import type { Approval } from "./types";
import type { DB, Feedback, FeedbackRequest, PublicFeedbackRequest } from "./storeContext";
import type { EmailThread } from "./workspace";
import { sentimentFromRating } from "./listening";

type Ctx = { now: Date; uid: (p: string) => string };
const DAY = 86_400_000;
const ago = (now: Date, days: number) => new Date(now.getTime() - days * DAY).toISOString();

/** Harbour Bakes' reviews and comments, as conversations waiting in the inbox. */
export function harbourHeard(now: Date): EmailThread[] {
  const item = (
    id: string,
    channel: "social" | "review",
    platform: string,
    name: string,
    text: string,
    days: number,
    rating: number | null = null,
  ): EmailThread => ({
    id,
    company_id: "c5",
    subject:
      channel === "review"
        ? `${rating}-star review on Google`
        : `Comment on ${platform === "instagram" ? "Instagram" : platform}`,
    name,
    address: "",
    mode: "support",
    channel,
    platform,
    rating,
    external_url: null,
    messages: [{ direction: "received", text, date: ago(now, days) }],
  });
  return [
    item(
      "c5-heard-1",
      "review",
      "google",
      "Priya Shah",
      "Lovely sourdough and the staff were so friendly. Worth the wait!",
      1,
      5,
    ),
    item(
      "c5-heard-2",
      "review",
      "google",
      "Tom Briggs",
      "Cake was beautiful but delivery was two hours late and nobody called.",
      3,
      2,
    ),
    item(
      "c5-heard-3",
      "social",
      "instagram",
      "@leithfoodie",
      "Those cinnamon buns look amazing, do you deliver to Leith?",
      2,
    ),
    item(
      "c5-heard-4",
      "social",
      "instagram",
      "@sam.bakes",
      "Bit pricey for a loaf but the quality is great",
      9,
    ),
  ];
}

export function demoFeedback(now: Date): Feedback[] {
  const row = (id: string, rating: number, body: string, days: number): Feedback => ({
    id,
    company_id: "c5",
    contact_id: null,
    source: "request",
    body,
    rating,
    sentiment: sentimentFromRating(rating),
    created_at: ago(now, days),
  });
  return [
    row("c5-fb-1", 5, "Fresh bread every Saturday, friendly team.", 4),
    row("c5-fb-2", 4, "Great quality, a little expensive.", 11),
    row("c5-fb-3", 2, "Waited 20 minutes in the queue.", 16),
  ];
}

/** The same checks as request_feedback: listening on is not needed for a manual request. */
export function demoRequestFeedback(
  db: DB,
  contactId: string,
  userId: string,
  ctx: Ctx,
): { db: DB } | { error: string } {
  const ct = db.contacts.find((c) => c.id === contactId);
  if (!ct) return { error: "Contact not found" };
  if (
    !db.current_consents.some(
      (s) => s.contact_id === contactId && s.purpose === "marketing" && s.status === "granted",
    )
  )
    return {
      error: `${ct.name} hasn't opted in to emails from you, so Sol can't ask for feedback`,
    };
  const recent = db.feedback_requests.some(
    (f) =>
      f.contact_id === contactId &&
      f.status !== "declined" &&
      (f.status === "awaiting_approval" || Date.parse(f.created_at) > ctx.now.getTime() - 90 * DAY),
  );
  if (recent) return { error: `You asked ${ct.name} for feedback recently` };
  const company = db.companies.find((c) => c.id === ct.company_id);
  const first = ct.name.split(" ")[0] ?? ct.name;
  const req: FeedbackRequest = {
    id: ctx.uid("fbr"),
    company_id: ct.company_id,
    contact_id: contactId,
    trigger: "manual",
    status: "awaiting_approval",
    created_at: ctx.now.toISOString(),
    responded_at: null,
    token: ctx.uid("tok"),
  };
  const approval: Approval = {
    id: ctx.uid("a"),
    company_id: ct.company_id,
    run_id: null,
    action_type: "send_email",
    payload: {
      to: ct.email,
      subject: `How did we do, ${first}?`,
      body: `Hello ${first},\n\nThank you for choosing ${company?.name ?? "us"}. Could you tell us how we did? It takes a minute:\n\n/fb/${req.token}\n\nThank you.`,
      outreach: true,
      feedback_request_id: req.id,
      reason: "You asked for feedback from this customer.",
    },
    estimated_credits: 5,
    status: "pending",
    requested_by: userId,
    created_at: ctx.now.toISOString(),
  };
  return {
    db: {
      ...db,
      feedback_requests: [req, ...db.feedback_requests],
      approvals: [approval, ...db.approvals],
    },
  };
}

export function demoFeedbackRequest(db: DB, token: string): PublicFeedbackRequest | null {
  const f = db.feedback_requests.find((x) => x.token === token && x.status !== "declined");
  const ct = f && db.contacts.find((c) => c.id === f.contact_id);
  const co = f && db.companies.find((c) => c.id === f.company_id);
  if (!f || !ct || !co) return null;
  return { company: co.name, name: ct.name.split(" ")[0] ?? "", done: f.status === "responded" };
}

export function demoSubmitFeedback(
  db: DB,
  token: string,
  rating: number,
  comment: string,
  ctx: Ctx,
): DB | null {
  const f = db.feedback_requests.find((x) => x.token === token);
  if (!f || (f.status !== "sent" && f.status !== "awaiting_approval")) return null;
  if (!(rating >= 1 && rating <= 5)) return null;
  return {
    ...db,
    feedback: [
      {
        id: ctx.uid("fb"),
        company_id: f.company_id,
        contact_id: f.contact_id,
        source: "request",
        body: comment.trim().slice(0, 2000),
        rating,
        sentiment: sentimentFromRating(rating),
        created_at: ctx.now.toISOString(),
      },
      ...db.feedback,
    ],
    feedback_requests: db.feedback_requests.map((x) =>
      x.id === f.id ? { ...x, status: "responded", responded_at: ctx.now.toISOString() } : x,
    ),
  };
}

/** What a decision on a public reply or a feedback email does in the demo. */
export function demoListeningDecided(db: DB, a: Approval, approved: boolean, ctx: Ctx): DB {
  if (a.action_type === "send_email" && a.payload.feedback_request_id) {
    const id = a.payload.feedback_request_id;
    return {
      ...db,
      feedback_requests: db.feedback_requests.map((f) =>
        f.id === id ? { ...f, status: approved ? "sent" : "declined" } : f,
      ),
    };
  }
  if (a.action_type !== "reply_public") return db;
  const item = db.inbox_items.find((i) => i.id === a.payload.inbox_item_id);
  return {
    ...db,
    inbox_items: db.inbox_items.map((i) =>
      i.id === item?.id ? { ...i, status: approved ? "sent" : "closed" } : i,
    ),
    emails: approved
      ? db.emails.map((t) =>
          t.id === a.payload.thread_id
            ? {
                ...t,
                messages: [
                  ...t.messages,
                  { direction: "sent", text: a.payload.text, date: ctx.now.toISOString() },
                ],
              }
            : t,
        )
      : db.emails,
  };
}
