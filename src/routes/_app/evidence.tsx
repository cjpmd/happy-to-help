import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved in 1a-design: kept so old links and bookmarks still work.
export const Route = createFileRoute("/_app/evidence")({
  beforeLoad: () => {
    throw redirect({ to: "/flight-plan", search: { tab: "evidence" }, replace: true });
  },
});
