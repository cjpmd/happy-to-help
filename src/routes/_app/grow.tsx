import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { social_posts } from "@/lib/seed";
import { PageHeader, Panel, Pill, StatusPill } from "@/components/dawn/primitives";
import { pageHead } from "@/lib/seo";
import { fmtShortDate, num } from "@/lib/format";
import type { SocialPost } from "@/lib/types";

export const Route = createFileRoute("/_app/grow")({
  head: () => pageHead("Grow", "Content calendar and results for every social channel."),
  component: Grow,
});

const COLS: SocialPost["status"][] = ["draft", "awaiting_approval", "scheduled", "published"];

function Grow() {
  const { companyId } = useStore();
  const posts = social_posts.filter((p) => p.company_id === companyId);
  const published = posts.filter((p) => p.status === "published");
  return (
    <div>
      <PageHeader title="Grow" description="Social posts across every channel, from draft to published." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((s) => {
          const list = posts.filter((p) => p.status === s);
          return (
            <div key={s} className="rounded-xl bg-muted/50 p-2">
              <div className="flex items-center justify-between px-2 py-1.5"><StatusPill status={s} /><span className="text-xs text-muted-foreground tabular">{list.length}</span></div>
              <div className="space-y-2">
                {list.map((p) => (
                  <div key={p.id} className="rounded-lg border bg-card p-3 shadow-card">
                    <div className="flex items-center justify-between"><Pill>{p.channel}</Pill><span className="text-xs text-muted-foreground">{fmtShortDate(p.scheduled_for)}</span></div>
                    <p className="mt-2 text-sm leading-snug">{p.text}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">{p.angle}</p>
                  </div>
                ))}
                {!list.length && <p className="px-2 py-4 text-center text-xs text-muted-foreground">Empty</p>}
              </div>
            </div>
          );
        })}
      </div>
      <Panel title="Results per post" className="mt-6" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="px-4 py-2 font-medium">Post</th><th className="px-4 py-2 font-medium">Channel</th><th className="px-4 py-2 text-right font-medium">Clicks</th><th className="px-4 py-2 text-right font-medium">Signups</th></tr></thead>
            <tbody>{published.map((p) => (
              <tr key={p.id} className="border-b last:border-0"><td className="px-4 py-3">{p.text}</td><td className="px-4 py-3">{p.channel}</td><td className="px-4 py-3 text-right tabular">{num(p.metrics.clicks)}</td><td className="px-4 py-3 text-right tabular">{num(p.metrics.signups)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
