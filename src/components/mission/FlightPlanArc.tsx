import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ARC,
  SKY,
  arcPaths,
  arcReadout,
  arcSummary,
  arcViewport,
  clampPan,
  inDays,
  layoutArc,
  panLimits,
  parallax,
  starField,
  type Milestone,
  type PlacedMilestone,
} from "@/lib/flightPlan";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FlightPlanArcProps {
  milestones: Milestone[];
  nowDay: number;
  /** Seeds the star field: use the company id, so each company has its own stable sky. */
  seed: string;
  /** Opens a milestone's evidence (tasks, proof, approvals). */
  onSelectMilestone: (id: string) => void;
  /** The current phase, for the screen-reader summary, e.g. "Build". */
  phase?: string | undefined;
  /** Caps the arc box's height in px by cropping empty sky above and below. */
  maxHeight?: number | undefined;
  /** Shown left of the pager, e.g. the card's heading. */
  heading?: ReactNode;
  className?: string;
}

const EASE = "cubic-bezier(0.33,0,0.2,1)";
const EDGE_MASK = "linear-gradient(90deg, transparent 0%, #000 7%, #000 93%, transparent 100%)";
const SKY_MASK = "radial-gradient(ellipse 60% 75% at 50% 40%, #000 35%, transparent 100%)";

/** Width of an element in px, kept up to date as it resizes. */
function useWidth(ref: RefObject<HTMLElement | null>, initial: number) {
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

const layerStyle = (
  offset: { x: number; y: number },
  seconds: number,
  reduced: boolean,
): CSSProperties => ({
  transform: `translate(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px)`,
  transition: reduced ? "none" : `transform ${seconds}s ${EASE}`,
});

const markerFill = (m: PlacedMilestone) =>
  m.past ? "var(--ink)" : m.kind === "gate" ? "var(--hold-bg)" : "var(--marker-hollow)";
const markerStroke = (m: PlacedMilestone) =>
  m.past
    ? "var(--ink)"
    : m.kind === "gate"
      ? "var(--hold)"
      : m.isNext
        ? "var(--ink)"
        : "var(--muted-ink)";

const describe = (m: Milestone, nowDay: number) =>
  `${m.label}${m.kind === "gate" ? " (gate)" : ""}: ${
    m.status === "done"
      ? `done, day ${m.day}`
      : `day ${m.day}, ${inDays(m.day - nowDay).toLowerCase()}`
  }`;

/**
 * The flight plan arc (docs/DESIGN.md section 5): milestones and gates on a
 * curved timeline, looking ahead from now. Earlier / Now / Later are the
 * accessible controls; swipe and drag are a convenience.
 */
export function FlightPlanArc({
  milestones,
  nowDay,
  seed,
  onSelectMilestone,
  phase,
  maxHeight,
  heading,
  className,
}: FlightPlanArcProps) {
  const reduced = usePrefersReducedMotion();
  const [pan, setPan] = useState(0);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, ARC.W);
  const drag = useRef<{ x: number; swiped: boolean } | null>(null);
  const swiped = useRef(false);
  const listId = useId();

  const view = arcViewport(width, maxHeight);
  const [minPan, maxPan] = panLimits(milestones, nowDay, view.lead);
  const items = useMemo(
    () => layoutArc({ milestones, nowDay, pan, widthPx: width, maxHeightPx: maxHeight }),
    [milestones, nowDay, pan, width, maxHeight],
  );
  const paths = arcPaths(nowDay, pan, view.lead);
  const readout = arcReadout(milestones, nowDay, pan, view.lead);
  const viewBox = `${view.x0.toFixed(1)} ${view.y0.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`;
  // The readout sits at the middle of the uncropped arc box.
  const readoutTop = `${(((ARC.H / 2 - view.y0) / view.h) * 100).toFixed(2)}%`;
  const stars = useMemo(() => starField(seed), [seed]);
  const px = parallax(reduced ? 0 : pan, reduced ? { x: 0, y: 0 } : pointer);

  const shift = (days: number) => setPan((p) => clampPan(p + days, milestones, nowDay, view.lead));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, swiped: false };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    drag.current = null;
    if (Math.abs(dx) > ARC.SWIPE_PX) {
      // A swipe pans; don't also treat it as a click on the marker it ended on.
      swiped.current = true;
      shift(dx > 0 ? -ARC.PAN_STEP : ARC.PAN_STEP);
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width - 0.5) * 20) / 10;
    const y = Math.round(((e.clientY - r.top) / r.height - 0.5) * 20) / 10;
    if (x !== pointer.x || y !== pointer.y) setPointer({ x, y });
  };
  const select = (id: string) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    onSelectMilestone(id);
  };

  const pager = "min-h-[30px] px-3 text-[11px] tracking-[0.14em] pointer-coarse:min-h-11";
  const skySvg = (
    paths3: [string, string, string],
    offset: { x: number; y: number },
    s: number,
  ) => (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${SKY.W} ${SKY.H}`}
      preserveAspectRatio="none"
      className="absolute -left-[240px] -top-5 h-[calc(100%+40px)] w-[calc(100%+480px)]"
      style={{ ...layerStyle(offset, s, reduced), maskImage: SKY_MASK, WebkitMaskImage: SKY_MASK }}
    >
      {paths3.map((d, i) => (
        <path key={i} d={d} fill="var(--star)" style={{ opacity: `var(--star-o${i})` }} />
      ))}
    </svg>
  );

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        {heading}
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground tab:inline">
            Swipe or use the arrows
          </span>
          <div className="flex gap-1.5" role="group" aria-label="Move the flight plan">
            <Button
              size="sm"
              variant="outline"
              className={pager}
              disabled={pan <= minPan}
              onClick={() => shift(-ARC.PAN_STEP)}
            >
              <span aria-hidden="true">‹</span> Earlier
            </Button>
            <Button
              size="sm"
              variant={pan === 0 ? "default" : "outline"}
              className={cn(pager, pan !== 0 && "border-ink")}
              aria-pressed={pan === 0}
              onClick={() => setPan(0)}
            >
              Now
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={pager}
              disabled={pan >= maxPan}
              onClick={() => shift(ARC.PAN_STEP)}
            >
              Later <span aria-hidden="true">›</span>
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={box}
        role="group"
        aria-roledescription="flight plan"
        aria-label={arcSummary(milestones, nowDay, phase)}
        aria-describedby={listId}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setPointer({ x: 0, y: 0 })}
        className="relative w-full cursor-grab touch-pan-y select-none overflow-hidden rounded-[8px] active:cursor-grabbing"
        style={{
          aspectRatio: `${view.w.toFixed(1)} / ${view.h.toFixed(1)}`,
          maskImage: EDGE_MASK,
          WebkitMaskImage: EDGE_MASK,
        }}
      >
        {/* 1–2. Far and near star fields */}
        {skySvg(stars.far, px.far, 0.9)}
        {skySvg(stars.near, px.near, 0.8)}

        {/* 3. Glow under the top of the arc, and two faint echo arcs */}
        <div
          aria-hidden="true"
          className="absolute left-[10%] right-[10%] top-[18%] h-[90%]"
          style={{
            ...layerStyle(px.glow, 0.8, reduced),
            background:
              "radial-gradient(ellipse 50% 45% at 50% 20%, var(--glow) 0%, transparent 100%)",
          }}
        />
        <svg
          aria-hidden="true"
          viewBox={viewBox}
          className="absolute inset-0 size-full"
          style={layerStyle(px.glow, 0.8, reduced)}
        >
          <path
            d={paths.track}
            fill="none"
            stroke="var(--track)"
            opacity={0.55}
            transform="translate(0 24)"
          />
          <path
            d={paths.track}
            fill="none"
            stroke="var(--track)"
            opacity={0.3}
            transform="translate(0 48)"
          />
        </svg>

        {/* 4. The arc and milestones */}
        <svg
          aria-hidden="true"
          viewBox={viewBox}
          className="absolute inset-0 size-full"
          style={{
            ...layerStyle(px.arc, 0.6, reduced),
            filter: "drop-shadow(0 6px 8px var(--arc-shadow))",
          }}
        >
          <path d={paths.track} fill="none" stroke="var(--track)" strokeWidth={2} />
          {paths.flown && (
            <path
              d={paths.flown}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}
          {paths.now && (
            <line
              x1={paths.now.x}
              y1={paths.now.y1}
              x2={paths.now.x}
              y2={paths.now.y2}
              stroke="var(--ink)"
              strokeWidth={2.5}
            />
          )}
        </svg>
        <div className="absolute inset-0" style={layerStyle(px.arc, 0.6, reduced)}>
          {items.map((m) => (
            <div
              key={m.id}
              className="absolute size-0"
              style={{
                left: `${m.left.toFixed(2)}%`,
                top: `${m.top.toFixed(2)}%`,
                opacity: m.opacity,
                transition: reduced
                  ? "none"
                  : `left 0.7s ${EASE}, top 0.7s ${EASE}, opacity 0.5s ease`,
              }}
            >
              <button
                type="button"
                disabled={!m.visible}
                aria-label={describe(m, nowDay)}
                onClick={() => select(m.id)}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                style={{ width: Math.max(24, m.size + 8), height: Math.max(24, m.size + 8) }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: m.size,
                    height: m.size,
                    background: markerFill(m),
                    border: `${m.border}px solid ${markerStroke(m)}`,
                    boxShadow: "0 3px 6px var(--arc-shadow)",
                  }}
                />
              </button>
              {m.showLabel && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 flex flex-col items-center gap-0.5 whitespace-nowrap"
                  style={{
                    bottom: m.size / 2 + 8,
                    transform: `translateX(-50%) rotate(${m.rotation.toFixed(1)}deg)`,
                    transformOrigin: "50% 100%",
                  }}
                >
                  <span
                    className={cn("label-caps", m.past ? "text-muted-foreground" : "text-ink")}
                    style={{ fontSize: m.fontSize }}
                  >
                    {m.label}
                  </span>
                  {m.sub && (
                    <span
                      className={cn(
                        "label-caps text-[11px] tracking-[0.1em]",
                        m.subTone === "hold" ? "text-hold" : "text-muted-foreground",
                      )}
                    >
                      {m.sub}
                    </span>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Readout: fixed in the centre below the arc */}
        <div
          className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1"
          style={{ top: readoutTop }}
          aria-live="polite"
        >
          <div className="display-num whitespace-nowrap text-[34px] uppercase">{readout.main}</div>
          <div className="label-caps whitespace-nowrap text-[11px] tracking-[0.14em] text-muted-foreground">
            {readout.sub}
          </div>
        </div>
      </div>

      <ul id={listId} className="sr-only">
        {milestones.map((m) => (
          <li key={m.id}>{describe(m, nowDay)}</li>
        ))}
      </ul>
    </div>
  );
}
