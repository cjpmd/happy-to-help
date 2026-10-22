import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { grants } from "@/lib/seed";
import { PageHeader, Panel, Pill, humanise } from "@/components/dawn/primitives";
import { pageHead } from "@/lib/seo";
import { fmtDate } from "@/lib/format";
import type { InvestorStage } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/raise")({
  head: () => pageHead("Raise", "Investor pipeline, grants and competitions."),
  component: Raise,
});

const STAGES: InvestorStage[] = [
  "researching",
  "contacted",
  "meeting",
  "diligence",
  "committed",
  "passed",
];

function Raise() {
  const { db, companyId, moveInvestor } = useStore();
  const list = db.investors.filter((i) => i.company_id === companyId);
  return (
    <div>
      <PageHeader
        title="Raise"
        description="Drag investors between stages as conversations move on."
      />
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="grid min-w-[1000px] grid-cols-6 gap-3">
          {STAGES.map((s) => (
            <div
              key={s}
              className="rounded-xl bg-muted/50 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => moveInvestor(e.dataTransfer.getData("id"), s)}
            >
              <p
                className={cn(
                  "px-2 py-1.5 text-xs font-medium",
                  s === "committed"
                    ? "text-success"
                    : s === "passed"
                      ? "text-destructive"
                      : "text-muted-foreground",
                )}
              >
                {humanise(s)}{" "}
                <span className="tabular">· {list.filter((i) => i.stage === s).length}</span>
              </p>
              <div className="min-h-24 space-y-2">
                {list
                  .filter((i) => i.stage === s)
                  .map((i) => (
                    <div
                      key={i.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("id", i.id)}
                      className="cursor-grab rounded-lg border bg-card p-3 shadow-card active:cursor-grabbing"
                    >
                      <p className="text-sm font-medium">{i.name}</p>
                      <p className="text-xs text-muted-foreground">{i.firm}</p>
                      <p className="mt-2 text-xs leading-snug">{i.notes}</p>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Panel title="Grants & competitions" className="mt-6" bodyClassName="p-0">
        <ul>
          {grants.map((g) => (
            <li
              key={g.name}
              className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0"
            >
              <span className="flex-1 text-sm font-medium">{g.name}</span>
              <span className="text-sm">{g.amount}</span>
              <span className="text-xs text-muted-foreground">Closes {fmtDate(g.deadline)}</span>
              <Pill tone={g.status === "Drafting" ? "info" : "neutral"}>{g.status}</Pill>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
