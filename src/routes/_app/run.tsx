import { createFileRoute } from "@tanstack/react-router";
import { RouteTabs } from "@/components/mission/RouteTabs";
import { DocumentsPage, EmailPage } from "@/components/mission/WorkspacePages";
import { useStore } from "@/lib/store";
import { PageHeader, Panel, Pill, SolAvatar, StatusPill } from "@/components/mission/primitives";
import { pageHead } from "@/lib/seo";
import { fmtDate } from "@/lib/format";

type RunTab = "overview" | "email" | "documents";
const RUN_TABS: RunTab[] = ["overview", "email", "documents"];

export const Route = createFileRoute("/_app/run")({
  head: () => pageHead("Run", "Inbox summary, customers and leads, and day-to-day tasks."),
  // ?tab=email|documents; the overview has no param.
  validateSearch: (search: Record<string, unknown>): { tab?: Exclude<RunTab, "overview"> } =>
    search["tab"] === "email" || search["tab"] === "documents" ? { tab: search["tab"] } : {},
  component: Run,
});

function Run() {
  const { tab = "overview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div>
      <PageHeader
        title="Run"
        description="The day-to-day: inbox, customers, email and documents."
      />
      <RouteTabs<RunTab>
        label="Run"
        value={RUN_TABS.includes(tab) ? tab : "overview"}
        onValueChange={(t) =>
          void navigate({ search: t === "overview" ? {} : { tab: t }, replace: true })
        }
        tabs={[
          { value: "overview", label: "Overview", content: <RunOverview /> },
          { value: "email", label: "Email", content: <EmailPage embedded /> },
          { value: "documents", label: "Documents", content: <DocumentsPage embedded /> },
        ]}
      />
    </div>
  );
}

function RunOverview() {
  const { companyId, db } = useStore();
  const people = db.contacts.filter((c) => c.company_id === companyId);
  // Sol's latest inbox summary is the last step of its most recent inbox run.
  const inboxRun = db.agent_runs
    .filter((r) => r.company_id === companyId && r.status === "succeeded" && /inbox/i.test(r.task))
    .sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? ""))[0];
  const todo = db.tasks.filter((t) => t.company_id === companyId && t.pillar === "run");
  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Inbox summary" className="lg:col-span-1">
          <div className="flex gap-3">
            <SolAvatar size={24} />
            <div className="space-y-2 text-sm leading-relaxed">
              {inboxRun ? (
                <>
                  <p>{inboxRun.steps.at(-1)?.summary ?? inboxRun.task}</p>
                  {inboxRun.finished_at && (
                    <p className="text-xs text-muted-foreground">{fmtDate(inboxRun.finished_at)}</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  No inbox summary yet. Sol writes one each morning once company email is set up.
                </p>
              )}
            </div>
          </div>
        </Panel>
        <Panel title="Tasks" className="lg:col-span-2" bodyClassName="p-0">
          <ul>
            {todo.map((t) => (
              <li key={t.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                <span className="flex-1 text-sm">{t.title}</span>
                {t.due && (
                  <span className="text-xs text-muted-foreground">Due {fmtDate(t.due)}</span>
                )}
                <StatusPill status={t.status} />
              </li>
            ))}
            {!todo.length && <li className="p-4 text-sm text-muted-foreground">No tasks.</li>}
          </ul>
        </Panel>
        <Panel title="Customers & leads" className="lg:col-span-3" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Value</th>
                  <th className="px-4 py-2 font-medium">Last contact</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.email}</td>
                    <td className="px-4 py-3">
                      <Pill tone={p.kind === "customer" ? "success" : "info"}>
                        {p.kind === "customer" ? "Customer" : "Lead"}
                      </Pill>
                    </td>
                    <td className="px-4 py-3">{p.value}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
