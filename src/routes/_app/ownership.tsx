import { createFileRoute } from "@tanstack/react-router";
import { OwnershipPage } from "@/components/mission/WorkspacePages";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/_app/ownership")({
  head: () =>
    pageHead("Ownership", "Founder-owned accounts, exports and optional public progress."),
  component: OwnershipPage,
});
