// The demo's inbox pipeline and consent-checked import: the same rules as the database and the
// agent (src/lib/inbox.ts), on the in-memory store. Pure; tested in src/test/demoInbox.test.ts.
import type { DB, ImportResult, InboxItem, ContactRow } from "./storeContext";
import type { EmailThread } from "./workspace";
import { decideMode, draftReply, triageMessage } from "./inbox";
import { draftPublicReply, reviewTriage } from "./listening";
import { currentVoice, type PolicyCategory } from "./voicePolicy";

/** Threads whose last message is from the customer become inbox items. */
export function demoInboxItems(emails: EmailThread[]): InboxItem[] {
  return emails
    .filter(
      (t) => t.mode !== "outreach" && t.messages[t.messages.length - 1]?.direction === "received",
    )
    .map((t) => ({
      id: `inbox-${t.id}`,
      company_id: t.company_id,
      thread_id: t.id,
      channel: t.channel ?? "email",
      contact_id: null,
      status: "new",
      category: null,
      sentiment: null,
      urgency: null,
      flags: {},
      mode: null,
      reason: null,
      approval_id: null,
      created_at: t.messages[t.messages.length - 1]!.date,
    }));
}

/** Triage → policy → draft for one item; replies always wait for a GO in the demo. */
export function demoProcess(
  db: DB,
  id: string,
  ctx: { now: Date; uid: (p: string) => string },
): DB {
  const item = db.inbox_items.find((i) => i.id === id);
  const thread = item && db.emails.find((t) => t.id === item.thread_id);
  if (!item || !thread) return db;
  const last = thread.messages.filter((m) => m.direction === "received").pop();
  const t = reviewTriage(triageMessage(thread.subject, last?.text ?? ""), thread.rating ?? null);
  const policy =
    db.response_policies.find((p) => p.company_id === item.company_id && p.category === t.category)
      ?.mode ?? "draft";
  const d = decideMode(t, policy);
  const flags = Object.fromEntries(Object.entries(t.flags).filter(([, v]) => v)) as Record<
    string,
    boolean
  >;
  const base = {
    ...item,
    category: t.category,
    sentiment: t.sentiment,
    urgency: t.urgency,
    flags,
    mode: d.mode,
    reason: d.reason,
  };
  if (d.mode === "escalate")
    return {
      ...db,
      inbox_items: db.inbox_items.map((i) =>
        i.id === id ? { ...base, status: t.category === "spam" ? "spam" : "escalated" } : i,
      ),
    };
  const company = db.companies.find((c) => c.id === item.company_id);
  if (thread.channel === "social" || thread.channel === "review") {
    // Public replies always wait for a GO (D75).
    const approvalId = ctx.uid("a");
    return {
      ...db,
      approvals: [
        {
          id: approvalId,
          company_id: item.company_id,
          run_id: null,
          action_type: "reply_public",
          payload: {
            platform: thread.platform ?? "",
            kind: thread.channel === "review" ? "review" : "comment",
            external_id: thread.id,
            text: draftPublicReply({
              name: thread.name,
              category: t.category as PolicyCategory,
              company: company?.name ?? "",
            }),
            thread_id: thread.id,
            inbox_item_id: item.id,
            reason:
              thread.channel === "review"
                ? "A public reply to a review, in your voice."
                : "A public reply to a comment on your post.",
          },
          estimated_credits: 5,
          status: "pending",
          created_at: ctx.now.toISOString(),
        },
        ...db.approvals,
      ],
      inbox_items: db.inbox_items.map((i) =>
        i.id === id ? { ...base, status: "awaiting_approval", approval_id: approvalId } : i,
      ),
    };
  }
  const body = draftReply({
    name: thread.name,
    category: t.category as PolicyCategory,
    company: company?.name ?? "",
    signOff: currentVoice(db.voice_profiles, item.company_id).approved?.sign_off ?? null,
  });
  const approvalId = ctx.uid("a");
  return {
    ...db,
    approvals: [
      {
        id: approvalId,
        company_id: item.company_id,
        run_id: null,
        action_type: "send_email",
        payload: {
          to: thread.address,
          subject: /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`,
          body,
          reason:
            d.mode === "auto_send"
              ? "Your policy lets me answer this; the demo still asks first."
              : "A reply to a customer, in your voice.",
        },
        estimated_credits: 5,
        status: "pending",
        created_at: ctx.now.toISOString(),
      },
      ...db.approvals,
    ],
    inbox_items: db.inbox_items.map((i) =>
      i.id === id ? { ...base, status: "awaiting_approval", approval_id: approvalId } : i,
    ),
  };
}

/** A consent-checked import: the same outcome rules as import_contacts_checked. */
export function demoImport(
  db: DB,
  companyId: string,
  rows: ContactRow[],
  softOptIn: boolean,
  ctx: { now: Date; uid: (p: string) => string },
): { db: DB; result: ImportResult } {
  const known = new Set(
    db.contacts.filter((c) => c.company_id === companyId).map((c) => c.email.toLowerCase()),
  );
  const result: ImportResult = { added: 0, consent: 0, soft_opt_in: 0, service_only: 0 };
  const contacts = [...db.contacts];
  const consents = [...db.current_consents];
  for (const r of rows) {
    const email = r.email.trim().toLowerCase();
    if (known.has(email)) continue;
    known.add(email);
    const id = ctx.uid("x");
    contacts.push({
      id,
      company_id: companyId,
      name: r.name,
      email,
      kind: r.kind,
      value: r.value,
      last: ctx.now.toISOString(),
      source: "import",
    });
    result.added++;
    const basis =
      r.consent === "consent" && r.consent_evidence?.trim()
        ? "consent"
        : r.consent === "soft_opt_in" && softOptIn && r.kind === "customer"
          ? "soft_opt_in"
          : null;
    if (basis === "consent") result.consent++;
    else if (basis) result.soft_opt_in++;
    else result.service_only++;
    consents.push({
      contact_id: id,
      purpose: "marketing",
      status: basis ? "granted" : "not_given",
      lawful_basis: basis,
    });
  }
  const today = ctx.now.toISOString().slice(0, 10);
  return {
    result,
    db: {
      ...db,
      contacts,
      current_consents: consents,
      compliance_items: result.service_only
        ? [
            ...db.compliance_items,
            {
              id: ctx.uid("ci"),
              company_id: companyId,
              title: `${result.service_only} imported ${result.service_only === 1 ? "contact" : "contacts"} can't be sent marketing`,
              category: "Data protection",
              due_date: new Date(Date.parse(`${today}T00:00:00Z`) + 14 * 86_400_000)
                .toISOString()
                .slice(0, 10),
              status: "upcoming",
              statutory: false,
            },
          ]
        : db.compliance_items,
    },
  };
}
