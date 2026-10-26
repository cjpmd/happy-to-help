import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved in 1a-design: kept so old links and bookmarks still work.
export const Route = createFileRoute("/_app/ads")({
  beforeLoad: () => {
    throw redirect({ to: "/grow", search: { tab: "ads" }, replace: true });
  },
});
