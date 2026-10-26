import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { ApprovalCard } from "@/components/mission/ApprovalCard";
import { ReviewCard } from "@/components/mission/Capture";
import { PageHeader } from "@/components/mission/primitives";
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
  const decided = all
    .filter((a) => a.status !== "pending")
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  const total = pending.reduce((s, a) => s + a.estimated_credits, 0);
  // "From your meeting" cards wait here too (SPEC P).
  const reviews = db.captures.filter((c) => c.company_id === companyId && c.status === "review");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Approvals"
        description={
          pending.length || reviews.length
            ? `${pending.length + reviews.length} waiting · ≈ ${num(total)} CR if all get a GO`
            : "Nothing waiting on you."
        }
      />
      <div className="space-y-3">
        {reviews.map((c) => (
          <ReviewCard key={c.id} captureId={c.id} />
        ))}
        {pending.map((a) => (
          <ApprovalCard key={a.id} a={a} />
        ))}
      </div>
      {decided.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-sm font-medium text-muted-foreground">Decided</h2>
          <div className="space-y-3">
            {decided.map((a) => (
              <ApprovalCard key={a.id} a={a} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
