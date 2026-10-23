import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { compliance_items } from "@/lib/seed";
import { PageHeader, Panel, Pill, humanise } from "@/components/mission/primitives";
import { complianceTone } from "@/lib/compliance";
import { DocumentsPage } from "@/components/mission/WorkspacePages";
import { pageHead } from "@/lib/seo";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/legal")({
  head: () => pageHead("Stay legal", "Compliance checklist and calendar for UK startups."),
  component: Legal,
});

function Legal() {
  const { companyId } = useStore();
  const items = compliance_items
    .filter((c) => c.company_id === companyId)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const done = items.filter((i) => i.status === "done").length;
  const next = items.filter((i) => i.status !== "done");
  return (
    <div>
      <PageHeader
        title="Stay legal"
        description={`${done} of ${items.length} complete. Sol tracks every UK deadline for you.`}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title="Checklist" bodyClassName="p-0">
          <ul>
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border",
                    i.status === "done" && "border-success bg-success text-primary-foreground",
                  )}
                >
                  {i.status === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{i.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.category}
                    {i.statutory && " · statutory"}
                  </p>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {fmtDate(i.due_date)}
                </span>
                <Pill tone={complianceTone(i)}>{humanise(i.status)}</Pill>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Coming up">
          <ol className="space-y-4">
            {next.map((i) => (
              <li key={i.id} className="flex gap-3">
                <div className="w-12 shrink-0 rounded-lg bg-muted py-1.5 text-center leading-tight">
                  <p className="text-[10px] uppercase text-muted-foreground">
                    {new Date(i.due_date).toLocaleDateString("en-GB", { month: "short" })}
                  </p>
                  <p className="text-lg font-semibold tabular">{new Date(i.due_date).getDate()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(i.due_date)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
      <Panel className="mt-4">
        <DocumentsPage embedded only={["Privacy policy"]} />
      </Panel>
    </div>
  );
}
