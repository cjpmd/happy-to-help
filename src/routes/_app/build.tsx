import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { tasks } from "@/lib/seed";
import { PageHeader, Panel, StatusPill } from "@/components/dawn/primitives";
import { ApprovalCard } from "@/components/dawn/ApprovalCard";
import { pageHead } from "@/lib/seo";
import { fmtDateTime, num } from "@/lib/format";

export const Route = createFileRoute("/_app/build")({
  head: () => pageHead("Build", "Your website and app: versions, changes and work in progress."),
  component: Build,
});

function Build() {
  const { db, companyId } = useStore();
  const runs = db.agent_runs.filter((r) => r.company_id === companyId && r.pillar === "build");
  const pending = db.approvals.filter((a) => a.company_id === companyId && a.status === "pending" && a.action_type === "publish_site");
  const versions = runs.filter((r) => r.status === "succeeded").map((r, i) => ({ v: `v0.${9 - i}`, what: r.task, when: r.finished_at! }));
  versions.push({ v: "v0.8", what: "Quiz engine and landing page", when: "2026-10-08T03:00:00Z" });
  return (
    <div>
      <PageHeader title="Build" description="Website and app versions, plus changes waiting for you." actions={<Link to="/hq" className="text-sm text-primary">Open live preview →</Link>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Changes awaiting approval">
          {pending.length ? <div className="space-y-3">{pending.map((a) => <ApprovalCard key={a.id} a={a} />)}</div> : <p className="text-sm text-muted-foreground">No site changes waiting. The latest build is on your preview URL.</p>}
        </Panel>
        <Panel title="Versions" bodyClassName="p-0">
          <ul>{versions.map((v) => (
            <li key={v.v} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{v.v}</code>
              <span className="flex-1 text-sm">{v.what}</span>
              <span className="text-xs text-muted-foreground">{fmtDateTime(v.when)}</span>
            </li>))}</ul>
        </Panel>
        <Panel title="Build tasks" className="lg:col-span-2" bodyClassName="p-0">
          <TaskList pillar="build" companyId={companyId} />
        </Panel>
      </div>
    </div>
  );
}

export function TaskList({ pillar, companyId }: { pillar: string; companyId: string }) {
  const rows = tasks.filter((t) => t.company_id === companyId && t.pillar === pillar);
  if (!rows.length) return <p className="p-4 text-sm text-muted-foreground">No tasks yet.</p>;
  return (
    <ul>{rows.map((t) => (
      <li key={t.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
        <span className="flex-1 text-sm">{t.title}</span>
        <span className="text-xs text-muted-foreground tabular">{num(t.estimated_credits)} cr</span>
        <StatusPill status={t.status} />
      </li>))}</ul>
  );
}
