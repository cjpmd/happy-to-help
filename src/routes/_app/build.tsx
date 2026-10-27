import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { CostButton, ProofOfDone, Why } from "@/components/mission/WorkControls";
import { Button } from "@/components/ui/button";
import { hasProof } from "@/lib/workspace";
import { PageHeader, Panel, StatusPill } from "@/components/mission/primitives";
import { ApprovalCard } from "@/components/mission/ApprovalCard";
import { pageHead } from "@/lib/seo";
import { fmtDateTime, num } from "@/lib/format";

export const Route = createFileRoute("/_app/build")({
  head: () => pageHead("Build", "Your website and app: versions, changes and work in progress."),
  component: Build,
});

function Build() {
  const { db, companyId } = useStore();
  const pending = db.approvals.filter(
    (a) => a.company_id === companyId && a.status === "pending" && a.action_type === "publish_site",
  );
  const versions = db.site_versions
    .filter((v) => v.company_id === companyId)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .map((v) => ({ v: v.version, what: v.summary, when: v.published_at }));
  return (
    <div>
      <PageHeader
        title="Build"
        description="Website and app versions, plus changes waiting for you."
        actions={
          <Link to="/hq" className="text-sm text-primary">
            Open live preview →
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Changes awaiting approval">
          {pending.length ? (
            <div className="space-y-3">
              {pending.map((a) => (
                <ApprovalCard key={a.id} a={a} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No site changes waiting. The latest build is on your preview URL.
            </p>
          )}
        </Panel>
        <Panel title="Versions" bodyClassName="p-0">
          <ul>
            {!versions.length && (
              <li className="p-4 text-sm text-muted-foreground">
                No versions yet. Sol's first build appears here once you approve it.
              </li>
            )}
            {versions.map((v) => (
              <li key={v.v} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{v.v}</code>
                <span className="flex-1 text-sm">{v.what}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(v.when)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Build tasks" className="lg:col-span-2" bodyClassName="p-0">
          <TaskList pillar="build" companyId={companyId} />
        </Panel>
      </div>
    </div>
  );
}

export function TaskList({ pillar, companyId }: { pillar: string; companyId: string }) {
  const { db, work, markDone } = useStore();
  const rows = db.tasks.filter((t) => t.company_id === companyId && t.pillar === pillar);
  if (!rows.length) return <p className="p-4 text-sm text-muted-foreground">No tasks yet.</p>;
  return (
    <ul>
      {rows.map((t) => (
        <li key={t.id} className="border-b px-4 py-4 last:border-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              <ProofOfDone proof={t.proof} />
              <Why reason="This task addresses an identified gap in the current product. Passing checks, a screenshot, preview and pull request are required before completion is verified." />
            </div>
            <StatusPill status={t.status} />
          </div>
          {t.status !== "done" && (
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <div>
                <CostButton
                  label="Run task"
                  cost={t.estimated_credits}
                  onConfirm={() => work(companyId, t.title, t.estimated_credits, "task", t.id)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={(t.actor ?? "sol") === "sol" && !hasProof(t.proof)}
                onClick={() => void markDone(t.id)}
              >
                Mark done
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
