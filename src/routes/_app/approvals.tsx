import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { ApprovalCard } from "@/components/dawn/ApprovalCard";
import { PageHeader } from "@/components/dawn/primitives";
import { pageHead } from "@/lib/seo";
import { num } from "@/lib/format";

export const Route = createFileRoute("/_app/approvals")({
  head: () => pageHead("Approvals", "Review exactly what Sol will do before it happens."),
  component: Approvals,
});

function Approvals() {
  const { db, companyId } = useStore();
  const all = db.approvals.filter((a) => a.company_id === companyId);
  const pending = all.filter((a) => a.status === "pending");
  const decided = all.filter((a) => a.status !== "pending").sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  const total = pending.reduce((s, a) => s + a.estimated_credits, 0);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Approvals" description={pending.length ? `${pending.length} waiting · ${num(total)} credits if all approved` : "Nothing waiting on you."} />
      <div className="space-y-3">{pending.map((a) => <ApprovalCard key={a.id} a={a} />)}</div>
      {decided.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-sm font-medium text-muted-foreground">Decided</h2>
          <div className="space-y-3">{decided.map((a) => <ApprovalCard key={a.id} a={a} />)}</div>
        </>
      )}
    </div>
  );
}
