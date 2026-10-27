// Process bots (Phase 17): each minute the scheduler enrols contacts into switched-on bots when
// their trigger happens, then carries out the steps that are due. Deterministic: no model runs
// here. Emails become approvals (sent after a GO, or with wording a founder approved), tasks and
// summaries are internal, feedback requests follow the Phase 16 rules. Every step is a bot_runs
// row with its outcome, so it's audited and never done twice.
import type { Db } from "./db/client.js";
import type { Json } from "./db/types.js";
import { ACTION_CREDITS } from "./tools.js";
import { reportError } from "./errors.js";
import {
  fillTemplate,
  stepDue,
  weekKey,
  weeklySummary,
  type BotConditions,
  type BotStep,
  type BotTrigger,
} from "../../src/lib/bots.js";
import { localTime } from "../../src/lib/schedule.js";

const DAY = 86_400_000;
const SUMMARY_AT = 9 * 60; // Mondays from 09:00 UK time

interface Bot {
  id: string;
  company_id: string;
  name: string;
  enabled: boolean;
  trigger: BotTrigger;
  conditions: BotConditions;
  steps: BotStep[];
  approval_level: "each" | "approved_wording";
  approved_by: string | null;
  cap_credits_week: number;
  enabled_at: string | null;
}

interface Enrolment {
  contact_id: string | null;
  at: string;
  period: string;
}

/** Who the bot's trigger picked up since it was switched on. */
async function triggered(db: Db, b: Bot, now: Date): Promise<Enrolment[]> {
  const since = b.enabled_at ?? now.toISOString();
  const t = b.trigger;
  if ("schedule" in t) {
    const lt = localTime(now);
    return lt.weekday === 1 && lt.minutes >= SUMMARY_AT
      ? [{ contact_id: null, at: now.toISOString(), period: weekKey(now) }]
      : [];
  }
  const rows = (data: { contact_id: string | null; at: string | null }[] | null, period = "") =>
    (data ?? [])
      .filter((r) => r.contact_id && r.at)
      .map((r) => ({ contact_id: r.contact_id, at: r.at!, period }));
  switch (t.event) {
    case "lead_created": {
      const { data } = await db
        .from("leads")
        .select("contact_id, created_at")
        .eq("company_id", b.company_id)
        .gte("created_at", since);
      return rows((data ?? []).map((l) => ({ contact_id: l.contact_id, at: l.created_at })));
    }
    case "lead_won": {
      const { data } = await db
        .from("leads")
        .select("contact_id, updated_at")
        .eq("company_id", b.company_id)
        .eq("status", "won")
        .gte("updated_at", since);
      return rows((data ?? []).map((l) => ({ contact_id: l.contact_id, at: l.updated_at })));
    }
    case "customer_added": {
      const { data } = await db
        .from("contacts")
        .select("id, created_at")
        .eq("company_id", b.company_id)
        .eq("kind", "customer")
        .gte("created_at", since);
      return rows((data ?? []).map((c) => ({ contact_id: c.id, at: c.created_at })));
    }
    case "booking_answered": {
      const { data } = await db
        .from("inbox_items")
        .select("contact_id, processed_at")
        .eq("company_id", b.company_id)
        .eq("category", "booking")
        .eq("status", "sent")
        .gte("processed_at", since);
      return rows((data ?? []).map((i) => ({ contact_id: i.contact_id, at: i.processed_at })));
    }
    case "lapsed": {
      // Once a year at most per customer.
      const { data } = await db
        .from("contacts")
        .select("id, last_contact_at")
        .eq("company_id", b.company_id)
        .eq("kind", "customer")
        .lt("last_contact_at", new Date(now.getTime() - (t.days ?? 90) * DAY).toISOString());
      return rows(
        (data ?? []).map((c) => ({ contact_id: c.id, at: now.toISOString() })),
        String(now.getUTCFullYear()),
      );
    }
    case "invoice_overdue":
      // Needs the company's own Stripe account (HANDOFF 9); such bots can't be switched on.
      return [];
  }
}

async function enrol(db: Db, now: Date) {
  const { data: bots, error } = await db.from("bots").select("*").eq("enabled", true);
  if (error) throw new Error(`bots: ${error.message}`);
  let n = 0;
  for (const raw of bots ?? []) {
    const b = raw as unknown as Bot;
    const who = await triggered(db, b, now);
    if (!who.length) continue;
    const rows = who.flatMap((e) =>
      b.steps.map((s, step) => ({
        bot_id: b.id,
        company_id: b.company_id,
        contact_id: e.contact_id,
        step,
        period: e.period,
        due_at: stepDue(e.at, s.after_days),
      })),
    );
    const { data: added, error: addError } = await db
      .from("bot_runs")
      .upsert(rows, { onConflict: "bot_id,contact_id,step,period", ignoreDuplicates: true })
      .select("id");
    if (addError) throw new Error(`enrol ${b.name}: ${addError.message}`);
    n += added?.length ?? 0;
  }
  return n;
}

type Outcome = {
  status: "done" | "skipped";
  reason?: string;
  approval_id?: string;
  credits?: number;
};

/** Should the rest of the sequence stop for this contact? */
async function stopped(
  db: Db,
  b: Bot,
  contact: { id: string; email: string },
  enrolledAt: string,
): Promise<string | null> {
  if (b.conditions.stop_if_won) {
    const { count } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contact.id)
      .eq("status", "won");
    if (count) return "They became a customer";
  }
  if (b.conditions.stop_if_replied && contact.email) {
    const { data: threads } = await db
      .from("email_threads")
      .select("id")
      .eq("company_id", b.company_id)
      .ilike("address", contact.email);
    const ids = (threads ?? []).map((t) => t.id);
    if (ids.length) {
      const { count } = await db
        .from("email_messages")
        .select("id", { count: "exact", head: true })
        .in("thread_id", ids)
        .eq("direction", "received")
        .gt("created_at", enrolledAt);
      if (count) return "They replied";
    }
  }
  return null;
}

async function spentThisWeek(db: Db, botId: string, now: Date) {
  const { data } = await db
    .from("bot_runs")
    .select("credits")
    .eq("bot_id", botId)
    .gte("finished_at", `${weekKey(now)}T00:00:00Z`);
  return (data ?? []).reduce((n, r) => n + r.credits, 0);
}

async function email(
  db: Db,
  b: Bot,
  s: Extract<BotStep, { kind: "email" }>,
  runId: string,
  contact: { id: string; name: string; email: string },
  now: Date,
): Promise<Outcome> {
  if (!contact.email) return { status: "skipped", reason: "No email address" };
  const { data: consent } = await db
    .from("current_consents")
    .select("status")
    .eq("contact_id", contact.id)
    .eq("purpose", "marketing")
    .maybeSingle();
  // PECR: marketing steps only to people who said yes.
  if (s.marketing && consent?.status !== "granted")
    return { status: "skipped", reason: "No permission for marketing emails" };
  const est = ACTION_CREDITS.send_email;
  if ((await spentThisWeek(db, b.id, now)) + est > b.cap_credits_week)
    return { status: "skipped", reason: "This week's credit cap is reached" };
  const { data: company } = await db
    .from("companies")
    .select("name")
    .eq("id", b.company_id)
    .single();
  const vars = { name: contact.name, company: company?.name ?? "" };
  const auto = b.approval_level === "approved_wording" && !!b.approved_by;
  const nowIso = now.toISOString();
  const { data: a, error } = await db
    .from("approvals")
    .insert({
      company_id: b.company_id,
      action_type: "send_email",
      payload: {
        to: contact.email,
        subject: fillTemplate(s.subject, vars),
        body: fillTemplate(s.body, vars),
        outreach: s.marketing,
        bot_id: b.id,
        bot_run_id: runId,
        reason: auto
          ? `${b.name}: wording you approved for this bot.`
          : `${b.name}: the next step for ${contact.name}.`,
      } as { [k: string]: Json },
      estimated_credits: est,
      // With approved wording, the founder's approval of the bot stands for each email; the
      // executor still checks claims, consent and its rules before sending.
      ...(auto
        ? {
            status: "approved" as const,
            decided_by: b.approved_by,
            decided_at: nowIso,
            execution_status: "queued" as const,
          }
        : {}),
    })
    .select("id")
    .single();
  if (error || !a) throw new Error(`bot email: ${error?.message ?? "no row"}`);
  return { status: "done", approval_id: a.id, credits: est };
}

async function summary(db: Db, b: Bot, now: Date): Promise<Outcome> {
  const since = new Date(now.getTime() - 7 * DAY).toISOString();
  const head = { count: "exact" as const, head: true };
  const [leads, customers, posts, replies, runs, waiting, company] = await Promise.all([
    db.from("leads").select("id", head).eq("company_id", b.company_id).gte("created_at", since),
    db
      .from("contacts")
      .select("id", head)
      .eq("company_id", b.company_id)
      .eq("kind", "customer")
      .gte("created_at", since),
    db
      .from("social_posts")
      .select("id", head)
      .eq("company_id", b.company_id)
      .eq("status", "published")
      .gte("created_at", since),
    db
      .from("email_messages")
      .select("id", head)
      .eq("company_id", b.company_id)
      .eq("direction", "sent")
      .gte("created_at", since),
    db
      .from("agent_runs")
      .select("credits_charged")
      .eq("company_id", b.company_id)
      .gte("started_at", since),
    db.from("approvals").select("id", head).eq("company_id", b.company_id).eq("status", "pending"),
    db.from("companies").select("name").eq("id", b.company_id).single(),
  ]);
  const text = weeklySummary(
    {
      leads: leads.count ?? 0,
      customers: customers.count ?? 0,
      posts: posts.count ?? 0,
      replies: replies.count ?? 0,
      credits: (runs.data ?? []).reduce((n, r) => n + (r.credits_charged ?? 0), 0),
      approvalsWaiting: waiting.count ?? 0,
    },
    company.data?.name ?? "your company",
  );
  await db.from("chat_messages").insert({ company_id: b.company_id, sender: "sol", content: text });
  return { status: "done" };
}

async function perform(db: Db, b: Bot, run: DueRun, now: Date, origin: string): Promise<Outcome> {
  const s = b.steps[run.step];
  if (!s) return { status: "skipped", reason: "The bot no longer has this step" };
  if (s.kind === "summary") return summary(db, b, now);
  const { data: contact } = run.contact_id
    ? await db.from("contacts").select("id, name, email").eq("id", run.contact_id).maybeSingle()
    : { data: null };
  if (!contact) return { status: "skipped", reason: "The contact is gone" };
  const stop = await stopped(db, b, contact, run.created_at);
  if (stop) return { status: "skipped", reason: stop };
  switch (s.kind) {
    case "email":
      return email(db, b, s, run.id, contact, now);
    case "task": {
      const company = await db.from("companies").select("name").eq("id", b.company_id).single();
      const { error } = await db.from("tasks").insert({
        company_id: b.company_id,
        pillar: "run",
        title: fillTemplate(s.title, { name: contact.name, company: company.data?.name ?? "" }),
        actor: "founder",
        due: localTime(now).date,
      });
      if (error) throw new Error(`bot task: ${error.message}`);
      return { status: "done" };
    }
    case "feedback_request": {
      const { error } = await db.rpc("bot_feedback_request", {
        p_company: b.company_id,
        p_contact: contact.id,
        p_origin: origin,
      });
      // The Phase 16 rules (consent, once in 90 days) say no: that's a skip, not a failure.
      return error ? { status: "skipped", reason: error.message } : { status: "done" };
    }
  }
}

interface DueRun {
  id: string;
  bot_id: string;
  company_id: string;
  contact_id: string | null;
  step: number;
  created_at: string;
}

async function runDue(db: Db, now: Date, origin: string) {
  const { data: due, error } = await db
    .from("bot_runs")
    .select("id, bot_id, company_id, contact_id, step, created_at, bots(*)")
    .eq("status", "pending")
    .lte("due_at", now.toISOString())
    .order("due_at")
    .limit(100);
  if (error) throw new Error(`due bot steps: ${error.message}`);
  const out = { done: 0, skipped: 0, failed: 0 };
  for (const run of due ?? []) {
    const b = run.bots as unknown as Bot | null;
    let o: Outcome | { status: "failed"; reason: string };
    try {
      o = !b?.enabled
        ? { status: "skipped", reason: "Bot switched off" }
        : await perform(db, b, run, now, origin);
    } catch (e) {
      o = { status: "failed", reason: e instanceof Error ? e.message : String(e) };
      await reportError(db, "scheduler", e, {
        companyId: run.company_id,
        bot: run.bot_id,
        run: run.id,
      });
    }
    await db
      .from("bot_runs")
      .update({
        status: o.status,
        reason: o.reason ?? null,
        finished_at: now.toISOString(),
        ...("approval_id" in o && o.approval_id ? { approval_id: o.approval_id } : {}),
        ...("credits" in o && o.credits ? { credits: o.credits } : {}),
      })
      .eq("id", run.id)
      .eq("status", "pending");
    out[o.status]++;
  }
  return out;
}

/** One pass: enrol, then carry out what's due. */
export async function runBots(
  db: Db,
  now = new Date(),
  origin = process.env["APP_URL"] ?? "http://127.0.0.1:8080",
) {
  const enrolled = await enrol(db, now);
  const r = await runDue(db, now, origin.replace(/\/$/, ""));
  return { enrolled, ...r };
}
