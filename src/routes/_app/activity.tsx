import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, StatusPill } from "@/components/mission/primitives";
import { RouteTabs } from "@/components/mission/RouteTabs";
import { RoutinesPage } from "@/components/mission/WorkspacePages";
import { AutoModeDialog } from "@/components/mission/AutoModeDialog";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/seo";
import { duration, fmtDateTime, num } from "@/lib/format";
import { ProofOfDone, Why } from "@/components/mission/WorkControls";
import { cn } from "@/lib/utils";

type LogTab = "past" | "scheduled";

export const Route = createFileRoute("/_app/activity")({
  head: () => pageHead("Log", "Every run Sol has made, and the work scheduled next."),
  // ?tab=scheduled; past runs have no param.
  validateSearch: (search: Record<string, unknown>): { tab?: "scheduled" } =>
    search["tab"] === "scheduled" ? { tab: "scheduled" } : {},
  component: Log,
});

function Log() {
  const { companyId } = useStore();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [auto, setAuto] = useState(false);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Log"
        description="Everything Sol has worked on, and what's scheduled next."
      />
      <RouteTabs<LogTab>
        label="Log"
        value={tab ?? "past"}
        onValueChange={(t) =>
          void navigate({ search: t === "past" ? {} : { tab: t }, replace: true })
        }
        tabs={[
          { value: "past", label: "Past", content: <PastRuns /> },
          {
            value: "scheduled",
            label: "Scheduled",
            content: (
              <div className="flex flex-col gap-3.5">
                <Panel
                  title="Auto Mode"
                  action={
                    <Button size="sm" variant="outline" onClick={() => setAuto(true)}>
                      Start Auto Mode
                    </Button>
                  }
                >
                  <p className="text-muted-foreground">
                    A time-boxed work period: Sol works for 1 to 8 hours within a credit limit you
                    set first.
                  </p>
                </Panel>
                <AutoModeDialog companyId={companyId} open={auto} onOpenChange={setAuto} />
                <RoutinesPage embedded />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function PastRuns() {
  const { db, companyId } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const runs = db.agent_runs
    .filter((r) => r.company_id === companyId)
    .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));
  return (
    <div>
      {runs.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No runs yet. Sol starts work tonight.
        </p>
      )}
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        {runs.map((r) => {
          const isOpen = open === r.id;
          return (
            <div key={r.id} className="border-b last:border-b-0">
              <button
                onClick={() => setOpen(isOpen ? null : r.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.task}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="capitalize">{r.pillar}</span> ·{" "}
                    {r.started_at && fmtDateTime(r.started_at)} ·{" "}
                    {duration(r.started_at, r.finished_at)}
                  </p>
                </div>
                {r.status === "failed" && (
                  <Pill tone="warning" className="hidden sm:inline-flex">
                    <RotateCcw className="h-3 w-3" />
                    Auto-refunded
                  </Pill>
                )}
                <StatusPill status={r.status} />
                <span className="w-20 text-right text-sm tabular">{num(r.credits_charged)} cr</span>
              </button>
              {isOpen && (
                <div className="bg-muted/40 px-4 py-3 pl-11">
                  <ol className="space-y-2">
                    {r.steps.map((s, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <code className="rounded bg-card px-1.5 py-0.5 font-mono text-[11px]">
                          {s.tool}
                        </code>
                        <span className="flex-1">{s.summary}</span>
                        <span className="text-xs text-muted-foreground tabular">
                          {s.credits} cr
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs text-muted-foreground tabular">
                    {r.model} · {num(r.usage.input_tokens)} in / {num(r.usage.output_tokens)} out ·
                    ${r.cost_usd.toFixed(2)} cost
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
