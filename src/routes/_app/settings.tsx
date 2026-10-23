import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/mission/WorkspacePages";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/_app/settings")({
  head: () =>
    pageHead("Settings", "Learning preferences, escalation thresholds and messaging channels."),
  component: SettingsPage,
});
