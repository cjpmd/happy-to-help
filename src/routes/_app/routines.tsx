import { createFileRoute } from "@tanstack/react-router";
import { RoutinesPage } from "@/components/mission/WorkspacePages";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/_app/routines")({
  head: () => pageHead("Routines", "Scheduled work and monthly credit estimates."),
  component: RoutinesPage,
});
