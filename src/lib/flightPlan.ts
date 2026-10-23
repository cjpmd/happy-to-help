import type { Company, StageGate, Task } from "./types";
import { dayOf, gateDay, gateName } from "./mission";

// Flight plan arc maths (docs/DESIGN.md section 5, from the approved prototype in
// docs/design/hq-reference.dc.html). Pure functions, so the component stays thin
// and the layout rules are testable.

export type MilestoneStatus = "done" | "upcoming";

export interface Milestone {
  id: string;
  /** Day from the company's start: the completed date if done, otherwise the target date. */
  day: number;
  label: string;
  kind: "gate" | "milestone";
  status: MilestoneStatus;
}

export const ARC = {
  /** SVG viewBox width and height. */
  W: 1000,
  H: 205,
  /** Circle radius; the centre sits below the box so the top of the arc is at y = TOP. */
  R: 1400,
  TOP: 72,
  /** Degrees of arc per day. */
  DEG: 1.1,
  /** The view looks ahead: its centre is this many days after now. */
  LEAD: 10,
  /** The arc is drawn from −LIMIT° to +LIMIT°. */
  LIMIT: 26,
  /** Milestones within ±VISIBLE° show; beyond ±FADE° they fade to FADED_OPACITY. */
  VISIBLE: 22,
  FADE: 18,
  FADED_OPACITY: 0.45,
  /** Earlier / Later shift the view by this many days. */
  PAN_STEP: 12,
  /** A horizontal swipe or drag longer than this (px) pans. */
  SWIPE_PX: 40,
  /** Minimum gap (px) between two labels. */
  LABEL_GAP: 16,
} as const;

const CX = ARC.W / 2;
const CY = ARC.R + ARC.TOP;

/** Below this scale (px per viewBox unit) labels would be unreadable, so narrow screens crop. */
export const MIN_SCALE = 0.75;

export interface ArcViewport {
  /** The horizontal slice of the viewBox on screen. */
  x0: number;
  w: number;
  /** Look-ahead in days, shrunk with the slice so "now" stays on screen. */
  lead: number;
}

/**
 * On wide screens the whole arc shows. On narrow ones (below 750px) it keeps a
 * readable scale and shows the middle of the arc, in a taller box.
 */
export function arcViewport(widthPx: number = ARC.W): ArcViewport {
  const w = Math.min(ARC.W, Math.max(1, widthPx) / MIN_SCALE);
  return { x0: (ARC.W - w) / 2, w, lead: Math.round((ARC.LEAD * w) / ARC.W) };
}

export const viewCentre = (nowDay: number, pan: number, lead: number = ARC.LEAD) =>
  nowDay + lead + pan;
export const angleFor = (day: number, centre: number) => (day - centre) * ARC.DEG;

/** The point on the arc at `angle` degrees from the top, in viewBox units. */
export function arcPoint(angle: number): [number, number] {
  const r = (angle * Math.PI) / 180;
  return [CX + ARC.R * Math.sin(r), CY - ARC.R * Math.cos(r)];
}

/** An SVG path along the arc from angle a1 to a2 (a1 < a2). */
export function arcPath(a1: number, a2: number): string {
  const [x1, y1] = arcPoint(a1);
  const [x2, y2] = arcPoint(a2);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${ARC.R} ${ARC.R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Keep the view centre between the first and last milestones (and always allow "now"). */
export function panLimits(
  milestones: Milestone[],
  nowDay: number,
  lead: number = ARC.LEAD,
): [number, number] {
  if (!milestones.length) return [0, 0];
  const days = milestones.map((m) => m.day);
  return [
    Math.min(0, Math.min(...days) - nowDay - lead),
    Math.max(0, Math.max(...days) - nowDay - lead),
  ];
}

export function clampPan(
  pan: number,
  milestones: Milestone[],
  nowDay: number,
  lead: number = ARC.LEAD,
): number {
  const [lo, hi] = panLimits(milestones, nowDay, lead);
  return Math.min(hi, Math.max(lo, pan));
}

/** Estimated label width in px, from DESIGN.md: chars × font size × 0.72 + 24. */
export const labelWidth = (label: string, fontSize: number) => label.length * fontSize * 0.72 + 24;

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** "In 4 days", "Today" or "2 days late". */
export function inDays(until: number): string {
  if (until === 0) return "Today";
  return until > 0 ? `In ${days(until)}` : `${days(-until)} late`;
}

export interface PlacedMilestone extends Milestone {
  /** Position in viewBox units, and as a percentage of the box for HTML overlays. */
  x: number;
  y: number;
  left: number;
  top: number;
  angle: number;
  /** Labels follow the curve: angle × 0.8. */
  rotation: number;
  visible: boolean;
  opacity: number;
  /** Placement priority: 3 gates, 2 the next milestone, 1 the rest. */
  tier: 1 | 2 | 3;
  isNext: boolean;
  past: boolean;
  /** Marker diameter and border, label font size, all in px. */
  size: number;
  border: number;
  fontSize: number;
  sub?: string | undefined;
  subTone: "hold" | "muted";
  showLabel: boolean;
}

/**
 * Lay out the milestones for the current view. `widthPx` is the rendered width
 * of the arc, used to turn label widths (px) into viewBox units, so labels don't
 * overlap at any screen size.
 */
export function layoutArc({
  milestones,
  nowDay,
  pan,
  widthPx = ARC.W,
}: {
  milestones: Milestone[];
  nowDay: number;
  pan: number;
  widthPx?: number;
}): PlacedMilestone[] {
  const view = arcViewport(widthPx);
  const centre = viewCentre(nowDay, pan, view.lead);
  const sorted = [...milestones].sort((a, b) => a.day - b.day);
  const next = sorted.find((m) => m.status !== "done" && m.day > nowDay);
  const items: PlacedMilestone[] = sorted.map((m) => {
    const angle = angleFor(m.day, centre);
    const [x, y] = arcPoint(angle);
    const abs = Math.abs(angle);
    const gate = m.kind === "gate";
    const isNext = m === next;
    const past = m.status === "done";
    const visible = abs <= ARC.VISIBLE && x >= view.x0 && x <= view.x0 + view.w;
    const until = m.day - nowDay;
    return {
      ...m,
      x,
      y,
      left: ((x - view.x0) / view.w) * 100,
      top: (y / ARC.H) * 100,
      angle,
      rotation: angle * 0.8,
      visible,
      opacity: !visible ? 0 : abs > ARC.FADE ? ARC.FADED_OPACITY : 1,
      tier: gate ? 3 : isNext ? 2 : 1,
      isNext,
      past,
      size: gate ? (past ? 16 : 22) : isNext ? 14 : 9,
      border: gate && !past ? 3 : 2,
      fontSize: gate ? 15 : isNext ? 13 : 11,
      sub: gate
        ? past
          ? `Passed · day ${m.day}`
          : inDays(until)
        : isNext
          ? inDays(until)
          : undefined,
      subTone: gate && !past ? "hold" : "muted",
      showLabel: false,
    };
  });

  // Place labels in priority order (gates, the next milestone, then the rest,
  // nearest the centre first). Skip any that would overlap one already placed;
  // its marker still shows.
  const pxToUnits = view.w / Math.max(1, widthPx);
  const gap = ARC.LABEL_GAP * pxToUnits;
  const placed: { lo: number; hi: number }[] = [];
  items
    .filter((m) => m.visible)
    .sort((a, b) => b.tier - a.tier || Math.abs(a.x - CX) - Math.abs(b.x - CX))
    .forEach((m) => {
      const half = (labelWidth(m.label, m.fontSize) * pxToUnits) / 2;
      const lo = m.x - half;
      const hi = m.x + half;
      if (placed.every((o) => hi + gap < o.lo || lo - gap > o.hi)) {
        m.showLabel = true;
        placed.push({ lo, hi });
      }
    });
  return items;
}

/** The "now" tick and the flown part of the arc. */
export function arcPaths(nowDay: number, pan: number, lead: number = ARC.LEAD) {
  const aNow = angleFor(nowDay, viewCentre(nowDay, pan, lead));
  const litEnd = Math.min(aNow, ARC.LIMIT);
  const [nx, ny] = arcPoint(aNow);
  return {
    track: arcPath(-ARC.LIMIT, ARC.LIMIT),
    flown: litEnd > -ARC.LIMIT ? arcPath(-ARC.LIMIT, litEnd) : null,
    now: Math.abs(aNow) <= ARC.VISIBLE + 1 ? { x: nx, y1: ny - 16, y2: ny + 16 } : null,
  };
}

const firstUpcoming = (milestones: Milestone[], nowDay: number, kind?: Milestone["kind"]) =>
  [...milestones]
    .sort((a, b) => a.day - b.day)
    .find((m) => m.status !== "done" && (kind ? m.kind === kind : m.day > nowDay));

/** The fixed readout under the arc. Text is sentence case; the UI shows it in capitals. */
export function arcReadout(
  milestones: Milestone[],
  nowDay: number,
  pan: number,
  lead: number = ARC.LEAD,
) {
  const gate = firstUpcoming(milestones, nowDay, "gate");
  return {
    main: `T+${nowDay} days`,
    sub:
      pan !== 0
        ? `Viewing day ${viewCentre(nowDay, pan, lead)} · press Now to return`
        : gate
          ? `Mission elapsed · ${gate.label} ${inDays(gate.day - nowDay).toLowerCase()}`
          : "Mission elapsed",
  };
}

/** A plain-English summary for screen readers. */
export function arcSummary(milestones: Milestone[], nowDay: number, phase?: string): string {
  const next = firstUpcoming(milestones, nowDay);
  const gate = firstUpcoming(milestones, nowDay, "gate");
  const parts = [`Flight plan: ${phase ? `${phase} phase, ` : ""}day ${nowDay}.`];
  if (next && next !== gate)
    parts.push(`Next: ${next.label} ${inDays(next.day - nowDay).toLowerCase()}.`);
  if (gate) parts.push(`${gate.label} ${inDays(gate.day - nowDay).toLowerCase()}.`);
  return parts.join(" ");
}

/** How far each depth layer moves (px) for a pan (days) and pointer position (−1 to 1). */
export function parallax(pan: number, pointer: { x: number; y: number }) {
  const { x, y } = pointer;
  return {
    far: { x: -pan * 2 - x * 4, y: -y * 3 },
    near: { x: -pan * 4.5 - x * 9, y: -y * 5 },
    glow: { x: -pan * 1.5 - x * 12, y: -y * 7 },
    arc: { x: -pan * 1 - x * 20, y: -y * 10 },
  };
}

/** A 32-bit hash of a string (FNV-1a), to seed the star field from the company id. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded random numbers in [0, 1) (mulberry32, as in the prototype). */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** The star sky's own viewBox, wider and taller than the arc so it can drift. */
export const SKY = { W: 1480, H: 310, FAR: 170, NEAR: 45 } as const;

const dot = (x: number, y: number, r: number) =>
  `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0`;

/**
 * Two star fields (far and near), each split into three brightness buckets
 * drawn as one path apiece. The same seed always gives the same sky.
 */
export function starField(seed: string) {
  const rnd = seededRandom(hashSeed(seed));
  const make = (n: number, rMin: number, rMax: number) => {
    const buckets: [string, string, string] = ["", "", ""];
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rnd() * 3) as 0 | 1 | 2;
      buckets[k] += dot(rnd() * SKY.W, rnd() * SKY.H, rMin + Math.pow(rnd(), 2) * (rMax - rMin));
    }
    return buckets;
  };
  return { far: make(SKY.FAR, 0.5, 1.1), near: make(SKY.NEAR, 1.0, 1.9) };
}

/**
 * Milestones for a company from the mock store: the mission start, its stage
 * gates and its key tasks. The database version comes in 1b.
 */
export function buildMilestones(
  company: Pick<Company, "id" | "started_at">,
  gates: StageGate[],
  tasks: Pick<Task, "id" | "title" | "status" | "key" | "due" | "completed_at">[],
): Milestone[] {
  const out: Milestone[] = [
    {
      id: `${company.id}-start`,
      day: 0,
      label: "Mission start",
      kind: "milestone",
      status: "done",
    },
  ];
  for (const g of gates) {
    const day = gateDay(g, company);
    if (day === null) continue;
    out.push({
      id: g.id,
      day,
      label: gateName(g.stage),
      kind: "gate",
      status: g.status === "approved" ? "done" : "upcoming",
    });
  }
  for (const t of tasks) {
    if (!t.key) continue;
    const date = t.status === "done" ? (t.completed_at ?? t.due) : t.due;
    if (!date) continue;
    out.push({
      id: t.id,
      day: dayOf(company, date),
      label: t.title,
      kind: "milestone",
      status: t.status === "done" ? "done" : "upcoming",
    });
  }
  return out.sort((a, b) => a.day - b.day);
}
