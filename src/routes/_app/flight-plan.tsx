import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useCompany, useStore } from "@/lib/store";
import { missionDay, stageLabel } from "@/lib/mission";
import { buildMilestones, inDays } from "@/lib/flightPlan";
import { PageHeader, Panel, Pill } from "@/components/mission/primitives";
import { FlightPlanArc } from "@/components/mission/FlightPlanArc";
import { StageBar } from "@/components/mission/StageBar";
import { RouteTabs } from "@/components/mission/RouteTabs";
import { EvidenceBoard } from "@/components/mission/EvidenceBoard";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/flight-plan")({
  // ?m=<milestone id> opens that milestone (from the HQ arc); ?tab=evidence shows the board.
  validateSearch: (search: Record<string, unknown>): { m?: string; tab?: "evidence" } => ({
    ...(typeof search["m"] === "string" ? { m: search["m"] } : {}),
    ...(search["tab"] === "evidence" ? { tab: "evidence" as const } : {}),
  }),
  head: () =>
    pageHead("Flight plan", "Your roadmap: milestones, gates and the evidence behind them."),
  component: FlightPlan,
});

// Step 5 of 1a-design adds gate detail, the evidence for each milestone and an Evidence tab.
function FlightPlan() {
  const { db, companyId, now } = useStore();
  const c = useCompany(companyId);
  const nowDay = missionDay(c, now);
  const milestones = useMemo(
    () =>
      buildMilestones(
        c,
        db.stage_gates.filter((g) => g.company_id === c.id),
        db.tasks.filter((t) => t.company_id === c.id),
      ),
    [c, db.stage_gates, db.tasks],
  );
  const { m, tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [selected, setSelected] = useState<string | null>(m ?? null);
  const picked = milestones.find((m) => m.id === selected);
  const gate = db.stage_gates.find((g) => g.id === selected);

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader
        title="Flight plan"
        description="Your milestones and stage gates, with the evidence behind each one."
      />
      <RouteTabs<"plan" | "evidence">
        label="Flight plan"
        value={tab ?? "plan"}
        onValueChange={(t) =>
          void navigate({
            search: (prev) => ({
              ...(prev.m ? { m: prev.m } : {}),
              ...(t === "evidence" ? { tab: t } : {}),
            }),
            replace: true,
          })
        }
        tabs={[
          {
            value: "plan",
            label: "Plan",
            content: (
              <div className="flex flex-col gap-3.5">
                <section
                  aria-labelledby="fp-heading"
                  className="rounded-hero border bg-hero px-[18px] pb-4 pt-3.5 shadow-hero"
                >
                  <FlightPlanArc
                    milestones={milestones}
                    nowDay={nowDay}
                    seed={c.id}
                    phase={stageLabel(c.stage)}
                    onSelectMilestone={setSelected}
                    heading={
                      <h2 id="fp-heading" className="label-caps text-[13px] tracking-[0.16em]">
                        Flight plan
                      </h2>
                    }
                  />
                </section>
                {picked && (
                  <Panel
                    title={picked.label}
                    action={
                      <Pill
                        tone={
                          picked.status === "done"
                            ? "success"
                            : picked.kind === "gate"
                              ? "warning"
                              : "info"
                        }
                      >
                        {picked.status === "done" ? "Done" : inDays(picked.day - nowDay)}
                      </Pill>
                    }
                  >
                    <p className="text-muted-foreground">
                      {picked.kind === "gate" ? "Gate" : "Milestone"} · day {picked.day}
                    </p>
                    {gate && gate.criteria.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {gate.criteria.map((cr) => (
                          <li key={cr.label} className="flex justify-between gap-3">
                            <span>{cr.label}</span>
                            <span
                              className={cr.current >= cr.target ? "text-go tabular" : "tabular"}
                            >
                              {cr.current} / {cr.target}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                )}
                <StageBar companyId={companyId} />
              </div>
            ),
          },
          {
            value: "evidence",
            label: "Evidence",
            content: <EvidenceBoard companyId={companyId} />,
          },
        ]}
      />
    </div>
  );
}
