import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBots } from "../src/bots.js";
import { drainApprovals } from "../src/executor/executor.js";
import { mockProviders } from "../src/executor/providers.js";
import { testDb } from "./local.js";

const db = testDb();
const HARBOUR = "c0000000-0000-4000-8000-000000000005";
const RORY = "a0000000-0000-4000-8000-000000000006";
const RUN = Date.now().toString(36);
const DAY = 86_400_000;

async function addBot(template: string, extra: Record<string, unknown> = {}) {
  const { data: t } = await db.from("bot_templates").select("*").eq("key", template).single();
  const { data, error } = await db
    .from("bots")
    .insert({
      company_id: HARBOUR,
      template,
      name: t!.name,
      trigger: t!.trigger,
      conditions: t!.conditions,
      steps: t!.steps,
      enabled: true,
      enabled_at: new Date(Date.now() - 60_000).toISOString(),
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function contact(name: string, granted: boolean) {
  const { data } = await db
    .from("contacts")
    .insert({
      company_id: HARBOUR,
      name,
      email: `${name.split(" ")[0]!.toLowerCase()}.${RUN}@example.com`,
      kind: "lead",
    })
    .select("id, email")
    .single();
  if (granted)
    await db.from("consents").insert({
      company_id: HARBOUR,
      contact_id: data!.id,
      purpose: "marketing",
      status: "granted",
      lawful_basis: "consent",
      source: "form",
    });
  await db.from("leads").insert({ company_id: HARBOUR, contact_id: data!.id });
  return data!;
}

const runs = async (botId: string, contactId: string | null) =>
  (
    await db
      .from("bot_runs")
      .select("step, status, reason, approval_id, credits")
      .eq("bot_id", botId)
      .filter("contact_id", contactId ? "eq" : "is", contactId ?? null)
      .order("step")
  ).data!;

beforeAll(async () => {
  // Bots this test made on an earlier run (one per template per company).
  await db.from("bots").delete().eq("company_id", HARBOUR);
});

afterAll(async () => {
  // Leave nothing switched on, or waiting, for the other suites.
  await db.from("bots").update({ enabled: false }).eq("company_id", HARBOUR);
  await db
    .from("approvals")
    .update({ status: "declined", decided_at: new Date().toISOString() })
    .eq("company_id", HARBOUR)
    .eq("status", "pending")
    .not("payload->>bot_id", "is", null);
});

describe("process bots", () => {
  let followUp = "";
  let ola = { id: "", email: "" };
  let ben = { id: "", email: "" };

  it("enrols new leads and sends the first email for a GO the next day", async () => {
    followUp = await addBot("lead_follow_up");
    ola = await contact("Ola Ade", true);
    ben = await contact("Ben Cole", false);
    const now = new Date();
    expect((await runBots(db, now)).enrolled).toBeGreaterThanOrEqual(4);
    expect((await runBots(db, now)).enrolled).toBe(0); // once only
    expect((await runs(followUp, ola.id)).map((r) => r.status)).toEqual(["pending", "pending"]);

    await runBots(db, new Date(now.getTime() + DAY + 60_000));
    const [first] = await runs(followUp, ola.id);
    expect(first).toMatchObject({ status: "done", credits: 5 });
    const { data: a } = await db
      .from("approvals")
      .select("status, payload")
      .eq("id", first!.approval_id!)
      .single();
    expect(a!.status).toBe("pending");
    expect(a!.payload).toMatchObject({ to: ola.email, outreach: false, bot_id: followUp });
    expect((a!.payload as { body: string }).body).toMatch(/^Hello Ola,/);
  });

  it("stops when they reply, and never sends marketing without permission", async () => {
    const { data: thread } = await db
      .from("email_threads")
      .insert({
        company_id: HARBOUR,
        subject: "Re: thanks",
        contact_name: "Ola",
        address: ola.email,
        mode: "support",
      })
      .select("id")
      .single();
    await db.from("email_messages").insert({
      thread_id: thread!.id,
      company_id: HARBOUR,
      direction: "received",
      body: "Thanks, all sorted.",
    });
    await runBots(db, new Date(Date.now() + 6 * DAY));
    expect((await runs(followUp, ola.id))[1]).toMatchObject({
      status: "skipped",
      reason: "They replied",
    });
    expect((await runs(followUp, ben.id))[1]).toMatchObject({
      status: "skipped",
      reason: "No permission for marketing emails",
    });
  });

  it("sends with wording the founder approved, within the weekly cap", async () => {
    await db.from("bots").delete().eq("id", followUp);
    const bot = await addBot("lead_follow_up", {
      approval_level: "approved_wording",
      approved_by: RORY,
      approved_at: new Date().toISOString(),
      cap_credits_week: 5,
    });
    const a = await contact("Cara Diaz", true);
    const b = await contact("Dev Patel", true);
    // Only these two leads: the bot was switched on just before they came in.
    const { data: first } = await db
      .from("leads")
      .select("created_at")
      .eq("contact_id", a.id)
      .single();
    await db.from("bots").update({ enabled_at: first!.created_at }).eq("id", bot);
    await runBots(db, new Date(Date.now() + DAY + 120_000));
    const ra = (await runs(bot, a.id))[0]!;
    const rb = (await runs(bot, b.id))[0]!;
    const sent = [ra, rb].filter((r) => r.status === "done");
    expect(sent).toHaveLength(1);
    expect([ra, rb].find((r) => r.status === "skipped")!.reason).toMatch(/credit cap/);
    const { data: approval } = await db
      .from("approvals")
      .select("status, decided_by, execution_status")
      .eq("id", sent[0]!.approval_id!)
      .single();
    expect(approval).toMatchObject({
      status: "approved",
      decided_by: RORY,
      execution_status: "queued",
    });
    // The executor sends it (mock provider), re-checking its rules.
    expect(await drainApprovals({ db, providers: mockProviders(), workerId: "test" })).toContain(
      "done",
    );
  });

  it("posts the weekly summary on Monday morning, once a week", async () => {
    const bot = await addBot("weekly_summary", { enabled_at: "2030-01-01T00:00:00Z" });
    const monday = new Date("2031-01-06T10:00:00Z");
    await runBots(db, new Date("2031-01-05T10:00:00Z")); // Sunday: nothing
    expect(await runs(bot, null)).toHaveLength(0);
    await runBots(db, monday);
    await runBots(db, new Date(monday.getTime() + 3_600_000));
    const r = await runs(bot, null);
    expect(r).toHaveLength(1);
    expect(r[0]!.status).toBe("done");
    const { data: chat } = await db
      .from("chat_messages")
      .select("content")
      .eq("company_id", HARBOUR)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(chat!.content).toMatch(/^Here's last week at Harbour Bakes\./);
  });
});
