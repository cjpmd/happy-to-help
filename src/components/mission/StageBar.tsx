import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageGate, Stage } from "@/lib/types";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "evidence", label: "Evidence" },
  { id: "build", label: "Build" },
  { id: "launch", label: "Launch" },
  { id: "grow", label: "Grow" },
];

export function StageBar({
  companyId,
  canApprove,
}: {
  companyId: string;
  canApprove?: boolean | undefined;
}) {
  const { db, approveGate } = useStore();
  const gates = db.stage_gates.filter((g) => g.company_id === companyId);
  const byStage = (s: Stage) => gates.find((g) => g.stage === s) as StageGate | undefined;

  return (
    <div className="grid grid-cols-5 gap-1.5 rounded-xl border bg-card p-1.5 shadow-card">
      {STAGES.map((s, i) => {
        const g = byStage(s.id);
        const done = g?.status === "approved";
        const current = g?.status === "in_progress" || g?.status === "ready";
        return (
          <div
            key={s.id}
            className={cn(
              "relative min-w-0 rounded-lg px-2.5 py-2.5 sm:px-3",
              current && "bg-primary-soft",
              done && "bg-muted/60",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular",
                  done && "border-success bg-success text-primary-foreground",
                  current && "border-primary bg-primary text-primary-foreground",
                  !done && !current && "text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  "truncate text-sm font-medium",
                  !done && !current && "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {g && g.criteria.length > 0 && (
              <div className="mt-2 hidden flex-wrap gap-x-3 gap-y-1 md:flex">
                {g.criteria.map((c) => {
                  const met = c.current >= c.target;
                  return (
                    <span
                      key={c.label}
                      className={cn(
                        "text-[11px] tabular",
                        met ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {c.label} {c.current}/{c.target}
                      {met && " ✓"}
                    </span>
                  );
                })}
              </div>
            )}
            {canApprove && g?.status === "ready" && (
              <Button
                size="sm"
                className="mt-2 h-7 w-full text-xs"
                onClick={() => void approveGate(g.id)}
              >
                Approve gate
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
