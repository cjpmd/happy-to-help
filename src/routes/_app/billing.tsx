import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Rocket } from "lucide-react";
import { useStore, useCompany, useBalance, useCompanyRole } from "@/lib/store";
import { billingEnabled, openPortal, productKey, startCheckout } from "@/lib/billingClient";
import { PLANS, TOP_UPS, LAUNCH_PACK, isLowBalance } from "@/lib/credits";
import { PageHeader, Panel, Pill, humanise } from "@/components/mission/primitives";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { pageHead } from "@/lib/seo";
import { fmtDate, gbp, num } from "@/lib/format";
import type { Plan, LedgerType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCreditSummary } from "@/lib/useCreditSummary";

export const Route = createFileRoute("/_app/billing")({
  head: () =>
    pageHead("Billing & credits", "Your plan, credit balance, top-ups and full credit ledger."),
  // ?checkout=success|cancelled when Stripe sends the founder back.
  validateSearch: (s: Record<string, unknown>): { checkout?: "success" | "cancelled" } =>
    s["checkout"] === "success" || s["checkout"] === "cancelled" ? { checkout: s["checkout"] } : {},
  component: Billing,
});

const ledgerTone: Record<LedgerType, "success" | "info" | "warning" | "neutral" | "destructive"> = {
  grant: "success",
  topup: "success",
  refund: "success",
  release: "info",
  hold: "warning",
  usage: "neutral",
  expiry: "destructive",
};
const soon = () =>
  toast("Payments are coming soon", {
    description: "Stripe checkout will be connected in a later release.",
  });

/** Opens Stripe Checkout (test mode) when billing is on; otherwise says it's coming. */
function useBuy(companyId: string) {
  const founder = useCompanyRole(companyId) === "founder";
  return (product: string) => {
    if (!billingEnabled) {
      soon();
      return;
    }
    if (!founder) {
      toast.error("Only a founder can buy plans and credits");
      return;
    }
    void startCheckout(companyId, product)
      .then((url) => window.location.assign(url))
      .catch((e: Error) => toast.error(e.message));
  };
}

function Billing() {
  const { db, companyId } = useStore();
  const company = useCompany();
  const balance = useBalance();
  const plan = PLANS[company.plan];
  const ledger = db.credit_ledger
    .filter((l) => l.company_id === companyId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pct = Math.min(100, Math.round((balance / plan.credits) * 100));
  const summary = useCreditSummary(companyId);
  const buy = useBuy(companyId);
  const subscription = db.subscriptions.find((x) => x.company_id === companyId);
  const { checkout } = Route.useSearch();
  const navigate = Route.useNavigate();
  useEffect(() => {
    if (!checkout) return;
    if (checkout === "success")
      toast.success("Payment received. Your credits will appear in a moment.");
    else toast("Checkout cancelled. Nothing was charged.");
    void navigate({ search: {}, replace: true });
  }, [checkout, navigate]);
  return (
    <div>
      <PageHeader
        title="Billing & credits"
        description={
          billingEnabled
            ? "Credits pay for Sol's work. Failed runs are always refunded. Payments are in Stripe test mode."
            : "Credits pay for Sol's work. Failed runs are always refunded."
        }
      />
      {isLowBalance(balance, company.plan) && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          Your balance is below 20% of your monthly allowance. Top up to keep Sol working overnight.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Credit balance" className="lg:col-span-1">
          <p className="text-4xl font-semibold tracking-tight tabular">{num(balance)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan.name} plan · {num(plan.credits)} credits/month
          </p>
          {subscription && subscription.current_period_end && (
            <p className="mt-1 text-xs text-muted-foreground">
              {subscription.status === "canceled"
                ? "Subscription cancelled"
                : subscription.cancel_at_period_end
                  ? `Ends on ${fmtDate(subscription.current_period_end)}`
                  : `Renews on ${fmtDate(subscription.current_period_end)}`}
            </p>
          )}
          {billingEnabled && subscription && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() =>
                void openPortal(companyId)
                  .then((url) => window.location.assign(url))
                  .catch((e: Error) => toast.error(e.message))
              }
            >
              Manage billing
            </Button>
          )}
          <Progress value={pct} className="mt-4 h-1.5" />
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Plan credits</dt>
            <dd className="text-right tabular">{num(summary.plan)}</dd>
            {summary.cohort + summary.cohort_headroom > 0 && (
              <>
                <dt className="text-muted-foreground">Cohort credits</dt>
                <dd className="text-right tabular">
                  {num(summary.cohort)}
                  {summary.cohort_headroom > 0 && ` (+${num(summary.cohort_headroom)} in pool)`}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Top-ups and Launch Pack</dt>
            <dd className="text-right tabular">{num(summary.topup)}</dd>
            {summary.held > 0 && (
              <>
                <dt className="text-muted-foreground">Held for running work</dt>
                <dd className="text-right tabular">{num(summary.held)}</dd>
              </>
            )}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Plan credits are used first and expire at the end of each month; top-ups last 12 months.
            {summary.next_expiry &&
              ` ${num(summary.next_expiry.credits)} credits expire on ${fmtDate(summary.next_expiry.at)}.`}
          </p>
        </Panel>
        <Panel title="Plans" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(PLANS) as Plan[]).map((k) => {
              const p = PLANS[k];
              const current = k === company.plan;
              return (
                <div
                  key={k}
                  className={cn(
                    "rounded-xl border p-4",
                    current && "border-primary bg-primary-soft",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{p.name}</p>
                    {current && <Pill tone="primary">Current</Pill>}
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular">
                    {gbp(p.priceGbp)}
                    <span className="text-sm font-normal text-muted-foreground"> /month</span>
                  </p>
                  <p className="text-sm text-muted-foreground tabular">{num(p.credits)} credits</p>
                  {!current && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full"
                      onClick={() => buy(productKey.plan(k))}
                    >
                      Switch
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Top up" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            {TOP_UPS.map((t) => (
              <button
                key={t.id}
                onClick={() => buy(productKey.topup(t.id))}
                className="rounded-xl border p-4 text-left transition-colors hover:border-primary hover:bg-primary-soft"
              >
                <p className="text-xl font-semibold tabular">{num(t.credits)}</p>
                <p className="text-sm text-muted-foreground">credits for {gbp(t.priceGbp)}</p>
              </button>
            ))}
          </div>
        </Panel>
        <Panel className="relative overflow-hidden">
          <Rocket className="h-5 w-5 text-primary" />
          <p className="mt-3 font-medium">Launch Pack</p>
          <p className="text-sm text-muted-foreground tabular">
            {num(LAUNCH_PACK.credits)} build credits for {gbp(LAUNCH_PACK.priceGbp)}
          </p>
          <Button className="mt-4 w-full" onClick={() => buy(productKey.launchPack)}>
            Buy Launch Pack
          </Button>
        </Panel>
        <Panel title="Credit ledger" className="lg:col-span-3" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                  <th className="px-4 py-2 font-medium">Run</th>
                  <th className="px-4 py-2 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {fmtDate(l.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={ledgerTone[l.entry_type]}>{humanise(l.entry_type)}</Pill>
                    </td>
                    <td className="px-4 py-3">{l.note}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {l.run_id ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-medium tabular",
                        l.amount > 0 ? "text-success" : "",
                      )}
                    >
                      {l.amount > 0 ? "+" : ""}
                      {num(l.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
