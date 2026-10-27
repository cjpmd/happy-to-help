// Campaigns (Phase 15, SPEC J): the CAP Code checks on promotional text, progress against the
// goal, and the plain plan and assets the mock runtime and demo use. Pure; tested in
// src/test/campaigns.test.ts.
import { checkClaims, type Sector } from "./workspace";

export interface CapFlag {
  phrase: string;
  reason: string;
}

const CAP_RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bfree\b/gi, reason: 'Only say "free" if there\'s no cost or catch (CAP Code 3.23)' },
  {
    pattern:
      /\b(last chance|limited time|only \d+ left|ends (today|tonight|soon)|hurry|while stocks last)\b/gi,
    reason: "Urgency must be true and specific (CAP Code 8.17)",
  },
  {
    pattern: /\b(\d{1,2}% off|half price|sale)\b/gi,
    reason: "Say when the offer ends and any conditions (CAP Code 8.17)",
  },
  {
    pattern: /\b(cheaper than|better than|beats|unbeatable)\b/gi,
    reason: "Comparisons must be fair and verifiable (CAP Code 3.33)",
  },
];

/** CAP Code checks for promotional copy, on top of the claims check. */
export function capFlags(text: string): CapFlag[] {
  const hasEndDate = /\b(until|ends|ending|by|before)\s+\w+/i.test(text);
  return CAP_RULES.flatMap((r) =>
    Array.from(text.matchAll(r.pattern), (m) => ({ phrase: m[0], reason: r.reason })).filter(
      // A discount with an end date stated is fine.
      (f) => !(r.reason.includes("offer ends") && hasEndDate),
    ),
  );
}

/** Everything that would stop a campaign asset being proposed. */
export function campaignCheck(text: string, sector: Sector = "general", unbuilt: string[] = []) {
  return [
    ...checkClaims(text, sector, unbuilt).map(({ phrase, reason }) => ({ phrase, reason })),
    ...capFlags(text),
  ];
}

export type Metric = "clicks" | "leads" | "customers";

export function progress(
  r: { clicks: number; leads: number; customers: number },
  metric: Metric,
  target: number,
) {
  const value = r[metric];
  return { value, pct: Math.min(100, Math.round((value / Math.max(1, target)) * 100)) };
}

export interface PlanInput {
  goal: string;
  channels: string[];
  customerType: "B2B" | "B2C";
  today: string;
  paid: boolean;
}

/** A plain two-week plan: the mock runtime's and the demo's. */
export function plainPlan(p: PlanInput) {
  const start = p.today;
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + 13 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const social = p.channels.filter((c) => c !== "email");
  return {
    name: p.goal.length > 60 ? `${p.goal.slice(0, 57)}…` : p.goal,
    metric: "leads" as Metric,
    target: p.customerType === "B2B" ? 10 : 30,
    audience:
      p.customerType === "B2B"
        ? "Decision-makers at small businesses nearby"
        : "Local customers who follow us or have bought before",
    starts_on: start,
    ends_on: end,
    plan: {
      rationale: `Two weeks, ${social.length ? `${social.length * 2} posts across ${social.join(", ")}` : "no social posts"}${p.channels.includes("email") ? ", one email to people who opted in" : ""}${p.paid ? ", and one ad to launch yourself" : ""}, each with its own tracked link so we can see what works.`,
      posts: social.length * 2,
      emails: p.channels.includes("email") ? 1 : 0,
      ads: p.paid ? 1 : 0,
    },
  };
}

/** Plain copy for a campaign asset (no claims, nothing the CAP checks flag). */
export function plainAsset(
  kind: "social_post" | "email" | "ad",
  company: string,
  goal: string,
  n: number,
) {
  if (kind === "email")
    return {
      title: `News from ${company}`,
      body: `Hello,\n\nA quick note from ${company}: ${goal.charAt(0).toLowerCase()}${goal.slice(1).replace(/\.$/, "")}. Have a look at the link below and reply if you have any questions.\n\nThanks for being with us.`,
    };
  if (kind === "ad")
    return {
      title: `${company} ad`,
      body: `${company}: ${goal.replace(/\.$/, "")}. Find out more.`,
    };
  const lines = [
    `Something new from ${company}: ${goal.replace(/\.$/, "")}.`,
    `Behind the scenes at ${company} this week. ${goal.replace(/\.$/, "")}: details at the link.`,
  ];
  return { title: `Post ${n + 1}`, body: lines[n % lines.length]! };
}
