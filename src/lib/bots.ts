// Process bots (Phase 17, SPEC L): the shapes of triggers and steps, plain descriptions for the
// app, filling in an email, and the weekly summary. Pure; tested in src/test/bots.test.ts.

export type BotEvent =
  | "lead_created"
  | "lead_won"
  | "customer_added"
  | "booking_answered"
  | "lapsed"
  | "invoice_overdue";

export type BotTrigger = { event: BotEvent; days?: number } | { schedule: "weekly" };

export interface BotConditions {
  stop_if_replied?: boolean;
  stop_if_won?: boolean;
}

export type BotStep =
  | { kind: "email"; after_days: number; subject: string; body: string; marketing: boolean }
  | { kind: "task"; after_days: number; title: string }
  | { kind: "feedback_request"; after_days: number }
  | { kind: "summary"; after_days: number };

const EVENTS: Record<BotEvent, string> = {
  lead_created: "a new lead comes in",
  lead_won: "you win a lead",
  customer_added: "you add a new customer",
  booking_answered: "a booking enquiry is answered",
  lapsed: "a customer hasn't been in touch for a while",
  invoice_overdue: "an invoice is overdue",
};

export function describeTrigger(t: BotTrigger): string {
  if ("schedule" in t) return "Every Monday at 09:00";
  if (t.event === "lapsed") return `When a customer hasn't been in touch for ${t.days ?? 90} days`;
  return `When ${EVENTS[t.event]}`;
}

const after = (d: number) =>
  d === 0 ? "Straight away" : d === 1 ? "After 1 day" : `After ${d} days`;

export function describeStep(s: BotStep): string {
  switch (s.kind) {
    case "email":
      return `${after(s.after_days)}: email "${s.subject}"${s.marketing ? " (only to people who opted in)" : ""}`;
    case "task":
      return `${after(s.after_days)}: a task for you, "${s.title}"`;
    case "feedback_request":
      return `${after(s.after_days)}: ask for feedback (only people who opted in)`;
    case "summary":
      return "Sol posts last week's summary in your chat";
  }
}

/** Fills {first_name} and {company}; anything else in braces is left as written. */
export function fillTemplate(text: string, vars: { name: string; company: string }): string {
  const first = vars.name.trim().split(/\s+/)[0] || "there";
  return text.replaceAll("{first_name}", first).replaceAll("{company}", vars.company);
}

/** When a step is due: days after the moment the contact was enrolled. */
export function stepDue(enrolledAt: string, afterDays: number): string {
  return new Date(Date.parse(enrolledAt) + afterDays * 86_400_000).toISOString();
}

export interface WeekFacts {
  leads: number;
  customers: number;
  posts: number;
  replies: number;
  credits: number;
  approvalsWaiting: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function weeklySummary(f: WeekFacts, company: string): string {
  const lines = [`Here's last week at ${company}.`];
  lines.push(
    `${plural(f.leads, "new lead")}, ${plural(f.customers, "new customer")}, ${plural(f.posts, "post")} published and ${plural(f.replies, "reply", "replies")} sent.`,
  );
  lines.push(`Sol used ${plural(f.credits, "credit")}.`);
  if (f.approvalsWaiting)
    lines.push(`${plural(f.approvalsWaiting, "thing")} still waiting for your GO.`);
  return lines.join("\n");
}

/** The Monday a week starts on (UTC), as the period key for a weekly bot. */
export function weekKey(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day))
    .toISOString()
    .slice(0, 10);
}
