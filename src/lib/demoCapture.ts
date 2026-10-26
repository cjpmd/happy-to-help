// The demo's version of capture from conversation: the same rules as the database RPCs
// (supabase/migrations/*_capture.sql), on the in-memory store. Pure: each function takes the
// store's data and returns the new data. Tested in src/test/demoCapture.test.ts.
import type { DB, ItemChanges, NewCapture } from "./storeContext";
import {
  acceptableInBulk,
  evidencePlan,
  extractItems,
  matchContact,
  matchTask,
  missingDetails,
  type ExtractedItem,
} from "./capture";

export interface DemoCtx {
  userId: string;
  now: Date;
  uid: (prefix: string) => string;
}

/** A capture from typed or pasted text, read straight away (the demo has no worker). */
export function demoCreateCapture(db: DB, c: NewCapture, ctx: DemoCtx): { db: DB; id: string } {
  const id = ctx.uid("cap");
  const at = ctx.now.toISOString();
  const team = db.company_members
    .filter((m) => m.company_id === c.companyId && m.role === "teammate")
    .map((m) => db.profiles.find((p) => p.id === m.user_id)?.full_name ?? "")
    .filter(Boolean);
  const contacts = db.contacts.filter((x) => x.company_id === c.companyId);
  const openTasks = db.tasks.filter((t) => t.company_id === c.companyId);
  const drafts = extractItems(c.text ?? "", {
    now: ctx.now,
    teammates: team,
    contacts: contacts.map((x) => x.name),
  });
  const auto =
    c.source === "voice_note" &&
    !!db.capture_settings.find((s) => s.company_id === c.companyId)?.auto_accept_own_notes;
  const items: ExtractedItem[] = drafts.map((d) => {
    const task = d.kind === "action" ? matchTask(d.text, openTasks) : undefined;
    return {
      ...d,
      id: ctx.uid("item"),
      capture_id: id,
      company_id: c.companyId,
      status: "pending",
      match_task_id: task?.id ?? null,
      contact_id: matchContact(d.contact_name, contacts)?.id ?? null,
      shared: false,
      routed: {},
    };
  });
  let next: DB = {
    ...db,
    captures: [
      {
        id,
        company_id: c.companyId,
        source: c.source,
        title: c.title ?? "",
        participants: c.participants ?? [],
        status: items.length ? "review" : "done",
        duration_seconds: c.durationSeconds ?? null,
        created_by: ctx.userId,
        created_at: at,
        error: null,
      },
      ...db.captures,
    ],
    extracted_items: [...db.extracted_items, ...items],
  };
  if (auto) for (const it of items) if (acceptableInBulk(it)) next = routeItem(next, it.id, ctx);
  return { db: closeIfReviewed(next, id), id };
}

/** Accepts one item (with the founder's changes) or explains why it can't be accepted yet. */
export function demoDecideItem(
  db: DB,
  id: string,
  decision: "accept" | "dismiss",
  changes: ItemChanges,
  fileSensitive: boolean,
  ctx: DemoCtx,
): { db: DB } | { error: string } {
  const it = db.extracted_items.find((x) => x.id === id);
  if (!it) return { error: "Item not found" };
  if (it.status !== "pending") return { error: "This was already decided" };
  if (decision === "dismiss")
    return {
      db: closeIfReviewed(
        { ...db, extracted_items: update(db, id, { status: "dismissed" }) },
        it.capture_id,
      ),
    };
  const edited = Object.keys(changes).length > 0;
  const next: ExtractedItem = { ...it, ...changes, ...(edited ? { confidence: 1 } : {}) };
  if (next.sensitive && !fileSensitive)
    return { error: "This sounds personal, so Sol won't file it unless you choose to" };
  const missing = missingDetails(next);
  if (missing[0] === "owner") return { error: "Say who is doing this first" };
  if (missing[0] === "due")
    return {
      error:
        next.kind === "commitment" ? "Add when you promised it by first" : "Add a due date first",
    };
  const withChanges = { ...db, extracted_items: update(db, id, next) };
  return { db: closeIfReviewed(routeItem(withChanges, id, ctx), it.capture_id) };
}

export function demoAcceptAll(db: DB, captureId: string, ctx: DemoCtx): { db: DB; n: number } {
  let next = db;
  let n = 0;
  for (const it of db.extracted_items)
    if (it.capture_id === captureId && it.status === "pending" && acceptableInBulk(it)) {
      next = routeItem(next, it.id, ctx);
      n++;
    }
  return { db: closeIfReviewed(next, captureId), n };
}

function update(db: DB, id: string, patch: Partial<ExtractedItem>) {
  return db.extracted_items.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

function closeIfReviewed(db: DB, captureId: string): DB {
  const waiting = db.extracted_items.some(
    (x) => x.capture_id === captureId && x.status === "pending",
  );
  return waiting
    ? db
    : {
        ...db,
        captures: db.captures.map((c) =>
          c.id === captureId && c.status === "review" ? { ...c, status: "done" } : c,
        ),
      };
}

/** Where an accepted item goes (SPEC P step 6). */
function routeItem(db: DB, id: string, ctx: DemoCtx): DB {
  const it = db.extracted_items.find((x) => x.id === id)!;
  const company = db.companies.find((c) => c.id === it.company_id);
  const at = ctx.now.toISOString();
  let routed: Record<string, unknown> = { noted: true };
  let next: DB = db;
  switch (it.kind) {
    case "action": {
      if (it.match_task_id) {
        next = {
          ...db,
          tasks: db.tasks.map((t) =>
            t.id === it.match_task_id && it.due_date ? { ...t, due: it.due_date } : t,
          ),
        };
        routed = { task_id: it.match_task_id, updated: true };
        break;
      }
      const taskId = ctx.uid("t");
      next = {
        ...db,
        tasks: [
          ...db.tasks,
          {
            id: taskId,
            company_id: it.company_id,
            pillar: it.department ?? "run",
            title: it.text,
            status: "todo",
            estimated_credits:
              it.owner === "sol"
                ? (db.job_types.find((j) => j.job_type === "task")?.estimate_credits ?? 150)
                : 0,
            actor: it.owner === "sol" ? "sol" : it.owner === "teammate" ? "teammate" : "founder",
            ...(it.due_date ? { due: it.due_date } : {}),
          },
        ],
      };
      routed = { task_id: taskId };
      break;
    }
    case "commitment": {
      const cid = ctx.uid("promise");
      next = {
        ...db,
        commitments: [
          ...db.commitments,
          {
            id: cid,
            company_id: it.company_id,
            to_name: it.contact_name ?? "Someone",
            contact_id: it.contact_id,
            what: it.text,
            due_date: it.due_date!,
            status: "open",
            followup_draft: null,
            created_at: at,
          },
        ],
      };
      routed = { commitment_id: cid };
      break;
    }
    case "idea": {
      const ideaId = ctx.uid("idea");
      const startUp = company?.entry_path !== "keep_going";
      const evidenceId = startUp ? ctx.uid("ev") : null;
      next = {
        ...db,
        ideas: [
          {
            id: ideaId,
            company_id: it.company_id,
            title: it.text,
            status: startUp ? "hypothesis" : "inbox",
            evidence_plan: startUp ? evidencePlan(it.text) : null,
            created_at: at,
          },
          ...db.ideas,
        ],
        evidence_items: evidenceId
          ? [
              ...db.evidence_items,
              {
                id: evidenceId,
                company_id: it.company_id,
                type: "assumption",
                title: it.text,
                data: { evidence_plan: evidencePlan(it.text), source: "capture" },
                status: "untested",
              },
            ]
          : db.evidence_items,
      };
      routed = { idea_id: ideaId, ...(evidenceId ? { evidence_item_id: evidenceId } : {}) };
      break;
    }
    case "memory_fact": {
      const approvalId = ctx.uid("a");
      next = {
        ...db,
        approvals: [
          {
            id: approvalId,
            company_id: it.company_id,
            run_id: null,
            action_type: "update_memory",
            payload: {
              fact: it.text,
              item_id: it.id,
              capture_id: it.capture_id,
              reason: "You mentioned this in a conversation. I'll remember it once you say GO.",
            },
            estimated_credits: 0,
            status: "pending",
            created_at: at,
            requested_by: ctx.userId,
          },
          ...db.approvals,
        ],
      };
      routed = { approval_id: approvalId };
      break;
    }
  }
  return {
    ...next,
    extracted_items: next.extracted_items.map((x) =>
      x.id === id ? { ...x, status: "accepted", routed } : x,
    ),
    activity_events: [
      {
        id: ctx.uid("ev"),
        company_id: it.company_id,
        type: "capture",
        summary: `From a conversation: ${it.kind.replace("_", " ")} accepted: ${it.text.slice(0, 160)}`,
        created_at: at,
      },
      ...next.activity_events,
    ],
  };
}
