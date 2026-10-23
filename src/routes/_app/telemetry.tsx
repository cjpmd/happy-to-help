import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/mission/primitives";
import { MetricsStrip } from "@/components/mission/CompanyHQ";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/telemetry")({
  head: () => pageHead("Telemetry", "Visitors, signups, paying customers and what each one cost."),
  component: Telemetry,
});

// Placeholder until 1a-design step 5 adds the funnel, cost per signup and trends.
function Telemetry() {
  const { companyId } = useStore();
  return (
    <div>
      <PageHeader
        title="Telemetry"
        description="How the mission is doing: visitors, signups and paying customers."
      />
      <MetricsStrip companyId={companyId} />
    </div>
  );
}
