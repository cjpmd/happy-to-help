// POST /functions/v1/billing-portal { company_id }: a Stripe Customer Portal link, where a
// founder changes plan, updates their card or cancels (Phase 6). Test mode only.
import { caller, cors, json, serviceClient } from "../_shared/http.ts";
import { checkStripeKey } from "../_shared/billing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const who = await caller(req);
  if (!who) return json({ error: "Sign in first" }, 401);
  const { company_id } = (await req.json().catch(() => ({}))) as { company_id?: string };
  if (!company_id) return json({ error: "company_id is required" }, 400);
  const { data: member } = await who.sb
    .from("company_members")
    .select("role")
    .eq("company_id", company_id)
    .eq("user_id", who.user.id)
    .maybeSingle();
  if (member?.role !== "founder") return json({ error: "Only a founder can manage billing" }, 403);

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const problem = checkStripeKey(key, Deno.env.get("STRIPE_ALLOW_LIVE") === "1");
  if (problem) return json({ error: problem }, 503);
  const { data: customer } = await serviceClient()
    .from("stripe_customers")
    .select("customer_id")
    .eq("company_id", company_id)
    .maybeSingle();
  if (!customer) return json({ error: "Buy a plan first; then you can manage it here" }, 400);
  const origin = Deno.env.get("APP_URL") ?? req.headers.get("origin") ?? "http://127.0.0.1:8080";
  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ customer: customer.customer_id, return_url: `${origin}/billing` }),
  });
  const session = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !session.url)
    return json({ error: session.error?.message ?? "Stripe refused" }, 502);
  return json({ url: session.url });
});
