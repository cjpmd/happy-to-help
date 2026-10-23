import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/mission/primitives";
import { StageBar } from "@/components/mission/StageBar";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/flight-plan")({
  head: () =>
    pageHead("Flight plan", "Your roadmap: milestones, gates and the evidence behind them."),
  component: FlightPlan,
});

// Placeholder until 1a-design step 5 adds the large arc, gate detail and Evidence tab.
function FlightPlan() {
  const { companyId } = useStore();
  return (
    <div>
      <PageHeader
        title="Flight plan"
        description="Your milestones and stage gates, with the evidence behind each one."
      />
      <StageBar companyId={companyId} />
    </div>
  );
}
