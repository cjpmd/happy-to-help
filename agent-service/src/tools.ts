// The company agent's tools. Read tools return company data; propose_* tools write a pending
// approval and return (CLAUDE.md rule 4: agents propose, the executor acts). No tool here
// publishes, sends, spends or files anything.
//
// Each tool is a plain handler plus a zod schema, so the Claude runtime (as an in-process MCP
// server) and the mock runtime call exactly the same code.
import { z } from "zod";
import type { Db } from "./db/client.js";
import type { Json } from "./db/types.js";
import { ITEM_KINDS, commitmentsDue, matchContact, matchTask } from "../../src/lib/capture.js";
import { localTime } from "../../src/lib/schedule.js";
import type { BriefFacts } from "../../src/lib/brief.js";
import { missingDeadlines, ukDeadlines } from "../../src/lib/skills.js";
import { decideMode, type Triage } from "../../src/lib/inbox.js";
import { capFlags } from "../../src/lib/campaigns.js";
import { topThemes, type Heard } from "../../src/lib/listening.js";
import type { ResponseMode } from "../../src/lib/voicePolicy.js";

export interface ToolContext {
  db: Db;
  companyId: string;
  runId: string;
}

export interface ToolResult {
  text: string;
  /** Set by propose_* tools: the approval they created. */
  approvalId?: string;
  isError?: boolean;
}

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  shape: S;
  readOnly: boolean;
  handler: (ctx: ToolContext, args: z.infer<z.ZodObject<S>>) => Promise<ToolResult>;
}

/** Credits the executor charges to carry out an approved action (Phase 5). */
export const ACTION_CREDITS = {
  approve_campaign: 0,
  publish_post: 5,
  send_email: 5,
  ad_spend: 10,
  file_document: 5,
  publish_site: 20,
  reply_public: 5,
} as const;

const def = <S extends z.ZodRawShape>(d: ToolDef<S>) => d as unknown as ToolDef;
const json = (v: unknown) => JSON.stringify(v, null, 2);

async function claims(ctx: ToolContext, text: string) {
  const { data, error } = await ctx.db.rpc("check_claims", {
    p_company: ctx.companyId,
    p_text: text,
  });
  if (error) throw new Error(`claims check: ${error.message}`);
  return (data ?? []) as { phrase: string; reason: string }[];
}

async function propose(
  ctx: ToolContext,
  action: keyof typeof ACTION_CREDITS,
  payload: Record<string, unknown>,
  publicText: string | null,
): Promise<ToolResult> {
  if (publicText !== null) {
    const flags = await claims(ctx, publicText);
    if (flags.length)
      return {
        isError: true,
        text: `Not proposed: the claims check flagged ${flags
          .map((f) => `"${f.phrase}" (${f.reason})`)
          .join(", ")}. Rewrite the text and try again.`,
      };
  }
  const { data, error } = await ctx.db
    .from("approvals")
    .insert({
      company_id: ctx.companyId,
      run_id: ctx.runId,
      action_type: action,
      payload: payload as { [key: string]: Json },
      estimated_credits: ACTION_CREDITS[action],
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`propose ${action}: ${error?.message ?? "no row"}`);
  return {
    approvalId: data.id,
    text: `Proposed for approval (${action}, approval ${data.id}). The founder decides in GO / NO-GO; don't retry or do it another way.`,
  };
}

export const TOOLS: ToolDef[] = [
  def({
    name: "get_company",
    description: "The company's profile: name, description, stage, customers, channels and goal.",
    shape: {},
    readOnly: true,
    handler: async (ctx) => {
      const { data } = await ctx.db
        .from("companies")
        .select(
          "name, description, stage, customer_type, sector, channels, target_customer, goal_90d, website_live_url",
        )
        .eq("id", ctx.companyId)
        .single();
      return { text: json(data) };
    },
  }),
  def({
    name: "get_metrics",
    description:
      "Recent performance: the last 14 days of visitors, signups, paying customers and MRR, and published posts with their clicks and signups by angle.",
    shape: {},
    readOnly: true,
    handler: async (ctx) => {
      const [metrics, posts] = await Promise.all([
        ctx.db
          .from("metrics_daily")
          .select("date, visitors, signups, paying_customers, mrr")
          .eq("company_id", ctx.companyId)
          .order("date", { ascending: false })
          .limit(14),
        ctx.db
          .from("social_posts")
          .select("channel, angle, text, metrics, status")
          .eq("company_id", ctx.companyId)
          .eq("status", "published"),
      ]);
      return { text: json({ daily: metrics.data ?? [], published_posts: posts.data ?? [] }) };
    },
  }),
  def({
    name: "list_posts",
    description: "Social posts in every status (draft, awaiting approval, scheduled, published).",
    shape: {},
    readOnly: true,
    handler: async (ctx) => {
      const { data } = await ctx.db
        .from("social_posts")
        .select("channel, angle, text, status, scheduled_for")
        .eq("company_id", ctx.companyId)
        .order("created_at", { ascending: false })
        .limit(30);
      return { text: json(data ?? []) };
    },
  }),
  def({
    name: "list_tasks",
    description: "The company's open tasks with status and due dates.",
    shape: {},
    readOnly: true,
    handler: async (ctx) => {
      const { data } = await ctx.db
        .from("tasks")
        .select("id, title, pillar, status, due, key, stage")
        .eq("company_id", ctx.companyId)
        .neq("status", "done");
      return { text: json(data ?? []) };
    },
  }),
  def({
    name: "get_email_thread",
    description: "One email thread with its messages, oldest first.",
    shape: { thread_id: z.string().uuid() },
    readOnly: true,
    handler: async (ctx, { thread_id }) => {
      const [thread, messages] = await Promise.all([
        ctx.db
          .from("email_threads")
          .select("*")
          .eq("id", thread_id)
          .eq("company_id", ctx.companyId)
          .maybeSingle(),
        ctx.db
          .from("email_messages")
          .select("direction, body, created_at")
          .eq("thread_id", thread_id)
          .order("created_at"),
      ]);
      if (!thread.data) return { isError: true, text: "No such thread for this company." };
      return { text: json({ thread: thread.data, messages: messages.data ?? [] }) };
    },
  }),
  def({
    name: "get_document",
    description:
      "A company document (e.g. Product roadmap, Privacy policy) with its latest version.",
    shape: { document_id: z.string().uuid() },
    readOnly: true,
    handler: async (ctx, { document_id }) => {
      const [doc, version] = await Promise.all([
        ctx.db
          .from("documents")
          .select("*")
          .eq("id", document_id)
          .eq("company_id", ctx.companyId)
          .maybeSingle(),
        ctx.db
          .from("document_versions")
          .select("version, content, created_at")
          .eq("document_id", document_id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!doc.data) return { isError: true, text: "No such document for this company." };
      return { text: json({ document: doc.data, latest: version.data }) };
    },
  }),
  def({
    name: "check_claims",
    description:
      "Runs the claims checker (UK CAP Code rules, the company's sector and its unbuilt features) on public-facing text. Returns the flagged phrases and why; an empty list means it passes.",
    shape: { text: z.string().min(1).max(5000) },
    readOnly: true,
    handler: async (ctx, { text }) => {
      const flags = await claims(ctx, text);
      return { text: flags.length ? json(flags) : "Passed: nothing flagged." };
    },
  }),
  def({
    name: "propose_post",
    description:
      "Proposes a social post for the founder's approval. It is not published until they give GO. The text must pass the claims check.",
    shape: {
      channel: z.enum(["Instagram", "TikTok", "LinkedIn", "X"]),
      text: z.string().min(10).max(2200),
      angle: z.string().min(1).max(80).describe("Which message angle this post tests"),
      reason: z.string().min(1).max(600).describe("Why this post, in one or two plain sentences"),
      scheduled_for: z.string().optional().describe("When to post, e.g. 21 Oct 2026, 16:30"),
    },
    readOnly: false,
    handler: async (ctx, { channel, text, angle, reason, scheduled_for }) => {
      const res = await propose(
        ctx,
        "publish_post",
        { channel, text, reason, angle, ...(scheduled_for ? { scheduled_for } : {}) },
        text,
      );
      if (res.approvalId)
        await ctx.db.from("social_posts").insert({
          company_id: ctx.companyId,
          approval_id: res.approvalId,
          channel,
          text,
          angle,
          status: "awaiting_approval",
        });
      return res;
    },
  }),
  def({
    name: "propose_email",
    description:
      "Proposes an email for the founder's approval (a reply or a small outreach batch). Nothing is sent until they give GO. Outreach needs consent or a PECR soft opt-in for every recipient.",
    shape: {
      to: z.string().min(1).max(500),
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(10000),
      reason: z.string().min(1).max(600),
      outreach: z.boolean().optional(),
      thread_id: z.string().uuid().optional(),
    },
    readOnly: false,
    handler: async (ctx, { to, subject, body, reason, outreach, thread_id }) =>
      propose(
        ctx,
        "send_email",
        {
          to,
          subject,
          body,
          reason,
          ...(outreach ? { outreach } : {}),
          ...(thread_id ? { thread_id } : {}),
        },
        `${subject}\n${body}`,
      ),
  }),
  def({
    name: "propose_ad_change",
    description:
      "Proposes an ad budget change. The daily budget must stay at or below the hard cap.",
    shape: {
      platform: z.string().min(1).max(40),
      daily_budget: z.number().min(0).max(1000),
      hard_cap: z.number().min(0).max(1000),
      audience: z.string().min(1).max(300),
      creative: z.string().min(1).max(300),
      reason: z.string().min(1).max(600),
    },
    readOnly: false,
    handler: async (ctx, a) => {
      if (a.daily_budget > a.hard_cap)
        return { isError: true, text: "Not proposed: the daily budget is over the hard cap." };
      return propose(
        ctx,
        "ad_spend",
        { ...a, amount_gbp: a.daily_budget, duration: "per day" },
        null,
      );
    },
  }),
  def({
    name: "propose_site_change",
    description:
      "Proposes publishing a change to the company's website. It goes live only after GO.",
    shape: {
      change: z.string().min(1).max(300),
      url: z.string().min(1).max(300),
      reason: z.string().min(1).max(600),
    },
    readOnly: false,
    handler: async (ctx, a) => propose(ctx, "publish_site", a, a.change),
  }),
  def({
    name: "propose_document_update",
    description:
      "Saves a new version of a company document. Internal documents need no approval; the founder sees the change in the document's versions.",
    shape: {
      document_id: z.string().uuid(),
      content: z.string().min(1).max(50000),
      summary: z.string().min(1).max(300),
    },
    readOnly: false,
    handler: async (ctx, { document_id, content, summary }) => {
      const { data: latest } = await ctx.db
        .from("document_versions")
        .select("version")
        .eq("document_id", document_id)
        .eq("company_id", ctx.companyId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return { isError: true, text: "No such document for this company." };
      const { error } = await ctx.db.from("document_versions").insert({
        document_id,
        company_id: ctx.companyId,
        version: latest.version + 1,
        content,
        run_id: ctx.runId,
      });
      if (error) throw new Error(`document update: ${error.message}`);
      return { text: `Saved version ${latest.version + 1}: ${summary}` };
    },
  }),
];

// Brand voice (Phase 11) ----------------------------------------------------------------------

const VOICE_SHAPE = {
  summary: z.string().min(1).max(1500).describe("Two to four plain sentences describing the voice"),
  traits: z.array(z.string().min(1).max(40)).min(3).max(5),
  use_phrases: z.array(z.string().min(1).max(80)).max(12).optional(),
  avoid_phrases: z.array(z.string().min(1).max(80)).max(20).optional(),
  reading_level: z.enum(["plain", "standard", "complex"]).optional(),
  spelling: z.enum(["UK", "US"]).optional(),
  sign_off: z.string().max(60).optional(),
  emoji: z.enum(["none", "sparing", "often"]).optional(),
  channel_variants: z.record(z.string(), z.string().max(400)).optional(),
  tone_rules: z.record(z.string(), z.string().max(400)).optional(),
  changes: z.string().min(1).max(1000).describe("What's different from the current voice, and why"),
};

async function proposeVoice(
  ctx: ToolContext,
  source: "analysis" | "edits",
  profile: Record<string, unknown>,
) {
  const { data, error } = await ctx.db.rpc("propose_voice_profile", {
    p_company: ctx.companyId,
    p_run: ctx.runId,
    p_source: source,
    p_profile: profile as { [key: string]: Json },
  });
  if (error) throw new Error(`propose voice: ${error.message}`);
  return {
    approvalId: undefined,
    text: `Proposed voice profile ${String(data)} for the founder's approval. It won't be used until they give GO.`,
  };
}

TOOLS.push(
  def({
    name: "get_voice_profile",
    description: "The company's current approved voice profile.",
    shape: {},
    readOnly: true,
    handler: async (ctx) => {
      const { data } = await ctx.db
        .from("voice_profiles")
        .select(
          "version, summary, traits, use_phrases, avoid_phrases, reading_level, spelling, sign_off, emoji, channel_variants, tone_rules",
        )
        .eq("company_id", ctx.companyId)
        .eq("status", "approved")
        .maybeSingle();
      return { text: json(data) };
    },
  }),
  def({
    name: "get_voice_sources",
    description:
      "The company's own writing for voice analysis: website copy and past emails or posts the founder shared.",
    shape: {},
    readOnly: true,
    handler: async (ctx) => {
      const { data } = await ctx.db
        .from("voice_sources")
        .select("kind, content")
        .eq("company_id", ctx.companyId)
        .order("created_at")
        .limit(40);
      return { text: json(data ?? []) };
    },
  }),
  def({
    name: "get_edit_events",
    description:
      "Edits the founder made to Sol's drafts that haven't been learned from yet: the original and the final text.",
    shape: {},
    readOnly: true,
    handler: async (ctx) => {
      const { data } = await ctx.db
        .from("voice_edit_events")
        .select("channel, original, final, created_at")
        .eq("company_id", ctx.companyId)
        .is("used_at", null)
        .order("created_at")
        .limit(50);
      return { text: json(data ?? []) };
    },
  }),
  def({
    name: "propose_voice_from_analysis",
    description:
      "Proposes a voice profile learned from the company's writing. The founder approves it in GO / NO-GO.",
    shape: VOICE_SHAPE,
    readOnly: false,
    handler: async (ctx, profile) => proposeVoice(ctx, "analysis", profile),
  }),
  def({
    name: "propose_voice_from_edits",
    description:
      "Proposes changes to the voice learned from the founder's edits. The founder approves it in GO / NO-GO.",
    shape: VOICE_SHAPE,
    readOnly: false,
    handler: async (ctx, profile) => proposeVoice(ctx, "edits", profile),
  }),
);

// Capture from conversation (Phase 12, SPEC P): read a capture, propose what was in it for the
// founder's review, and draft promised follow-ups. Nothing is created until they accept.
const ITEM_SHAPE = z.object({
  kind: z.enum(ITEM_KINDS),
  text: z.string().min(1).max(1000),
  owner: z.enum(["sol", "founder", "teammate", "unknown"]).optional(),
  owner_id: z.string().uuid().optional(),
  owner_name: z.string().max(100).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  department: z.enum(["build", "grow", "run", "legal", "raise"]).optional(),
  confidence: z.number().min(0).max(1),
  contact_name: z.string().max(200).optional(),
  sensitive: z.boolean().optional(),
  quote: z.string().max(1000).optional(),
  at_seconds: z.number().int().min(0).optional(),
});

async function captureTeam(ctx: ToolContext) {
  const { data } = await ctx.db
    .from("company_members")
    .select("user_id, role, profiles(full_name)")
    .eq("company_id", ctx.companyId)
    .in("role", ["founder", "teammate"]);
  return (data ?? []).map((m) => ({
    id: m.user_id,
    role: m.role,
    name: (m.profiles as { full_name: string } | null)?.full_name ?? "",
  }));
}

TOOLS.push(
  def({
    name: "get_capture",
    description:
      "The capture to read: its kind, title, participants and transcript (with speaker labels and timestamps when there are any).",
    shape: { capture_id: z.string().uuid() },
    readOnly: true,
    handler: async (ctx, { capture_id }) => {
      const [cap, tr] = await Promise.all([
        ctx.db
          .from("captures")
          .select("id, source, title, participants, created_at")
          .eq("id", capture_id)
          .eq("company_id", ctx.companyId)
          .maybeSingle(),
        ctx.db
          .from("transcripts")
          .select("text, segments")
          .eq("capture_id", capture_id)
          .eq("company_id", ctx.companyId)
          .maybeSingle(),
      ]);
      if (!cap.data || !tr.data) return { isError: true, text: "Capture or transcript not found." };
      return { text: json({ ...cap.data, transcript: tr.data.text, segments: tr.data.segments }) };
    },
  }),
  def({
    name: "get_capture_context",
    description:
      "What to match extracted items against: open tasks, ideas, the team (founders and teammates) and contacts. Prefer updating an existing task to creating a duplicate.",
    shape: {},
    readOnly: true,
    handler: async (ctx) => {
      const [tasks, ideas, contacts] = await Promise.all([
        ctx.db
          .from("tasks")
          .select("id, title, status, due")
          .eq("company_id", ctx.companyId)
          .neq("status", "done"),
        ctx.db.from("ideas").select("id, title, status").eq("company_id", ctx.companyId),
        ctx.db.from("contacts").select("id, name").eq("company_id", ctx.companyId).limit(500),
      ]);
      return {
        text: json({
          today: new Date().toISOString().slice(0, 10),
          tasks: tasks.data ?? [],
          ideas: ideas.data ?? [],
          team: await captureTeam(ctx),
          contacts: contacts.data ?? [],
        }),
      };
    },
  }),
  def({
    name: "propose_extraction",
    description:
      "Saves what you found in the capture for the founder's review card. Nothing is created until they accept. Matching to existing tasks and contacts is checked here too.",
    shape: { capture_id: z.string().uuid(), items: z.array(ITEM_SHAPE).max(60) },
    readOnly: false,
    handler: async (ctx, { capture_id, items }) => {
      const [tasks, contacts, team] = await Promise.all([
        ctx.db
          .from("tasks")
          .select("id, title, status")
          .eq("company_id", ctx.companyId)
          .neq("status", "done"),
        ctx.db.from("contacts").select("id, name").eq("company_id", ctx.companyId).limit(500),
        captureTeam(ctx),
      ]);
      const rows = items.map((it) => {
        const task = it.kind === "action" ? matchTask(it.text, tasks.data ?? []) : undefined;
        const contact = matchContact(it.contact_name, contacts.data ?? []);
        const mate =
          it.owner === "teammate" && !it.owner_id && it.owner_name
            ? matchContact(it.owner_name, team)
            : undefined;
        return {
          ...it,
          ...(task ? { match_task_id: task.id } : {}),
          ...(contact ? { contact_id: contact.id } : {}),
          ...(mate ? { owner_id: mate.id } : {}),
        };
      });
      const { data, error } = await ctx.db.rpc("save_extraction", {
        p_capture: capture_id,
        p_run: ctx.runId,
        p_items: rows as unknown as Json,
      });
      if (error) return { isError: true, text: `Not saved: ${error.message}` };
      const updates = rows.filter((r) => "match_task_id" in r).length;
      return {
        text: `Saved ${String(data)} items for review${updates ? ` (${updates} update existing tasks)` : ""}.`,
      };
    },
  }),
  def({
    name: "get_commitment",
    description: "A promise the founder made to someone outside the company, with the contact.",
    shape: { commitment_id: z.string().uuid() },
    readOnly: true,
    handler: async (ctx, { commitment_id }) => {
      const { data } = await ctx.db
        .from("commitments")
        .select("id, to_name, what, due_date, status, contacts(name, email)")
        .eq("id", commitment_id)
        .eq("company_id", ctx.companyId)
        .maybeSingle();
      return data ? { text: json(data) } : { isError: true, text: "Promise not found." };
    },
  }),
  def({
    name: "propose_followup",
    description:
      "Drafts the follow-up the founder promised, in the company voice. With the contact's email it becomes an email for approval; otherwise the draft is saved on the promise for the founder to send.",
    shape: {
      commitment_id: z.string().uuid(),
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(5000),
    },
    readOnly: false,
    handler: async (ctx, { commitment_id, subject, body }) => {
      const { data: c } = await ctx.db
        .from("commitments")
        .select("id, to_name, what, contacts(email)")
        .eq("id", commitment_id)
        .eq("company_id", ctx.companyId)
        .maybeSingle();
      if (!c) return { isError: true, text: "Promise not found." };
      const email = (c.contacts as { email: string } | null)?.email;
      if (!email) {
        const flags = await claims(ctx, body);
        if (flags.length)
          return {
            isError: true,
            text: `Not saved: the claims check flagged "${flags[0]!.phrase}". Rewrite it.`,
          };
        await ctx.db
          .from("commitments")
          .update({ followup_draft: `${subject}\n\n${body}` })
          .eq("id", commitment_id);
        return { text: "Saved the draft on the promise (no email address for this person)." };
      }
      const r = await propose(
        ctx,
        "send_email",
        { to: email, subject, body, reason: `You promised ${c.to_name}: ${c.what}` },
        `${subject}\n${body}`,
      );
      if (r.approvalId)
        await ctx.db
          .from("commitments")
          .update({ followup_approval_id: r.approvalId, followup_draft: body })
          .eq("id", commitment_id);
      return r;
    },
  }),
);

// The morning brief (Phase 8): facts from the database, then the brief itself.
async function briefFacts(ctx: ToolContext): Promise<BriefFacts> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const today = localTime(new Date()).date;
  const head = { count: "exact" as const, head: true };
  const [approvals, runs, meetings, actions, accepted, promises, threads, leads, summary] =
    await Promise.all([
      ctx.db
        .from("approvals")
        .select("id", head)
        .eq("company_id", ctx.companyId)
        .eq("status", "pending"),
      ctx.db
        .from("agent_runs")
        .select("credits_charged, task")
        .eq("company_id", ctx.companyId)
        .gte("started_at", since)
        .neq("task", "Chat with Sol"),
      ctx.db
        .from("captures")
        .select("id", head)
        .eq("company_id", ctx.companyId)
        .gte("created_at", since),
      ctx.db
        .from("extracted_items")
        .select("id", head)
        .eq("company_id", ctx.companyId)
        .eq("kind", "action")
        .gte("created_at", since),
      ctx.db
        .from("extracted_items")
        .select("id", head)
        .eq("company_id", ctx.companyId)
        .eq("kind", "action")
        .eq("status", "accepted")
        .gte("created_at", since),
      ctx.db
        .from("commitments")
        .select("to_name, what, due_date, status")
        .eq("company_id", ctx.companyId),
      ctx.db
        .from("email_threads")
        .select("id, email_messages(direction, created_at)")
        .eq("company_id", ctx.companyId)
        .neq("mode", "outreach"),
      ctx.db
        .from("leads")
        .select("id", head)
        .eq("company_id", ctx.companyId)
        .gte("created_at", since),
      ctx.db.rpc("credit_summary", { p_company: ctx.companyId }),
    ]);
  const heard = await heardThisWeek(ctx);
  const waiting = (threads.data ?? []).filter((t) => {
    const msgs = ((t.email_messages ?? []) as { direction: string; created_at: string }[]).sort(
      (a, b) => a.created_at.localeCompare(b.created_at),
    );
    return msgs[msgs.length - 1]?.direction === "received";
  }).length;
  return {
    date: today,
    approvalsWaiting: approvals.count ?? 0,
    overnight: {
      runs: (runs.data ?? []).length,
      credits: (runs.data ?? []).reduce((n, r) => n + (r.credits_charged ?? 0), 0),
    },
    meetings: meetings.count ?? 0,
    actionsFound: actions.count ?? 0,
    actionsAccepted: accepted.count ?? 0,
    promisesDue: commitmentsDue(promises.data ?? [], today).map((c) => ({
      to: c.to_name,
      what: c.what,
    })),
    inboxWaiting: waiting,
    newLeads: leads.count ?? 0,
    balance: (summary.data as { balance: number } | null)?.balance ?? 0,
    ...(heard.count ? { heard } : {}),
  };
}

/** Comments, reviews and feedback from the last seven days, as themes (Phase 16). */
async function heardThisWeek(ctx: ToolContext) {
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [items, feedback] = await Promise.all([
    ctx.db
      .from("inbox_items")
      .select("sentiment, created_at, email_messages(body)")
      .eq("company_id", ctx.companyId)
      .in("channel", ["social", "review"])
      .gte("created_at", week),
    ctx.db
      .from("feedback")
      .select("body, sentiment, created_at")
      .eq("company_id", ctx.companyId)
      .gte("created_at", week),
  ]);
  const all: Heard[] = [
    ...(items.data ?? []).map((i) => ({
      at: i.created_at,
      text: (i.email_messages as { body: string } | null)?.body ?? "",
      sentiment: i.sentiment as Heard["sentiment"],
    })),
    ...(feedback.data ?? []).map((f) => ({
      at: f.created_at,
      text: f.body,
      sentiment: f.sentiment as Heard["sentiment"],
    })),
  ];
  return {
    count: all.length,
    negative: all.filter((h) => h.sentiment === "negative").length,
    themes: topThemes(all, 3).map((t) => t.theme),
  };
}

TOOLS.push(
  def({
    name: "get_brief_facts",
    description:
      "Today's facts for the morning brief: approvals waiting, last night's work, yesterday's meetings and actions, promises due today, customers waiting, new leads, what customers said this week (themes) and the balance.",
    shape: {},
    readOnly: true,
    handler: async (ctx) => ({ text: json(await briefFacts(ctx)) }),
  }),
  def({
    name: "save_brief",
    description: "Saves today's morning brief and sends it to the founder in chat.",
    shape: { content: z.string().min(1).max(3000) },
    readOnly: false,
    handler: async (ctx, { content }) => {
      const facts = await briefFacts(ctx);
      const { error } = await ctx.db.from("briefs").upsert({
        company_id: ctx.companyId,
        brief_date: facts.date,
        content,
        facts: facts as unknown as { [k: string]: Json },
        run_id: ctx.runId,
      });
      if (error) return { isError: true, text: `Not saved: ${error.message}` };
      await ctx.db
        .from("chat_messages")
        .insert({ company_id: ctx.companyId, sender: "sol", content });
      return { text: "Saved and sent." };
    },
  }),
);

// Skills from Phase 9: compliance calendar, investor update, evidence plan.
TOOLS.push(
  def({
    name: "get_compliance",
    description:
      "The company's compliance calendar (title, category, due date, status), and the UK deadlines a small limited company would normally have, worked out from when it started.",
    shape: {},
    readOnly: true,
    handler: async (ctx) => {
      const [items, company, consents] = await Promise.all([
        ctx.db
          .from("compliance_items")
          .select("title, category, due_date, status, statutory")
          .eq("company_id", ctx.companyId),
        ctx.db.from("companies").select("started_at, created_at").eq("id", ctx.companyId).single(),
        ctx.db
          .from("consents")
          .select("id", { count: "exact", head: true })
          .eq("company_id", ctx.companyId)
          .eq("purpose", "marketing"),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const started = (company.data?.started_at ?? company.data?.created_at ?? today).slice(0, 10);
      return {
        text: json({
          today,
          calendar: items.data ?? [],
          usual_uk_deadlines: ukDeadlines(started, today, {
            emailMarketing: (consents.count ?? 0) > 0,
          }),
        }),
      };
    },
  }),
  def({
    name: "add_compliance_items",
    description:
      "Adds deadlines to the compliance calendar (internal, no approval needed) and marks anything past its date as overdue. Items already in the calendar are skipped.",
    shape: {
      items: z
        .array(
          z.object({
            title: z.string().min(1).max(200),
            category: z.string().min(1).max(60),
            due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            statutory: z.boolean(),
          }),
        )
        .max(20),
    },
    readOnly: false,
    handler: async (ctx, { items }) => {
      const { data: existing } = await ctx.db
        .from("compliance_items")
        .select("title, due_date")
        .eq("company_id", ctx.companyId);
      const add = missingDeadlines(items, existing ?? []);
      if (add.length)
        await ctx.db.from("compliance_items").insert(
          add.map((i) => ({
            ...i,
            company_id: ctx.companyId,
            status: "upcoming" as const,
            source: "sol",
          })),
        );
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await ctx.db
        .from("compliance_items")
        .update({ status: "overdue" }, { count: "exact" })
        .eq("company_id", ctx.companyId)
        .lt("due_date", today)
        .in("status", ["upcoming", "in_progress"]);
      return { text: `Added ${add.length} deadline(s); ${count ?? 0} marked overdue.` };
    },
  }),
  def({
    name: "get_investor_facts",
    description:
      "Facts for the monthly investor update: this month's and last month's revenue, visitors and signups, the stage, recently completed tasks and investors in the pipeline.",
    shape: {},
    readOnly: true,
    handler: async (ctx) => {
      const since = new Date(Date.now() - 62 * 86_400_000).toISOString().slice(0, 10);
      const [metrics, company, done, investors] = await Promise.all([
        ctx.db
          .from("metrics_daily")
          .select("date, visitors, signups, mrr")
          .eq("company_id", ctx.companyId)
          .gte("date", since)
          .order("date"),
        ctx.db.from("companies").select("name, stage").eq("id", ctx.companyId).single(),
        ctx.db
          .from("tasks")
          .select("title, completed_at")
          .eq("company_id", ctx.companyId)
          .eq("status", "done")
          .gte("completed_at", new Date(Date.now() - 31 * 86_400_000).toISOString())
          .limit(10),
        ctx.db.from("investors").select("name, firm, stage").eq("company_id", ctx.companyId),
      ]);
      const rows = metrics.data ?? [];
      const cut = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
      const thisMonth = rows.filter((r) => r.date >= cut);
      const lastMonth = rows.filter((r) => r.date < cut);
      const sum = (xs: typeof rows, k: "visitors" | "signups") => xs.reduce((n, r) => n + r[k], 0);
      return {
        text: json({
          company: company.data?.name,
          stage: company.data?.stage,
          visitors: sum(thisMonth, "visitors"),
          signups: sum(thisMonth, "signups"),
          mrr: Number(thisMonth[thisMonth.length - 1]?.mrr ?? 0),
          previous_mrr: Number(lastMonth[lastMonth.length - 1]?.mrr ?? 0),
          wins: (done.data ?? []).map((t) => t.title),
          investors: investors.data ?? [],
        }),
      };
    },
  }),
  def({
    name: "save_investor_update",
    description:
      'Saves the investor update as a new version of the company\'s "Investor updates" document (internal; the founder sends it).',
    shape: { content: z.string().min(1).max(20000) },
    readOnly: false,
    handler: async (ctx, { content }) => {
      let { data: doc } = await ctx.db
        .from("documents")
        .select("id")
        .eq("company_id", ctx.companyId)
        .eq("title", "Investor updates")
        .maybeSingle();
      if (!doc) {
        const made = await ctx.db
          .from("documents")
          .insert({ company_id: ctx.companyId, title: "Investor updates" })
          .select("id")
          .single();
        doc = made.data;
      }
      if (!doc) return { isError: true, text: "Couldn't create the document." };
      const { data: latest } = await ctx.db
        .from("document_versions")
        .select("version")
        .eq("document_id", doc.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error } = await ctx.db.from("document_versions").insert({
        document_id: doc.id,
        company_id: ctx.companyId,
        version: (latest?.version ?? 0) + 1,
        content,
        run_id: ctx.runId,
      });
      if (error) return { isError: true, text: `Not saved: ${error.message}` };
      return { text: `Saved as version ${(latest?.version ?? 0) + 1} of Investor updates.` };
    },
  }),
  def({
    name: "add_assumptions",
    description:
      "Adds testable assumptions to the evidence board (internal), each with how to test it and what counts as a pass, plus the smoke test to run.",
    shape: {
      idea: z.string().min(1).max(500),
      smoke_test: z.string().min(1).max(1000),
      assumptions: z
        .array(
          z.object({
            title: z.string().min(1).max(300),
            test: z.string().min(1).max(500),
            pass: z.string().min(1).max(300),
          }),
        )
        .min(1)
        .max(5),
    },
    readOnly: false,
    handler: async (ctx, { idea, smoke_test, assumptions }) => {
      const { error } = await ctx.db.from("evidence_items").insert(
        assumptions.map((a) => ({
          company_id: ctx.companyId,
          type: "assumption" as const,
          title: a.title,
          status: "untested" as const,
          data: { test: a.test, pass: a.pass, idea, smoke_test, source: "sol" },
        })),
      );
      if (error) return { isError: true, text: `Not saved: ${error.message}` };
      return { text: `Added ${assumptions.length} assumptions to test.` };
    },
  }),
);

// The inbox pipeline (Phase 14): triage, the policy decision, and the reply.
async function inboxItem(ctx: ToolContext, itemId: string) {
  const { data: item } = await ctx.db
    .from("inbox_items")
    .select(
      "id, thread_id, message_id, contact_id, status, category, mode, channel, email_threads(subject, contact_name, address, platform, external_id, external_url, rating)",
    )
    .eq("id", itemId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  return item;
}

TOOLS.push(
  def({
    name: "get_inbox_item",
    description:
      "One message waiting in the inbox, with the conversation so far, who sent it, what we know about them, and the company's name and sign-off.",
    shape: { item_id: z.string().uuid() },
    readOnly: true,
    handler: async (ctx, { item_id }) => {
      const item = await inboxItem(ctx, item_id);
      if (!item) return { isError: true, text: "Message not found." };
      const thread = item.email_threads as {
        subject: string;
        contact_name: string;
        address: string;
      } | null;
      const [messages, contact, company, voice] = await Promise.all([
        ctx.db
          .from("email_messages")
          .select("id, direction, body, created_at")
          .eq("thread_id", item.thread_id)
          .order("created_at"),
        item.contact_id
          ? ctx.db
              .from("contacts")
              .select("name, kind, value, source")
              .eq("id", item.contact_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        ctx.db.from("companies").select("name").eq("id", ctx.companyId).single(),
        ctx.db
          .from("voice_profiles")
          .select("sign_off")
          .eq("company_id", ctx.companyId)
          .eq("status", "approved")
          .maybeSingle(),
      ]);
      const msgs = messages.data ?? [];
      return {
        text: json({
          item_id,
          subject: thread?.subject,
          from: { name: thread?.contact_name, address: thread?.address },
          message: msgs.find((m) => m.id === item.message_id)?.body,
          earlier: msgs.filter((m) => m.id !== item.message_id).slice(-6),
          contact: contact.data,
          company: company.data?.name,
          sign_off: voice.data?.sign_off ?? null,
          mode: item.mode,
          // Social comments and reviews are answered in public, briefly (Phase 16).
          channel: item.channel,
          ...(item.channel === "social" || item.channel === "review"
            ? {
                public: true,
                platform: (item.email_threads as { platform: string | null } | null)?.platform,
                rating: (item.email_threads as { rating: number | null } | null)?.rating ?? null,
              }
            : {}),
        }),
      };
    },
  }),
  def({
    name: "save_triage",
    description:
      "Records the triage (category, sentiment, urgency, language, flags) and applies the response policy and its hard rules. Returns what happens next: escalate to the founder, or draft a reply (sent automatically only where the policy allows).",
    shape: {
      item_id: z.string().uuid(),
      category: z.enum([
        "general_enquiry",
        "pricing_question",
        "complaint",
        "refund_request",
        "booking",
        "review_positive",
        "review_negative",
        "legal_threat",
        "press",
        "spam",
      ]),
      sentiment: z.enum(["positive", "neutral", "negative"]),
      urgency: z.enum(["low", "normal", "high"]),
      language: z.string().min(2).max(10),
      flags: z
        .object({
          money: z.boolean().optional(),
          legal: z.boolean().optional(),
          safety: z.boolean().optional(),
          vulnerable: z.boolean().optional(),
          data_request: z.boolean().optional(),
          unverified_claim: z.boolean().optional(),
          spam: z.boolean().optional(),
        })
        .default({}),
    },
    readOnly: false,
    handler: async (ctx, t) => {
      const item = await inboxItem(ctx, t.item_id);
      if (!item) return { isError: true, text: "Message not found." };
      const { data: policy } = await ctx.db
        .from("response_policies")
        .select("mode")
        .eq("company_id", ctx.companyId)
        .eq("category", t.category)
        .maybeSingle();
      const flags = Object.fromEntries(Object.entries(t.flags).filter(([, v]) => v === true));
      const d = decideMode(
        { category: t.category, flags } as Pick<Triage, "category" | "flags">,
        (policy?.mode ?? "draft") as ResponseMode,
      );
      const escalate = d.mode === "escalate";
      await ctx.db
        .from("inbox_items")
        .update({
          category: t.category,
          sentiment: t.sentiment,
          urgency: t.urgency,
          language: t.language,
          flags,
          mode: d.mode,
          reason: d.reason,
          status: t.category === "spam" ? "spam" : escalate ? "escalated" : "drafting",
          ...(escalate ? { processed_at: new Date().toISOString() } : {}),
        })
        .eq("id", t.item_id);
      const thread = item.email_threads as { contact_name: string; subject: string } | null;
      if (escalate && t.category !== "spam") {
        await ctx.db.from("chat_messages").insert({
          company_id: ctx.companyId,
          sender: "sol",
          content: `A message from ${thread?.contact_name || "a customer"} ("${thread?.subject ?? ""}") needs you: ${d.reason}. I haven't replied.`,
        });
        await ctx.db.from("activity_events").insert({
          company_id: ctx.companyId,
          type: "escalation",
          summary: `Escalated: ${thread?.subject ?? "a message"} (${d.reason})`,
        });
      }
      if (!escalate)
        await ctx.db.from("agent_jobs").insert({
          company_id: ctx.companyId,
          job_type: "inbox_draft",
          payload: { item_id: t.item_id, title: `Reply: ${thread?.subject ?? "a message"}` },
          estimated_credits: 15,
        });
      return {
        text: escalate
          ? `Escalated to the founder: ${d.reason}.`
          : `Policy: ${d.mode} (${d.reason}). A reply will be drafted.`,
      };
    },
  }),
  def({
    name: "propose_reply",
    description:
      "Proposes the reply to an inbox message. It's checked for claims; then it's sent automatically if the policy allows (and the executor's hard rules agree), otherwise it waits for the founder's GO.",
    shape: { item_id: z.string().uuid(), body: z.string().min(1).max(5000) },
    readOnly: false,
    handler: async (ctx, { item_id, body }) => {
      const item = await inboxItem(ctx, item_id);
      if (!item) return { isError: true, text: "Message not found." };
      const flags = await claims(ctx, body);
      if (flags.length)
        return {
          isError: true,
          text: `Not proposed: the claims check flagged "${flags[0]!.phrase}". Rewrite it.`,
        };
      if (item.channel === "social" || item.channel === "review") {
        // A public reply: always waits for the founder's GO, whatever the policy (D75).
        const t = item.email_threads as {
          platform: string | null;
          external_id: string | null;
        } | null;
        const { data: msg } = await ctx.db
          .from("email_messages")
          .select("external_id")
          .eq("id", item.message_id)
          .single();
        const review = item.channel === "review";
        const r = await propose(
          ctx,
          "reply_public",
          {
            platform: t?.platform ?? "",
            kind: review ? "review" : "comment",
            // The provider's id, without our platform prefix.
            external_id: (msg?.external_id ?? t?.external_id ?? "").replace(/^[a-z]+:/, ""),
            text: body,
            thread_id: item.thread_id,
            inbox_item_id: item_id,
            reason: review
              ? "A public reply to a review, in your voice."
              : "A public reply to a comment on your post.",
          },
          null,
        );
        if (r.approvalId)
          await ctx.db
            .from("inbox_items")
            .update({ status: "awaiting_approval", approval_id: r.approvalId })
            .eq("id", item_id);
        return r;
      }
      const thread = item.email_threads as { subject: string; address: string } | null;
      const { data: full } = await ctx.db
        .from("inbox_items")
        .select("category, flags, mode")
        .eq("id", item_id)
        .single();
      const auto = full?.mode === "auto_send";
      const subject = /^re:/i.test(thread?.subject ?? "")
        ? thread!.subject
        : `Re: ${thread?.subject ?? ""}`;
      const now = new Date().toISOString();
      const { data: approval, error } = await ctx.db
        .from("approvals")
        .insert({
          company_id: ctx.companyId,
          run_id: ctx.runId,
          action_type: "send_email",
          payload: {
            to: thread?.address ?? "",
            subject,
            body,
            thread_id: item.thread_id,
            inbox_item_id: item_id,
            reason: auto
              ? "Your policy lets me answer this kind of message myself."
              : "A reply to a customer, in your voice.",
            triage: {
              category: full?.category,
              ...((full?.flags as Record<string, boolean>) ?? {}),
            },
            ...(auto ? { auto_send: true } : {}),
          },
          estimated_credits: ACTION_CREDITS.send_email,
          ...(auto
            ? { status: "approved" as const, decided_at: now, execution_status: "queued" as const }
            : {}),
        })
        .select("id")
        .single();
      if (error || !approval) throw new Error(`propose reply: ${error?.message ?? "no row"}`);
      await ctx.db
        .from("inbox_items")
        .update({ status: "awaiting_approval", approval_id: approval.id })
        .eq("id", item_id);
      return {
        approvalId: approval.id,
        text: auto
          ? "Queued to send automatically (the executor checks the hard rules first)."
          : "Waiting for the founder's GO.",
      };
    },
  }),
);

// Campaigns (Phase 15).
async function campaign(ctx: ToolContext, id: string) {
  const { data } = await ctx.db
    .from("campaigns")
    .select(
      "id, name, goal, metric, target, audience, channels, budget_credits, budget_gbp, starts_on, ends_on, status, plan",
    )
    .eq("id", id)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  return data;
}

TOOLS.push(
  def({
    name: "propose_campaign",
    description:
      "Proposes a campaign plan for the founder's approval: goal, success metric and target, audience, channels, credit budget (and any paid media budget in pounds), dates, and the outline. Nothing is drafted until they approve.",
    shape: {
      name: z.string().min(1).max(120),
      goal: z.string().min(1).max(300),
      metric: z.enum(["clicks", "leads", "customers"]),
      target: z.number().int().positive(),
      audience: z.string().max(300),
      channels: z.array(z.string().min(1).max(30)).min(1).max(8),
      budget_credits: z.number().int().min(0).max(5000),
      budget_gbp: z.number().min(0).max(10000).optional(),
      starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      rationale: z.string().min(1).max(1500),
      posts: z.number().int().min(0).max(20),
      emails: z.number().int().min(0).max(4),
      ads: z.number().int().min(0).max(4),
    },
    readOnly: false,
    handler: async (ctx, c) => {
      const { data: row, error } = await ctx.db
        .from("campaigns")
        .insert({
          company_id: ctx.companyId,
          name: c.name,
          goal: c.goal,
          metric: c.metric,
          target: c.target,
          audience: c.audience,
          channels: c.channels.map((x) => x.toLowerCase()),
          budget_credits: c.budget_credits,
          ...(c.budget_gbp !== undefined ? { budget_gbp: c.budget_gbp } : {}),
          starts_on: c.starts_on,
          ends_on: c.ends_on,
          plan: { rationale: c.rationale, posts: c.posts, emails: c.emails, ads: c.ads },
          run_id: ctx.runId,
        })
        .select("id")
        .single();
      if (error || !row)
        return { isError: true, text: `Not proposed: ${error?.message ?? "no row"}` };
      const r = await propose(
        ctx,
        "approve_campaign",
        {
          campaign_id: row.id,
          name: c.name,
          goal: c.goal,
          target: `${c.target} ${c.metric}`,
          channels: c.channels.join(", "),
          dates: `${c.starts_on} to ${c.ends_on}`,
          budget: `${c.budget_credits} credits${c.budget_gbp ? ` + £${c.budget_gbp} paid media (you launch it)` : ""}`,
          reason: c.rationale,
        },
        null,
      );
      if (r.approvalId)
        await ctx.db.from("campaigns").update({ approval_id: r.approvalId }).eq("id", row.id);
      return r;
    },
  }),
  def({
    name: "get_campaign",
    description:
      "An approved campaign: its plan, channels, dates and any assets and tracked links so far.",
    shape: { campaign_id: z.string().uuid() },
    readOnly: true,
    handler: async (ctx, { campaign_id }) => {
      const c = await campaign(ctx, campaign_id);
      if (!c) return { isError: true, text: "Campaign not found." };
      const [assets, links, consented] = await Promise.all([
        ctx.db
          .from("campaign_assets")
          .select("kind, channel, title, status")
          .eq("campaign_id", campaign_id),
        ctx.db
          .from("tracked_links")
          .select("id, code, channel, label")
          .eq("campaign_id", campaign_id),
        ctx.db
          .from("current_consents")
          .select("contact_id", { count: "exact", head: true })
          .eq("company_id", ctx.companyId)
          .eq("purpose", "marketing")
          .eq("status", "granted"),
      ]);
      return {
        text: json({
          ...c,
          assets: assets.data ?? [],
          links: links.data ?? [],
          contacts_who_opted_in: consented.count ?? 0,
        }),
      };
    },
  }),
  def({
    name: "create_campaign_link",
    description:
      "Creates the campaign's tracked link for one channel (UTM-tagged, counted in its results).",
    shape: {
      campaign_id: z.string().uuid(),
      channel: z.string().min(1).max(30),
      destination: z.string().url().optional(),
    },
    readOnly: false,
    handler: async (ctx, { campaign_id, channel, destination }) => {
      const c = await campaign(ctx, campaign_id);
      if (!c) return { isError: true, text: "Campaign not found." };
      const [{ data: hub }, { data: co }] = await Promise.all([
        ctx.db.from("hub_pages").select("slug, enabled").eq("company_id", ctx.companyId).single(),
        ctx.db.from("companies").select("website_live_url").eq("id", ctx.companyId).single(),
      ]);
      const appUrl = process.env["APP_URL"] ?? "http://127.0.0.1:8080";
      const dest =
        destination ??
        (hub?.enabled
          ? `${appUrl}/h/${hub.slug}`
          : /^https?:\/\//.test(co?.website_live_url ?? "")
            ? co!.website_live_url!
            : `${appUrl}/h/${hub?.slug ?? ""}`);
      const code = Array.from(
        crypto.getRandomValues(new Uint8Array(8)),
        (b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"[b % 57],
      ).join("");
      const { data, error } = await ctx.db
        .from("tracked_links")
        .insert({
          company_id: ctx.companyId,
          code,
          destination: dest,
          label: `${c.name}: ${channel}`,
          channel: channel.toLowerCase(),
          medium: channel === "email" ? "email" : channel === "print" ? "qr" : "social",
          campaign: c.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 60),
          campaign_id,
          created_by_sol: true,
        })
        .select("id, code")
        .single();
      if (error || !data) return { isError: true, text: `Link not created: ${error?.message}` };
      return { text: json({ link_id: data.id, code: data.code }) };
    },
  }),
  def({
    name: "propose_campaign_asset",
    description:
      "Drafts one campaign asset. Posts and emails are checked (claims and CAP Code) and go to the founder for GO, scheduled for the given time; emails go only to contacts who opted in to marketing. Ads are exported with their tracked link for the founder to launch.",
    shape: {
      campaign_id: z.string().uuid(),
      kind: z.enum(["social_post", "email", "ad"]),
      channel: z.string().min(1).max(30),
      title: z.string().max(200),
      body: z.string().min(1).max(5000),
      link_id: z.string().uuid().optional(),
      scheduled_for: z.string().datetime({ offset: true }).optional(),
    },
    readOnly: false,
    handler: async (ctx, a) => {
      const c = await campaign(ctx, a.campaign_id);
      if (!c) return { isError: true, text: "Campaign not found." };
      const text = `${a.title}\n${a.body}`;
      const flags = [...(await claims(ctx, text)), ...capFlags(text)];
      if (flags.length)
        return {
          isError: true,
          text: `Not drafted: ${flags.map((f) => `"${f.phrase}" (${f.reason})`).join(", ")}. Rewrite it.`,
        };
      const { data: link } = a.link_id
        ? await ctx.db
            .from("tracked_links")
            .select("id, code")
            .eq("id", a.link_id)
            .eq("company_id", ctx.companyId)
            .maybeSingle()
        : { data: null };
      const base =
        process.env["SHORT_LINK_BASE"] ??
        `${process.env["SUPABASE_URL"] ?? "http://127.0.0.1:54321"}/functions/v1/link`;
      const body = link ? `${a.body}\n\n${base}/${link.code}` : a.body;
      const { data: asset, error } = await ctx.db
        .from("campaign_assets")
        .insert({
          campaign_id: a.campaign_id,
          company_id: ctx.companyId,
          kind: a.kind,
          channel: a.channel.toLowerCase(),
          title: a.title,
          body,
          ...(a.scheduled_for ? { scheduled_for: a.scheduled_for } : {}),
          ...(link ? { link_id: link.id } : {}),
          status: a.kind === "ad" ? "exported" : "draft",
        })
        .select("id")
        .single();
      if (error || !asset) return { isError: true, text: `Not drafted: ${error?.message}` };
      if (a.kind === "ad")
        return {
          text: "Ad copy and tracked link ready for the founder to launch in the ad platform.",
        };
      let r: ToolResult;
      if (a.kind === "email") {
        // PECR: marketing email only to people with recorded permission.
        const { data: ok } = await ctx.db
          .from("current_consents")
          .select("contact_id, contacts(email)")
          .eq("company_id", ctx.companyId)
          .eq("purpose", "marketing")
          .eq("status", "granted")
          .limit(50);
        const to = (ok ?? [])
          .map((x) => (x.contacts as { email: string } | null)?.email)
          .filter(Boolean);
        if (!to.length) {
          await ctx.db.from("campaign_assets").delete().eq("id", asset.id);
          return {
            isError: true,
            text: "No contacts have opted in to marketing email, so no campaign email can be sent.",
          };
        }
        r = await propose(
          ctx,
          "send_email",
          {
            to: to.join(", "),
            subject: a.title,
            body,
            outreach: true,
            campaign_asset_id: asset.id,
            campaign_id: a.campaign_id,
            reason: `Campaign: ${c.name}`,
          },
          null,
        );
      } else {
        const channel = (
          {
            instagram: "Instagram",
            tiktok: "TikTok",
            linkedin: "LinkedIn",
            x: "X",
            twitter: "X",
          } as Record<string, string>
        )[a.channel.toLowerCase()];
        if (!channel)
          return {
            isError: true,
            text: `Can't publish to ${a.channel}; use Instagram, TikTok, LinkedIn or X.`,
          };
        r = await propose(
          ctx,
          "publish_post",
          {
            channel,
            text: body,
            angle: c.name,
            campaign_asset_id: asset.id,
            campaign_id: a.campaign_id,
            reason: `Campaign: ${c.name}`,
            ...(a.scheduled_for ? { scheduled_for: a.scheduled_for } : {}),
          },
          null,
        );
      }
      if (r.approvalId)
        await ctx.db
          .from("campaign_assets")
          .update({ status: "awaiting_approval", approval_id: r.approvalId })
          .eq("id", asset.id);
      return r;
    },
  }),
);

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);

/** The MCP server name the tools are served under, so full names are mcp__gumption__<tool>. */
export const MCP_SERVER = "gumption";
export const fullName = (tool: string) => `mcp__${MCP_SERVER}__${tool}`;

/** Validates and runs a tool by name. Unknown tools and bad input come back as errors. */
export async function callTool(
  ctx: ToolContext,
  name: string,
  input: unknown,
): Promise<ToolResult> {
  const tool = toolByName(name);
  if (!tool) return { isError: true, text: `Unknown tool ${name}` };
  const parsed = z.object(tool.shape).safeParse(input ?? {});
  if (!parsed.success) return { isError: true, text: `Invalid input: ${parsed.error.message}` };
  return tool.handler(ctx, parsed.data);
}
