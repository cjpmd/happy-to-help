// Capture from conversation (SPEC part P): what Sol pulls out of a note, debrief or transcript,
// how it's matched against what already exists, and how the review card groups it. Pure
// functions shared by the demo store and the agent service's mock runtime; tested in
// src/test/capture.test.ts. The real extraction is the capture-extract skill (structured
// output); this rule-based version is the stand-in until real agent runs are on.

export const ITEM_KINDS = [
  "decision",
  "action",
  "idea",
  "question",
  "commitment",
  "feedback",
  "memory_fact",
  "claim",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export type Owner = "sol" | "founder" | "teammate" | "unknown";
export type Department = "build" | "grow" | "run" | "legal" | "raise";

/** One item as extracted, before it's saved. */
export interface ItemDraft {
  kind: ItemKind;
  text: string;
  owner?: Owner;
  owner_name?: string;
  due_date?: string;
  department?: Department;
  /** 0 to 1. Below LOW_CONFIDENCE it's shown under "Possibly". */
  confidence: number;
  /** For commitments and feedback: who it's to or from. */
  contact_name?: string;
  /** Health, money trouble or private matters: never filed unless the founder does it. */
  sensitive?: boolean;
  /** The words it came from, and where in the transcript. */
  quote?: string;
  at_seconds?: number;
}

/** A saved item (the extracted_items table). */
export interface ExtractedItem extends ItemDraft {
  id: string;
  capture_id: string;
  company_id: string;
  status: "pending" | "accepted" | "dismissed";
  /** An existing task this updates instead of creating a new one. */
  match_task_id: string | null;
  contact_id: string | null;
  shared: boolean;
  routed: Record<string, unknown>;
}

export type CaptureSource =
  "voice_note" | "debrief" | "transcript" | "recording" | "notetaker" | "call";
export type CaptureStatus = "transcribing" | "extracting" | "review" | "done" | "failed";

export interface Capture {
  id: string;
  company_id: string;
  source: CaptureSource;
  title: string;
  participants: string[];
  status: CaptureStatus;
  duration_seconds: number | null;
  created_by: string | null;
  created_at: string;
  error: string | null;
}

export interface Idea {
  id: string;
  company_id: string;
  title: string;
  status: "inbox" | "hypothesis" | "parked" | "done";
  evidence_plan: string | null;
  created_at: string;
}

export interface Commitment {
  id: string;
  company_id: string;
  to_name: string;
  contact_id: string | null;
  what: string;
  due_date: string;
  status: "open" | "done" | "cancelled";
  followup_draft: string | null;
  created_at: string;
}

export const LOW_CONFIDENCE = 0.6;

export const KIND_LABELS: Record<ItemKind, string> = {
  decision: "Decision",
  action: "Action",
  idea: "Idea",
  question: "Open question",
  commitment: "Promise",
  feedback: "Customer feedback",
  memory_fact: "Remember",
  claim: "Claim to check",
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** A due date from words like "tomorrow", "by Friday", "next week" or "30 Oct". */
export function parseDue(text: string, now: Date): string | undefined {
  const t = text.toLowerCase();
  if (/\b(today|tonight|end of (the )?day)\b/.test(t)) return ymd(now);
  if (/\btomorrow\b/.test(t)) return ymd(addDays(now, 1));
  if (/\bnext week\b/.test(t)) return ymd(addDays(now, 7));
  if (/\b(end of (the )?week|this week)\b/.test(t))
    return ymd(addDays(now, (5 - now.getUTCDay() + 7) % 7));
  const dm = t.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*/,
  );
  if (dm) {
    const day = Number(dm[1]);
    const month = MONTHS.indexOf(dm[2]!);
    let d = new Date(Date.UTC(now.getUTCFullYear(), month, day));
    if (d.getTime() < now.getTime() - 86_400_000)
      d = new Date(Date.UTC(now.getUTCFullYear() + 1, month, day));
    return ymd(d);
  }
  const wd = t.match(
    /\b(?:by |on |this |next )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (wd) {
    const target = DAYS.indexOf(wd[1]!);
    const diff = (target - now.getUTCDay() + 7) % 7 || 7;
    return ymd(addDays(now, diff));
  }
  return undefined;
}

const SENSITIVE =
  /\b(diagnos\w*|illness|ill\b|sick|hospital|therapy|depress\w*|anxiety|divorce|pregnan\w*|debt|overdraft|bankrupt\w*|can'?t pay (my|the) rent|grief|funeral)\b/i;
const VAGUE = /\b(maybe|at some point|one day|someday|might|could (try|do|look)|what if|wonder)\b/i;

function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\w/.test(s));
}

/** Strips a "Speaker: " label from a transcript line. */
function unlabel(s: string): { speaker?: string; text: string } {
  const m = s.match(/^([A-Z][\w .'-]{0,30}):\s+(.*)$/);
  return m ? { speaker: m[1]!, text: m[2]! } : { text: s };
}

export interface ExtractOptions {
  now: Date;
  /** Team members by first name, so "Aisha will…" is assigned to them. */
  teammates?: string[];
  /** Known contacts' names, so promises and feedback link to them. */
  contacts?: string[];
  /** The person speaking in a note or debrief. */
  speaker?: string;
}

/**
 * A rule-based reading of a note or transcript into review items. Deliberately cautious:
 * anything vague becomes an idea, never a task, and it doesn't guess owners or dates.
 */
export function extractItems(text: string, opts: ExtractOptions): ItemDraft[] {
  const items: ItemDraft[] = [];
  const teammates = (opts.teammates ?? []).map((n) => n.split(" ")[0]!).filter(Boolean);
  const contacts = opts.contacts ?? [];
  const contactIn = (s: string) =>
    contacts.find((c) => new RegExp(`\\b${escape(c.split(" ")[0]!)}\\b`, "i").test(s));
  for (const raw of sentences(text)) {
    const { text: s } = unlabel(raw);
    const lower = s.toLowerCase();
    const due = parseDue(s, opts.now);
    const sensitive = SENSITIVE.test(s) || undefined;
    const base = { text: tidy(s), quote: raw, ...(sensitive ? { sensitive } : {}) };

    if (/\b(decided|agreed|we'?re going with|going ahead with|settled on)\b/i.test(s)) {
      items.push({ ...base, kind: "decision", confidence: 0.85 });
      continue;
    }
    // A promise to someone outside: "I'll send Jo the deck on Friday".
    const promise = s.match(
      /\b(?:i'?ll|i will|we'?ll|we will|promised to)\s+(send|email|call|get back to|follow up with|share|forward)\s+(.*)/i,
    );
    const to = contactIn(s);
    if (promise && to && !teammates.some((t) => new RegExp(`\\b${escape(t)}\\b`, "i").test(s))) {
      items.push({
        ...base,
        kind: "commitment",
        contact_name: to,
        owner: "founder",
        confidence: due ? 0.85 : 0.7,
        ...(due ? { due_date: due } : {}),
      });
      continue;
    }
    if (
      /\b(customer|client|they|she|he)\s+(said|says|told|loved|liked|hated|complained|asked)\b/i.test(
        s,
      )
    ) {
      items.push({
        ...base,
        kind: "feedback",
        confidence: 0.75,
        ...(to ? { contact_name: to } : {}),
      });
      continue;
    }
    if (
      /\b(remember that|for the record|note that|our (price|prices|opening hours|supplier) (is|are))\b/i.test(
        s,
      )
    ) {
      items.push({ ...base, kind: "memory_fact", confidence: 0.7 });
      continue;
    }
    if (/\b(best|guaranteed|cheapest|number one|#1|proven|clinically)\b/i.test(s)) {
      items.push({ ...base, kind: "claim", confidence: 0.7 });
      continue;
    }
    if (VAGUE.test(s)) {
      items.push({ ...base, kind: "idea", confidence: 0.7 });
      continue;
    }
    // A request to Sol is an action even when it's phrased as a question.
    if (s.trim().endsWith("?") && !/\bsol\b/i.test(s)) {
      items.push({ ...base, kind: "question", confidence: 0.65 });
      continue;
    }
    const action = s.match(
      /\b(i'?ll|i will|i need to|i must|we need to|we should|we'?ll|let'?s|sol(,)? (can|could|please|will)|can you|(\w+) (will|is going to|needs to))\b/i,
    );
    if (action) {
      const mate = teammates.find((t) => new RegExp(`\\b${escape(t)}\\b`, "i").test(s));
      const owner: Owner = /\bsol\b|\bcan you\b/i.test(lower)
        ? "sol"
        : mate
          ? "teammate"
          : /\b(i'?ll|i will|i need to|i must)\b/i.test(s)
            ? "founder"
            : "unknown";
      items.push({
        ...base,
        kind: "action",
        owner,
        ...(mate ? { owner_name: mate } : {}),
        ...(due ? { due_date: due } : {}),
        department: department(lower),
        confidence: owner === "unknown" ? 0.55 : 0.8,
      });
    }
  }
  return items;
}

function department(s: string): Department {
  if (/\b(website|site|app|feature|bug|landing page|build)\b/.test(s)) return "build";
  if (/\b(post|instagram|tiktok|linkedin|campaign|marketing|newsletter|ad|ads|leads?)\b/.test(s))
    return "grow";
  if (/\b(contract|terms|gdpr|privacy|vat|hmrc|companies house|licence|insurance)\b/.test(s))
    return "legal";
  if (/\b(investor|pitch|deck|grant|funding|raise)\b/.test(s)) return "raise";
  return "run";
}

function tidy(s: string) {
  const t = s.replace(/^(so|and|ok|okay|right|um|uh)[, ]+/i, "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STOP = new Set(
  "the a an and or to of in on for with at by from is are be it this that we i you our my will need should do get".split(
    " ",
  ),
);
function tokens(s: string) {
  return new Set(
    (s.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/**
 * An existing open task this item is about, if the overlap is strong enough: updating it beats
 * creating a duplicate (SPEC P step 4). Jaccard similarity of meaningful words, at least 0.5.
 */
export function matchTask<T extends { id: string; title: string; status: string }>(
  text: string,
  tasks: T[],
  threshold = 0.5,
): T | undefined {
  const a = tokens(text);
  let best: { t: T; score: number } | undefined;
  for (const t of tasks) {
    if (t.status === "done") continue;
    const b = tokens(t.title);
    const inter = [...a].filter((w) => b.has(w)).length;
    const score = inter / Math.max(1, new Set([...a, ...b]).size);
    if (score >= threshold && (!best || score > best.score)) best = { t, score };
  }
  return best?.t;
}

/**
 * A contact named in the text: a full-name match, or a first name only when exactly one
 * contact has it. Never a guess between two people.
 */
export function matchContact<T extends { id: string; name: string }>(
  name: string | undefined,
  contacts: T[],
): T | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  const full = contacts.filter((c) => c.name.toLowerCase() === n);
  if (full.length === 1) return full[0];
  const first = contacts.filter((c) => c.name.toLowerCase().split(" ")[0] === n.split(" ")[0]);
  return first.length === 1 ? first[0] : undefined;
}

/** What the founder must fill in before an item can be accepted. Sol doesn't guess. */
export function missingDetails(
  item: Pick<ItemDraft, "kind" | "owner" | "due_date">,
): ("owner" | "due")[] {
  const out: ("owner" | "due")[] = [];
  if (item.kind === "action") {
    if (!item.owner || item.owner === "unknown") out.push("owner");
    if (!item.due_date && item.owner !== "sol") out.push("due");
  }
  if (item.kind === "commitment" && !item.due_date) out.push("due");
  return out;
}

/** Debrief mode: up to two follow-up questions about missing owners and dates. */
export function followUpQuestions(
  items: Pick<ItemDraft, "kind" | "owner" | "due_date" | "text">[],
) {
  const qs: { index: number; field: "owner" | "due"; question: string }[] = [];
  items.forEach((it, index) => {
    for (const field of missingDetails(it)) {
      if (qs.length >= 2) return;
      const short = it.text.length > 60 ? `${it.text.slice(0, 57)}…` : it.text;
      qs.push({
        index,
        field,
        question: field === "owner" ? `Who's doing "${short}"?` : `When is "${short}" due?`,
      });
    }
  });
  return qs;
}

/** The review card's sections: the main list, "Possibly" (low confidence) and sensitive. */
export function groupForReview<T extends Pick<ItemDraft, "confidence" | "sensitive">>(items: T[]) {
  return {
    main: items.filter((i) => !i.sensitive && i.confidence >= LOW_CONFIDENCE),
    possibly: items.filter((i) => !i.sensitive && i.confidence < LOW_CONFIDENCE),
    sensitive: items.filter((i) => i.sensitive),
  };
}

/** "Accept all" takes only complete, confident, non-sensitive items. */
export function acceptableInBulk(
  item: Pick<ItemDraft, "kind" | "owner" | "due_date" | "confidence" | "sensitive">,
) {
  return !item.sensitive && item.confidence >= LOW_CONFIDENCE && missingDetails(item).length === 0;
}

/** Open promises due on or before a day, oldest first. */
export function commitmentsDue<T extends { status: string; due_date: string }>(
  commitments: T[],
  day: string,
) {
  return commitments
    .filter((c) => c.status === "open" && c.due_date <= day)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

/** Credits for a capture: transcription by the started minute, plus extraction. */
export function captureEstimate(
  durationSeconds: number | null,
  perMinute: number,
  extract: number,
) {
  const minutes = durationSeconds ? Math.ceil(durationSeconds / 60) : 0;
  return minutes * perMinute + extract;
}

/** An evidence plan for an idea from a Start up company: test it before building it. */
export function evidencePlan(idea: string) {
  return `Before building "${idea.length > 60 ? `${idea.slice(0, 57)}…` : idea}": talk to five target customers about it, and count it as supported if at least three would sign up, pre-order or switch.`;
}
