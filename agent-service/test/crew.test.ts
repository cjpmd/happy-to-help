// Crew logic that needs no database (Phase 20). Database-backed crew tests are in
// crewRuns.test.ts and need the local Supabase stack.
import { describe, expect, it } from "vitest";
import {
  agentLimit,
  effectiveSkills,
  effectiveTools,
  loadStylePrompt,
  monthStart,
  unavailableReason,
} from "../src/crew.js";
import { companyMemory, type MemoryInput } from "../src/memory.js";

const nova = { name: "Nova", budget_per_run_credits: 120, budget_per_month_credits: null };

describe("agent caps (D105)", () => {
  it("lets a run reserve up to the per-run cap when there's no monthly cap", () => {
    expect(agentLimit(nova, 10_000, 40)).toEqual({ limit: 120, blocked: null });
  });

  it("limits a run to what's left of the month", () => {
    const capped = { ...nova, budget_per_month_credits: 500 };
    expect(agentLimit(capped, 420, 40)).toEqual({ limit: 80, blocked: null });
  });

  it("refuses a run when the month's cap can't cover the estimate", () => {
    const capped = { ...nova, budget_per_month_credits: 500 };
    const r = agentLimit(capped, 480, 40);
    expect(r.blocked).toMatch(/used 480 of 500 credits this month/);
  });

  it("refuses a run when the per-run cap is below the estimate", () => {
    const r = agentLimit({ ...nova, budget_per_run_credits: 30 }, 0, 40);
    expect(r.blocked).toMatch(/limit of 30 credits a run/);
  });

  it("never reports a negative month allowance", () => {
    const r = agentLimit({ ...nova, budget_per_month_credits: 100 }, 250, 10);
    expect(r.limit).toBe(0);
    expect(r.blocked).not.toBeNull();
  });

  it("counts the month from the 1st (UTC)", () => {
    expect(monthStart(new Date("2026-11-30T23:59:00Z")).toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });
});

describe("who may run", () => {
  it("runs active and standing-by agents", () => {
    expect(unavailableReason({ name: "Nova", status: "active" })).toBeNull();
    expect(unavailableReason({ name: "Penn", status: "standing_by" })).toBeNull();
  });
  it("refuses paused and locked agents with a reason the founder can act on", () => {
    expect(unavailableReason({ name: "Nova", status: "paused" })).toMatch(/Resume Nova in Crew/);
    expect(unavailableReason({ name: "Rex", status: "locked" })).toMatch(/Upgrade in Billing/);
  });
});

describe("tools and skills", () => {
  it("narrows a job's tools to the agent's", () => {
    expect(effectiveTools(["a", "b", "c"], ["c", "a", "z"])).toEqual(["a", "c"]);
  });
  it("keeps the job's tools when the agent lists none", () => {
    expect(effectiveTools(["a", "b"], [])).toEqual(["a", "b"]);
  });
  it("adds the agent's skills to the job's, once each", () => {
    expect(effectiveSkills(["social-post", "claims-check"], ["claims-check", "x"])).toEqual([
      "social-post",
      "claims-check",
      "x",
    ]);
  });
});

describe("style prompts", () => {
  it("loads a Starter crew member's prompt", async () => {
    expect(await loadStylePrompt("prompts/nova.md")).toMatch(/Nova/);
  });
  it("refuses paths outside agent-service/prompts", async () => {
    expect(await loadStylePrompt("../package.json")).toBeNull();
    expect(await loadStylePrompt("prompts/../package.json")).toBeNull();
    expect(await loadStylePrompt("/etc/passwd")).toBeNull();
  });
  it("returns null for a missing prompt", async () => {
    expect(await loadStylePrompt("prompts/nobody.md")).toBeNull();
  });
});

describe("the crew member in company memory", () => {
  const base: MemoryInput = {
    company: {
      id: "c",
      name: "StudyBuddy",
      description: "Revision app",
      target_customer: "Students",
      customer_type: "B2C",
      sector: "general",
      channels: [],
      website_live_url: "",
      stage: "build",
      goal_90d: null,
    } as unknown as MemoryInput["company"],
    founders: ["Aisha"],
    gates: [],
    voiceGuide: null,
    unbuilt: [],
    openTasks: [],
    declined: [],
  };

  it("is Sol when no crew member is given", () => {
    expect(companyMemory(base)).toContain("You are Sol, the AI cofounder for StudyBuddy");
  });

  it("names the crew member, their role and Sol as flight director", () => {
    const text = companyMemory({
      ...base,
      crew: { name: "Nova", role: "Content creator", isSol: false, prompt: "Write well." },
    });
    expect(text).toContain("You are Nova, content creator in Sol's crew at StudyBuddy");
    expect(text).toContain("flight director");
    expect(text).toContain("## Your role\nWrite well.");
  });

  it("keeps Sol's own opening when Sol runs the job", () => {
    const text = companyMemory({
      ...base,
      crew: { name: "Sol", role: "Flight director", isSol: true, prompt: null },
    });
    expect(text).toContain("You are Sol, the AI cofounder");
    expect(text).not.toContain("## Your role");
  });
});
