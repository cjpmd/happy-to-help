import { beforeAll, describe, expect, it } from "vitest";
import { resendEmail } from "../src/integrations/resend.js";
import { ayrshareSocial, sumAnalytics } from "../src/integrations/ayrshare.js";
import { posthogDaily } from "../src/integrations/posthog.js";
import { providersFor, syncPostHog, syncSocialAnalytics } from "../src/integrations/index.js";
import { drainApprovals } from "../src/executor/executor.js";
import { mockProviders, type Providers, type SendEmailInput } from "../src/executor/providers.js";
import { checkUnsubscribeToken } from "../../supabase/functions/_shared/unsubscribe.js";
import { testDb } from "./local.js";

const db = testDb();
const HARBOUR = "c0000000-0000-4000-8000-000000000005";
const RORY = "a0000000-0000-4000-8000-000000000006";

/** A fake fetch that records requests and answers with the given JSON. */
function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("provider adapters", () => {
  it("Resend sends from the company's address with an idempotency key", async () => {
    const { f, calls } = fakeFetch({ id: "re_123" });
    const r = await resendEmail(
      "re_key",
      { from: "Harbour Bakes <harbour-bakes@mail.test>", replyTo: "rory@x.test" },
      f,
    ).send({
      companyId: HARBOUR,
      approvalId: "appr-1",
      to: ["a@b.test"],
      subject: "Hi",
      body: "Hello",
    });
    expect(r.messageIds).toEqual(["re_123"]);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({
      from: "Harbour Bakes <harbour-bakes@mail.test>",
      reply_to: "rory@x.test",
      text: "Hello",
    });
    expect((calls[0]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "appr-1:a@b.test",
    );
  });

  it("Resend failures throw so the executor refunds and retries", async () => {
    const { f } = fakeFetch({ message: "domain not verified" }, 422);
    await expect(
      resendEmail("re_key", { from: "x <x@y.test>" }, f).send({
        companyId: "c",
        approvalId: "a",
        to: ["a@b.test"],
        subject: "s",
        body: "b",
      }),
    ).rejects.toThrow(/domain not verified/);
  });

  it("Ayrshare publishes to the company's profile", async () => {
    const { f, calls } = fakeFetch({
      status: "success",
      id: "ay_1",
      postIds: [{ postUrl: "https://li.example/p/1" }],
    });
    const r = await ayrshareSocial("ay_key", "profile_key", f).publish({
      companyId: "c",
      approvalId: "a",
      channel: "LinkedIn",
      text: "Hello",
    });
    expect(r).toEqual({ externalId: "ay_1", url: "https://li.example/p/1", status: "published" });
    expect((calls[0]!.init.headers as Record<string, string>)["Profile-Key"]).toBe("profile_key");
    expect(JSON.parse(String(calls[0]!.init.body)).platforms).toEqual(["linkedin"]);
  });

  it("sums analytics across platforms, whatever the field names", () => {
    expect(
      sumAnalytics({
        linkedin: { analytics: { impressionCount: 120, likeCount: 7, clickCount: 3 } },
        twitter: { analytics: { impressions: 80, likes: 2 } },
      }),
    ).toEqual({ impressions: 200, likes: 9, clicks: 3 });
  });

  it("PostHog returns daily visitors and signups", async () => {
    const { f, calls } = fakeFetch({ results: [["2026-10-20", 31, 4]] });
    expect(
      await posthogDaily(
        { host: "https://eu.posthog.com", projectId: "1", apiKey: "phx" },
        "c",
        14,
        f,
      ),
    ).toEqual([{ date: "2026-10-20", visitors: 31, signups: 4 }]);
    expect(JSON.parse(String(calls[0]!.init.body)).query.values).toEqual({
      company: "c",
      days: 14,
    });
  });
});

describe("per-company switches", () => {
  beforeAll(async () => {
    await db.from("integration_settings").delete().eq("company_id", HARBOUR);
    await db.from("integration_secrets").delete().eq("company_id", HARBOUR);
  });
  it("stays on the mocks until the company switches a provider on and the platform has its key", async () => {
    const keys = {
      resend: { apiKey: "re_x", sendingDomain: "mail.test" },
      ayrshare: { apiKey: "ay_x" },
    };
    expect((await providersFor(db, {}, HARBOUR)).name).toBe("mock");
    expect((await providersFor(db, keys, HARBOUR)).name).toBe("mock");
    await db
      .from("integration_settings")
      .upsert({ company_id: HARBOUR, provider: "resend", enabled: true });
    expect((await providersFor(db, {}, HARBOUR)).name).toBe("mock");
    expect((await providersFor(db, keys, HARBOUR)).name).toBe("resend+mock");
    // Ayrshare also needs the company's profile key.
    await db
      .from("integration_settings")
      .upsert({ company_id: HARBOUR, provider: "ayrshare", enabled: true });
    expect((await providersFor(db, keys, HARBOUR)).name).toBe("resend+mock");
    await db
      .from("integration_secrets")
      .upsert({ company_id: HARBOUR, provider: "ayrshare", secret: "pk" });
    expect((await providersFor(db, keys, HARBOUR)).name).toBe("resend+ayrshare+mock");
  });

  it("syncs post analytics and site metrics for companies that use them", async () => {
    const ext = `ay_sync_${Date.now()}`;
    await db.from("social_posts").insert({
      company_id: HARBOUR,
      channel: "LinkedIn",
      text: "Synced post",
      status: "published",
      provider: "ayrshare",
      external_id: ext,
    });
    const social = fakeFetch({
      linkedin: { analytics: { impressionCount: 55, likeCount: 4, clickCount: 6 } },
    });
    expect(await syncSocialAnalytics(db, { ayrshare: { apiKey: "ay" } }, social.f)).toBeGreaterThan(
      0,
    );
    const { data: post } = await db
      .from("social_posts")
      .select("metrics")
      .eq("external_id", ext)
      .single();
    expect(post!.metrics).toMatchObject({ impressions: 55, likes: 4, clicks: 6 });

    await db
      .from("integration_settings")
      .upsert({ company_id: HARBOUR, provider: "posthog", enabled: true });
    const ph = fakeFetch({ results: [["2026-10-25", 77, 5]] });
    expect(
      await syncPostHog(
        db,
        { posthog: { host: "https://eu.posthog.com", projectId: "1", apiKey: "phx" } },
        ph.f,
      ),
    ).toBe(1);
    const { data: m } = await db
      .from("metrics_daily")
      .select("visitors, signups")
      .eq("company_id", HARBOUR)
      .eq("date", "2026-10-25")
      .single();
    expect(m).toEqual({ visitors: 77, signups: 5 });
    await db.from("integration_settings").delete().eq("company_id", HARBOUR);
    await db.from("integration_secrets").delete().eq("company_id", HARBOUR);
  });
});

describe("marketing email", () => {
  it("sends each person their own unsubscribe link and skips anyone who opted out", async () => {
    const sent: SendEmailInput[] = [];
    const providers: Providers = {
      ...mockProviders(),
      email: {
        async send(i) {
          sent.push(i);
          return { messageIds: [`m${sent.length}`] };
        },
      },
    };
    const { data: tom } = await db
      .from("contacts")
      .select("id")
      .eq("company_id", HARBOUR)
      .eq("email", "tom.gillespie@example.com")
      .single();
    await db.from("consents").insert({
      company_id: HARBOUR,
      contact_id: tom!.id,
      purpose: "marketing",
      status: "withdrawn",
      source: "unsubscribe",
    });
    await db.from("approvals").insert({
      company_id: HARBOUR,
      action_type: "send_email",
      payload: {
        to: "sarah.patel@example.com, tom.gillespie@example.com",
        subject: "Saturday specials",
        body: "Cinnamon buns are back.",
        outreach: true,
      },
      estimated_credits: 5,
      status: "approved",
      decided_by: RORY,
      decided_at: new Date().toISOString(),
      execution_status: "queued",
    });
    const outcomes = await drainApprovals({
      db,
      providers,
      unsubscribe: { secret: "s3cret", base: "https://proj.supabase.test" },
      workerId: "test",
    });
    expect(outcomes).toContain("done");
    expect(sent.map((s) => s.to)).toEqual([["sarah.patel@example.com"]]);
    const link = new URL(sent[0]!.headers!["List-Unsubscribe"]!.slice(1, -1));
    expect(link.pathname).toBe("/functions/v1/unsubscribe");
    expect(
      await checkUnsubscribeToken(
        "s3cret",
        HARBOUR,
        "sarah.patel@example.com",
        link.searchParams.get("t")!,
      ),
    ).toBe(true);
    expect(sent[0]!.body).toContain(
      "Unsubscribe: https://proj.supabase.test/functions/v1/unsubscribe?",
    );
  });
});
