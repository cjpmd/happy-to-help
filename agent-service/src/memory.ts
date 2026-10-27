// Company memory: the CLAUDE.md each run's workspace starts with, generated from the database
// (SPEC C: business, brand voice, goals, rules, stage). Pure, tested in test/memory.test.ts.
import type { Tables } from "./db/types.js";

export interface MemoryInput {
  company: Tables<"companies">;
  founders: string[];
  gates: Tables<"stage_gates">[];
  voiceGuide: string | null;
  unbuilt: string[];
  openTasks: Pick<Tables<"tasks">, "title" | "status" | "due">[];
  declined: { what: string; when: string }[];
  /** Facts the founder approved for Sol to remember (from conversations). */
  facts?: string[];
}

const STAGE_GOALS: Record<string, string> = {
  idea: "Turn the idea into testable assumptions and a smoke test.",
  evidence: "Prove demand: waitlist signups, customer interviews and pre-orders.",
  build: "Build the smallest product that the evidence supports.",
  launch: "Get the first paying customers.",
  grow: "Grow revenue and keep customers happy.",
};

export function companyMemory(m: MemoryInput): string {
  const c = m.company;
  const gate = m.gates.find((g) => g.status === "in_progress" || g.status === "ready");
  const criteria = Array.isArray(gate?.criteria)
    ? (gate.criteria as { label: string; current: number; target: number }[])
        .map((x) => `${x.label} ${x.current}/${x.target}`)
        .join(", ")
    : "";
  const lines = [
    `# ${c.name}: company memory`,
    "",
    `You are Sol, the AI cofounder for ${c.name}, working for ${m.founders.join(" and ") || "the founder"}.`,
    "",
    "## The business",
    `- ${c.description || "(No description yet.)"}`,
    `- Customers: ${c.target_customer ?? c.customer_type} (${c.customer_type}).`,
    `- Sector: ${c.sector}${c.sector === "general" ? "" : " (regulated: be stricter about claims)"}.`,
    `- Channels: ${c.channels.join(", ") || "none chosen yet"}.`,
    c.website_live_url ? `- Website: ${c.website_live_url}` : "",
    "",
    "## Stage and goal",
    `- Stage: ${c.stage}. ${STAGE_GOALS[c.stage] ?? ""}`,
    c.goal_90d ? `- 90-day goal: ${c.goal_90d}` : "",
    gate ? `- Current gate (${gate.stage}): ${criteria || "no criteria set"}.` : "",
    "",
    "## Brand voice",
    m.voiceGuide?.trim() ||
      "Clear, encouraging and honest. UK spelling. No guarantees or unsupported claims.",
    "",
    ...(m.facts?.length
      ? ["## Things to remember", ...m.facts.slice(0, 30).map((f) => `- ${f}`), ""]
      : []),
    "## Not built yet (never promise these in public text)",
    ...(m.unbuilt.length ? m.unbuilt.map((u) => `- ${u}`) : ["- (Nothing listed.)"]),
    "",
    "## Open tasks",
    ...(m.openTasks.length
      ? m.openTasks
          .slice(0, 12)
          .map((t) => `- ${t.title} (${t.status}${t.due ? `, due ${t.due}` : ""})`)
      : ["- (None.)"]),
    "",
    ...(m.declined.length
      ? [
          "## Recently declined (don't propose these again unchanged)",
          ...m.declined.slice(0, 5).map((d) => `- ${d.what} (${d.when})`),
          "",
        ]
      : []),
    "## Rules for you",
    "- Anything that publishes, sends, spends or files is a proposal: use a propose_* tool. The founder approves it in GO / NO-GO; you never do it yourself.",
    "- Run the claims check on all public-facing text before proposing it (UK CAP Code). Fix anything it flags.",
    "- Email marketing needs consent or a valid PECR soft opt-in. If you can't tell, don't propose it.",
    "- UK English, £, dates like 21 Oct 2026.",
    "- End every run with a one-paragraph summary of what you did.",
  ];
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n") + "\n";
}
