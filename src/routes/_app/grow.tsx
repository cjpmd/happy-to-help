import { createFileRoute } from "@tanstack/react-router";
import { RouteTabs } from "@/components/mission/RouteTabs";
import { AdsPage, MediaPage } from "@/components/mission/WorkspacePages";
import { LinksPage } from "@/components/mission/LinkLayer";
import { useStore, useEstimate } from "@/lib/store";
import { PageHeader, Panel, Pill, StatusPill } from "@/components/mission/primitives";
import { ClaimsCheck, CostButton, Why } from "@/components/mission/WorkControls";
import { pageHead } from "@/lib/seo";
import { fmtShortDate, num } from "@/lib/format";
import type { ApprovalOf, SocialPost } from "@/lib/types";

type GrowTab = "overview" | "media" | "ads" | "links";
const GROW_TABS: GrowTab[] = ["overview", "media", "ads", "links"];

export const Route = createFileRoute("/_app/grow")({
  head: () => pageHead("Grow", "Content calendar and results for every social channel."),
  // ?tab=media|ads|links; the overview has no param.
  validateSearch: (search: Record<string, unknown>): { tab?: Exclude<GrowTab, "overview"> } =>
    search["tab"] === "media" || search["tab"] === "ads" || search["tab"] === "links"
      ? { tab: search["tab"] }
      : {},
  component: Grow,
});

function Grow() {
  const { companyId, work } = useStore();
  const postCost = useEstimate("social");
  const { tab = "overview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div>
      <PageHeader
        title="Grow"
        description="Social posts across every channel, from draft to published."
        actions={
          <div>
            <CostButton
              label="Write post"
              cost={postCost}
              onConfirm={() => work(companyId, "Write social post", postCost, "social")}
            />
          </div>
        }
      />
      <RouteTabs<GrowTab>
        label="Grow"
        value={GROW_TABS.includes(tab) ? tab : "overview"}
        onValueChange={(t) =>
          void navigate({ search: t === "overview" ? {} : { tab: t }, replace: true })
        }
        tabs={[
          { value: "overview", label: "Posts", content: <GrowOverview /> },
          { value: "media", label: "Media", content: <MediaPage embedded /> },
          { value: "ads", label: "Ads", content: <AdsPage embedded /> },
          { value: "links", label: "Links & forms", content: <LinksPage /> },
        ]}
      />
    </div>
  );
}

const COLS: SocialPost["status"][] = ["draft", "awaiting_approval", "scheduled", "published"];

function GrowOverview() {
  const { companyId, db } = useStore();
  const posts = [
    ...db.social_posts.filter((p) => p.company_id === companyId),
    ...db.approvals
      .filter(
        (a): a is ApprovalOf<"publish_post"> =>
          a.company_id === companyId &&
          a.action_type === "publish_post" &&
          !db.social_posts.some((p) => p.text === a.payload.text),
      )
      .map((a) => ({
        id: a.id,
        company_id: companyId,
        channel: a.payload.channel,
        text: a.payload.text,
        angle: "Sol draft",
        status:
          a.status === "approved"
            ? ("published" as const)
            : a.status === "pending"
              ? ("awaiting_approval" as const)
              : ("draft" as const),
        scheduled_for: a.created_at,
        metrics: { clicks: 0, signups: 0 },
        media_id: a.payload.media_id,
      })),
  ];
  const published = posts.filter((p) => p.status === "published");
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((s) => {
          const list = posts.filter((p) => p.status === s);
          return (
            <div key={s} className="rounded-xl bg-muted/50 p-2">
              <div className="flex items-center justify-between px-2 py-1.5">
                <StatusPill status={s} />
                <span className="text-xs text-muted-foreground tabular">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.map((p) => (
                  <div key={p.id} className="rounded-lg border bg-card p-3 shadow-card">
                    <div className="flex items-center justify-between">
                      <Pill>{p.channel}</Pill>
                      <span className="text-xs text-muted-foreground">
                        {fmtShortDate(p.scheduled_for)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-snug">{p.text}</p>
                    <ClaimsCheck text={p.text} />
                    <Why reason="This post tests a specific message with your target audience. Previous post results and the company voice guide inform the draft." />
                    {"media_id" in p &&
                      typeof p.media_id === "string" &&
                      db.media.find((m) => m.id === p.media_id)?.url && (
                        <img
                          className="mt-3 aspect-[4/3] w-full rounded border object-cover"
                          src={db.media.find((m) => m.id === p.media_id)?.url}
                          alt="Post creative"
                        />
                      )}
                    <p className="mt-2 text-[11px] text-muted-foreground">{p.angle}</p>
                  </div>
                ))}
                {!list.length && (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Panel title="Results per post" className="mt-6" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">Post</th>
                <th className="px-4 py-2 font-medium">Channel</th>
                <th className="px-4 py-2 text-right font-medium">Clicks</th>
                <th className="px-4 py-2 text-right font-medium">Signups</th>
              </tr>
            </thead>
            <tbody>
              {published.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{p.text}</td>
                  <td className="px-4 py-3">{p.channel}</td>
                  <td className="px-4 py-3 text-right tabular">{num(p.metrics.clicks)}</td>
                  <td className="px-4 py-3 text-right tabular">{num(p.metrics.signups)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
