// Billing calls from the app: Stripe Checkout and the Customer Portal, through the billing Edge
// Functions (Phase 6). Off unless the app runs live with VITE_BILLING_ENABLED=true; the server
// also refuses live Stripe keys, so this is test mode only until the owner says otherwise.
import { isLiveMode } from "@/integrations/supabase/client";
import { AgentError, functionUrl } from "./agentClient";
import { LAUNCH_PACK, PLANS, TOP_UPS } from "./credits";
import type { Plan } from "./types";

export const billingEnabled =
  isLiveMode && (import.meta.env["VITE_BILLING_ENABLED"] as string | undefined) === "true";

/** The billing_products key for each thing on sale. */
export const productKey = {
  plan: (p: Plan) => `plan_${p}`,
  topup: (id: (typeof TOP_UPS)[number]["id"]) => `topup_${id}`,
  launchPack: "launch_pack",
} as const;

/** Everything on sale, with the key the server knows it by (checked against the database). */
export function catalogue() {
  return [
    ...(Object.keys(PLANS) as Plan[]).map((p) => ({
      product: productKey.plan(p),
      price_gbp: PLANS[p].priceGbp,
      credits: PLANS[p].credits,
    })),
    ...TOP_UPS.map((t) => ({
      product: productKey.topup(t.id),
      price_gbp: t.priceGbp,
      credits: t.credits,
    })),
    {
      product: productKey.launchPack,
      price_gbp: LAUNCH_PACK.priceGbp,
      credits: LAUNCH_PACK.credits,
    },
  ];
}

async function post(name: string, body: unknown): Promise<string> {
  const { url, headers } = await functionUrl(name);
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new AgentError(data.error ?? "Billing isn't available right now");
  return data.url;
}

/** Resolves to the Stripe Checkout page (or, in mock mode, straight back to Billing). */
export const startCheckout = (companyId: string, product: string) =>
  post("billing-checkout", { company_id: companyId, product });

/** Resolves to the Stripe Customer Portal for changing plan or card. */
export const openPortal = (companyId: string) => post("billing-portal", { company_id: companyId });
