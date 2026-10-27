#!/usr/bin/env node
// Replays signed test Stripe webhooks to the local stripe-webhook function, each twice, to show
// purchases are granted once (Phase 6). No Stripe account needed: events are signed with
// STRIPE_WEBHOOK_SECRET (default: the local-only value in supabase/functions/.env.example).
//
//   node scripts/dev/replay-stripe-webhooks.mjs [company_id]
//
// To replay real test-mode events instead, use the Stripe CLI (docs/HANDOFF.md 5):
//   stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
//   stripe events resend evt_...
import { createHmac } from "node:crypto";

const url = process.env.WEBHOOK_URL ?? "http://127.0.0.1:54321/functions/v1/stripe-webhook";
const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_local_test_only";
const company = process.argv[2] ?? "c0000000-0000-4000-8000-000000000001";
const run = Date.now().toString(36);
const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;

const events = [
  {
    id: `evt_topup_${run}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_topup_${run}`,
        mode: "payment",
        payment_status: "paid",
        customer: `cus_test_${run}`,
        client_reference_id: company,
        metadata: { company_id: company, product: "topup_t25" },
      },
    },
  },
  {
    id: `evt_sub_${run}`,
    type: "customer.subscription.created",
    data: {
      object: {
        id: `sub_test_${run}`,
        customer: `cus_test_${run}`,
        status: "active",
        cancel_at_period_end: false,
        metadata: { company_id: company, product: "plan_founder" },
        items: { data: [{ price: { id: "price_unknown" }, current_period_end: periodEnd }] },
      },
    },
  },
  {
    id: `evt_invoice_${run}`,
    type: "invoice.paid",
    data: {
      object: {
        id: `in_test_${run}`,
        subscription_details: { metadata: { company_id: company, product: "plan_founder" } },
        lines: { data: [{ period: { end: periodEnd }, price: { id: "price_unknown" } }] },
      },
    },
  },
];

let failed = false;
for (const event of events)
  for (const attempt of [1, 2]) {
    const payload = JSON.stringify(event);
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${t},v1=${sig}` },
      body: payload,
    });
    const body = await res.json().catch(() => ({}));
    const expected = attempt === 1 ? "applied" : "duplicate";
    const ok = res.ok && body.result === expected;
    failed ||= !ok;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${event.type} (attempt ${attempt}): ${res.status} ${body.result ?? body.error}`,
    );
  }
process.exit(failed ? 1 : 0);
