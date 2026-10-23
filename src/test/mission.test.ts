import { describe, expect, it } from "vitest";
import {
  currentGate,
  gateDay,
  gateMetric,
  gateName,
  greeting,
  missionDay,
  solStatus,
} from "@/lib/mission";
import { complianceTone } from "@/lib/compliance";
import { NOW, companies, stage_gates } from "@/lib/seed";
import type { StageGate } from "@/lib/types";

const studyBuddy = companies.find((c) => c.id === "c1")!;
const gates = stage_gates.filter((g) => g.company_id === "c1");

describe("mission timeline", () => {
  it("counts elapsed days from the company's start", () => {
    expect(missionDay(studyBuddy, NOW)).toBe(30);
    expect(missionDay({}, NOW)).toBe(0);
  });

  it("names a gate after the stage it opens", () => {
    expect(gateName("build")).toBe("Launch gate");
    expect(gateName("idea")).toBe("Evidence gate");
    expect(gateName("grow")).toBe("Grow gate");
  });

  it("uses the completed date for passed gates and the target date otherwise", () => {
    const evidence = gates.find((g) => g.stage === "evidence")!;
    const build = gates.find((g) => g.stage === "build")!;
    expect(gateDay(evidence, studyBuddy)).toBe(18);
    expect(gateDay(build, studyBuddy)).toBe(42);
    expect(gateDay({ ...build, target_date: null }, studyBuddy)).toBeNull();
  });

  it("finds the current gate and its first unmet criterion", () => {
    const gate = currentGate(gates);
    expect(gate?.stage).toBe("build");
    expect(gateMetric(gate)).toEqual({ label: "Beta users", current: 23, target: 40 });
    const allMet: StageGate = {
      ...gate!,
      criteria: [{ label: "Waitlist", current: 60, target: 50 }],
    };
    expect(gateMetric(allMet)?.label).toBe("Waitlist");
    expect(gateMetric(undefined)).toBeUndefined();
  });

  it("greets by UK time of day", () => {
    expect(greeting(new Date("2026-10-21T07:30:00Z"))).toBe("Good morning");
    expect(greeting(new Date("2026-10-21T13:00:00Z"))).toBe("Good afternoon");
    // 18:30 in London during BST is 17:30 UTC.
    expect(greeting(new Date("2026-07-01T17:30:00Z"))).toBe("Good evening");
  });
});

describe("Sol status", () => {
  const base = { companyId: "c9", runs: [], approvals: [], events: [], solTyping: false };
  it("is idle with nothing running or waiting", () => {
    expect(solStatus(base).state).toBe("idle");
  });
  it("is waiting when approvals are pending and nothing runs", () => {
    const approvals = [{ company_id: "c9", status: "pending" }] as never[];
    expect(solStatus({ ...base, approvals })).toMatchObject({ state: "waiting", pending: 1 });
  });
  it("is working while a run is in progress", () => {
    const runs = [{ company_id: "c9", status: "running", task: "Draft post" }] as never[];
    expect(solStatus({ ...base, runs })).toMatchObject({ state: "working", summary: "Draft post" });
  });
});

describe("compliance tone", () => {
  it("shows overdue statutory deadlines in red", () => {
    expect(complianceTone({ status: "overdue", statutory: true })).toBe("destructive");
  });
  it("shows other overdue items in amber", () => {
    expect(complianceTone({ status: "overdue" })).toBe("warning");
    expect(complianceTone({ status: "overdue", statutory: false })).toBe("warning");
  });
  it("never shows statutory items red unless overdue", () => {
    expect(complianceTone({ status: "upcoming", statutory: true })).toBe("neutral");
    expect(complianceTone({ status: "done", statutory: true })).toBe("success");
  });
});
