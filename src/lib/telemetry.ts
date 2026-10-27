// Telemetry page maths (docs/STATUS.md, step 5 decisions). Pure functions, tested in
// src/test/telemetry.test.ts.
import { ACTION_COSTS, PLANS } from "./credits";
import type { Approval, Company, MetricsDaily, SocialPost } from "./types";
import type { AdAccount } from "./workspace";

export type TrendKey = "visitors" | "signups" | "paying_customers" | "mrr";

export interface Trend {
  key: TrendKey;
  label: string;
  points: { date: string; value: number }[];
  total: number;
  /** Total for sums (visitors, signups); latest value for levels (paying, MRR). */
  kind: "sum" | "level";
}

const TRENDS: { key: TrendKey; label: string; kind: Trend["kind"] }[] = [
  { key: "visitors", label: "Visitors", kind: "sum" },
  { key: "signups", label: "Signups", kind: "sum" },
  { key: "paying_customers", label: "Paying customers", kind: "level" },
  { key: "mrr", label: "MRR", kind: "level" },
];

/** The last `days` days of each metric for one company, oldest first. */
export function trends(metrics: MetricsDaily[], companyId: string, days: number): Trend[] {
  const rows = metrics
    .filter((m) => m.company_id === companyId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
  return TRENDS.map(({ key, label, kind }) => {
    const points = rows.map((r) => ({ date: r.date, value: r[key] }));
    const total =
      kind === "sum" ? points.reduce((n, p) => n + p.value, 0) : (points.at(-1)?.value ?? 0);
    return { key, label, kind, points, total };
  });
}

export interface FunnelStep {
  label: string;
  value: number;
  /** Share of the previous step, as a whole percentage; null for the first. */
  conversion: number | null;
  /** Shown as sample data until the company defines activation. */
  sample?: boolean;
}

/** Visitors → signups → activated → paying over the period. */
export function funnel(
  metrics: MetricsDaily[],
  companyId: string,
  days: number,
  activationDefined: boolean,
): FunnelStep[] {
  const rows = metrics
    .filter((m) => m.company_id === companyId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
  const visitors = rows.reduce((n, r) => n + r.visitors, 0);
  const signups = rows.reduce((n, r) => n + r.signups, 0);
  const activated = rows.reduce((n, r) => n + (r.activated ?? 0), 0);
  const paying = rows.at(-1)?.paying_customers ?? 0;
  const steps: Omit<FunnelStep, "conversion">[] = [
    { label: "Visitors", value: visitors },
    { label: "Signups", value: signups },
    { label: "Activated", value: activated, sample: !activationDefined },
    { label: "Paying", value: paying },
  ];
  return steps.map((s, i) => {
    const prev = steps[i - 1]?.value;
    return {
      ...s,
      conversion: i === 0 || !prev ? null : Math.round((s.value / prev) * 100),
    };
  });
}

/** What one credit is worth to this founder: their plan price ÷ plan credits, in pence. */
export function pencePerCredit(plan: Company["plan"]) {
  return (PLANS[plan].priceGbp * 100) / PLANS[plan].credits;
}

export interface ChannelCost {
  channel: string;
  signups: number;
  adSpendGbp: number;
  credits: number;
  /** £ of ad spend per signup, null with no signups. */
  adPerSignup: number | null;
  creditsPerSignup: number | null;
  /** Ad spend plus credits valued at the plan's price per credit, per signup. */
  allInPerSignup: number | null;
}

/**
 * Cost per signup by channel. Organic channels: signups from published posts' results, and
 * the standard cost of writing each post. Meta ads: spend and signups from the ad account, credits from
 * approved ad changes.
 */
export function costPerSignup(
  company: Pick<Company, "id" | "plan">,
  posts: SocialPost[],
  approvals: Approval[],
  ad: Pick<AdAccount, "status" | "spend" | "signups"> | undefined,
): ChannelCost[] {
  const ppc = pencePerCredit(company.plan) / 100;
  const rows = new Map<string, { signups: number; adSpendGbp: number; credits: number }>();
  const row = (channel: string) => {
    let r = rows.get(channel);
    if (!r) rows.set(channel, (r = { signups: 0, adSpendGbp: 0, credits: 0 }));
    return r;
  };
  for (const p of posts.filter((p) => p.company_id === company.id && p.status === "published")) {
    row(p.channel).signups += p.metrics.signups;
    row(p.channel).credits += ACTION_COSTS.social;
  }
  for (const a of approvals.filter((a) => a.company_id === company.id && a.status === "approved")) {
    if (a.action_type === "ad_spend") row("Meta ads").credits += a.estimated_credits;
  }
  if (ad && ad.status !== "not_connected" && (ad.spend > 0 || ad.signups > 0)) {
    const r = row("Meta ads");
    r.signups += ad.signups;
    r.adSpendGbp += ad.spend;
  }
  return [...rows.entries()]
    .map(([channel, r]) => {
      const per = (v: number) => (r.signups ? v / r.signups : null);
      return {
        channel,
        ...r,
        adPerSignup: per(r.adSpendGbp),
        creditsPerSignup: per(r.credits),
        allInPerSignup: per(r.adSpendGbp + r.credits * ppc),
      };
    })
    .sort((a, b) => b.signups - a.signups);
}
