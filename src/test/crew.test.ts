import { describe, expect, it } from "vitest";
import { attributeRuns, runAgentName, seedAgents, startLevel } from "@/lib/crew";
import { ACTION_TYPES, CREW_CATALOGUE, STARTER_CREW } from "@/lib/crewCatalogue";
import { demoDb } from "@/lib/demoDb";
import type { AgentRun } from "@/lib/types";

const type = (key: string) => ACTION_TYPES.find((t) => t.key === key)!;

describe("the crew catalogue (generated from the database)", () => {
  it("has Sol and 45 crew members", () => {
    expect(CREW_CATALOGUE).toHaveLength(46);
    expect(CREW_CATALOGUE[0]!.key).toBe("sol");
  });

  it("gives every agent without work a call to action, and never active ones", () => {
    for (const c of CREW_CATALOGUE) {
      if (c.engine) expect(c.needs).toBeNull();
      else expect(c.needs?.label).toBeTruthy();
    }
  });

  it("starts every agent with no monthly cap (D105)", () => {
    expect(CREW_CATALOGUE.filter((c) => c.budget_per_month_credits !== null)).toEqual([]);
  });

  it("puts exactly the Starter-plan agents in the Starter crew", () => {
    expect(
      CREW_CATALOGUE.filter((c) => c.min_plan === "starter")
        .map((c) => c.key)
        .sort(),
    ).toEqual([...STARTER_CREW].sort());
  });
});

describe("start levels (D96)", () => {
  it("caps external and customer-facing actions at L2", () => {
    expect(startLevel(3, type("reply_inbox"))).toBe(2);
    expect(startLevel(3, type("publish_post"))).toBe(2);
  });
  it("allows L3 for internal work", () => {
    expect(startLevel(3, type("internal_update"))).toBe(3);
  });
  it("never goes above an action type's ceiling", () => {
    expect(startLevel(3, type("update_memory"))).toBe(2);
    expect(startLevel(3, type("ad_spend"))).toBe(2);
  });
  it("keeps a lower start level", () => {
    expect(startLevel(1, type("update_voice"))).toBe(1);
  });
});

describe("seeding a crew", () => {
  const { agents, autonomy } = seedAgents("c9", STARTER_CREW, CREW_CATALOGUE, ACTION_TYPES);

  it("gives a company Sol and 11 others", () => {
    expect(agents).toHaveLength(12);
    expect(agents.map((a) => a.catalogue_key)).toContain("sol");
  });

  it("stands Penn by, with nothing to connect yet", () => {
    expect(agents.find((a) => a.catalogue_key === "penn")!.status).toBe("standing_by");
    expect(agents.find((a) => a.catalogue_key === "nova")!.status).toBe("active");
  });

  it("starts nothing external above L2", () => {
    const external = new Set(
      ACTION_TYPES.filter((t) => t.external || t.customer_facing).map((t) => t.key),
    );
    expect(autonomy.filter((a) => external.has(a.action_type) && a.level > 2)).toEqual([]);
  });
});

describe("attributing runs", () => {
  const { agents } = seedAgents("c9", STARTER_CREW, CREW_CATALOGUE, ACTION_TYPES);
  const run = (task: string, pillar: AgentRun["pillar"]): AgentRun => ({
    id: task,
    company_id: "c9",
    task_id: null,
    task,
    pillar,
    model: "m",
    status: "succeeded",
    started_at: null,
    finished_at: null,
    cost_usd: 0,
    credits_charged: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
    steps: [],
  });

  it("follows the database's rules for runs with no job", () => {
    const out = attributeRuns(
      [
        run("Chat with Sol", "run"),
        run("A post", "grow"),
        run("A deadline", "legal"),
        run("Inbox", "run"),
        run("Build", "build"),
      ],
      agents,
    );
    expect(out.map((r) => runAgentName(r, agents))).toEqual([
      "Sol",
      "Nova",
      "Clara",
      "Tilly",
      "Sol",
    ]);
  });

  it("gives every demo run a crew member", () => {
    const db = demoDb();
    expect(db.agent_runs.filter((r) => !r.agent_id)).toEqual([]);
    expect(db.agents.filter((a) => a.company_id === db.companies[0]!.id)).toHaveLength(12);
  });
});

describe("the roster", () => {
  it("badges an agent by its external actions first", async () => {
    const { topLevel } = await import("@/lib/crew");
    const { agents, autonomy } = seedAgents("c9", STARTER_CREW, CREW_CATALOGUE, ACTION_TYPES);
    const tilly = agents.find((a) => a.catalogue_key === "tilly")!;
    const clara = agents.find((a) => a.catalogue_key === "clara")!;
    expect(topLevel(tilly.id, autonomy, ACTION_TYPES)).toBe(2);
    expect(topLevel(clara.id, autonomy, ACTION_TYPES)).toBe(3);
  });

  it("groups the demo crew: Sol, on duty by pillar, and Penn joining", async () => {
    const { demoCrewStats, roster } = await import("@/lib/crew");
    const db = demoDb();
    const c = db.companies[0]!.id;
    const now = new Date("2026-11-09T12:00:00Z");
    const r = roster(db.agents, demoCrewStats(db, c, now), db.agent_catalogue, c);
    expect(r.sol?.agent.name).toBe("Sol");
    expect(r.joining.map((e) => e.agent.name)).toEqual(["Penn"]);
    expect(r.pillars.map((p) => p.pillar)).toEqual(["grow", "customers", "run", "legal", "meta"]);
    expect(r.joining[0]!.stat?.outcome_total).toBeNull();
  });

  it("counts this month from the 1st in UK time", async () => {
    const { ukMonthStart } = await import("@/lib/crew");
    expect(ukMonthStart(new Date("2026-11-09T12:00:00Z")).toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(ukMonthStart(new Date("2026-07-15T12:00:00Z")).toISOString()).toBe(
      "2026-06-30T23:00:00.000Z",
    );
  });

  it("applies founder settings with the database's limits", async () => {
    const { applyAgentSettings } = await import("@/lib/crew");
    const db = demoDb();
    const nova = db.agents.find((a) => a.catalogue_key === "nova")!;
    const ok = applyAgentSettings(db.agents, db.agent_catalogue, nova.id, {
      budget_per_month_credits: 900,
      paused: true,
    });
    expect("agents" in ok && ok.agents.find((a) => a.id === nova.id)).toMatchObject({
      budget_per_month_credits: 900,
      status: "paused",
    });
    expect(
      applyAgentSettings(db.agents, db.agent_catalogue, nova.id, { budget_per_run_credits: 99999 }),
    ).toHaveProperty("error");
    const penn = db.agents.find((a) => a.catalogue_key === "penn")!;
    const resumed = applyAgentSettings(db.agents, db.agent_catalogue, penn.id, { paused: false });
    expect("agents" in resumed && resumed.agents.find((a) => a.id === penn.id)!.status).toBe(
      "standing_by",
    );
  });
});
