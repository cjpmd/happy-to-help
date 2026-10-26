import { describe, expect, it } from "vitest";
import { companyMemory } from "../src/memory.js";
import { gate } from "../src/gate.js";

const company = {
  id: "c",
  slug: "c",
  name: "StudyBuddy",
  description: "Revision quizzes.",
  customer_type: "B2C" as const,
  stage: "build" as const,
  plan: "founder" as const,
  sector: "education" as const,
  channels: ["TikTok"],
  target_customer: "S5 students",
  goal_90d: "500 weekly users",
  starting_stage: null,
  existing_website_url: null,
  website_live_url: "/site/c",
  website_preview_url: "",
  created_by: null,
  created_at: "",
  updated_at: "",
  started_at: "",
  activation_definition: null,
  entry_path: "start_up" as const,
  social_handles: {},
  google_business_url: null,
};

describe("company memory", () => {
  const md = companyMemory({
    company,
    founders: ["Aisha Grant"],
    gates: [
      {
        id: "g",
        company_id: "c",
        stage: "build",
        status: "in_progress",
        approved_at: null,
        approved_by: null,
        target_date: null,
        criteria: [{ label: "Beta users", current: 23, target: 40 }],
      },
    ],
    voiceGuide: "Friendly and honest.",
    unbuilt: ["Teacher dashboard"],
    openTasks: [{ title: "Connect Stripe", status: "todo", due: "2026-10-29" }],
    declined: [{ what: "publish post: Revision is broken", when: "2026-10-19" }],
  });
  it("covers business, stage, voice, unbuilt features, tasks and rules", () => {
    expect(md).toContain("working for Aisha Grant");
    expect(md).toContain("regulated: be stricter about claims");
    expect(md).toContain("Current gate (build): Beta users 23/40");
    expect(md).toContain("Friendly and honest.");
    expect(md).toContain("- Teacher dashboard");
    expect(md).toContain("Connect Stripe (todo, due 2026-10-29)");
    expect(md).toContain("Recently declined");
    expect(md).toMatch(/propose_\* tool/);
  });
});

describe("approval gate", () => {
  const allowed = ["get_metrics", "propose_post"];
  it("allows the job's own tools and reading the workspace", () => {
    expect(gate("mcp__gumption__propose_post", allowed).behavior).toBe("allow");
    expect(gate("Read", allowed).behavior).toBe("allow");
  });
  it("denies tools the job doesn't list, and shell, writes and the web", () => {
    for (const t of [
      "mcp__gumption__propose_email",
      "Bash",
      "Write",
      "WebFetch",
      "mcp__other__publish",
    ])
      expect(gate(t, allowed).behavior).toBe("deny");
  });
});

describe("voice examples in memory", async () => {
  const { examplesText, voiceText } = await import("../src/workspace.js");
  it("lists the founder's examples under the voice, and nothing when there are none", () => {
    expect(examplesText([])).toBe("");
    const text = examplesText([{ situation: "pricing_question", body: "Our loaves are £4." }]);
    expect(text).toContain('pricing question: "Our loaves are £4."');
    expect(
      voiceText({
        summary: "Warm.",
        traits: ["Warm"],
        use_phrases: [],
        avoid_phrases: ["best"],
        reading_level: "plain",
        spelling: "UK",
        sign_off: null,
        emoji: "none",
        channel_variants: {},
        tone_rules: {},
      }),
    ).toContain('Never say: "best"');
  });
});
