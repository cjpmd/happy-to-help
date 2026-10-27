import { describe, expect, it } from "vitest";
import { signStripePayload } from "../../../supabase/functions/_shared/billing";
import { CALLUM, JAMIE, STUDYBUDDY, adminClient, clientAs, localStack } from "./local";

// Croft (Callum's company): the credits tests check StudyBuddy's balances, so billing grants
// go elsewhere.
const CROFT = "c0000000-0000-4000-8000-000000000004";

// Needs `npx supabase functions serve` with supabase/functions/.env from .env.example
// (BILLING_MOCK=1 and the local webhook secret).
const SECRET = "whsec_local_test_only";

async function checkout(email: string, product: string, company = CROFT) {
  const sb = await clientAs(email);
  const { data } = await sb.auth.getSession();
  const s = localStack();
  return fetch(`${s.API_URL}/functions/v1/billing-checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session!.access_token}`,
      apikey: s.PUBLISHABLE_KEY ?? s.ANON_KEY,
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:8080",
    },
    body: JSON.stringify({ company_id: company, product }),
  });
}

async function webhook(event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  return fetch(`${localStack().API_URL}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": await signStripePayload(payload, secret, Math.floor(Date.now() / 1000)),
    },
    body: payload,
  });
}

const balance = async () =>
  (
    (await adminClient().rpc("credit_summary", { p_company: CROFT })).data as {
      balance: number;
    }
  ).balance;

describe("billing", () => {
  it("a founder's mock checkout grants a top-up", async () => {
    const before = await balance();
    const res = await checkout(CALLUM, "topup_t25");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url).toBe(
      "http://127.0.0.1:8080/billing?checkout=success&mock=1",
    );
    expect((await balance()) - before).toBe(1300);
  });

  it("a teammate can't buy", async () => {
    const res = await checkout(JAMIE, "topup_t10", STUDYBUDDY);
    expect(res.status).toBe(403);
  });

  it("a paid invoice grants the plan's credits once, however often Stripe sends it", async () => {
    const id = `in_it_${Date.now()}`;
    const event = {
      id: `evt_${id}`,
      type: "invoice.paid",
      data: {
        object: {
          id,
          subscription_details: { metadata: { company_id: CROFT, product: "plan_growth" } },
          lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 86400 * 30 } }] },
        },
      },
    };
    const { data: was } = await adminClient()
      .from("companies")
      .select("plan")
      .eq("id", CROFT)
      .single();
    const before = await balance();
    const first = await webhook(event);
    expect(first.status).toBe(200);
    expect(((await first.json()) as { result: string }).result).toBe("applied");
    const again = await webhook(event);
    expect(((await again.json()) as { result: string }).result).toBe("duplicate");
    expect((await balance()) - before).toBe(12000);
    const { data: company } = await adminClient()
      .from("companies")
      .select("plan")
      .eq("id", CROFT)
      .single();
    expect(company!.plan).toBe("growth");
    await adminClient().from("companies").update({ plan: was!.plan }).eq("id", CROFT);
  });

  it("rejects an event with a bad signature", async () => {
    const res = await webhook(
      { id: "evt_forged", type: "invoice.paid", data: { object: {} } },
      "whsec_wrong",
    );
    expect(res.status).toBe(400);
  });
});
