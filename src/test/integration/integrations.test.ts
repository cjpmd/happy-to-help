import { describe, expect, it } from "vitest";
import { svixSignature } from "../../../supabase/functions/_shared/svix";
import { unsubscribeUrl } from "../../../supabase/functions/_shared/unsubscribe";
import { adminClient, localStack } from "./local";

// Needs `npx supabase functions serve` with supabase/functions/.env from .env.example.
const HARBOUR = "c0000000-0000-4000-8000-000000000005";
const RESEND_SECRET = "whsec_bG9jYWwtb25seS1yZXNlbmQtc2VjcmV0";

async function inbound(event: object, secret = RESEND_SECRET) {
  const body = JSON.stringify(event);
  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const ts = Math.floor(Date.now() / 1000);
  return fetch(`${localStack().API_URL}/functions/v1/resend-inbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(ts),
      "svix-signature": await svixSignature(secret, id, ts, body),
    },
    body,
  });
}

describe("inbound email", () => {
  it("files an email to the company's address in its inbox", async () => {
    const res = await inbound({
      type: "email.received",
      data: {
        email_id: `em_${Date.now()}`,
        from: "Priya Shah <priya.shah@example.com>",
        to: ["harbour-bakes@in.gumption.test"],
        subject: "Sourdough subscription?",
        text: "Do you deliver weekly?",
      },
    });
    expect(res.status).toBe(200);
    const { data: thread } = await adminClient()
      .from("email_threads")
      .select("id, contact_name, email_messages(body, direction)")
      .eq("company_id", HARBOUR)
      .eq("address", "priya.shah@example.com")
      .single();
    expect(thread!.contact_name).toBe("Priya Shah");
    expect(thread!.email_messages).toEqual([
      { body: "Do you deliver weekly?", direction: "received" },
    ]);
  });

  it("ignores mail for unknown addresses and refuses forged events", async () => {
    const other = await inbound({
      type: "email.received",
      data: { email_id: "em_x", from: "a@b.example", to: ["nobody@in.gumption.test"], text: "Hi" },
    });
    expect(((await other.json()) as { ignored?: string }).ignored).toBe("unknown company");
    const forged = await inbound({ type: "email.received", data: {} }, "whsec_b3RoZXI=");
    expect(forged.status).toBe(400);
  });
});

describe("unsubscribe", () => {
  it("a signed link opts the person out at once; a tampered one does nothing", async () => {
    const good = await unsubscribeUrl(
      localStack().API_URL,
      "local-only-unsubscribe-secret",
      HARBOUR,
      "lucy.moore@example.com",
    );
    const res = await fetch(good);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("You&#39;re unsubscribed"); // HTML-escaped
    const admin = adminClient();
    const { data: lucy } = await admin
      .from("contacts")
      .select("id")
      .eq("company_id", HARBOUR)
      .eq("email", "lucy.moore@example.com")
      .single();
    const { data: consent } = await admin
      .from("current_consents")
      .select("status")
      .eq("contact_id", lucy!.id)
      .eq("purpose", "marketing")
      .single();
    expect(consent!.status).toBe("withdrawn");
    const bad = await fetch(good.replace("lucy.moore", "sarah.patel"));
    expect(bad.status).toBe(400);
  });
});
