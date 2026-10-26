// Visitor analytics on public pages (Phase 7): PostHog's capture API, only after the visitor
// allows it (the cookie banner), and only when VITE_POSTHOG_KEY is set. Events carry the
// company id so the agent service's daily sync can count each company's visitors and signups.
import { analyticsAllowed } from "@/components/mission/LinkLayer";

const KEY = import.meta.env["VITE_POSTHOG_KEY"] as string | undefined;
const HOST =
  (import.meta.env["VITE_POSTHOG_HOST"] as string | undefined) ?? "https://eu.i.posthog.com";

/** A random id for this visit, kept for the session only (after consent). */
function visitorId() {
  try {
    let id = sessionStorage.getItem("gumption-visitor");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("gumption-visitor", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Sends one event if the visitor allowed analytics. Never throws. */
export function track(event: "$pageview" | "signed_up", props: Record<string, string>) {
  if (!KEY || typeof window === "undefined" || !analyticsAllowed()) return false;
  void fetch(`${HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: KEY,
      event,
      distinct_id: visitorId(),
      properties: { ...props, $current_url: window.location.href },
    }),
    keepalive: true,
  }).catch(() => {});
  return true;
}
