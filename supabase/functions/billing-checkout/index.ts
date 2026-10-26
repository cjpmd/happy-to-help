// POST /functions/v1/billing-checkout { company_id, product }: a Stripe Checkout link for a
// plan, a top-up or the Launch Pack (Phase 6). Founders only. Test mode only: live keys are
// refused. With no Stripe key and BILLING_MOCK=1 it applies the purchase straight away, so the
// flow can be tried locally without Stripe.
import { caller, cors, json, serviceClient } from "../_shared/http.ts";
import {
  checkStripeKey,
  checkoutForm,
  type BillingAction,
  type Product,
} from "../_shared/billing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const who = await caller(req);
  if (!who) return json({ error: "Sign in first" }, 401);
  let body: { company_id?: string; product?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Send a JSON body" }, 400);
  }
  if (!body.company_id || !body.product)
    return json({ error: "company_id and product are required" }, 400);

  const { data: member } = await who.sb
    .from("company_members")
    .select("role")
    .eq("company_id", body.company_id)
    .eq("user_id", who.user.id)
    .maybeSingle();
  if (member?.role !== "founder")
    return json({ error: "Only a founder can buy plans and credits" }, 403);

  const admin = serviceClient();
  const { data: product } = await admin
    .from("billing_products")
    .select("product, kind, plan, credits, stripe_price_id")
    .eq("product", body.product)
    .eq("active", true)
    .maybeSingle<Product>();
  if (!product) return json({ error: "Unknown product" }, 400);
  const origin = Deno.env.get("APP_URL") ?? req.headers.get("origin") ?? "http://127.0.0.1:8080";

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const problem = checkStripeKey(key, Deno.env.get("STRIPE_ALLOW_LIVE") === "1");
  if (problem) {
    if (!key && Deno.env.get("BILLING_MOCK") === "1") {
      // Mock checkout: the purchase is applied as if Stripe had confirmed it.
      const eventId = `mock_${crypto.randomUUID()}`;
      const actions: BillingAction[] =
        product.kind === "plan"
          ? [
              {
                kind: "subscription",
                company_id: body.company_id,
                subscription_id: `sub_mock_${body.company_id}`,
                customer_id: `cus_mock_${body.company_id}`,
                status: "active",
                product: product.product,
                current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
              },
              {
                kind: "grant",
                company_id: body.company_id,
                product: product.product,
                key: eventId,
              },
            ]
          : [
              {
                kind: "grant",
                company_id: body.company_id,
                product: product.product,
                key: eventId,
              },
            ];
      const { error } = await admin.rpc("apply_billing_event", {
        p_event_id: eventId,
        p_type: "mock.checkout",
        p_actions: actions,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ url: `${origin}/billing?checkout=success&mock=1`, mock: true });
    }
    return json({ error: problem }, 503);
  }
  if (!product.stripe_price_id)
    return json({ error: "This product isn't set up in Stripe yet" }, 503);

  const { data: customer } = await admin
    .from("stripe_customers")
    .select("customer_id")
    .eq("company_id", body.company_id)
    .maybeSingle();
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: checkoutForm({
      product,
      companyId: body.company_id,
      customerId: customer?.customer_id ?? null,
      email: who.user.email ?? null,
      origin,
    }),
  });
  const session = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !session.url)
    return json({ error: session.error?.message ?? "Stripe refused the checkout" }, 502);
  return json({ url: session.url });
});
