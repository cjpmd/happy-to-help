import { useId, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { labelFor, useBalance, useCompany, useStore } from "@/lib/store";
import { NOW, compliance_items, metrics_daily, social_posts } from "@/lib/seed";
import { actionQuote } from "@/lib/credits";
import { checkClaims } from "@/lib/workspace";
import { approvalText, type Approval } from "@/lib/types";
import { gbp, num } from "@/lib/format";
import { missionDay, stageLabel } from "@/lib/mission";
import { buildMilestones } from "@/lib/flightPlan";
import {
  channelRows,
  isGain,
  nextWindows,
  overnightBurn,
  phaseTasks,
  taskBadge,
  tasksAwaitingGo,
  telemetry,
  tileSummary,
} from "@/lib/hq";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FlightPlanArc } from "./FlightPlanArc";
import { Pill, Readout, Tile } from "./primitives";

/** Height cap for the HQ arc, so the whole HQ fits a 1440×900 screen. */
const HQ_ARC_MAX_HEIGHT = 145;

const meta = "label-caps text-[11px] text-muted-foreground";

/** A card in the HQ grid: Barlow title, optional right-aligned meta label. */
export function HQCard({
  title,
  meta: metaLabel,
  children,
  className,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-card border bg-card px-3.5 py-2.5 shadow-card",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id} className="label-caps text-[13px] tracking-[0.16em]">
          {title}
        </h2>
        {metaLabel}
      </div>
      {children}
    </section>
  );
}

/** The hero card: the flight plan arc and the current phase's key tasks. */
export function FlightPlanCard({
  companyId,
  readOnly,
}: {
  companyId: string;
  readOnly?: boolean | undefined;
}) {
  const { db } = useStore();
  const c = useCompany(companyId);
  const navigate = useNavigate();
  const nowDay = missionDay(c, NOW);
  const milestones = useMemo(
    () =>
      buildMilestones(
        c,
        db.stage_gates.filter((g) => g.company_id === c.id),
        db.tasks.filter((t) => t.company_id === c.id),
      ),
    [c, db.stage_gates, db.tasks],
  );
  const tiles = phaseTasks(db.tasks, c.id, c.stage);
  const awaiting = tasksAwaitingGo(db.approvals, db.agent_runs);
  const badges = tiles.map((t) => taskBadge(t, awaiting.has(t.id)));
  const [showTiles, setShowTiles] = useState(false);
  const tilesId = useId();
  return (
    <section
      aria-labelledby="hq-flight-plan"
      className="flex flex-col gap-2.5 rounded-hero border bg-hero px-[18px] pb-4 pt-3.5 shadow-hero"
    >
      <FlightPlanArc
        milestones={milestones}
        nowDay={nowDay}
        seed={c.id}
        phase={stageLabel(c.stage)}
        maxHeight={HQ_ARC_MAX_HEIGHT}
        onSelectMilestone={(id) => {
          // Mentors view another company's HQ; its flight plan page isn't theirs to open.
          if (!readOnly) void navigate({ to: "/flight-plan", search: { m: id } });
        }}
        heading={
          <h2 id="hq-flight-plan" className="label-caps text-[13px] tracking-[0.16em]">
            Flight plan
          </h2>
        }
      />
      {tiles.length > 0 && (
        // On short screens the tiles collapse to one line until shown.
        <div className="hidden items-baseline justify-between gap-3 short:flex">
          <span className="label-caps text-[11px] text-muted-foreground">
            {stageLabel(c.stage)} tasks · {tileSummary(badges)}
          </span>
          <button
            type="button"
            aria-expanded={showTiles}
            aria-controls={tilesId}
            onClick={() => setShowTiles((v) => !v)}
            className="label-caps text-[11px] hover:opacity-80"
          >
            {showTiles ? "Hide tasks" : "Show tasks"}
          </button>
        </div>
      )}
      {tiles.length > 0 && (
        <ul
          id={tilesId}
          className={cn(
            "grid gap-2.5 min-[480px]:grid-cols-2 desk:grid-cols-4",
            !showTiles && "short:hidden",
          )}
        >
          {tiles.map((t, i) => {
            const badge = badges[i]!;
            return (
              <li key={t.id}>
                <Tile className="flex h-full flex-col items-start gap-1 px-3 py-[9px]">
                  <Pill tone={badge.tone}>{badge.text}</Pill>
                  <span className="font-semibold">{t.title}</span>
                </Tile>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function approvalLabel(a: Approval) {
  switch (a.action_type) {
    case "publish_post":
      return `${a.payload.channel} post`;
    case "send_email":
      return a.payload.outreach ? "Outreach email" : "Email";
    case "ad_spend":
      return `${a.payload.platform} ads`;
    case "file_document":
      return "Filing";
    case "publish_site":
      return "Site change";
  }
}

function approvalTitle(a: Approval) {
  switch (a.action_type) {
    case "publish_post":
      return `${a.payload.channel} post`;
    case "send_email":
      return a.payload.subject;
    case "ad_spend":
      return `${a.payload.platform} ads · ${gbp(a.payload.amount_gbp)} test`;
    case "file_document":
      return a.payload.document;
    case "publish_site":
      return a.payload.change;
  }
}

function approvalPreview(a: Approval) {
  switch (a.action_type) {
    case "publish_post":
      return a.payload.text;
    case "send_email":
      return a.payload.body;
    case "ad_spend":
      return `${gbp(a.payload.amount_gbp)} over ${a.payload.duration}, for ${a.payload.audience}.`;
    case "file_document":
      return `${a.payload.document} to ${a.payload.destination}.`;
    case "publish_site":
      return a.payload.change;
  }
}

/** GO / NO-GO: the oldest pending approval in full, the rest as a list. */
export function GoNoGoCard({
  companyId,
  readOnly,
  onAskWhy,
}: {
  companyId: string;
  readOnly?: boolean | undefined;
  onAskWhy?: (() => void) | undefined;
}) {
  const { db, decideApproval, askWhy } = useStore();
  const c = useCompany(companyId);
  const balance = useBalance(companyId);
  const pending = db.approvals
    .filter((a) => a.company_id === companyId && a.status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [first, ...rest] = pending;
  const affordable = !first || actionQuote(balance, first.estimated_credits).affordable;
  const flags = (a: Approval) => checkClaims(approvalText(a), c.sector).length;

  return (
    <HQCard
      title="GO / NO-GO"
      meta={
        <Link
          to="/approvals"
          className={cn(meta, "text-[12px] hover:opacity-80", pending.length && "text-hold")}
        >
          {pending.length ? `${pending.length} holding` : "Clear"}
        </Link>
      }
    >
      {!first ? (
        <p className="text-muted-foreground">Nothing is waiting for your GO.</p>
      ) : (
        <Tile className="flex flex-col gap-1">
          <div className="flex flex-wrap justify-between gap-x-2">
            <span className={meta}>
              {approvalLabel(first)} · ≈ {num(first.estimated_credits)} CR
            </span>
            {!affordable ? (
              <span className="label-caps text-[11px] text-hold">Not enough credits</span>
            ) : flags(first) ? (
              <span className="label-caps text-[11px] text-hold">
                {flags(first)} {flags(first) === 1 ? "claim" : "claims"} flagged
              </span>
            ) : approvalText(first) ? (
              <span className="label-caps text-[11px] text-go">✓ Claims check passed</span>
            ) : null}
          </div>
          <p className="line-clamp-2 text-[13px] leading-snug">“{approvalPreview(first)}”</p>
          {!readOnly && (
            <GoButtons
              approval={first}
              blocked={
                flags(first) > 0
                  ? "Resolve the flagged claims before GO."
                  : !affordable
                    ? "Top up to give this a GO."
                    : null
              }
              onGo={() => {
                decideApproval(first.id, "approved");
                toast.success("GO given. Sol will carry it out.", {
                  description: labelFor(first),
                });
              }}
              onWhy={() => {
                askWhy(first.id);
                onAskWhy?.();
              }}
            />
          )}
        </Tile>
      )}
      {rest.length > 0 && (
        <ul>
          {rest.slice(0, 2).map((a, i) => (
            <li key={a.id} className={cn(i > 0 && "shorter:hidden")}>
              <Link
                to="/approvals"
                className="flex justify-between gap-2 border-t px-0.5 pt-1.5 hover:opacity-80"
              >
                <span className="truncate">{approvalTitle(a)}</span>
                <span className={cn(meta, "shrink-0", flags(a) && "text-hold")}>
                  {flags(a)
                    ? `${flags(a)} ${flags(a) === 1 ? "claim" : "claims"} flagged`
                    : `≈ ${num(a.estimated_credits)} CR`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HQCard>
  );
}

function GoButtons({
  approval,
  blocked,
  onGo,
  onWhy,
}: {
  approval: Approval;
  blocked: string | null;
  onGo: () => void;
  onWhy: () => void;
}) {
  const label = approvalLabel(approval);
  const reasonId = useId();
  return (
    <div className="flex flex-col gap-1">
      {blocked && (
        <span id={reasonId} className="sr-only">
          {blocked}
        </span>
      )}
      <div className="flex gap-1.5">
        <Button
          className="flex-1"
          disabled={!!blocked}
          aria-label={`GO: ${label}, about ${approval.estimated_credits} credits`}
          aria-describedby={blocked ? reasonId : undefined}
          onClick={onGo}
        >
          GO
        </Button>
        {/* Editing drafts arrives with the approvals fixes (1e); until then EDIT opens the queue. */}
        <Button asChild variant="outline" className="flex-1">
          <Link to="/approvals">Edit</Link>
        </Button>
        <Button variant="outline" className="px-3" onClick={onWhy} aria-label={`Why ${label}?`}>
          Why
        </Button>
      </div>
    </div>
  );
}

/** Telemetry: four 7-day figures and a 14-day signups sparkline. */
export function TelemetryCard({ companyId }: { companyId: string }) {
  const { db } = useStore();
  const t = telemetry(
    metrics_daily,
    companyId,
    db.ads.find((a) => a.company_id === companyId),
  );
  const max = Math.max(1, ...t.spark);
  const points = t.spark
    .map(
      (v, i) =>
        `${((i / Math.max(1, t.spark.length - 1)) * 300).toFixed(0)},${(46 - (v / max) * 42).toFixed(1)}`,
    )
    .join(" ");
  const note = (text: string | null) =>
    text && (
      <span className={isGain(text) ? "font-semibold text-go" : "text-muted-foreground"}>
        {text}
      </span>
    );
  return (
    <HQCard title="Telemetry" meta={<span className={meta}>7 days</span>}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Readout label="Visitors" value={num(t.visitors)} note={note(t.visitorsNote)} />
        <Readout label="Signups" value={num(t.signups)} note={note(t.signupsNote)} />
        <Readout label="Paying" value={num(t.paying)} note={note(t.payingNote)} />
        <Readout label="Cost / signup" value={gbp(t.costPerSignup)} note={note(t.costNote)} />
      </div>
      {t.spark.length > 1 && (
        <svg
          viewBox="0 0 300 50"
          preserveAspectRatio="none"
          className="h-[30px] w-full short:hidden"
          role="img"
          aria-label={`Signups per day over the last ${t.spark.length} days`}
        >
          <polyline
            points={points}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </HQCard>
  );
}

/** Vehicle: a sketch of the founder's site and the latest check on it. */
export function VehicleCard({ companyId }: { companyId: string }) {
  const { db } = useStore();
  const c = useCompany(companyId);
  const verified = db.tasks
    .filter((t) => t.company_id === companyId && t.status === "done" && t.proof)
    .at(-1)?.proof;
  const headline = c.description.split(/(?<=\.)\s/)[0] ?? c.name;
  return (
    <HQCard
      title="Vehicle"
      meta={
        <a
          href={c.website_preview_url}
          target="_blank"
          rel="noreferrer"
          className={cn(meta, "hover:text-ink")}
        >
          Open preview
        </a>
      }
    >
      <div className="overflow-hidden rounded-tile border">
        <div className="bg-soft px-2.5 py-1.5 font-label text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Preview · {c.name}
        </div>
        <div className="flex flex-col gap-1.5 px-3 py-2.5" aria-hidden="true">
          <div className="truncate text-[15px] font-semibold">{headline}</div>
          <div className="h-[7px] w-[70%] rounded-[3px] bg-track shorter:hidden" />
          <div className="h-[7px] w-1/2 rounded-[3px] bg-track shorter:hidden" />
          <span className="mt-1 self-start rounded-pill bg-ink px-2.5 py-[5px] text-xs font-semibold text-surface">
            {c.customer_type === "B2B" ? "Book a demo" : "Join the waitlist"}
          </span>
        </div>
      </div>
      <div className="label-caps flex justify-between text-[11px]">
        {verified ? (
          <span className="text-go">
            QA {verified.passed}/{verified.total} · verified
          </span>
        ) : (
          <span className="text-muted-foreground">Not checked yet</span>
        )}
        <Link to="/build" className="hover:opacity-80">
          Open build
        </Link>
      </div>
    </HQCard>
  );
}

/** Channels: how each marketing channel is doing. */
export function ChannelsCard({ companyId }: { companyId: string }) {
  const { db } = useStore();
  const c = useCompany(companyId);
  const rows = channelRows(
    c,
    social_posts,
    db.emails,
    db.ads.find((a) => a.company_id === companyId),
  );
  return (
    <HQCard title="Channels">
      <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-[7px]">
        {rows.map((r, i) => (
          <div key={r.channel} className={cn("contents", i >= 2 && "shorter:hidden")}>
            <dt className="truncate">
              {r.channel} <span className="text-muted-foreground">· {r.detail}</span>
            </dt>
            <dd className="tabular">
              {r.action ? (
                <Link to={r.action.to} className="label-caps text-[11px] hover:opacity-80">
                  {r.action.label}
                </Link>
              ) : (
                r.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </HQCard>
  );
}

/** Overnight burn: Sol's runs in the last 24 hours and the credits they used. */
export function OvernightBurnCard({ companyId }: { companyId: string }) {
  const { db } = useStore();
  const burn = overnightBurn(db.agent_runs, db.credit_ledger, companyId, NOW);
  return (
    <HQCard
      title="Overnight burn"
      meta={
        <Link
          to="/activity"
          className={cn(meta, "hover:text-ink")}
          aria-label={`${num(burn.total)} credits in the last 24 hours. Open the log`}
        >
          {num(burn.total)} CR ›
        </Link>
      }
    >
      {burn.rows.length === 0 ? (
        <p className="text-muted-foreground">No runs in the last 24 hours.</p>
      ) : (
        <ul className="grid grid-cols-[44px_1fr_auto] items-baseline gap-x-2.5 gap-y-[7px]">
          {burn.rows.map((r, i) => (
            <li key={r.id} className={cn("contents", i >= 2 && "shorter:hidden")}>
              <span className="text-xs text-muted-foreground tabular">{r.time}</span>
              <span className="truncate">{r.task}</span>
              {r.state === "refunded" ? (
                <span className="label-caps text-[11px] tracking-[0.1em] text-go">Refunded</span>
              ) : r.state === "running" ? (
                <span className="label-caps text-[11px] tracking-[0.1em]">Running</span>
              ) : (
                <span className="text-xs text-muted-foreground tabular">{num(r.credits)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </HQCard>
  );
}

/** Next windows: the soonest deadlines (compliance and dated tasks). */
export function NextWindowsCard({ companyId }: { companyId: string }) {
  const { db } = useStore();
  const rows = nextWindows(compliance_items, db.tasks, companyId, NOW);
  return (
    <HQCard title="Next windows">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No deadlines coming up.</p>
      ) : (
        <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-[7px]">
          {rows.map((r, i) => (
            <div key={r.id} className={cn("contents", i >= 2 && "shorter:hidden")}>
              <dt className="truncate">{r.title}</dt>
              <dd
                className={cn(
                  "label-caps text-[11px]",
                  r.tone === "destructive"
                    ? "text-destructive"
                    : r.tone === "warning"
                      ? "text-hold"
                      : "text-muted-foreground",
                )}
              >
                {r.label}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </HQCard>
  );
}
