// Builds a run's workspace on disk: the company's CLAUDE.md (memory generated from the
// database), the job's skills under .claude/skills, and a data snapshot. Removed after the run.
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db/client.js";
import { must } from "./db/client.js";
import { companyMemory, type MemoryInput } from "./memory.js";

const SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");

export async function loadMemoryInput(db: Db, companyId: string): Promise<MemoryInput> {
  const [company, members, gates, docs, tasks, declined] = await Promise.all([
    db.from("companies").select("*").eq("id", companyId).single(),
    db
      .from("company_members")
      .select("role, profiles(full_name)")
      .eq("company_id", companyId)
      .eq("role", "founder"),
    db.from("stage_gates").select("*").eq("company_id", companyId),
    db.from("documents").select("id, title, outcomes").eq("company_id", companyId),
    db.from("tasks").select("title, status, due").eq("company_id", companyId).neq("status", "done"),
    db
      .from("approvals")
      .select("action_type, payload, decided_at, decision_note")
      .eq("company_id", companyId)
      .eq("status", "declined")
      .order("decided_at", { ascending: false })
      .limit(5),
  ]);
  const docRows = must(docs, "documents");
  // The approved voice profile is the brand voice (Phase 11); the old guide document is the fallback.
  const { data: profile } = await db
    .from("voice_profiles")
    .select(
      "summary, traits, use_phrases, avoid_phrases, reading_level, spelling, sign_off, emoji, channel_variants, tone_rules",
    )
    .eq("company_id", companyId)
    .eq("status", "approved")
    .maybeSingle();
  const voiceDoc = docRows.find((d) => d.title === "Brand & voice guide");
  const voice = voiceDoc
    ? await db
        .from("document_versions")
        .select("content")
        .eq("document_id", voiceDoc.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
    : null;
  const roadmap = docRows.find((d) => d.title === "Product roadmap");
  const outcomes = (Array.isArray(roadmap?.outcomes) ? roadmap.outcomes : []) as {
    title: string;
    complete: boolean;
  }[];
  return {
    company: must(company, "company"),
    founders: must(members, "founders")
      .map((m) => (m.profiles as { full_name: string } | null)?.full_name ?? "")
      .filter(Boolean),
    gates: must(gates, "gates"),
    voiceGuide: profile ? voiceText(profile) : (voice?.data?.content ?? null),
    unbuilt: outcomes.filter((o) => !o.complete).map((o) => o.title),
    openTasks: must(tasks, "tasks"),
    declined: must(declined, "declined approvals").map((a) => {
      const p = a.payload as Record<string, unknown>;
      return {
        what:
          `${a.action_type.replace("_", " ")}: ${String(p["text"] ?? p["subject"] ?? p["change"] ?? "")}`.slice(
            0,
            120,
          ) + (a.decision_note ? ` (founder's note: ${a.decision_note})` : ""),
        when: a.decided_at ?? "",
      };
    }),
  };
}

export async function prepareWorkspace(
  root: string,
  runId: string,
  memory: MemoryInput,
  skills: string[],
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = path.join(root, memory.company.id, runId);
  await mkdir(path.join(dir, "data"), { recursive: true });
  await writeFile(path.join(dir, "CLAUDE.md"), companyMemory(memory));
  for (const skill of skills)
    await cp(path.join(SKILLS_DIR, skill), path.join(dir, ".claude", "skills", skill), {
      recursive: true,
    });
  await writeFile(path.join(dir, "data", "company.json"), JSON.stringify(memory.company, null, 2));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** The approved voice profile as plain instructions for CLAUDE.md. */
export function voiceText(v: {
  summary: string;
  traits: string[];
  use_phrases: string[];
  avoid_phrases: string[];
  reading_level: string;
  spelling: string;
  sign_off: string | null;
  emoji: string;
  channel_variants: unknown;
  tone_rules: unknown;
}): string {
  const lines = (o: unknown) =>
    Object.entries((o ?? {}) as Record<string, string>).map(
      ([k, val]) => `  - ${k.replace(/_/g, " ")}: ${val}`,
    );
  return [
    v.summary,
    `- Traits: ${v.traits.join(", ")}.`,
    `- Reading level: ${v.reading_level}. Spelling: ${v.spelling}. Emoji: ${v.emoji}.${v.sign_off ? ` Sign off with "${v.sign_off}".` : ""}`,
    v.use_phrases.length
      ? `- Phrases to use: ${v.use_phrases.map((p) => `"${p}"`).join(", ")}.`
      : "",
    v.avoid_phrases.length
      ? `- Never say: ${v.avoid_phrases.map((p) => `"${p}"`).join(", ")}.`
      : "",
    "- By channel:",
    ...lines(v.channel_variants),
    "- By situation:",
    ...lines(v.tone_rules),
  ]
    .filter(Boolean)
    .join("\n");
}
