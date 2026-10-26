// The mock runtime: no Anthropic calls and no cost to us, but the same tools, gate, audit trail
// and credit flow as a real run. It follows each job's playbook with fixed, plain drafts, so
// the whole pipeline (claim → reserve → run → propose → settle) can be tested end to end.
// AGENT_RUNTIME=claude switches to the real runtime.
import { gate } from "../gate.js";
import { callTool } from "../tools.js";
import type { AgentRuntime, RunOutcome, RunRequest } from "./types.js";
import { analyseVoice } from "../../../src/lib/voice.js";
import { extractItems } from "../../../src/lib/capture.js";
import { briefText, type BriefFacts } from "../../../src/lib/brief.js";

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

      case "capture_process": {
        const id = req.input.target ?? "";
        const cap = await step("get_capture", { capture_id: id });
        if (cap.isError) return { ...done(cap.text), status: "error", error: cap.text };
        const { transcript, segments } = JSON.parse(cap.text) as {
          transcript: string;
          segments: { start: number; text: string }[];
        };
        const ctx = JSON.parse((await step("get_capture_context")).text) as {
          today: string;
          team: { name: string; role: string }[];
          contacts: { name: string }[];
        };
        const items = extractItems(transcript, {
          now: new Date(`${ctx.today}T09:00:00Z`),
          teammates: ctx.team.filter((m) => m.role === "teammate").map((m) => m.name),
          contacts: ctx.contacts.map((c) => c.name),
        }).map((it) => {
          // Link back to the moment in the recording it came from.
          const seg = segments.find((sg) => it.quote?.includes(sg.text));
          return seg ? { ...it, at_seconds: Math.floor(seg.start) } : it;
        });
        const saved = await step("propose_extraction", { capture_id: id, items });
        if (saved.isError) return { ...done(saved.text), status: "error", error: saved.text };
        return done(
          items.length
            ? `I found ${items.length} things in it. They're on the review card: nothing is created until you accept.`
            : "I read it but didn't find any actions, decisions or promises.",
        );
      }

      case "commitment_followup": {
        const id = req.input.target ?? "";
        const c = JSON.parse((await step("get_commitment", { commitment_id: id })).text) as {
          to_name: string;
          what: string;
        };
        const first = c.to_name.split(" ")[0] ?? c.to_name;
        const what = c.what.replace(/^i'?ll |^i will |^we'?ll /i, "");
        await step("propose_followup", {
          commitment_id: id,
          subject: "Following up",
          body: `Hi ${first},\n\nAs promised, following up: ${what.charAt(0).toLowerCase()}${what.slice(1)}\n\nAny questions, just reply to this email.\n\nThanks`,
        });
        return done("I've drafted the follow-up you promised. It's waiting for your GO.");
      }

      case "morning_brief": {
        const facts = JSON.parse((await step("get_brief_facts")).text) as BriefFacts;
        const { data: company } = await req.ctx.db
          .from("companies")
          .select("name")
          .eq("id", req.ctx.companyId)
          .single();
        await step("save_brief", { content: briefText(facts, company?.name ?? "your company") });
        return done("Morning brief sent.");
      }

      case "task":
      case "routine":
      case "nightly":
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
