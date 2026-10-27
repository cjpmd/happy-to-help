// POST /functions/v1/stripe-webhook: Stripe's events (Phase 6). Checks the signature, turns
// the event into actions (_shared/billing.ts) and applies them once (apply_billing_event is
// idempotent on the event id; grants also carry their own idempotency key). Public: deployed
// with verify_jwt = false, so the signature is the only way in.
import { json, readBody, reportEdgeError, serviceClient } from "../_shared/http.ts";
import { billingActions, verifyStripeSignature, type Product } from "../_shared/billing.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhooks aren't set up" }, 503);
  const payload = await readBody(req);
  if (payload === null) return json({ error: "Too large" }, 413);
  const ok = await verifyStripeSignature(
    payload,
    req.headers.get("stripe-signature"),
    secret,
    Math.floor(Date.now() / 1000),
  );
  if (!ok) return json({ error: "Bad signature" }, 400);
  let event: {
    id: string;
    type: string;
    livemode?: boolean;
    data: { object: Record<string, unknown> };
  };
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }
  if (event.livemode && Deno.env.get("STRIPE_ALLOW_LIVE") !== "1")
    return json({ error: "Live events are switched off" }, 400);

  const admin = serviceClient();
  const { data: catalogue } = await admin
    .from("billing_products")
    .select("product, kind, plan, credits, stripe_price_id")
    .returns<Product[]>();
  const actions = billingActions(event, catalogue ?? []);
  const { data: result, error } = await admin.rpc("apply_billing_event", {
    p_event_id: event.id,
    p_type: event.type,
    p_actions: actions,
  });
  if (error) {
    await admin.rpc("fail_billing_event", {
      p_event_id: event.id,
      p_type: event.type,
      p_error: error.message,
    });
    // A 500 makes Stripe retry later.
    return json({ error: error.message }, 500);
  }
  return json({ received: true, result });
});
