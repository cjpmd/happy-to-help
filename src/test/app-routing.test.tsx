import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  // Pages moved in 1a-design redirect, so old links and bookmarks still work.
  it.each([
    ["/evidence", "/flight-plan", { tab: "evidence" }],
    ["/routines", "/activity", { tab: "scheduled" }],
    ["/email", "/run", { tab: "email" }],
    ["/documents", "/run", { tab: "documents" }],
    ["/media", "/grow", { tab: "media" }],
    ["/ads", "/grow", { tab: "ads" }],
  ])("redirects %s to %s", async (from, to, search) => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [from] }),
      context: { queryClient: new QueryClient() },
    });
    await router.load();
    expect(router.state.location.pathname).toBe(to);
    expect(router.state.location.search).toEqual(search);
  });
});
