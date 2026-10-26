import { describe, expect, it } from "vitest";
import {
  billingActions,
  checkStripeKey,
  checkoutForm,
  signStripePayload,
  verifyStripeSignature,
  type Product,
} from "../../supabase/functions/_shared/billing";

const catalogue: Product[] = [
  {
    product: "plan_founder",
    kind: "plan",
    plan: "founder",
    credits: 5000,
    stripe_price_id: "price_founder",
  },
  { product: "topup_t25", kind: "topup", plan: null, credits: 1300, stripe_price_id: "price_t25" },
];
const C = "c0000000-0000-4000-8000-000000000001";

describe("Stripe keys", () => {
  it("refuses live keys unless explicitly allowed", () => {
    expect(checkStripeKey(undefined)).toMatch(/aren't set up/);
    expect(checkStripeKey("sk_live_abc")).toMatch(/Live Stripe keys/);
    expect(checkStripeKey("sk_live_abc", true)).toBeNull();
    expect(checkStripeKey("sk_test_abc")).toBeNull();
    expect(checkStripeKey("pk_test_abc")).toMatch(/isn't a Stripe secret key/);
  });
});

describe("webhook signatures", () => {
  it("accepts Stripe's scheme and rejects tampering and old events", async () => {
    const payload = '{"id":"evt_1"}';
    const header = await signStripePayload(payload, "whsec_x", 1_000_000);
    expect(await verifyStripeSignature(payload, header, "whsec_x", 1_000_100)).toBe(true);
    expect(await verifyStripeSignature(payload + " ", header, "whsec_x", 1_000_100)).toBe(false);
    expect(await verifyStripeSignature(payload, header, "whsec_y", 1_000_100)).toBe(false);
    expect(await verifyStripeSignature(payload, header, "whsec_x", 1_000_400)).toBe(false);
    expect(await verifyStripeSignature(payload, null, "whsec_x", 1_000_100)).toBe(false);
    // Several v1 signatures (during secret rotation): any match is enough.
    expect(
      await verifyStripeSignature(payload, `${header},v1=deadbeef`, "whsec_x", 1_000_100),
    ).toBe(true);
  });
});

describe("events to actions", () => {
  it("grants a top-up when its checkout is paid", () => {
    expect(
      billingActions(
        {
          id: "evt_1",
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_1",
              mode: "payment",
              payment_status: "paid",
              customer: "cus_1",
              metadata: { company_id: C, product: "topup_t25" },
            },
          },
        },
        catalogue,
      ),
    ).toEqual([
      { kind: "customer", company_id: C, customer_id: "cus_1" },
      { kind: "grant", company_id: C, product: "topup_t25", key: "stripe:cs_1" },
    ]);
  });

  it("doesn't grant an unpaid checkout, or a subscription checkout (the invoice does)", () => {
    const unpaid = billingActions(
      {
        id: "e",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs",
            mode: "payment",
            payment_status: "unpaid",
            metadata: { company_id: C, product: "topup_t25" },
          },
        },
      },
      catalogue,
    );
    expect(unpaid).toEqual([]);
    const sub = billingActions(
      {
        id: "e",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs",
            mode: "subscription",
            payment_status: "paid",
            customer: "cus",
            metadata: { company_id: C, product: "plan_founder" },
          },
        },
      },
      catalogue,
    );
    expect(sub.map((a) => a.kind)).toEqual(["customer"]);
  });

  it("grants the plan's monthly credits on each paid invoice, expiring at the period end", () => {
    expect(
      billingActions(
        {
          id: "evt_2",
          type: "invoice.paid",
          data: {
            object: {
              id: "in_1",
              parent: { subscription_details: { metadata: { company_id: C } } },
              lines: {
                data: [
                  {
                    period: { end: 1_800_000_000 },
                    pricing: { price_details: { price: "price_founder" } },
                  },
                ],
              },
            },
          },
        },
        catalogue,
      ),
    ).toEqual([
      {
        kind: "grant",
        company_id: C,
        product: "plan_founder",
        key: "stripe:in_1",
        expires_at: new Date(1_800_000_000_000).toISOString(),
      },
    ]);
  });

  it("tracks the subscription, and marks a deleted one cancelled", () => {
    const [a] = billingActions(
      {
        id: "evt_3",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_1",
            customer: "cus_1",
            status: "active",
            metadata: { company_id: C },
            items: {
              data: [{ price: { id: "price_founder" }, current_period_end: 1_800_000_000 }],
            },
          },
        },
      },
      catalogue,
    );
    expect(a).toMatchObject({
      kind: "subscription",
      status: "canceled",
      product: "plan_founder",
      subscription_id: "sub_1",
    });
  });

  it("ignores events it doesn't need", () => {
    expect(
      billingActions({ id: "e", type: "charge.refunded", data: { object: {} } }, catalogue),
    ).toEqual([]);
  });
});

describe("checkout", () => {
  it("asks for a subscription for plans and a payment for top-ups, tagged with the company", () => {
    const plan = checkoutForm({
      product: catalogue[0]!,
      companyId: C,
      customerId: null,
      email: "a@b.example",
      origin: "https://app.example",
    });
    expect(plan.get("mode")).toBe("subscription");
    expect(plan.get("subscription_data[metadata][company_id]")).toBe(C);
    expect(plan.get("customer_email")).toBe("a@b.example");
    expect(plan.get("success_url")).toBe("https://app.example/billing?checkout=success");
    const topup = checkoutForm({
      product: catalogue[1]!,
      companyId: C,
      customerId: "cus_1",
      email: null,
      origin: "https://app.example",
    });
    expect(topup.get("mode")).toBe("payment");
    expect(topup.get("customer")).toBe("cus_1");
    expect(topup.get("line_items[0][price]")).toBe("price_t25");
    expect(topup.get("metadata[product]")).toBe("topup_t25");
  });
});
