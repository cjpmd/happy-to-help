import { useState } from "react";
import { Pause, Settings2 } from "lucide-react";
import { useCompany, useSolStatus, useStore } from "@/lib/store";
import { autoModeCost } from "@/lib/credits";
import {
  currentGate,
  gateDay,
  gateMetric,
  gateName,
  greeting,
  missionDay,
  type SolState,
} from "@/lib/mission";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AUTO_MODE_DEFAULT_HOURS, AutoModeDialog } from "./AutoModeDialog";
import { Pill, Readout } from "./primitives";

const TITLES = /^(dr|mr|mrs|ms|mx|prof)\.?$/i;
const firstName = (fullName: string) =>
  fullName.split(" ").find((p) => p && !TITLES.test(p)) ?? fullName;

const solWord: Record<SolState, string> = {
  working: "Active",
  idle: "Idle",
  waiting: "Waiting for you",
};
const solDot: Record<SolState, string> = {
  working: "bg-go",
  idle: "bg-muted-foreground",
  waiting: "bg-hold",
};

/** HQ header: greeting, phase, Sol's status, next-gate countdown and Auto Mode. */
export function MissionHeader({
  companyId,
  readOnly,
  onCustomise,
}: {
  companyId: string;
  readOnly?: boolean | undefined;
  /** Opens the HQ card settings. */
  onCustomise?: (() => void) | undefined;
}) {
  const { db, user, solTyping, stopAuto, now } = useStore();
  const c = useCompany(companyId);
  const sol = useSolStatus(companyId);
  const [auto, setAuto] = useState(false);
  const gate = currentGate(db.stage_gates.filter((g) => g.company_id === companyId));
  const metric = gateMetric(gate);
  const day = missionDay(c, now);
  const gDay = gate ? gateDay(gate, c) : null;
  const until = gDay === null ? null : gDay - day;
  const solLine =
    sol.state === "working"
      ? sol.summary
      : sol.state === "waiting"
        ? `${sol.pending} for GO / NO-GO`
        : null;

  return (
    <section
      aria-labelledby="mission-phase"
      className="flex flex-wrap items-end justify-between gap-4"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="label-caps truncate text-[12px] tracking-[0.16em] text-muted-foreground">
          {readOnly
            ? `Mission ${c.name} · mentor view`
            : `${greeting(now)}, ${firstName(user.full_name)} · Mission ${c.name}`}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1
            id="mission-phase"
            className="display-num text-[40px] uppercase leading-[0.95] tracking-[0.02em]"
          >
            {c.stage} phase
          </h1>
          {c.sector && c.sector !== "general" && (
            <span title="Stricter claims checks apply to everything Sol writes">
              <Pill className="border border-line">Regulated · {c.sector}</Pill>
              <span className="sr-only">: stricter claims checks apply</span>
            </span>
          )}
        </div>
        <p className="label-caps flex min-w-0 items-center gap-2 text-[12px]" aria-live="polite">
          <span className={cn("size-2 shrink-0 rounded-full", solDot[sol.state])} />
          <span className="truncate">
            Sol · {solWord[sol.state]}
            {solLine && ` · ${solLine}`}
          </span>
          {solTyping && !readOnly && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-1 min-h-6 px-1.5"
              aria-label="Stop Auto Mode"
              onClick={stopAuto}
            >
              <Pause />
            </Button>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        {gate && until !== null && (
          <Readout
            size={30}
            label={gateName(gate.stage)}
            value={until >= 0 ? `T–${until}` : `+${-until}`}
            unit={
              <span className={cn("tracking-[0.1em] text-ink", until < 0 && "text-hold")}>
                {until >= 0 ? "DAYS" : "DAYS LATE"}
              </span>
            }
          />
        )}
        {metric && (
          <Readout
            size={30}
            label={metric.label}
            value={metric.current}
            unit={`/ ${metric.target}`}
          />
        )}
        {!readOnly && (
          <>
            <Button
              variant="outline"
              className="min-h-11 border-ink bg-transparent text-[12px]"
              onClick={() => setAuto(true)}
            >
              Auto Mode · {AUTO_MODE_DEFAULT_HOURS}h ≈ {autoModeCost(AUTO_MODE_DEFAULT_HOURS)} CR
            </Button>
            <AutoModeDialog companyId={companyId} open={auto} onOpenChange={setAuto} />
          </>
        )}
        {onCustomise && (
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="Customise HQ"
            title="Customise HQ"
            onClick={onCustomise}
          >
            <Settings2 />
          </Button>
        )}
      </div>
    </section>
  );
}
