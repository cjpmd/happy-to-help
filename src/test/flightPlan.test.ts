import { describe, expect, it } from "vitest";
import {
  ARC,
  arcPaths,
  arcPoint,
  arcReadout,
  arcSummary,
  buildMilestones,
  clampPan,
  inDays,
  labelWidth,
  layoutArc,
  panLimits,
  parallax,
  starField,
  type Milestone,
} from "@/lib/flightPlan";
import { companies, stage_gates, tasks } from "@/lib/seed";

// The prototype's milestones (docs/design/hq-reference.dc.html), now = day 30.
const NOW_DAY = 30;
const prototype: Milestone[] = [
  [0, "Idea"],
  [7, "Interviews"],
  [18, "Evidence gate", "gate"],
  [22, "Spec approved"],
  [25, "Waitlist live"],
  [34, "Quiz feature"],
  [38, "Stripe live"],
  [42, "Launch gate", "gate"],
  [50, "First customer"],
  [64, "50 paying"],
  [80, "Grow gate", "gate"],
].map(([day, label, kind], i) => ({
  id: `m${i}`,
  day: day as number,
  label: (label as string).toUpperCase(),
  kind: kind === "gate" ? "gate" : "milestone",
  status: (day as number) <= NOW_DAY ? "done" : "upcoming",
}));

const overlaps = (items: ReturnType<typeof layoutArc>, widthPx: number) => {
  const k = ARC.W / widthPx;
  const spans = items
    .filter((m) => m.showLabel)
    .map((m) => {
      const half = (labelWidth(m.label, m.fontSize) * k) / 2;
      return [m.x - half, m.x + half] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  return spans.some((s, i) => i > 0 && s[0] - ARC.LABEL_GAP * k <= spans[i - 1]![1]);
};

describe("arc geometry", () => {
  it("puts the top of the arc at y = 72 in the centre of the box", () => {
    const [x, y] = arcPoint(0);
    expect(x).toBeCloseTo(500);
    expect(y).toBeCloseTo(72);
  });

  it("looks ahead: the view centre is 10 days after now", () => {
    const items = layoutArc({ milestones: prototype, nowDay: NOW_DAY, pan: 0 });
    // Day 42 is 2 days right of the centre (day 40): 2.2°.
    expect(items.find((m) => m.day === 42)!.angle).toBeCloseTo(2.2);
    expect(items.find((m) => m.day === 42)!.rotation).toBeCloseTo(1.76);
  });

  it("draws the flown part of the arc up to now, with a now tick", () => {
    const paths = arcPaths(NOW_DAY, 0);
    expect(paths.flown).toMatch(/^M /);
    expect(paths.now).not.toBeNull();
    // Panned far into the future, now is off to the left: no flown part, no tick.
    const later = arcPaths(NOW_DAY, 40);
    expect(later.flown).toBeNull();
    expect(later.now).toBeNull();
  });
});

describe("milestone layout", () => {
  const items = layoutArc({ milestones: prototype, nowDay: NOW_DAY, pan: 0 });
  const byDay = (d: number) => items.find((m) => m.day === d)!;

  it("shows milestones within ±22° and fades them beyond ±18°", () => {
    for (const m of items) {
      const abs = Math.abs(m.angle);
      expect(m.visible).toBe(abs <= 22);
      expect(m.opacity).toBe(abs > 22 ? 0 : abs > 18 ? 0.45 : 1);
    }
  });

  it("sizes gates, the next milestone and the rest", () => {
    expect(byDay(18)).toMatchObject({ size: 16, fontSize: 15, border: 2, sub: "Passed · day 18" });
    expect(byDay(42)).toMatchObject({ size: 22, fontSize: 15, border: 3, sub: "In 12 days" });
    expect(byDay(42).subTone).toBe("hold");
    expect(byDay(34)).toMatchObject({ isNext: true, size: 14, fontSize: 13, sub: "In 4 days" });
    expect(byDay(38)).toMatchObject({ isNext: false, size: 9, fontSize: 11, sub: undefined });
  });

  it("never overlaps labels, at any pan or width", () => {
    for (const widthPx of [1000, 1180, 700, 360]) {
      for (let pan = -40; pan <= 40; pan++) {
        const placed = layoutArc({ milestones: prototype, nowDay: NOW_DAY, pan, widthPx });
        expect(overlaps(placed, widthPx)).toBe(false);
      }
    }
  });

  it("labels gates before other milestones and keeps every marker", () => {
    const narrow = layoutArc({ milestones: prototype, nowDay: NOW_DAY, pan: 0, widthPx: 360 });
    const visible = narrow.filter((m) => m.visible);
    expect(visible.length).toBeGreaterThan(narrow.filter((m) => m.showLabel).length);
    expect(narrow.find((m) => m.day === 42)!.showLabel).toBe(true);
  });

  it("never labels a hidden milestone", () => {
    for (let pan = -40; pan <= 40; pan += 4) {
      const placed = layoutArc({ milestones: prototype, nowDay: NOW_DAY, pan });
      expect(placed.every((m) => m.visible || !m.showLabel)).toBe(true);
    }
  });
});

describe("panning", () => {
  it("clamps the view centre to the first and last milestones", () => {
    expect(panLimits(prototype, NOW_DAY)).toEqual([-40, 40]);
    expect(clampPan(-100, prototype, NOW_DAY)).toBe(-40);
    expect(clampPan(100, prototype, NOW_DAY)).toBe(40);
    expect(clampPan(12, prototype, NOW_DAY)).toBe(12);
  });

  it("always allows the view at now", () => {
    const early: Milestone[] = [{ id: "a", day: 2, label: "A", kind: "gate", status: "done" }];
    expect(panLimits(early, NOW_DAY)).toEqual([-38, 0]);
    expect(panLimits([], NOW_DAY)).toEqual([0, 0]);
  });

  it("moves each depth layer by a different amount", () => {
    expect(parallax(12, { x: 0, y: 0 })).toEqual({
      far: { x: -24, y: -0 },
      near: { x: -54, y: -0 },
      glow: { x: -18, y: -0 },
      arc: { x: -12, y: -0 },
    });
    const p = parallax(0, { x: 1, y: 1 });
    expect([p.far.x, p.near.x, p.glow.x, p.arc.x]).toEqual([-4, -9, -12, -20]);
  });
});

describe("readout and summary", () => {
  it("shows elapsed time and the next gate at now", () => {
    expect(arcReadout(prototype, NOW_DAY, 0)).toEqual({
      main: "T+30 days",
      sub: "Mission elapsed · LAUNCH GATE in 12 days",
    });
  });

  it("shows the viewed day while panned", () => {
    expect(arcReadout(prototype, NOW_DAY, 12).sub).toBe("Viewing day 52 · press Now to return");
  });

  it("summarises the plan for screen readers", () => {
    expect(arcSummary(prototype, NOW_DAY, "Build")).toBe(
      "Flight plan: Build phase, day 30. Next: QUIZ FEATURE in 4 days. LAUNCH GATE in 12 days.",
    );
  });

  it("words day counts in plain English", () => {
    expect([inDays(0), inDays(1), inDays(4), inDays(-2)]).toEqual([
      "Today",
      "In 1 day",
      "In 4 days",
      "2 days late",
    ]);
  });
});

describe("star field", () => {
  const count = (paths: string[]) => paths.join("").split("M").length - 1;

  it("is stable for a company and different between companies", () => {
    expect(starField("c1")).toEqual(starField("c1"));
    expect(starField("c1")).not.toEqual(starField("c2"));
  });

  it("has about 170 far and 45 near stars", () => {
    const sky = starField("c1");
    expect(count(sky.far)).toBe(170);
    expect(count(sky.near)).toBe(45);
  });
});

describe("milestones from the store", () => {
  it("builds StudyBuddy's flight plan from its gates and key tasks", () => {
    const c1 = companies.find((c) => c.id === "c1")!;
    const ms = buildMilestones(
      c1,
      stage_gates.filter((g) => g.company_id === "c1"),
      tasks.filter((t) => t.company_id === "c1"),
    );
    expect(ms.map((m) => [m.day, m.label, m.kind, m.status])).toEqual([
      [0, "Mission start", "milestone", "done"],
      [8, "Go for evidence", "gate", "done"],
      [12, "Customer interviews", "milestone", "done"],
      [18, "Go for build", "gate", "done"],
      [22, "Approve product spec", "milestone", "done"],
      [25, "Waitlist page live", "milestone", "done"],
      [34, "Daily quiz feature", "milestone", "upcoming"],
      [38, "Connect Stripe", "milestone", "upcoming"],
      [42, "Go for launch", "gate", "upcoming"],
      [50, "First paying customer", "milestone", "upcoming"],
      [64, "50 paying customers", "milestone", "upcoming"],
      [80, "Go for growth", "gate", "upcoming"],
    ]);
  });
});
