import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { contacts, tasks } from "@/lib/seed";
import { PageHeader, Panel, Pill, SolAvatar, StatusPill } from "@/components/dawn/primitives";
import { pageHead } from "@/lib/seo";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_app/run")({
  head: () => pageHead("Run", "Inbox summary, customers and leads, and day-to-day tasks."),
  component: Run,
});

function Run() {
  const { companyId } = useStore();
  const people = contacts.filter((c) => c.company_id === companyId);
  const todo = tasks.filter((t) => t.company_id === companyId && t.pillar === "run");
  return (
    <div>
      <PageHeader title="Run" description="The day-to-day: inbox, customers and tasks." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Inbox summary" className="lg:col-span-1">
          <div className="flex gap-3">
            <SolAvatar size={24} />
            <div className="space-y-2 text-sm leading-relaxed">
              <p>14 new emails overnight. I archived 9 newsletters and replied to 2 support questions.</p>
              <p className="font-medium">3 teacher enquiries need you — they're asking about school licences.</p>
            </div>
          </div>
        </Panel>
        <Panel title="Tasks" className="lg:col-span-2" bodyClassName="p-0">
          <ul>{todo.map((t) => (
            <li key={t.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
              <span className="flex-1 text-sm">{t.title}</span>
              {t.due && <span className="text-xs text-muted-foreground">Due {fmtDate(t.due)}</span>}
              <StatusPill status={t.status} />
            </li>))}
            {!todo.length && <li className="p-4 text-sm text-muted-foreground">No tasks.</li>}
          </ul>
        </Panel>
        <Panel title="Customers & leads" className="lg:col-span-3" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Email</th><th className="px-4 py-2 font-medium">Type</th><th className="px-4 py-2 font-medium">Value</th><th className="px-4 py-2 font-medium">Last contact</th></tr></thead>
              <tbody>{people.map((p) => (
                <tr key={p.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{p.name}</td><td className="px-4 py-3 text-muted-foreground">{p.email}</td><td className="px-4 py-3"><Pill tone={p.kind === "customer" ? "success" : "info"}>{p.kind === "customer" ? "Customer" : "Lead"}</Pill></td><td className="px-4 py-3">{p.value}</td><td className="px-4 py-3 text-muted-foreground">{fmtDate(p.last)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
