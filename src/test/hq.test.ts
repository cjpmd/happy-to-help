import { describe, expect, it } from "vitest";
import {
  channelRows,
  isGain,
  nextWindows,
  overnightBurn,
  phaseTasks,
  taskBadge,
  tasksAwaitingGo,
  telemetry,
} from "@/lib/hq";
import { NOW, agent_runs, credit_ledger, metrics_daily, tasks } from "@/lib/seed";
import type { AgentRun, Approval, ComplianceItem } from "@/lib/types";

describe("flight plan task tiles", () => {
  const tiles = phaseTasks(tasks, "c1", "build");

  it("shows up to four key tasks for the current phase, in date order", () => {
    expect(tiles.map((t) => t.title)).toEqual([
      "Approve product spec",
      "Waitlist page live",
      "Daily quiz feature",
      "Connect Stripe",
    ]);
  });

  it("derives each badge from status and proof", () => {
    expect(tiles.map((t) => taskBadge(t).text)).toEqual([
      "You · done",
      "Sol · verified 6/6",
      "Sol · building · ≈ 420 CR",
      "Up next · ≈ 120 CR",
    ]);
    expect(taskBadge(tiles[3]!, true)).toEqual({ tone: "warning", text: "Hold · awaiting GO" });
  });

  it("finds tasks whose runs wait for a GO", () => {
    const runs = [{ id: "r", task_id: "t" }] as AgentRun[];
    const pending = [{ status: "pending", run_id: "r" }] as Approval[];
    expect([...tasksAwaitingGo(pending, runs)]).toEqual(["t"]);
    const decided = [{ status: "approved", run_id: "r" }] as Approval[];
    expect(tasksAwaitingGo(decided, runs).size).toBe(0);
  });
});

describe("telemetry", () => {
  it("compares the last 7 days with the 7 before", () => {
    const t = telemetry(metrics_daily, "c1", { status: "not_connected", spend: 0, signups: 0 });
    expect(t.spark).toHaveLength(14);
    expect(t.visitors).toBeGreaterThan(0);
    expect(t.costNote).toBe("Organic");
    expect(t.costPerSignup).toBe(0);
  });

  it("works out cost per signup from paid ads", () => {
    const t = telemetry(metrics_daily, "c1", { status: "demo", spend: 30, signups: 6 });
    expect(t.costPerSignup).toBe(5);
    expect(t.costNote).toBe("Paid ads");
  });

  it("shows only gains in green", () => {
    expect([isGain("+18%"), isGain("+0"), isGain("-3"), isGain(null)]).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });
});

describe("overnight burn", () => {
  const burn = overnightBurn(agent_runs, credit_ledger, "c1", NOW);

  it("lists the latest runs from the last 24 hours, oldest first", () => {
    expect(burn.count).toBe(8);
    expect(burn.rows).toHaveLength(4);
    expect(burn.rows.map((r) => r.id)).toEqual(["r5", "r6", "r7", "r8"]);
  });

  it("marks failed runs as refunded and leaves them out of the total", () => {
    expect(burn.rows[0]).toMatchObject({ id: "r5", state: "refunded" });
    expect(burn.rows[3]).toMatchObject({ id: "r8", state: "running" });
    expect(burn.total).toBe(40 + 30 + 90 + 420 + 25 + 60 + 80);
  });
});

describe("next windows", () => {
  const now = new Date("2026-10-21T07:30:00Z");
  const item = (id: string, due: string, statutory = false): ComplianceItem => ({
    id,
    company_id: "c1",
    title: id,
    category: "x",
    due_date: due,
    status: "upcoming",
    statutory,
  });

  it("lists the soonest open deadlines with their urgency", () => {
    const rows = nextWindows(
      [
        item("far", "2027-01-10"),
        item("soon", "2026-10-30"),
        item("late-statutory", "2026-10-01", true),
        item("late", "2026-10-05"),
        { ...item("done", "2026-10-22"), status: "done" },
      ],
      [{ id: "task", company_id: "c1", title: "Survey", status: "todo", due: "2026-11-20" }],
      "c1",
      now,
    );
    expect(rows.map((r) => [r.id, r.tone])).toEqual([
      ["late-statutory", "destructive"],
      ["late", "warning"],
      ["soon", "warning"],
      ["task", "muted"],
    ]);
    expect(rows[2]!.label).toBe("30 Oct");
  });
});

describe("channels", () => {
  it("shows posts, support email and Meta ads, but not the waitlist", () => {
    const rows = channelRows(
      { id: "c1", channels: ["TikTok", "Waitlist", "Trust page"] },
      [
        {
          id: "p",
          company_id: "c1",
          channel: "TikTok",
          text: "",
          angle: "",
          status: "published",
          scheduled_for: "",
          metrics: { clicks: 41, signups: 3 },
        },
      ],
      [
        {
          id: "e",
          company_id: "c1",
          subject: "",
          name: "",
          address: "",
          mode: "support",
          messages: [{ direction: "received", text: "", date: "" }],
        },
      ],
      { status: "not_connected", daily_budget: 0, clicks: 0 },
    );
    expect(rows.map((r) => [r.channel, r.detail, r.value])).toEqual([
      ["TikTok", "1 published", "41 clicks"],
      ["Trust page", "not started", "—"],
      ["Email", "support", "1 to answer"],
      ["Meta ads", "off", ""],
    ]);
    expect(rows[3]!.action).toEqual({ label: "Set up", to: "/ads" });
  });
});
