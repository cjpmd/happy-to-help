import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { pageHead } from "@/lib/seo";

// A short link served by the app (the demo, or when no short domain is set up). The link Edge
// Function does the same with a real redirect.
export const Route = createFileRoute("/l/$code")({
  head: () => pageHead("Redirecting", "Taking you to the page."),
  component: ShortLink,
});

function ShortLink() {
  const { code } = Route.useParams();
  const { followLink } = useStore();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    void followLink(code).then((to) => {
      if (!to) setMissing(true);
      else window.location.replace(to);
    });
  }, [code, followLink]);
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-sm text-muted-foreground" role="status">
      {missing ? "This link doesn't exist or has been switched off." : "Taking you there…"}
    </main>
  );
}
