// Pure helpers shared by the Edge Functions. No imports and no Deno globals, so the app's
// Vitest suite tests them directly (src/test/edgeLogic.test.ts).

export type Tier = "routine" | "planning" | "strategy";

/**
 * SPEC C: Sol chat uses the smallest model by default and a mid-tier model when the founder
 * asks for planning. A plain keyword check; cheap and predictable.
 */
export function chatTier(message: string): Tier {
  return /\b(plan|planning|strategy|strategic|roadmap|priorit\w*|launch plan|go[- ]to[- ]market|campaign)\b/i.test(
    message,
  )
    ? "planning"
    : "routine";
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** USD for a response's usage at per-million-token prices (cache reads at 10%, writes at 125%). */
export function costUsd(usage: Usage, price: { input_per_mtok: number; output_per_mtok: number }) {
  const input =
    usage.input_tokens +
    (usage.cache_read_input_tokens ?? 0) * 0.1 +
    (usage.cache_creation_input_tokens ?? 0) * 1.25;
  return (input * price.input_per_mtok + usage.output_tokens * price.output_per_mtok) / 1_000_000;
}

/** How much to reserve: the cap or what's available, whichever is smaller, never below the estimate. */
export function reservation(estimate: number, cap: number, available: number): number | null {
  if (available < estimate) return null;
  return Math.max(estimate, Math.min(cap, available));
}

/** One server-sent event. */
export function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export interface ChatContext {
  company: {
    name: string;
    description: string;
    stage: string;
    customer_type: string;
    goal_90d: string | null;
  };
  voice: string | null;
  unbuilt: string[];
}

/** The chat system prompt: short, stable per company (so it caches), no timestamps. */
export function chatSystemPrompt(c: ChatContext): string {
  return [
    `You are Sol, the AI cofounder of ${c.company.name}, chatting with its founder in the app.`,
    `The business: ${c.company.description || "(no description yet)"}. Customers: ${c.company.customer_type}. Stage: ${c.company.stage}.${c.company.goal_90d ? ` 90-day goal: ${c.company.goal_90d}.` : ""}`,
    `Voice: ${c.voice?.trim() || "clear, encouraging and honest"}.`,
    c.unbuilt.length ? `Not built yet (don't imply these exist): ${c.unbuilt.join(", ")}.` : "",
    "Reply in UK English, briefly (two to five sentences unless asked for more). You can't publish, send or spend from chat: offer to draft it, and say it will wait for their approval in GO / NO-GO. Don't invent numbers; if you don't know, say so.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Splits text into word-sized chunks for the mock stream. */
export function chunks(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/** The demo's canned replies, used when no Anthropic key is configured. */
export function mockReply(message: string): string {
  const t = message.toLowerCase();
  if (t.includes("waitlist") || t.includes("signup"))
    return "I'll look at which posts brought in signups and draft more of what's working. Anything that goes out will wait for your GO.";
  if (/\bads?\b/.test(t) || t.includes("spend"))
    return "I can plan a small, capped ad test. I'll put the budget in your approvals before anything is spent.";
  if (t.includes("legal") || t.includes("privacy"))
    return "I'll check your compliance calendar and draft what's due. Filings wait for your approval.";
  return "Got it. I'll add that to tonight's plan and have a draft ready for your approval by the morning.";
}
