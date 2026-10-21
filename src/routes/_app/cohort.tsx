import { createFileRoute, Link, Outlet, useMatch } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { cohorts, cohort_companies } from "@/lib/seed";
import { creditBalance } from "@/lib/credits";
import { PageHeader, Pill, StatusPill } from "@/components/dawn/primitives";
import { STAGES } from "@/components/dawn/StageBar";
import { pageHead } from "@/lib/seo";
import { fmtDate, num } from "@/lib/format";

export const Route = createFileRoute("/_app/cohort")({
  head: () => pageHead("Cohort", "Oversee every company in your cohort at a glance."),
  component: Cohort,
});

function Cohort() {
  const child = useMatch({ from: "/_app/cohort/$companyId", shouldThrow: false });
  const { db } = useStore();
  if (child) return <Outlet />;
  const cohort = cohorts[0];
  if (!cohort) return null;
  const rows = cohort_companies.filter((cc) => cc.cohort_id === cohort.id).map((cc) => {
    const c = db.companies.find((x) => x.id === cc.company_id)!;
    const ledger = db.credit_ledger.filter((l) => l.company_id === c.id);
    const used = -ledger.filter((l) => l.amount < 0 && l.entry_type !== "hold").reduce((s, l) => s + l.amount, 0);
    const last = db.activity_events.filter((e) => e.company_id === c.id).map((e) => e.created_at).sort().pop() ?? "2026-10-02T00:00:00Z";
    const daysQuiet = (new Date("2026-10-21").getTime() - new Date(last).getTime()) / 86400000;
    const health = daysQuiet > 10 ? "stalled" : daysQuiet > 1 ? "needs_attention" : "on_track";
    const gatesPending = db.stage_gates.filter((g) => g.company_id === c.id && g.status === "ready").length;
    return { c, cc, used, last, health, gatesPending, balance: creditBalance(db.credit_ledger, c.id) };
  });
  return (
    <div>
      <PageHeader title={cohort.name} description={`${cohort.institution} · ${rows.length} companies · ${num(cohort.credit_pool)} credit pool`} />
      <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="px-4 py-2.5 font-medium">Company</th><th className="px-4 py-2.5 font-medium">Stage</th><th className="px-4 py-2.5 font-medium">Health</th><th className="px-4 py-2.5 font-medium">Last activity</th><th className="px-4 py-2.5 font-medium">Credits used / cap</th><th className="px-4 py-2.5 font-medium">Gate approvals</th></tr></thead>
          <tbody>{rows.map(({ c, cc, used, last, health, gatesPending }) => (
            <tr key={c.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
              <td className="px-4 py-3"><Link to="/cohort/$companyId" params={{ companyId: c.id }} className="font-medium hover:text-primary">{c.name}</Link><p className="text-xs text-muted-foreground">{c.customer_type}</p></td>
              <td className="px-4 py-3">{STAGES.find((s) => s.id === c.stage)?.label}</td>
              <td className="px-4 py-3"><StatusPill status={health} /></td>
              <td className="px-4 py-3 text-muted-foreground">{fmtDate(last)}</td>
              <td className="px-4 py-3 tabular">
                {num(used)} / {num(cc.credit_cap)}
                <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (used / cc.credit_cap) * 100)}%` }} /></div>
              </td>
              <td className="px-4 py-3">{gatesPending ? <Pill tone="warning">{gatesPending} ready</Pill> : <span className="text-muted-foreground">—</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
