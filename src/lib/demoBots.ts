// The demo's process bots (Phase 17): the same templates as 20261101100000_bots.sql (kept in step
// by src/test/demoBots.test.ts) and the same rules as create_bot / update_bot. The demo shows how
// bots are set up; they run on the live service. Pure.
import type { Bot, BotTemplate, DB } from "./storeContext";
import type { BotStep } from "./bots";
import { checkClaims } from "./workspace";

const email = (after_days: number, marketing: boolean, subject: string, body: string): BotStep => ({
  kind: "email",
  after_days,
  marketing,
  subject,
  body,
});

export const DEMO_BOT_TEMPLATES: BotTemplate[] = [
  {
    key: "lead_follow_up",
    name: "Lead follow-up",
    description:
      "When a new lead comes in, reply the next day if nobody has, then one gentle follow-up a few days later for leads who opted in. Stops when they reply or you win them.",
    trigger: { event: "lead_created" },
    conditions: { stop_if_replied: true, stop_if_won: true },
    steps: [
      email(
        1,
        false,
        "Thanks for getting in touch",
        "Hello {first_name},\n\nThanks for your enquiry. I wanted to check you have everything you need from us. Just reply to this email with any questions.\n\n{company}",
      ),
      email(
        5,
        true,
        "Any questions?",
        "Hello {first_name},\n\nI'm following up on your enquiry in case it got lost. If now isn't the right time, no problem at all.\n\n{company}",
      ),
    ],
    needs: null,
    sort: 1,
  },
  {
    key: "review_request",
    name: "Review request",
    description:
      "A few days after a purchase or a booking, ask customers who opted in how it went, with a one-minute feedback page.",
    trigger: { event: "lead_won" },
    conditions: {},
    steps: [{ kind: "feedback_request", after_days: 3 }],
    needs: null,
    sort: 2,
  },
  {
    key: "payment_reminder",
    name: "Invoice and payment reminders",
    description: "Polite reminders when an invoice is overdue, through your own Stripe account.",
    trigger: { event: "invoice_overdue" },
    conditions: {},
    steps: [
      email(
        1,
        false,
        "A friendly reminder about your invoice",
        "Hello {first_name},\n\nA quick reminder that your invoice from {company} is now due. If you've already paid, thank you, and please ignore this.\n\n{company}",
      ),
    ],
    needs: "stripe",
    sort: 3,
  },
  {
    key: "onboarding",
    name: "New-customer onboarding",
    description:
      "Welcome new customers, then a useful tip a week later for those who opted in. You get a task to check in personally.",
    trigger: { event: "customer_added" },
    conditions: {},
    steps: [
      email(
        0,
        false,
        "Welcome to {company}",
        "Hello {first_name},\n\nWelcome, and thank you for choosing us. If you need anything, just reply to this email.\n\n{company}",
      ),
      { kind: "task", after_days: 3, title: "Check in with {first_name}" },
      email(
        7,
        true,
        "Getting the most from {company}",
        "Hello {first_name},\n\nA week in, here's a tip: tell us what you'd like more of, and we'll let you know when it's ready.\n\n{company}",
      ),
    ],
    needs: null,
    sort: 4,
  },
  {
    key: "win_back",
    name: "Lapsed-customer win-back",
    description:
      "When a customer who opted in hasn't been in touch for three months, a friendly note to say hello.",
    trigger: { event: "lapsed", days: 90 },
    conditions: { stop_if_replied: true },
    steps: [
      email(
        0,
        true,
        "We've missed you at {company}",
        "Hello {first_name},\n\nIt's been a while, so we wanted to say hello. We'd love to see you again whenever suits.\n\n{company}",
      ),
    ],
    needs: null,
    sort: 5,
  },
  {
    key: "weekly_summary",
    name: "Weekly performance summary",
    description:
      "Every Monday morning, a short summary of last week in your chat with Sol: leads, customers, posts, replies and credits.",
    trigger: { schedule: "weekly" },
    conditions: {},
    steps: [{ kind: "summary", after_days: 0 }],
    needs: null,
    sort: 6,
  },
];

type R = { db: DB } | { error: string };

export function demoCreateBot(db: DB, companyId: string, template: string, uid: string): R {
  const t = db.bot_templates.find((x) => x.key === template);
  if (!t) return { error: "Unknown bot" };
  if (db.bots.some((b) => b.company_id === companyId && b.template === template))
    return { error: "You already have this bot" };
  const bot: Bot = {
    id: uid,
    company_id: companyId,
    template,
    name: t.name,
    enabled: false,
    trigger: t.trigger,
    conditions: t.conditions,
    steps: t.steps,
    approval_level: "each",
    approved_by: null,
    cap_credits_week: 50,
    enabled_at: null,
  };
  return { db: { ...db, bots: [...db.bots, bot] } };
}

export function demoUpdateBot(
  db: DB,
  id: string,
  patch: Parameters<import("./storeContext").Ctx["updateBot"]>[1],
  userId: string,
  now: Date,
): R {
  const b = db.bots.find((x) => x.id === id);
  if (!b) return { error: "Bot not found" };
  let steps = b.steps;
  if (patch.steps) {
    if (patch.steps.length !== b.steps.length)
      return { error: "A bot keeps its steps; you can change their wording and timing" };
    steps = b.steps.map((s, i) => {
      const n = patch.steps![i]!;
      const days = n.after_days;
      if (s.kind === "email" && n.kind === "email")
        return { ...s, after_days: days, subject: n.subject.trim(), body: n.body.trim() };
      if (s.kind === "task" && n.kind === "task")
        return { ...s, after_days: days, title: n.title.trim() };
      return { ...s, after_days: days };
    });
    if (
      patch.steps.some(
        (s) => !Number.isInteger(s.after_days) || s.after_days < 0 || s.after_days > 90,
      )
    )
      return { error: "Days must be between 0 and 90" };
    if (
      steps.some(
        (s) => (s.kind === "email" && (!s.subject || !s.body)) || (s.kind === "task" && !s.title),
      )
    )
      return { error: "Each email needs a subject and a message" };
  }
  const changed = JSON.stringify(steps) !== JSON.stringify(b.steps);
  const level = patch.approval_level ?? (changed ? "each" : b.approval_level);
  const approving = level === "approved_wording" && (!!patch.approval_level || changed);
  if (approving)
    for (const s of steps)
      if (s.kind === "email") {
        const f = checkClaims(`${s.subject}\n${s.body}`)[0];
        if (f)
          return { error: `The claims check flagged "${f.phrase}". Change the wording first.` };
      }
  const enabling = patch.enabled === true && !b.enabled;
  if (enabling && db.bot_templates.find((t) => t.key === b.template)?.needs === "stripe")
    return { error: "This bot needs your Stripe account connected, which isn't available yet" };
  const next: Bot = {
    ...b,
    steps,
    enabled: patch.enabled ?? b.enabled,
    enabled_at: enabling ? now.toISOString() : b.enabled_at,
    approval_level: level,
    approved_by: level === "approved_wording" ? (approving ? userId : b.approved_by) : null,
    cap_credits_week: patch.cap_credits_week ?? b.cap_credits_week,
  };
  return { db: { ...db, bots: db.bots.map((x) => (x.id === id ? next : x)) } };
}

export function demoDeleteBot(db: DB, id: string): DB {
  return {
    ...db,
    bots: db.bots.filter((b) => b.id !== id),
    bot_runs: db.bot_runs.filter((r) => r.bot_id !== id),
  };
}
