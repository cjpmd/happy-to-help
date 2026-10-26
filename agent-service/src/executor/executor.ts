// The approvals executor (CLAUDE.md rule 4): carries out approved actions deterministically.
// For each approved action it re-checks the rules, charges the action's credits through the
// usual reserve → settle flow, calls the provider, and records the outcome on the approval and
// in activity_events. Provider failures are refunded and retried once; rule failures are
// blocked without charge and explained to the founder.
import type { Db } from "../db/client.js";
import { must } from "../db/client.js";
import type { Json, Tables } from "../db/types.js";
import {
  checkRules,
  DEFAULT_LIMITS,
  recipients,
  type ExecutorLimits,
  type FounderRules,
} from "./rules.js";
import type { Providers } from "./providers.js";

export type Approval = Tables<"approvals">;

export interface ExecutorDeps {
  db: Db;
  providers: Providers;
  workerId: string;
  limits?: ExecutorLimits;
  maxAttempts?: number;
  log?: (msg: string) => void;
}

export type ExecutionOutcome = "done" | "blocked" | "retry" | "failed";

const PILLAR: Record<Approval["action_type"], "grow" | "run" | "build" | "legal"> = {
  publish_post: "grow",
  send_email: "run",
  ad_spend: "grow",
  publish_site: "build",
  file_document: "legal",
};

function label(a: Approval): string {
  const p = a.payload as Record<string, unknown>;
  switch (a.action_type) {
    case "publish_post":
      return `${String(p["channel"])} post`;
    case "send_email":
      return `email "${String(p["subject"])}"`;
    case "ad_spend":
      return `£${String(p["daily_budget"] ?? p["amount_gbp"])} a day ${String(p["platform"])} budget`;
    case "publish_site":
      return `site change: ${String(p["change"])}`;
    case "file_document":
      return `filing: ${String(p["document"])}`;
  }
}

async function say(db: Db, companyId: string, content: string) {
  await db.from("chat_messages").insert({ company_id: companyId, sender: "sol", content });
}
async function event(
  db: Db,
  companyId: string,
  type: string,
  summary: string,
  runId?: string | null,
) {
  await db.from("activity_events").insert({
    company_id: companyId,
    type,
    summary: summary.slice(0, 300),
    ...(runId ? { run_id: runId } : {}),
  });
}

/** The strictest escalation settings among the company's founders. */
export async function founderRules(db: Db, companyId: string): Promise<FounderRules> {
  const { data: founders } = await db
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("role", "founder");
  const ids = (founders ?? []).map((f) => f.user_id);
  const { data: prefs } = ids.length
    ? await db
        .from("user_preferences")
        .select("ad_threshold, outreach_threshold, publishing")
        .in("user_id", ids)
    : { data: [] };
  // Founders without saved settings have the defaults (src/lib/workspace.ts defaultPreferences).
  const rows = [
    ...(prefs ?? []),
    ...Array.from({ length: ids.length - (prefs?.length ?? 0) }, () => ({
      ad_threshold: 20,
      outreach_threshold: 25,
      publishing: true,
    })),
  ];
  if (!rows.length) return { adThreshold: 20, outreachThreshold: 25, publishing: true };
  return {
    adThreshold: Math.min(...rows.map((r) => r.ad_threshold)),
    outreachThreshold: Math.min(...rows.map((r) => r.outreach_threshold)),
    publishing: rows.some((r) => r.publishing),
  };
}

async function deciderRole(db: Db, a: Approval) {
  if (!a.decided_by) return null;
  const { data: member } = await db
    .from("company_members")
    .select("role")
    .eq("company_id", a.company_id)
    .eq("user_id", a.decided_by)
    .maybeSingle();
  if (member) return member.role;
  // Cohort mentors decide without a membership.
  const { data: cohort } = await db
    .from("cohort_companies")
    .select("cohort_id")
    .eq("company_id", a.company_id)
    .maybeSingle();
  if (!cohort) return null;
  const { data: mentor } = await db
    .from("cohort_mentors")
    .select("user_id")
    .eq("cohort_id", cohort.cohort_id)
    .eq("user_id", a.decided_by)
    .maybeSingle();
  return mentor ? ("mentor" as const) : null;
}

async function block(
  db: Db,
  a: Approval,
  reason: string,
  needsFounder: boolean,
): Promise<ExecutionOutcome> {
  await db
    .from("approvals")
    .update({ execution_status: "blocked", execution_error: reason })
    .eq("id", a.id);
  await event(db, a.company_id, "escalation", `Didn't carry out ${label(a)}: ${reason}`, a.run_id);
  await say(
    db,
    a.company_id,
    `I didn't carry out the ${label(a)}: ${reason}${needsFounder ? " Ask me to propose it again and a founder can give the GO." : ""} Nothing was charged.`,
  );
  return "blocked";
}

/** Calls the provider for an approval and records its effects. Returns what to store as the result. */
async function perform(
  db: Db,
  providers: Providers,
  a: Approval,
): Promise<Record<string, unknown>> {
  const p = a.payload as Record<string, unknown>;
  const now = new Date().toISOString();
  switch (a.action_type) {
    case "publish_post": {
      const r = await providers.social.publish({
        companyId: a.company_id,
        approvalId: a.id,
        channel: String(p["channel"]),
        text: String(p["text"]),
        ...(typeof p["scheduled_for"] === "string" ? { scheduledFor: p["scheduled_for"] } : {}),
      });
      const { data: post } = await db
        .from("social_posts")
        .select("id")
        .eq("approval_id", a.id)
        .maybeSingle();
      if (post)
        await db
          .from("social_posts")
          .update({ status: r.status, scheduled_for: now })
          .eq("id", post.id);
      else
        await db.from("social_posts").insert({
          company_id: a.company_id,
          approval_id: a.id,
          channel: String(p["channel"]) as "Instagram" | "TikTok" | "LinkedIn" | "X",
          text: String(p["text"]),
          angle: String(p["angle"] ?? ""),
          status: r.status,
          scheduled_for: now,
        });
      return {
        provider: providers.name,
        external_id: r.externalId,
        status: r.status,
        ...(r.url ? { url: r.url } : {}),
      };
    }
    case "send_email": {
      const { emails, count } = recipients(String(p["to"]));
      const r = await providers.email.send({
        companyId: a.company_id,
        approvalId: a.id,
        to: emails.length ? emails : [String(p["to"])],
        subject: String(p["subject"]),
        body: String(p["body"]),
      });
      let threadId = typeof p["thread_id"] === "string" ? p["thread_id"] : null;
      if (!threadId) {
        const { data: thread } = await db
          .from("email_threads")
          .insert({
            company_id: a.company_id,
            subject: String(p["subject"]),
            contact_name: emails.length === 1 ? "" : String(p["to"]),
            address: String(p["to"]),
            mode: p["outreach"] ? "outreach" : "support",
          })
          .select("id")
          .single();
        threadId = thread?.id ?? null;
      }
      if (threadId)
        await db.from("email_messages").insert({
          thread_id: threadId,
          company_id: a.company_id,
          direction: "sent",
          body: String(p["body"]),
        });
      return { provider: providers.name, message_ids: r.messageIds, recipients: count };
    }
    case "ad_spend": {
      const daily = Number(p["daily_budget"] ?? p["amount_gbp"]);
      const cap = Number(p["hard_cap"] ?? daily);
      const r = await providers.ads.setDailyBudget({
        companyId: a.company_id,
        approvalId: a.id,
        platform: String(p["platform"]),
        dailyBudget: daily,
        hardCap: cap,
      });
      const { data: account } = await db
        .from("ad_accounts")
        .select("company_id")
        .eq("company_id", a.company_id)
        .maybeSingle();
      if (account)
        await db
          .from("ad_accounts")
          .update({ daily_budget: daily, hard_cap: cap })
          .eq("company_id", a.company_id);
      else
        await db
          .from("ad_accounts")
          .insert({ company_id: a.company_id, daily_budget: daily, hard_cap: cap });
      return {
        provider: providers.name,
        reference: r.reference,
        daily_budget: daily,
        hard_cap: cap,
      };
    }
    case "publish_site": {
      const r = await providers.site.publish({
        companyId: a.company_id,
        approvalId: a.id,
        change: String(p["change"]),
        url: String(p["url"]),
      });
      // Next version after the highest v0.N so far.
      const { data: versions } = await db
        .from("site_versions")
        .select("version")
        .eq("company_id", a.company_id);
      const minor = Math.max(
        0,
        ...(versions ?? []).map((v) => Number(/^v0\.(\d+)$/.exec(v.version)?.[1] ?? 0)),
      );
      await db.from("site_versions").insert({
        company_id: a.company_id,
        version: `v0.${minor + 1}`,
        summary: String(p["change"]),
        preview_url: r.previewUrl,
      });
      return { provider: providers.name, version: r.version };
    }
    case "file_document": {
      const r = await providers.documents.file({
        companyId: a.company_id,
        approvalId: a.id,
        document: String(p["document"]),
        destination: String(p["destination"]),
      });
      return { provider: providers.name, reference: r.reference };
    }
  }
}

/** Carries out one claimed approval. */
export async function executeApproval(deps: ExecutorDeps, a: Approval): Promise<ExecutionOutcome> {
  const { db, providers } = deps;
  const maxAttempts = deps.maxAttempts ?? 2;
  const log = deps.log ?? (() => {});

  // 1. Rules, checked again now: claims, caps, and the founders' escalation settings.
  const { data: flags, error: claimsError } = await db.rpc("check_claims", {
    p_company: a.company_id,
    p_text:
      a.action_type === "publish_post"
        ? String((a.payload as Record<string, unknown>)["text"] ?? "")
        : a.action_type === "send_email"
          ? `${String((a.payload as Record<string, unknown>)["subject"] ?? "")}\n${String((a.payload as Record<string, unknown>)["body"] ?? "")}`
          : "",
  });
  if (claimsError) throw new Error(`claims check: ${claimsError.message}`);
  const flagged = (flags ?? []) as { phrase: string }[];
  if (flagged.length)
    return block(db, a, `the claims check now flags "${flagged[0]!.phrase}".`, false);
  const rule = checkRules(
    {
      action_type: a.action_type,
      payload: a.payload as Record<string, unknown>,
      deciderRole: await deciderRole(db, a),
    },
    await founderRules(db, a.company_id),
    deps.limits ?? DEFAULT_LIMITS,
  );
  if (!rule.ok) return block(db, a, rule.reason, rule.needsFounder);

  // 2. Credits: reserve the action's price on its own run.
  const run = must(
    await db
      .from("agent_runs")
      .insert({
        company_id: a.company_id,
        task: `Carry out ${label(a)}`,
        pillar: PILLAR[a.action_type],
        model: `executor (${providers.name})`,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single(),
    "executor run",
  );
  await db.from("approvals").update({ execution_run_id: run.id }).eq("id", a.id);
  if (a.estimated_credits > 0) {
    const held = await db.rpc("reserve_credits", {
      p_company: a.company_id,
      p_run: run.id,
      p_amount: a.estimated_credits,
      p_note: `Hold for ${label(a)}`,
    });
    if (held.error) {
      await db
        .from("agent_runs")
        .update({ status: "failed", finished_at: new Date().toISOString() })
        .eq("id", run.id);
      return block(db, a, `there weren't enough credits (it needs ${a.estimated_credits}).`, false);
    }
  }

  // 3. The provider.
  let result: Record<string, unknown>;
  try {
    result = await perform(db, providers, a);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await db.rpc("refund_run", { p_run: run.id, p_reason: reason });
    await db
      .from("agent_runs")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", run.id);
    if (a.execution_attempts < maxAttempts) {
      await db
        .from("approvals")
        .update({ execution_status: "queued", execution_error: reason })
        .eq("id", a.id);
      log(`approval ${a.id}: provider failed (${reason}); will retry`);
      return "retry";
    }
    await db
      .from("approvals")
      .update({ execution_status: "failed", execution_error: reason })
      .eq("id", a.id);
    await event(
      db,
      a.company_id,
      "escalation",
      `Couldn't carry out ${label(a)} after ${a.execution_attempts} tries`,
      run.id,
    );
    await say(
      db,
      a.company_id,
      `I couldn't carry out the ${label(a)} after ${a.execution_attempts} tries (${reason}). Nothing was charged. I'll keep it in GO / NO-GO history so you can ask me to try again.`,
    );
    return "failed";
  }

  // 4. Record it.
  const charged =
    a.estimated_credits > 0
      ? Number(
          must(
            await db.rpc("settle_run_credits", {
              p_run: run.id,
              p_credits: a.estimated_credits,
              p_note: label(a),
            }),
            "settle",
          ),
        )
      : 0;
  const now = new Date().toISOString();
  await db
    .from("agent_runs")
    .update({
      status: "succeeded",
      finished_at: now,
      steps: [
        { tool: a.action_type, summary: `Carried out with ${providers.name}`, credits: charged },
      ] as unknown as Json[],
    })
    .eq("id", run.id);
  await db
    .from("approvals")
    .update({
      execution_status: "done",
      executed_at: now,
      execution_result: result as { [k: string]: Json },
      execution_error: null,
    })
    .eq("id", a.id);
  const verb = {
    publish_post: "Published",
    send_email: "Sent",
    ad_spend: "Set",
    publish_site: "Published",
    file_document: "Filed",
  }[a.action_type];
  await event(db, a.company_id, PILLAR[a.action_type], `${verb} ${label(a)}`, run.id);
  log(`approval ${a.id}: done (${charged} credits)`);
  return "done";
}

export async function claimApproval(db: Db, workerId: string): Promise<Approval | null> {
  const { data, error } = await db.rpc("claim_approval_execution", { p_worker: workerId });
  if (error) throw new Error(`claim approval: ${error.message}`);
  return (data as Approval[] | null)?.[0] ?? null;
}

/** Carries out every queued approval. Returns the outcomes. */
export async function drainApprovals(deps: ExecutorDeps): Promise<ExecutionOutcome[]> {
  const out: ExecutionOutcome[] = [];
  for (
    let a = await claimApproval(deps.db, deps.workerId);
    a;
    a = await claimApproval(deps.db, deps.workerId)
  )
    out.push(await executeApproval(deps, a));
  return out;
}
