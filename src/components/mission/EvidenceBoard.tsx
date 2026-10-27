import { useStore } from "@/lib/store";
import { fmtDate, gbp, num } from "@/lib/format";
import { Panel, Readout, StatusPill } from "./primitives";
import { PlanEvidence } from "./SkillButtons";

/** The evidence board: what the founder believes, what they've tested, what customers said. */
export function EvidenceBoard({ companyId }: { companyId: string }) {
  const { db } = useStore();
  const items = db.evidence_items.filter((e) => e.company_id === companyId);
  const assumptions = items.filter((e) => e.type === "assumption");
  const interviews = items.filter((e) => e.type === "interview");
  const waitlist = (items.find((e) => e.type === "waitlist")?.data["count"] as number) ?? 0;
  const pre = items.find((e) => e.type === "preorder")?.data as
    { count: number; value_gbp: number } | undefined;
  return (
    <div className="flex flex-col gap-3.5">
      <PlanEvidence />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            ["Waitlist", num(waitlist)],
            ["Interviews", num(interviews.length)],
            ["Pre-orders", num(pre?.count ?? 0)],
            ["Pre-order value", gbp(pre?.value_gbp ?? 0)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-card border bg-card px-3.5 py-3 shadow-card">
            <Readout label={label} value={value} />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Assumptions to test" bodyClassName="px-0 pb-0">
          <ul>
            {assumptions.map((a) => (
              <li key={a.id} className="border-t px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{a.title}</p>
                  {a.status && <StatusPill status={a.status} />}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{String(a.data["test"] ?? "")}</p>
              </li>
            ))}
            {!assumptions.length && (
              <li className="border-t px-3.5 py-3 text-muted-foreground">
                Sol will draft your first assumptions tonight.
              </li>
            )}
          </ul>
        </Panel>
        <Panel title="Interview notes" bodyClassName="px-0 pb-0">
          <ul>
            {interviews.map((i) => (
              <li key={i.id} className="border-t px-3.5 py-3">
                <div className="flex justify-between gap-3">
                  <p className="font-medium">{i.title}</p>
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(String(i.data["date"]))}
                  </span>
                </div>
                <p className="mt-1 leading-relaxed text-muted-foreground">
                  {String(i.data["note"])}
                </p>
              </li>
            ))}
            {!interviews.length && (
              <li className="border-t px-3.5 py-3 text-muted-foreground">
                No interviews logged yet.
              </li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
