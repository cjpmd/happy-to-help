import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { CookieBanner, LeadFormView } from "@/components/mission/LinkLayer";
import { BrandLogo } from "@/components/mission/primitives";
import { useStore } from "@/lib/store";
import type { PublicHub } from "@/lib/links";
import { pageHead } from "@/lib/seo";

// A company's public hub page (link-in-bio): who they are, their links and a contact form.
export const Route = createFileRoute("/h/$slug")({
  // ?l= is the tracked link a visitor came through, so a lead is attributed without cookies.
  validateSearch: (s: Record<string, unknown>): { l?: string } =>
    typeof s["l"] === "string" && /^[A-Za-z0-9]{6,12}$/.test(s["l"]) ? { l: s["l"] } : {},
  head: ({ params }) => pageHead(params.slug, "Links, news and a way to get in touch."),
  component: Hub,
});

function Hub() {
  const { slug } = Route.useParams();
  const { l } = Route.useSearch();
  const { fetchHub } = useStore();
  const [hub, setHub] = useState<PublicHub | null | undefined>(undefined);
  useEffect(() => {
    void fetchHub(slug).then(setHub);
  }, [slug, fetchHub]);
  if (hub === undefined) return <main className="min-h-screen bg-background" aria-busy="true" />;
  if (!hub)
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-muted-foreground">This page doesn't exist or isn't public yet.</p>
      </main>
    );
  const socials = Object.entries(hub.socials).filter(([, v]) => v);
  return (
    <main className="mx-auto min-h-screen max-w-md bg-background px-4 py-10">
      <h1 className="text-3xl font-semibold">{hub.headline || hub.name}</h1>
      {hub.bio && <p className="mt-3 text-muted-foreground">{hub.bio}</p>}
      <ul className="mt-6 space-y-2">
        {hub.links.map((x) => (
          <li key={x.url}>
            <a
              href={x.url}
              className="flex items-center justify-between rounded-card border bg-card px-4 py-3 font-medium shadow-card hover:opacity-90"
              rel="noreferrer"
            >
              {x.label}
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          </li>
        ))}
        {hub.website && (
          <li>
            <a
              href={hub.website}
              className="flex items-center justify-between rounded-card border bg-card px-4 py-3 font-medium shadow-card hover:opacity-90"
              rel="noreferrer"
            >
              Our website
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          </li>
        )}
      </ul>
      {socials.length > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {socials.map(([k, v]) => `${k[0]!.toUpperCase()}${k.slice(1)} ${v}`).join(" · ")}
        </p>
      )}
      {hub.form && (
        <div className="mt-8">
          <LeadFormView form={hub.form} linkCode={l} page={`/h/${hub.slug}`} />
        </div>
      )}
      <footer className="mt-10 flex justify-center opacity-60">
        <BrandLogo />
      </footer>
      <CookieBanner />
    </main>
  );
}
