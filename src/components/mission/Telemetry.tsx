import { useState } from "react";
import { useCompany, useStore } from "@/lib/store";
import { costPerSignup, funnel, pencePerCredit, trends, type Trend } from "@/lib/telemetry";
import { fmtShortDate, gbp, num } from "@/lib/format";
import { PLANS } from "@/lib/credits";
import { Panel, Pill } from "./primitives";
import { cn } from "@/lib/utils";

const RANGES = [14, 30, 90] as const;
type Range = (typeof RANGES)[number];

const fmtValue = (t: Pick<Trend, "key">, v: number) => (t.key === "mrr" ? gbp(v) : num(v));

/**
 * One metric over time: a 2px ink line on a recessive baseline, with a crosshair and tooltip
 * on hover or focus. One series per chart (small multiples), so no legend: the title names it.
 */
function TrendChart({ trend }: { trend: Trend }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 80;
  const pts = trend.points;
  const max = Math.max(1, ...pts.map((p) => p.value));
  const x = (i: number) => (pts.length > 1 ? (i / (pts.length - 1)) * W : W / 2);
  const y = (v: number) => H - 4 - (v / max) * (H - 12);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const active = hover === null ? null : pts[hover];
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const i = Math.round(((clientX - r.left) / r.width) * (pts.length - 1));
    setHover(Math.max(0, Math.min(pts.length - 1, i)));
  };
  return (
    <figure className="rounded-tile bg-soft p-3 shadow-tile">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="label-caps text-[11px] tracking-[0.14em] text-muted-foreground">
          {trend.label}
        </span>
        <span className="display-num text-[26px] leading-none">
          {fmtValue(trend, active?.value ?? trend.total)}
        </span>
      </figcaption>
      <p className="mt-0.5 h-4 text-right text-[11px] text-muted-foreground">
        {active ? fmtShortDate(active.date) : trend.kind === "sum" ? "total" : "latest"}
      </p>
      {pts.length > 1 ? (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="mt-1 h-20 w-full touch-pan-y outline-none"
            role="img"
            tabIndex={0}
            aria-label={`${trend.label} per day, ${fmtShortDate(pts[0]!.date)} to ${fmtShortDate(pts.at(-1)!.date)}. ${trend.kind === "sum" ? "Total" : "Latest"} ${fmtValue(trend, trend.total)}. Use the arrow keys to read each day.`}
            onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? pts.length) - 1));
              if (e.key === "ArrowRight") setHover((h) => Math.min(pts.length - 1, (h ?? -1) + 1));
            }}
          >
            <line x1={0} x2={W} y1={H - 4} y2={H - 4} stroke="var(--line)" strokeWidth={1} />
            <polyline
              points={line}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {active && hover !== null && (
              <>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={0}
                  y2={H - 4}
                  stroke="var(--muted-ink)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={x(hover)}
                  cy={y(active.value)}
                  r={4}
                  fill="var(--ink)"
                  stroke="var(--soft)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </svg>
          <div className="flex justify-between text-[11px] text-muted-foreground tabular">
            <span>{fmtShortDate(pts[0]!.date)}</span>
            <span>{fmtShortDate(pts.at(-1)!.date)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Not enough data yet.</p>
      )}
    </figure>
  );
}

export function TelemetryPage() {
  const { db, companyId } = useStore();
  const c = useCompany(companyId);
  const [range, setRange] = useState<Range>(14);
  const series = trends(db.metrics_daily, companyId, range);
  const steps = funnel(db.metrics_daily, companyId, range, false);
  const top = Math.max(1, steps[0]?.value ?? 1);
  const costs = costPerSignup(
    c,
    db.social_posts,
    db.approvals,
    db.ads.find((a) => a.company_id === companyId),
  );
  const ppc = pencePerCredit(c.plan);
  const plan = PLANS[c.plan];
  const days = series[0]?.points.length ?? 0;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={cn(
              "label-caps min-h-[34px] rounded-tile border px-3 text-[12px]",
              range === r ? "border-ink bg-ink text-surface" : "bg-surface hover:bg-soft",
            )}
          >
            {r} days
          </button>
        ))}
        {days < range && days > 0 && (
          <span className="text-xs text-muted-foreground">Showing the {days} days recorded.</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 desk:grid-cols-4">
        {series.map((t) => (
          <TrendChart key={t.key} trend={t} />
        ))}
      </div>

      <div className="grid gap-3.5 desk:grid-cols-[1fr_1.4fr]">
        <Panel
          title="Funnel"
          action={<span className="text-xs text-muted-foreground">{range} days</span>}
        >
          <ol className="flex flex-col gap-3">
            {steps.map((s) => (
              <li key={s.label}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    {s.label}
                    {s.sample && <Pill>Sample data</Pill>}
                  </span>
                  <span className="tabular">
                    <span className="font-semibold">{num(s.value)}</span>
                    {s.conversion !== null && (
                      <span className="text-muted-foreground"> · {s.conversion}%</span>
                    )}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-[4px] bg-track">
                  <div
                    className="h-full rounded-[4px] bg-ink"
                    style={{ width: `${Math.max(s.value ? 1 : 0, (s.value / top) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Activated is sample data until you define what counts as activated: ask Sol to propose a
            definition from your flight plan.
          </p>
        </Panel>

        <Panel title="Cost per signup by channel" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">Channel</th>
                  <th className="px-4 py-2 text-right font-medium">Signups</th>
                  <th className="px-4 py-2 text-right font-medium">Ad spend / signup</th>
                  <th className="px-4 py-2 text-right font-medium">Credits / signup</th>
                  <th className="px-4 py-2 text-right font-medium">All-in / signup</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((r) => (
                  <tr key={r.channel} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">{r.channel}</td>
                    <td className="px-4 py-2.5 text-right tabular">{num(r.signups)}</td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {r.adPerSignup === null ? "—" : gbp(Number(r.adPerSignup.toFixed(2)))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {r.creditsPerSignup === null
                        ? "—"
                        : `${r.creditsPerSignup.toFixed(1)} credits`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {r.allInPerSignup === null ? "—" : gbp(Number(r.allInPerSignup.toFixed(2)))}
                    </td>
                  </tr>
                ))}
                {!costs.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-muted-foreground">
                      No channel results yet. Published posts and ads show up here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            All-in is ad spend plus credits valued at your plan price ({plan.name}: £{plan.priceGbp}{" "}
            for {num(plan.credits)} credits, {ppc.toFixed(2)}p a credit).
          </p>
        </Panel>
      </div>

      <details className="rounded-card border bg-surface p-3 text-sm shadow-card">
        <summary className="label-caps cursor-pointer text-[12px]">
          Show the numbers as a table
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 pr-4 font-medium">Date</th>
                {series.map((t) => (
                  <th key={t.key} className="py-1.5 pr-4 text-right font-medium">
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(series[0]?.points ?? []).map((p, i) => (
                <tr key={p.date} className="border-b last:border-0">
                  <td className="py-1.5 pr-4">{fmtShortDate(p.date)}</td>
                  {series.map((t) => (
                    <td key={t.key} className="py-1.5 pr-4 text-right tabular">
                      {fmtValue(t, t.points[i]?.value ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
