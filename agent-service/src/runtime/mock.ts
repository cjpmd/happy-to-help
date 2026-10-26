// The mock runtime: no Anthropic calls and no cost to us, but the same tools, gate, audit trail
// and credit flow as a real run. It follows each job's playbook with fixed, plain drafts, so
// the whole pipeline (claim → reserve → run → propose → settle) can be tested end to end.
// AGENT_RUNTIME=claude switches to the real runtime.
import { gate } from "../gate.js";
import { callTool } from "../tools.js";
import type { AgentRuntime, RunOutcome, RunRequest } from "./types.js";
import { analyseVoice } from "../../../src/lib/voice.js";

interface Post {
  channel: string;
  angle: string;
  metrics: { clicks?: number; signups?: number };
}

const firstSentence = (s: string) => (s.split(/(?<=\.)\s/)[0] ?? s).replace(/\.$/, "");

/** The chat replies the demo has always given, now from the worker. */
export function mockChatReply(message: string): string {
  const t = message.toLowerCase();
  if (t.includes("waitlist") || t.includes("signup"))
    return "I'll look at which posts brought in signups and draft more of what's working. Anything that goes out will wait for your GO.";
  if (t.includes("ad") || t.includes("spend"))
    return "I can plan a small, capped ad test. I'll put the budget in your approvals before anything is spent.";
  if (t.includes("legal") || t.includes("privacy"))
    return "I'll check your compliance calendar and draft what's due. Filings wait for your approval.";
  return "Got it. I'll add that to tonight's plan and have a draft ready for your approval by the morning.";
}

export const mockRuntime: AgentRuntime = {
  name: "mock",
  async run(req: RunRequest): Promise<RunOutcome> {
    const step = async (name: string, input: unknown = {}) => {
      const g = gate(`mcp__gumption__${name}`, req.tools);
      if (g.behavior === "deny") return { text: g.message, isError: true };
      const r = await callTool(req.ctx, name, input);
      await req.onStep({
        tool: name,
        summary: r.isError
          ? `Error: ${r.text.slice(0, 140)}`
          : r.text.split("\n")[0]!.slice(0, 160),
        credits: 0,
      });
      return r;
    };
    const done = (text: string): RunOutcome => ({
      status: "success",
      costUsd: Math.round(req.estimateUsd * 0.9 * 10000) / 10000,
      usage: { input_tokens: 4200, output_tokens: 600 },
      text,
    });

    // A title containing "fail" simulates a provider failure, for retry and refund tests.
    if (/\bfail\b/i.test(req.input.title ?? ""))
      return {
        status: "error",
        costUsd: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
        text: "",
        error: "Mock provider timeout",
      };

    switch (req.jobType) {
      case "chat":
        return done(mockChatReply(req.input.message ?? ""));

      case "social_post": {
        const company = JSON.parse((await step("get_company")).text) as {
          name: string;
          description: string;
          customer_type: string;
          channels: string[];
        };
        const metrics = JSON.parse((await step("get_metrics")).text) as { published_posts: Post[] };
        // Rank angles by signups per click, as the social-post skill says.
        const ranked = [...metrics.published_posts].sort(
          (a, b) =>
            (b.metrics.signups ?? 0) / Math.max(1, b.metrics.clicks ?? 0) -
            (a.metrics.signups ?? 0) / Math.max(1, a.metrics.clicks ?? 0),
        );
        const best = ranked[0];
        const channel =
          best?.channel ?? (company.customer_type === "B2B" ? "LinkedIn" : "Instagram");
        const angle = best?.angle ?? "Founder story";
        let text = `${firstSentence(company.description)}. We're building ${company.name} with our first users, one small step at a time. Join the waitlist and tell us what you need.`;
        // Like the model would: rewrite anything the claims check flags, then propose.
        const check = (await step("check_claims", { text })).text;
        const flags = (check.startsWith("Passed") ? [] : JSON.parse(check)) as { phrase: string }[];
        for (const f of flags)
          text = text.replace(new RegExp(f.phrase, "gi"), "").replace(/\s{2,}/g, " ");
        const proposed = await step("propose_post", {
          channel,
          text,
          angle,
          reason: best
            ? `${angle} posts convert best so far (${best.metrics.signups ?? 0} signups from ${best.metrics.clicks ?? 0} clicks).`
            : "No results yet, so this starts with the founder story.",
        });
        return done(
          proposed.isError
            ? `I drafted a ${channel} post but couldn't propose it: ${proposed.text}`
            : `I drafted a ${channel} post using the ${angle} angle and put it in your approvals.`,
        );
      }

      case "email_reply": {
        const thread = await step("get_email_thread", { thread_id: req.input.target });
        if (thread.isError)
          return done(`I couldn't find that email thread, so nothing was drafted.`);
        const t = JSON.parse(thread.text) as {
          thread: { address: string; subject: string; contact_name: string };
        };
        await step("propose_email", {
          to: t.thread.address,
          subject: `Re: ${t.thread.subject}`,
          body: `Hi ${t.thread.contact_name || "there"},\n\nThanks for getting in touch. We're looking into this and will come back to you with the details shortly.\n\nBest wishes`,
          reason: "A prompt, honest holding reply while the founder confirms the details.",
          thread_id: req.input.target,
        });
        return done("I drafted a reply and put it in your approvals.");
      }

      case "document_update": {
        const doc = await step("get_document", { document_id: req.input.target });
        if (doc.isError) return done("I couldn't find that document, so nothing changed.");
        const d = JSON.parse(doc.text) as { latest: { content: string } | null };
        await step("propose_document_update", {
          document_id: req.input.target,
          content: `${d.latest?.content ?? ""}\n\nReview update: prioritise the next customer-tested outcome; no unsupported promises added.`,
          summary: "Added a review note on priorities",
        });
        return done("I reviewed the document and saved a new version with a short update.");
      }

      case "voice_analysis": {
        const sources = JSON.parse((await step("get_voice_sources")).text) as { content: string }[];
        await step("get_voice_profile");
        const read = analyseVoice(sources.map((x) => x.content));
        if (!read)
          return done(
            "I need a few past emails or your website copy before I can learn your voice.",
          );
        await step("propose_voice_from_analysis", {
          summary: read.summary.split("\n")[0]!,
          traits: [...read.traits, "Honest", "Helpful"].slice(0, 5),
          use_phrases: read.phrases,
          avoid_phrases: ["guaranteed", "best", "world-leading"],
          reading_level: read.readingLevel,
          spelling: read.spelling === "US" ? "US" : "UK",
          ...(read.signOff ? { sign_off: read.signOff } : {}),
          emoji: read.usesEmoji ? "sparing" : "none",
          changes: `Learned from ${sources.length} pieces of your own writing.`,
        });
        return done("I've proposed a voice profile from your writing. It's waiting for your GO.");
      }

      case "voice_update": {
        const edits = JSON.parse((await step("get_edit_events")).text) as {
          original: string;
          final: string;
        }[];
        if (edits.length < 3)
          return done(`Only ${edits.length} edits this week, so no change to propose.`);
        const words = (t: string) => new Set(t.toLowerCase().match(/[a-z']+/g) ?? []);
        const removed = new Map<string, number>();
        for (const e of edits) {
          const after = words(e.final);
          for (const w of words(e.original))
            if (!after.has(w) && w.length > 3) removed.set(w, (removed.get(w) ?? 0) + 1);
        }
        const avoid = [...removed.entries()].filter(([, n]) => n >= 2).map(([w]) => w);
        if (!avoid.length)
          return done("Your edits this week were one-off fixes, so no change to propose.");
        const current = JSON.parse((await step("get_voice_profile")).text) as {
          summary: string;
          traits: string[];
          avoid_phrases: string[];
        } | null;
        await step("propose_voice_from_edits", {
          summary: current?.summary ?? "Clear, encouraging and honest.",
          traits: (current?.traits ?? ["Clear", "Encouraging", "Honest"]).slice(0, 5),
          avoid_phrases: [...new Set([...(current?.avoid_phrases ?? []), ...avoid])],
          changes: `You removed ${avoid.map((w) => `"${w}"`).join(", ")} in several edits, so I'll stop using them.`,
        });
        return done("I've proposed a small change to the voice from your edits.");
      }

      case "task":
      case "auto_mode": {
        const tasks = JSON.parse((await step("list_tasks")).text) as { title: string }[];
        return done(
          `I reviewed ${tasks.length} open tasks and worked on "${req.input.title ?? "the next one"}". Nothing needed your approval this time.`,
        );
      }

      default:
        return done(`Done: ${req.input.title ?? req.jobType}.`);
    }
  },
};
