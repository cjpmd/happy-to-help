// Stripe billing logic shared by the billing Edge Functions, free of Deno and network calls so
// vitest can test it (src/test/billing.test.ts). Stripe is called with plain fetch and form
// encoding; webhook signatures are checked with WebCrypto.

export interface Product {
  product: string;
  kind: "plan" | "topup" | "launch_pack";
  plan: string | null;
  credits: number;
  stripe_price_id: string | null;
}

export type BillingAction =
  | {
      kind: "grant";
      company_id: string;
      product: string;
      key: string;
      expires_at?: string;
      note?: string;
    }
  | {
      kind: "subscription";
      company_id: string;
      subscription_id: string;
      customer_id: string;
      status: string;
      product?: string;
      current_period_end?: string;
      cancel_at_period_end?: boolean;
    }
  | { kind: "customer"; company_id: string; customer_id: string };

/** Test mode only (AUTONOMOUS-RUN hard limit): live keys are refused unless explicitly allowed. */
export function checkStripeKey(key: string | undefined, allowLive = false): string | null {
  if (!key) return "Payments aren't set up yet";
  if (key.startsWith("sk_live_") && !allowLive) return "Live Stripe keys are switched off";
  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_") && !key.startsWith("rk_"))
    return "That isn't a Stripe secret key";
  return null;
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

/** A Stripe-Signature header for a payload (for tests and the replay script). */
export async function signStripePayload(payload: string, secret: string, timestamp: number) {
  return `t=${timestamp},v1=${await hmac(secret, `${timestamp}.${payload}`)}`;
}

/**
 * Checks a Stripe-Signature header: any v1 signature must match HMAC-SHA256 of
 * "{t}.{payload}" with the endpoint secret, and t must be within the tolerance.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSeconds - t) > toleranceSeconds)
    return false;
  const expected = await hmac(secret, `${t}.${payload}`);
  // Compare in constant time.
  return sigs.some(
    (s) =>
      s.length === expected.length &&
      [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0,
  );
}

// The parts of Stripe objects we read. Stripe sends much more.
interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const iso = (unix: unknown) =>
  typeof unix === "number" ? new Date(unix * 1000).toISOString() : undefined;

function productFor(catalogue: Product[], priceId: string | undefined, named: string | undefined) {
  return (
    catalogue.find((p) => priceId && p.stripe_price_id === priceId) ??
    catalogue.find((p) => named && p.product === named)
  );
}

/** What a Stripe event means for us. An empty list means it's ignored. */
export function billingActions(event: StripeEvent, catalogue: Product[]): BillingAction[] {
  const o = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      const meta = obj(o["metadata"]);
      const company = str(meta["company_id"]) ?? str(o["client_reference_id"]);
      if (!company) return [];
      const customer = str(o["customer"]);
      const actions: BillingAction[] = customer
        ? [{ kind: "customer", company_id: company, customer_id: customer }]
        : [];
      // One-off purchases are granted here; subscriptions on each paid invoice.
      if (o["mode"] === "payment" && o["payment_status"] === "paid") {
        const p = productFor(catalogue, undefined, str(meta["product"]));
        if (p && p.kind !== "plan")
          actions.push({
            kind: "grant",
            company_id: company,
            product: p.product,
            key: `stripe:${str(o["id"])}`,
          });
      }
      return actions;
    }
    case "invoice.paid": {
      const line = obj((obj(o["lines"])["data"] as unknown[] | undefined)?.[0]);
      const meta = {
        ...obj(obj(obj(o["parent"])["subscription_details"])["metadata"]),
        ...obj(obj(o["subscription_details"])["metadata"]),
        ...obj(line["metadata"]),
      };
      const company = str(meta["company_id"]);
      const priceId =
        str(obj(line["price"])["id"]) ?? str(obj(obj(line["pricing"])["price_details"])["price"]);
      const p = productFor(catalogue, priceId, str(meta["product"]));
      if (!company || !p || p.kind !== "plan") return [];
      const end = iso(obj(line["period"])["end"]);
      return [
        {
          kind: "grant",
          company_id: company,
          product: p.product,
          key: `stripe:${str(o["id"])}`,
          ...(end ? { expires_at: end } : {}),
        },
      ];
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const company = str(obj(o["metadata"])["company_id"]);
      const item = obj((obj(o["items"])["data"] as unknown[] | undefined)?.[0]);
      const p = productFor(
        catalogue,
        str(obj(item["price"])["id"]),
        str(obj(o["metadata"])["product"]),
      );
      const end = iso(item["current_period_end"] ?? o["current_period_end"]);
      if (!company || !str(o["id"])) return [];
      return [
        {
          kind: "subscription",
          company_id: company,
          subscription_id: str(o["id"])!,
          customer_id: str(o["customer"]) ?? "",
          status:
            event.type === "customer.subscription.deleted"
              ? "canceled"
              : (str(o["status"]) ?? "unknown"),
          ...(p ? { product: p.product } : {}),
          ...(end ? { current_period_end: end } : {}),
          cancel_at_period_end: o["cancel_at_period_end"] === true,
        },
      ];
    }
    default:
      return [];
  }
}

/** The Checkout Session request for a product (Stripe's form encoding). */
export function checkoutForm(opts: {
  product: Product;
  companyId: string;
  customerId: string | null;
  email: string | null;
  origin: string;
}): URLSearchParams {
  const { product, companyId, customerId, email, origin } = opts;
  const f = new URLSearchParams();
  const plan = product.kind === "plan";
  f.set("mode", plan ? "subscription" : "payment");
  f.set("line_items[0][price]", product.stripe_price_id ?? "");
  f.set("line_items[0][quantity]", "1");
  f.set("success_url", `${origin}/billing?checkout=success`);
  f.set("cancel_url", `${origin}/billing?checkout=cancelled`);
  f.set("client_reference_id", companyId);
  f.set("metadata[company_id]", companyId);
  f.set("metadata[product]", product.product);
  if (plan) {
    f.set("subscription_data[metadata][company_id]", companyId);
    f.set("subscription_data[metadata][product]", product.product);
  }
  if (customerId) f.set("customer", customerId);
  else if (email) {
    f.set("customer_email", email);
    if (!plan) f.set("customer_creation", "always");
  }
  f.set("allow_promotion_codes", "true");
  return f;
}
