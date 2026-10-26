import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/mission/primitives";
import { TelemetryPage } from "@/components/mission/Telemetry";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/telemetry")({
  head: () => pageHead("Telemetry", "Visitors, signups, paying customers and what each one cost."),
  component: Telemetry,
});

function Telemetry() {
  return (
    <div>
      <PageHeader
        title="Telemetry"
        description="How the mission is doing: trends, the signup funnel and what each signup cost."
      />
      <TelemetryPage />
    </div>
  );
}
