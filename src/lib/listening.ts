// Listening (Phase 16, SPEC K): what customers say in comments, reviews and feedback, as themes
// and a sentiment trend, and the short public replies Sol drafts. Pure; tested in
// src/test/listening.test.ts.
import type { PolicyCategory } from "./voicePolicy";
import type { Triage } from "./inbox";

export type Sentiment = "positive" | "neutral" | "negative";

const THEMES: { theme: string; pattern: RegExp }[] = [
  {
    theme: "Price and value",
    pattern: /\b(price\w*|expensive|cheap|pricey|value|cost\w*|overpriced)\b/i,
  },
  {
    theme: "Staff and service",
    pattern: /\b(staff|service|friendly|rude|helpful|welcom\w*|team)\b/i,
  },
  {
    theme: "Quality",
    pattern: /\b(quality|delicious|tasty|fresh|stale|cold|burnt|broken|perfect|beautiful)\b/i,
  },
  {
    theme: "Waiting and speed",
    pattern: /\b(wait\w*|slow|quick\w*|late|delay\w*|queue\w*|fast)\b/i,
  },
  { theme: "Delivery", pattern: /\b(deliver\w*|courier|parcel|arriv\w*|postage|shipping)\b/i },
  { theme: "Booking", pattern: /\b(book\w*|reservation|appointment|slot)\b/i },
  { theme: "Cleanliness", pattern: /\b(clean\w*|dirty|tidy|hygien\w*)\b/i },
  {
    theme: "Location and access",
    pattern: /\b(parking|location|find (you|us)|access\w*|wheelchair)\b/i,
  },
];

/** The themes a piece of feedback touches. */
export function themesFor(text: string): string[] {
  return THEMES.filter((t) => t.pattern.test(text)).map((t) => t.theme);
}

export function sentimentFromRating(rating: number): Sentiment {
  return rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative";
}

export interface Heard {
  at: string;
  text: string;
  sentiment: Sentiment | null;
}

/** The most-mentioned themes, with how many mentions were negative. */
export function topThemes(items: Heard[], n = 5) {
  const counts = new Map<string, { theme: string; count: number; negative: number }>();
  for (const i of items)
    for (const theme of themesFor(i.text)) {
      const c = counts.get(theme) ?? { theme, count: 0, negative: 0 };
      c.count++;
      if (i.sentiment === "negative") c.negative++;
      counts.set(theme, c);
    }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || b.negative - a.negative || a.theme.localeCompare(b.theme))
    .slice(0, n);
}

/** Positive, neutral and negative per week (weeks start on Monday, UTC), oldest first. */
export function sentimentTrend(items: Heard[], weeks: number, now: Date) {
  const day = (now.getUTCDay() + 6) % 7;
  const thisMonday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day);
  const WEEK = 7 * 86_400_000;
  const rows = Array.from({ length: weeks }, (_, i) => ({
    week: new Date(thisMonday - (weeks - 1 - i) * WEEK).toISOString().slice(0, 10),
    positive: 0,
    neutral: 0,
    negative: 0,
  }));
  for (const i of items) {
    const t = Date.parse(i.at);
    if (!i.sentiment || !Number.isFinite(t) || t >= thisMonday + WEEK) continue;
    const weeksAgo = t >= thisMonday ? 0 : Math.ceil((thisMonday - t) / WEEK);
    const row = rows[weeks - 1 - weeksAgo];
    if (row) row[i.sentiment]++;
  }
  return rows;
}

/** A review's stars settle what the words alone might not. */
export function reviewTriage(t: Triage, rating: number | null): Triage {
  if (rating === null || t.category === "spam" || t.category === "legal_threat") return t;
  if (rating <= 2)
    return {
      ...t,
      category: t.category === "refund_request" ? t.category : "review_negative",
      sentiment: "negative",
    };
  if (rating >= 4 && t.category !== "refund_request" && t.category !== "complaint")
    return { ...t, category: "review_positive", sentiment: "positive" };
  return t;
}

/** A short public reply: no letter format, no promises, nothing personal in public. */
export function draftPublicReply(o: {
  name: string;
  category: PolicyCategory;
  company: string;
}): string {
  const first = o.name.split(/\s+/)[0] || "";
  const hi = first && first !== "Someone" && first !== "A" ? `Thank you, ${first}.` : "Thank you.";
  const body: Partial<Record<PolicyCategory, string>> = {
    review_positive: `${hi} We're so glad you enjoyed it, and we hope to see you again soon.`,
    review_negative: `${hi.replace("Thank you", "Thank you for telling us")} We're sorry it wasn't right. Please get in touch directly so we can put it right.`,
    complaint: `We're sorry to hear this. Please get in touch directly so we can look into it.`,
    booking: `${hi} Please send us a message directly and we'll find a time that works.`,
    pricing_question: `${hi} Send us a message and we'll share the details.`,
  };
  return `${body[o.category] ?? `${hi} Send us a message if there's anything we can help with.`} – ${o.company}`;
}
