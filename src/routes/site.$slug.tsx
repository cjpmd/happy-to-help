import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";

// Stand-in for each company's generated website, shown in the HQ preview frame.
export const Route = createFileRoute("/site/$slug")({
  validateSearch: (s: Record<string, unknown>) => ({ preview: s.preview ? 1 : undefined }),
  head: () => ({ meta: [{ title: "Company website" }, { name: "robots", content: "noindex" }] }),
  component: Site,
});

function Site() {
  const { slug } = Route.useParams();
  const { preview } = Route.useSearch();
  const { db } = useStore();
  const c = db.companies.find((x) => x.slug === slug);
  const name = c?.name ?? slug;
  return (
    <div className="min-h-screen bg-background">
      {preview && <div className="bg-warning-soft py-1.5 text-center text-xs font-medium text-warning">Preview — includes 1 change awaiting approval</div>}
      <nav className="flex items-center justify-between px-6 py-4">
        <span className="font-semibold">{name}</span>
        <span className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">Join the waitlist</span>
      </nav>
      <section className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">{c?.customer_type === "B2B" ? "For teams" : "Now in beta"}</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{c?.description.split(".")[0]}.</h1>
        <p className="mt-4 text-muted-foreground">{c?.description.split(".").slice(1).join(".").trim()}</p>
        <div className="mx-auto mt-8 flex max-w-sm gap-2">
          <div className="h-11 flex-1 rounded-lg border bg-card" />
          <div className="flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">Get early access</div>
        </div>
      </section>
      <section className="mx-auto grid max-w-4xl gap-4 px-6 pb-16 sm:grid-cols-3">
        {["10 minutes a day", "Learns your weak spots", preview ? "🔥 Daily streaks (new)" : "Built for SQA"].map((t) => (
          <div key={t} className="rounded-xl border bg-card p-5 text-sm font-medium shadow-card">{t}</div>
        ))}
      </section>
    </div>
  );
}
