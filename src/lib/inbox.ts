// The inbox pipeline's rules (Phase 14, SPEC I and G): triage a message, decide what the policy
// allows, and draft a reply. The rule-based triage and draft are the mock runtime's and the
// demo's; the real ones are the inbox skills, which must reach the same decisions on the hard
// rules. Also the contact timeline. Pure; tested in src/test/inbox.test.ts.
import type { PolicyCategory, ResponseMode } from "./voicePolicy";

export type Flag =
  "money" | "legal" | "safety" | "vulnerable" | "data_request" | "unverified_claim" | "spam";

export interface Triage {
  category: PolicyCategory;
  sentiment: "positive" | "neutral" | "negative";
  urgency: "low" | "normal" | "high";
  language: string;
  flags: Partial<Record<Flag, boolean>>;
}

const has = (re: RegExp, s: string) => re.test(s);

/** A cautious, rule-based reading of a message. When in doubt it raises a flag. */
export function triageMessage(subject: string, body: string): Triage {
  const t = `${subject}\n${body}`.toLowerCase();
  const flags: Triage["flags"] = {};
  if (has(/\b(refund|money back|charged twice|overcharged|chargeback|compensation)\b/, t))
    flags.money = true;
  if (has(/\b(solicitor|lawyer|legal action|court|sue|trading standards|small claims)\b/, t))
    flags.legal = true;
  if (has(/\b(allerg\w*|anaphyla\w*|food poisoning|injur\w*|unsafe|hospital|ill after)\b/, t))
    flags.safety = true;
  if (has(/\b(can'?t cope|struggling|desperate|suicid\w*|self[- ]harm|bereave\w*|vulnerable)\b/, t))
    flags.vulnerable = true;
  if (
    has(/\b(gdpr|subject access|delete my (data|details|account)|what data you hold|erase my)\b/, t)
  )
    flags.data_request = true;
  if (has(/\b(you (said|promised|claimed)|your (ad|website) said|guaranteed?|cures?)\b/, t))
    flags.unverified_claim = true;
  if (has(/\b(seo services|crypto|bitcoin|backlinks|loan offer|winner|viagra)\b/, t))
    flags.spam = true;

  const category: PolicyCategory = flags.spam
    ? "spam"
    : flags.legal
      ? "legal_threat"
      : flags.money
        ? "refund_request"
        : has(/\b(journalist|press|reporter|newspaper|podcast|interview request)\b/, t)
          ? "press"
          : has(
                /\b(complain\w*|disappoint\w*|unhappy|terrible|awful|rude|wrong order|still waiting|never arrived)\b/,
                t,
              )
            ? "complaint"
            : has(/\b(review|stars?|recommend(ed)?|loved it)\b/, t) &&
                has(/\b(great|amazing|lovely|loved|thank)/, t)
              ? "review_positive"
              : has(/\b(book|booking|reserve|reservation|appointment|table for|slot)\b/, t)
                ? "booking"
                : has(/\b(price|prices|cost|how much|quote|rates?|£\d)/, t)
                  ? "pricing_question"
                  : "general_enquiry";
  const negative = has(
    /\b(disappoint\w*|unhappy|angry|terrible|awful|worst|furious|rude|complain\w*)\b/,
    t,
  );
  const positive = has(/\b(thank\w*|love[ds]?|great|amazing|lovely|brilliant|delighted)\b/, t);
  return {
    category,
    sentiment: negative ? "negative" : positive ? "positive" : "neutral",
    urgency:
      flags.safety ||
      flags.legal ||
      flags.vulnerable ||
      has(/\b(urgent|asap|today|tonight|immediately)\b/, t)
        ? "high"
        : category === "spam"
          ? "low"
          : "normal",
    language: "en",
    flags,
  };
}

export const ESCALATING_FLAGS: Flag[] = [
  "money",
  "legal",
  "safety",
  "vulnerable",
  "data_request",
  "unverified_claim",
];

/**
 * What to do: the hard rules first (money, legal threats and the flagged cases always go to the
 * founder, SPEC G), then the company's policy for the category. Mirrors private.always_escalate
 * and the executor's checkAutoSend.
 */
export function decideMode(
  t: Pick<Triage, "category" | "flags">,
  policy: ResponseMode,
): { mode: ResponseMode; reason: string } {
  if (t.category === "refund_request" || t.category === "legal_threat")
    return { mode: "escalate", reason: `${t.category.replace("_", " ")}s always come to you` };
  const flag = ESCALATING_FLAGS.find((f) => t.flags[f]);
  if (flag)
    return {
      mode: "escalate",
      reason: `it mentions ${flag.replace("_", " ")}, so it comes to you`,
    };
  if (t.category === "spam") return { mode: "escalate", reason: "it looks like spam" };
  return { mode: policy, reason: `your policy for ${t.category.replace("_", " ")}s` };
}

/** A plain reply in the company's voice: the mock runtime's draft. */
export function draftReply(o: {
  name: string;
  category: PolicyCategory;
  company: string;
  signOff: string | null;
}): string {
  const first = o.name.split(/\s+/)[0] || "there";
  const middle: Record<string, string> = {
    pricing_question:
      "Thanks for asking about prices. I'll send you the details shortly, with anything that depends on quantity or dates.",
    booking:
      "Thanks for getting in touch about a booking. Let me check what we have and come back to you with times that work.",
    complaint:
      "I'm sorry this wasn't right. Thank you for telling us. I'm looking into what happened and will come back to you with what we'll do next.",
    review_positive: "Thank you so much for the kind words. It means a lot to the whole team.",
    press:
      "Thanks for getting in touch. I'll pass this to the right person and we'll come back to you soon.",
    general_enquiry: "Thanks for getting in touch. I'll come back to you shortly with an answer.",
  };
  return [
    `Hi ${first},`,
    "",
    middle[o.category] ?? middle["general_enquiry"]!,
    "",
    o.signOff ?? `Best wishes,\n${o.company}`,
  ].join("\n");
}

export interface TimelineEvent {
  at: string;
  kind: "email_in" | "email_out" | "lead" | "consent" | "feedback" | "promise" | "meeting";
  text: string;
}

/** Everything that's happened with a contact, newest first (the contact timeline). */
export function contactTimeline(input: {
  email: string;
  threads: {
    address: string;
    subject: string;
    messages: { direction: "received" | "sent"; text: string; date: string }[];
  }[];
  leads: { message: string; channel: string; created_at: string }[];
  consents: { status: string; lawful_basis: string | null; at?: string }[];
  feedback: { body: string; created_at: string }[];
  promises: { what: string; due_date: string; created_at: string }[];
  meetings: { text: string; at: string }[];
}): TimelineEvent[] {
  const e = input.email.toLowerCase();
  const out: TimelineEvent[] = [];
  for (const t of input.threads.filter((x) => x.address.toLowerCase() === e))
    for (const m of t.messages)
      out.push({
        at: m.date,
        kind: m.direction === "received" ? "email_in" : "email_out",
        text: `${t.subject}: ${m.text.slice(0, 140)}`,
      });
  for (const l of input.leads)
    out.push({
      at: l.created_at,
      kind: "lead",
      text: `Lead from ${l.channel}${l.message ? `: ${l.message}` : ""}`,
    });
  for (const c of input.consents)
    if (c.at)
      out.push({
        at: c.at,
        kind: "consent",
        text:
          c.status === "granted"
            ? `Marketing: opted in (${c.lawful_basis?.replace("_", " ")})`
            : c.status === "withdrawn"
              ? "Marketing: opted out"
              : "Marketing: service only",
      });
  for (const f of input.feedback) out.push({ at: f.created_at, kind: "feedback", text: f.body });
  for (const p of input.promises)
    out.push({ at: p.created_at, kind: "promise", text: `Promised: ${p.what} (by ${p.due_date})` });
  for (const m of input.meetings) out.push({ at: m.at, kind: "meeting", text: m.text });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
