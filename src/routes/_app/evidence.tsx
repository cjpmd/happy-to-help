import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, StatusPill } from "@/components/dawn/primitives";
import { pageHead } from "@/lib/seo";
import { fmtDate, gbp, num } from "@/lib/format";

export const Route = createFileRoute("/_app/evidence")({
  head: () => pageHead("Evidence board", "Assumptions, interviews, waitlist and pre-orders."),
  component: Evidence,
});

function Evidence() {
  const { db, companyId } = useStore();
  const items = db.evidence_items.filter((e) => e.company_id === companyId);
  const assumptions = items.filter((e) => e.type === "assumption");
  const interviews = items.filter((e) => e.type === "interview");
  const waitlist = (items.find((e) => e.type === "waitlist")?.data.count as number) ?? 0;
  const pre = items.find((e) => e.type === "preorder")?.data as { count: number; value_gbp: number } | undefined;
  return (
    <div>
      <PageHeader title="Evidence board" description="What you believe, what you've tested, and what customers said." />
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[["Waitlist", num(waitlist)], ["Interviews", num(interviews.length)], ["Pre-orders", num(pre?.count ?? 0)], ["Pre-order value", gbp(pre?.value_gbp ?? 0)]].map(([l, v]) => (
          <div key={l} className="rounded-xl border bg-card p-4 shadow-card"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-semibold tabular">{v}</p></div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Assumptions to test" bodyClassName="p-0">
          <ul>{assumptions.map((a) => (
            <li key={a.id} className="border-b px-4 py-3 last:border-0">
              <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{a.title}</p>{a.status && <StatusPill status={a.status} />}</div>
              <p className="mt-1 text-xs text-muted-foreground">{String(a.data.test ?? "")}</p>
            </li>))}
            {!assumptions.length && <li className="p-4 text-sm text-muted-foreground">Sol will draft your first assumptions tonight.</li>}
          </ul>
        </Panel>
        <Panel title="Interview notes" bodyClassName="p-0">
          <ul>{interviews.map((i) => (
            <li key={i.id} className="border-b px-4 py-3 last:border-0">
              <div className="flex justify-between gap-3"><p className="text-sm font-medium">{i.title}</p><span className="text-xs text-muted-foreground">{fmtDate(String(i.data.date))}</span></div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{String(i.data.note)}</p>
            </li>))}
            {!interviews.length && <li className="p-4 text-sm text-muted-foreground">No interviews logged yet.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
