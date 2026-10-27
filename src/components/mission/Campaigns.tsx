// Grow → Campaigns (Phase 15): ask Sol for a plan towards a goal, approve it, then approve each
// asset. Ads are exported for the founder to launch; results come from the campaign's links.
import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompanyRole, useEstimate, useStore } from "@/lib/store";
import { progress } from "@/lib/campaigns";
import { FLAGS } from "@/lib/flags";
import type { Campaign, CampaignAsset } from "@/lib/storeContext";
import { fmtDate, fmtShortDate } from "@/lib/format";
import { CostButton } from "./WorkControls";
import { Panel, Pill, StatusPill } from "./primitives";

const ACTIVE: Campaign["status"][] = ["proposed", "approved", "drafting", "ready"];
const KIND: Record<CampaignAsset["kind"], string> = {
  social_post: "Post",
  email: "Email",
  ad: "Ad to launch yourself",
};

function useResults(c: Campaign) {
  const { db } = useStore();
  const r = db.campaign_results.find((x) => x.campaign_id === c.id) ?? {
    clicks: 0,
    leads: 0,
    customers: 0,
  };
  return { ...r, ...progress(r, c.metric, c.target) };
}

export function CampaignsPage() {
  const { companyId, db, planCampaign } = useStore();
  const isFounder = useCompanyRole(companyId) === "founder";
  const cost = useEstimate("campaign");
  const [goal, setGoal] = useState("");
  const campaigns = db.campaigns.filter((c) => c.company_id === companyId);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (await planCampaign(companyId, goal)) setGoal("");
  };
  return (
    <div className="space-y-4">
      <Panel title="Plan a campaign">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => void submit(e)}>
          <Input
            aria-label="Campaign goal"
            placeholder="What should it achieve? e.g. 20 bookings for the spring menu"
            value={goal}
            maxLength={300}
            onChange={(e) => setGoal(e.target.value)}
          />
          <CostButton
            label="Ask Sol for a plan"
            cost={cost}
            disabled={!goal.trim() || !isFounder}
            onConfirm={() => submit()}
          />
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Sol proposes the audience, channels, dates and budget. Nothing is drafted until you give
          the plan a GO, and every post and email still comes to you before it goes out. Emails go
          only to people who opted in.
        </p>
      </Panel>
      {campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground">No campaigns yet.</p>
      ) : (
        campaigns.map((c) => <CampaignPanel key={c.id} c={c} canCancel={isFounder} />)
      )}
    </div>
  );
}

function CampaignPanel({ c, canCancel }: { c: Campaign; canCancel: boolean }) {
  const { db, cancelCampaign } = useStore();
  const r = useResults(c);
  const assets = db.campaign_assets.filter((a) => a.campaign_id === c.id);
  const active = ACTIVE.includes(c.status);
  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          {c.name} <StatusPill status={c.status} />
        </span>
      }
      action={
        active && canCancel ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void cancelCampaign(c.id).then((ok) => ok && toast.success("Campaign cancelled"))
            }
          >
            Cancel campaign
          </Button>
        ) : null
      }
    >
      <div className="space-y-3 text-sm">
        <p>{c.goal}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Dates</dt>
            <dd>
              {fmtShortDate(c.starts_on)} to {fmtDate(c.ends_on)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Channels</dt>
            <dd className="capitalize">{c.channels.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Audience</dt>
            <dd>{c.audience || "Not set"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Budget</dt>
            <dd>
              {c.budget_credits} credits
              {c.budget_gbp ? ` · £${c.budget_gbp} ad spend (yours)` : ""}
            </dd>
          </div>
        </dl>
        {c.plan.rationale ? <p className="text-muted-foreground">{c.plan.rationale}</p> : null}
        <div>
          <div className="flex justify-between text-xs">
            <span>
              {r.value} of {c.target} {c.metric}
            </span>
            <span className="text-muted-foreground tabular">
              {r.clicks} clicks · {r.leads} leads · {r.customers} customers
            </span>
          </div>
          <div
            className="mt-1 h-1.5 rounded-pill bg-muted"
            role="progressbar"
            aria-label={`${c.name} progress`}
            aria-valuenow={r.pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-pill bg-foreground" style={{ width: `${r.pct}%` }} />
          </div>
        </div>
        {c.status === "proposed" ? (
          <p className="text-xs">
            The plan is waiting for a GO in{" "}
            <Link to="/approvals" className="underline">
              Approvals
            </Link>
            .
          </p>
        ) : null}
        {assets.length ? (
          <ul className="divide-y rounded-card border">
            {assets.map((a) => (
              <li key={a.id} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Pill>{KIND[a.kind]}</Pill>
                  <span className="capitalize">{a.channel}</span>
                  {a.scheduled_for ? (
                    <span className="text-muted-foreground">{fmtShortDate(a.scheduled_for)}</span>
                  ) : null}
                  <StatusPill status={a.status} />
                </div>
                <p className="whitespace-pre-wrap">{a.body}</p>
                {a.kind === "ad" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void navigator.clipboard
                        ?.writeText(a.body)
                        .then(() => toast.success("Ad copy copied"))
                        .catch(() => toast.error("Couldn't copy. Select and copy it instead."))
                    }
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy ad copy
                  </Button>
                ) : null}
                {a.kind === "ad" && FLAGS.ads ? (
                  <LaunchAd assetId={a.id} companyId={a.company_id} />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}

/** The active campaign furthest along, for the HQ card. */
export function ActiveCampaignLine({ companyId }: { companyId: string }) {
  const { db } = useStore();
  const c = db.campaigns.find((x) => x.company_id === companyId && ACTIVE.includes(x.status));
  return c ? <CampaignProgress c={c} /> : null;
}

function CampaignProgress({ c }: { c: Campaign }) {
  const r = useResults(c);
  return (
    <p className="text-xs">
      <span className="font-medium">{c.name}</span>{" "}
      <span className="text-muted-foreground tabular">
        {r.value}/{c.target} {c.metric} ({r.pct}%)
      </span>
    </p>
  );
}

/** Phase 19 (behind VITE_ADS_ENABLED): launch a campaign's ad copy as a paid ad, for a GO. */
export function LaunchAd({ assetId, companyId }: { assetId: string; companyId: string }) {
  const { db, proposeAdLaunch } = useStore();
  const founder = useCompanyRole(companyId) === "founder";
  const [platform, setPlatform] = useState<"meta" | "google">("meta");
  const [budget, setBudget] = useState("5");
  const ad = db.ad_campaigns.find(
    (a) => a.campaign_asset_id === assetId && a.status !== "declined",
  );
  const cap = db.ads.find((a) => a.company_id === companyId)?.hard_cap ?? 50;
  if (ad)
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs">
        <StatusPill status={ad.status === "pending" ? "awaiting_approval" : ad.status} />
        {ad.platform === "meta" ? "Meta" : "Google"} · £{ad.daily_budget} a day · £{ad.spend} spent
      </p>
    );
  if (!founder) return null;
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <label className="space-y-1">
        <span className="block text-muted-foreground">Launch on</span>
        <select
          className="h-9 rounded-md border bg-background px-2"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as "meta" | "google")}
        >
          <option value="meta">Meta (Facebook, Instagram)</option>
          <option value="google">Google</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className="block text-muted-foreground">£ a day (cap £{cap})</span>
        <Input
          type="number"
          min={1}
          max={cap}
          className="w-24"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={!(Number(budget) > 0 && Number(budget) <= cap)}
        onClick={() => void proposeAdLaunch(assetId, platform, Number(budget))}
      >
        Launch for a GO
      </Button>
    </div>
  );
}
