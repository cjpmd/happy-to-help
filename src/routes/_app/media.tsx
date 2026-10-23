import { createFileRoute } from "@tanstack/react-router";
import { MediaPage } from "@/components/mission/WorkspacePages";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/_app/media")({
  head: () => pageHead("Media", "Generated company creative assets."),
  component: MediaPage,
});
