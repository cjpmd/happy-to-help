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
  publish_post: 5,
  send_email: 5,
  ad_spend: 10,
  file_document: 5,
  publish_site: 20,
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
  };
}

TOOLS.push(
  def({
    name: "get_brief_facts",
    description:
      "Today's facts for the morning brief: approvals waiting, last night's work, yesterday's meetings and actions, promises due today, customers waiting, new leads and the balance.",
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
