import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/mission/primitives";
import { CrewRoster } from "@/components/mission/Crew";
import { useStore } from "@/lib/store";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/crew")({
  head: () => pageHead("Crew", "Sol and the crew doing the work, with what each has achieved."),
  component: Crew,
});

function Crew() {
  const { companyId } = useStore();
  return (
    <div>
      <PageHeader
        title="Crew"
        description="Sol leads a crew doing the work you'd otherwise hire for. You approve anything that matters."
      />
      <CrewRoster companyId={companyId} />
    </div>
  );
}
