// The crew roster (Phase 21, docs/CREW-PHASES.md): Sol as flight director, the crew on duty
// grouped by pillar, and a collapsed "Joining your crew" list for agents standing by (and,
// from Phase 24, locked by plan). Mission HQ (Option D) styling: monochrome cards, green only
// for done, amber only for "needs you".
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import {
  activityLabel,
  PILLAR_LABEL,
  sinceLabel,
  topLevel,
  type CrewActivity,
  type RosterEntry,
} from "@/lib/crew";
import { useCrew } from "@/lib/useCrew";
import { useCompanyRole, useStore } from "@/lib/store";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Panel, Pill, SolAvatar, StatusPill, Tile } from "./primitives";
import { Why } from "./WorkControls";

const DOT: Record<CrewActivity, string> = {
  working: "bg-go",
  waiting: "bg-hold",
  idle: "bg-muted-foreground",
  paused: "bg-muted-foreground",
  standing_by: "bg-track",
  locked: "bg-track",
};

function Monogram({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="display-num inline-flex shrink-0 items-center justify-center rounded-tile bg-soft text-ink shadow-tile"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

function StatusLine({ activity, waiting }: { activity: CrewActivity; waiting: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", DOT[activity])} aria-hidden="true" />
      <span className={cn(activity === "waiting" && "text-hold")}>
        {activityLabel(activity)}
        {activity === "waiting" && waiting > 1 ? ` · ${waiting}` : ""}
      </span>
    </span>
  );
}

/** Credits this month, against the monthly cap when there is one. */
function CreditsBar({ used, cap }: { used: number; cap: number | null }) {
  if (cap === null)
    return (
      <span className="text-xs text-muted-foreground tabular-nums">
        {used.toLocaleString("en-GB")} cr this month
      </span>
    );
  const pct = Math.min(100, Math.round((used / cap) * 100));
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
      <span
        className="h-1 min-w-10 flex-1 overflow-hidden rounded-full bg-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={used}
        aria-label="Credits this month"
      >
        <span
          className={cn("block h-full", pct >= 80 ? "bg-hold" : "bg-ink")}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular-nums">
        {used.toLocaleString("en-GB")}/{cap.toLocaleString("en-GB")} cr
      </span>
    </span>
  );
}

function CrewCard({
  entry,
  level,
  now,
  onOpen,
}: {
  entry: RosterEntry;
  level: number | null;
  now: Date;
  onOpen: () => void;
}) {
  const { agent, stat } = entry;
  const activity = stat?.activity ?? (agent.status === "active" ? "idle" : agent.status);
  const total = stat?.outcome_total;
  const summary = [
    `${agent.name}, ${agent.role}`,
    activityLabel(activity),
    total !== null && total !== undefined ? `${total} ${agent.outcome_metric.label}` : null,
    level !== null ? `level ${level}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${summary}. Open details`}
        className="flex h-full w-full flex-col gap-3 rounded-card border bg-card p-3.5 text-left shadow-card transition-colors hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start gap-2.5">
          <Monogram name={agent.name} />
          <div className="min-w-0 flex-1">
            <div className="label-caps truncate text-[13px] tracking-[0.14em]">{agent.name}</div>
            <div className="truncate text-xs text-muted-foreground">{agent.role}</div>
          </div>
          {level !== null && (
            <Pill tone={activity === "waiting" ? "warning" : "info"} className="shrink-0">
              L{level}
            </Pill>
          )}
        </div>
        <div>
          <div className="display-num text-[30px] leading-none">
            {(total ?? 0).toLocaleString("en-GB")}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {agent.outcome_metric.label}
            {stat?.outcome_month ? (
              <span className="text-go"> · +{stat.outcome_month} this month</span>
            ) : null}
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <StatusLine activity={activity} waiting={stat?.waiting ?? 0} />
          <span className="text-xs text-muted-foreground">
            {sinceLabel(stat?.last_run_at ?? null, now)}
          </span>
        </div>
        <CreditsBar used={stat?.credits_month ?? 0} cap={agent.budget_per_month_credits} />
      </button>
    </li>
  );
}

function FlightDirector({
  entry,
  onDuty,
  working,
  waiting,
  now,
  onOpen,
}: {
  entry: RosterEntry;
  onDuty: number;
  working: number;
  waiting: number;
  now: Date;
  onOpen: () => void;
}) {
  const { agent, stat } = entry;
  const solState = working > 0 ? "working" : waiting > 0 ? "waiting" : "idle";
  return (
    <section className="rounded-hero border bg-hero p-4 shadow-hero">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <SolAvatar size={44} status={solState} />
          <div className="min-w-0">
            <div className="label-caps text-[13px] tracking-[0.16em]">Sol · Flight director</div>
            <p className="text-sm text-muted-foreground">
              {working} of {onDuty} crew working
              {waiting > 0 && (
                <>
                  {" · "}
                  <Link to="/approvals" className="text-hold underline-offset-2 hover:underline">
                    {waiting} waiting for you
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2 sm:w-[420px]">
          <Tile>
            <dt className="label-caps text-[11px] tracking-[0.14em] text-muted-foreground">
              {agent.outcome_metric.label}
            </dt>
            <dd className="display-num text-[26px]">
              {(stat?.outcome_total ?? 0).toLocaleString("en-GB")}
            </dd>
          </Tile>
          <Tile>
            <dt className="label-caps text-[11px] tracking-[0.14em] text-muted-foreground">
              Last run
            </dt>
            <dd className="mt-1.5 text-sm">{sinceLabel(stat?.last_run_at ?? null, now)}</dd>
          </Tile>
          <Tile>
            <dt className="label-caps text-[11px] tracking-[0.14em] text-muted-foreground">
              Credits · month
            </dt>
            <dd className="display-num text-[26px]">
              {(stat?.credits_month ?? 0).toLocaleString("en-GB")}
            </dd>
          </Tile>
        </dl>
        <Button variant="outline" size="sm" onClick={onOpen} className="self-start sm:self-center">
          Details
        </Button>
      </div>
    </section>
  );
}

function Joining({ entries }: { entries: RosterEntry[] }) {
  if (!entries.length) return null;
  return (
    <details className="group rounded-card border bg-card shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3">
        <ChevronRight
          className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        <h2 className="label-caps text-[13px] tracking-[0.16em]">Joining your crew</h2>
        <span className="text-xs text-muted-foreground">{entries.length}</span>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
          Ready once there's something for them to work with
        </span>
      </summary>
      <ul className="divide-y border-t">
        {entries.map(({ agent, catalogue }) => (
          <li
            key={agent.id}
            className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <Monogram name={agent.name} size={28} />
              <div className="min-w-0">
                <div className="text-sm">
                  <span className="font-medium">{agent.name}</span>
                  <span className="text-muted-foreground"> · {agent.role}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {agent.status === "locked"
                    ? "Not part of your plan yet."
                    : (catalogue?.needs?.label ?? "Not available yet.")}
                </p>
              </div>
            </div>
            {agent.status !== "locked" && catalogue?.needs?.route && catalogue.needs.action ? (
              <Button asChild variant="outline" size="sm" className="self-start sm:self-center">
                <a href={catalogue.needs.route}>{catalogue.needs.action}</a>
              </Button>
            ) : (
              <span className="label-caps text-[11px] tracking-[0.14em] text-muted-foreground sm:self-center">
                {agent.status === "locked" ? "Locked" : "Not available yet"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function AgentSheet({
  entry,
  companyId,
  now,
  onClose,
}: {
  entry: RosterEntry | null;
  companyId: string;
  now: Date;
  onClose: () => void;
}) {
  const { db, updateAgentSettings } = useStore();
  const founder = useCompanyRole(companyId) === "founder";
  const agent = entry ? (db.agents.find((a) => a.id === entry.agent.id) ?? entry.agent) : null;
  const [perRun, setPerRun] = useState("");
  const [perMonth, setPerMonth] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  if (agent && editing !== agent.id) {
    setEditing(agent.id);
    setPerRun(String(agent.budget_per_run_credits));
    setPerMonth(
      agent.budget_per_month_credits === null ? "" : String(agent.budget_per_month_credits),
    );
  }
  const runs = useMemo(
    () =>
      agent
        ? db.agent_runs
            .filter((r) => r.agent_id === agent.id)
            .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""))
            .slice(0, 5)
        : [],
    [db.agent_runs, agent],
  );
  const autonomy = agent ? db.agent_autonomy.filter((x) => x.agent_id === agent.id) : [];
  const types = new Map(db.autonomy_action_types.map((t) => [t.key, t]));
  const reasonFor = (runId: string) => {
    const a = db.approvals.find((x) => x.run_id === runId);
    const r = a?.payload && "reason" in a.payload ? a.payload.reason : undefined;
    return r ?? entry?.catalogue?.summary;
  };

  const save = async () => {
    if (!agent) return;
    const run = Number(perRun);
    const month = perMonth.trim() === "" ? null : Number(perMonth);
    if (
      await updateAgentSettings(agent.id, {
        budget_per_run_credits: run,
        budget_per_month_credits: month,
      })
    )
      toast.success(`${agent.name}'s limits saved`);
  };

  return (
    <Sheet open={!!agent} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {agent && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 pr-6">
              {agent.crew_pillar === "hq" ? (
                <SolAvatar size={40} />
              ) : (
                <Monogram name={agent.name} size={40} />
              )}
              <div className="min-w-0">
                <SheetTitle className="label-caps text-[15px] tracking-[0.14em]">
                  {agent.name}
                </SheetTitle>
                <SheetDescription>
                  {agent.role} · {PILLAR_LABEL[agent.crew_pillar]}
                </SheetDescription>
              </div>
            </div>
            {entry?.catalogue?.summary && <p className="text-sm">{entry.catalogue.summary}</p>}

            <Panel title="Recent work">
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                <ul className="divide-y">
                  {runs.map((r) => (
                    <li key={r.id} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-sm">{r.task}</p>
                        <StatusPill status={r.status} />
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {r.started_at ? fmtDateTime(r.started_at) : "Not started"} ·{" "}
                        {r.credits_charged} cr
                      </p>
                      <Why reason={reasonFor(r.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Autonomy">
              {autonomy.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing to decide for this crew member yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {autonomy.map((x) => (
                    <li
                      key={x.action_type}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{types.get(x.action_type)?.label ?? x.action_type}</span>
                      <Pill tone="info">L{x.level}</Pill>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                L1 drafts, L2 acts after your GO, L3 acts and reports. Changing levels comes with
                the autonomy ladder.
              </p>
            </Panel>

            <Panel title="Limits">
              {founder ? (
                <div className="space-y-3">
                  <label className="block text-sm">
                    Most credits a run
                    <Input
                      type="number"
                      min={1}
                      max={entry?.catalogue?.budget_per_run_credits}
                      value={perRun}
                      onChange={(e) => setPerRun(e.target.value)}
                      className="mt-1"
                    />
                  </label>
                  <label className="block text-sm">
                    Monthly cap (leave empty for none)
                    <Input
                      type="number"
                      min={1}
                      placeholder="No cap"
                      value={perMonth}
                      onChange={(e) => setPerMonth(e.target.value)}
                      className="mt-1"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void save()}>
                      Save limits
                    </Button>
                    {agent.status !== "locked" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void updateAgentSettings(agent.id, { paused: agent.status !== "paused" })
                        }
                      >
                        {agent.status === "paused" ? (
                          <>
                            <Play className="h-3.5 w-3.5" aria-hidden="true" /> Resume
                          </>
                        ) : (
                          <>
                            <Pause className="h-3.5 w-3.5" aria-hidden="true" /> Pause
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm">
                  {agent.budget_per_run_credits} credits a run ·{" "}
                  {agent.budget_per_month_credits === null
                    ? "no monthly cap"
                    : `${agent.budget_per_month_credits} a month`}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Used this month: {(entry?.stat?.credits_month ?? 0).toLocaleString("en-GB")} credits
                · last run {sinceLabel(entry?.stat?.last_run_at ?? null, now).toLowerCase()}.
              </p>
            </Panel>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function CrewRoster({ companyId }: { companyId: string }) {
  const { db } = useStore();
  const [now] = useState(() => new Date());
  const crew = useCrew(companyId, now);
  const [open, setOpen] = useState<string | null>(null);
  const all = [crew.sol, ...crew.pillars.flatMap((p) => p.entries), ...crew.joining].filter(
    (e): e is RosterEntry => !!e,
  );
  const openEntry = all.find((e) => e.agent.id === open) ?? null;

  return (
    <div className="space-y-6">
      {crew.sol && (
        <FlightDirector
          entry={crew.sol}
          onDuty={crew.onDuty}
          working={crew.working}
          waiting={crew.waiting}
          now={now}
          onOpen={() => setOpen(crew.sol!.agent.id)}
        />
      )}
      {crew.pillars.map((g) => (
        <section key={g.pillar} aria-labelledby={`crew-${g.pillar}`}>
          <h2
            id={`crew-${g.pillar}`}
            className="label-caps mb-2 text-[13px] tracking-[0.16em] text-muted-foreground"
          >
            {PILLAR_LABEL[g.pillar]}
          </h2>
          <ul className="grid gap-3 tab:grid-cols-2 desk:grid-cols-3">
            {g.entries.map((e) => (
              <CrewCard
                key={e.agent.id}
                entry={e}
                level={topLevel(e.agent.id, db.agent_autonomy, db.autonomy_action_types)}
                now={now}
                onOpen={() => setOpen(e.agent.id)}
              />
            ))}
          </ul>
        </section>
      ))}
      <Joining entries={crew.joining} />
      <AgentSheet entry={openEntry} companyId={companyId} now={now} onClose={() => setOpen(null)} />
    </div>
  );
}
