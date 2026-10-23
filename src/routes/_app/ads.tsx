import { createFileRoute } from "@tanstack/react-router";
import { AdsPage } from "@/components/mission/WorkspacePages";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/_app/ads")({
  head: () => pageHead("Ads", "Capped advertising budgets and acquisition results."),
  component: AdsPage,
});
