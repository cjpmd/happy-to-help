import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved in 1a-design: kept so old links and bookmarks still work.
export const Route = createFileRoute("/_app/documents")({
  beforeLoad: () => {
    throw redirect({ to: "/run", search: { tab: "documents" }, replace: true });
  },
});
