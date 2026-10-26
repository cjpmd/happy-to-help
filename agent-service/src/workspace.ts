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
      .select("action_type, payload, decided_at")
      .eq("company_id", companyId)
      .eq("status", "declined")
      .order("decided_at", { ascending: false })
      .limit(5),
  ]);
  const docRows = must(docs, "documents");
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
    voiceGuide: voice?.data?.content ?? null,
    unbuilt: outcomes.filter((o) => !o.complete).map((o) => o.title),
    openTasks: must(tasks, "tasks"),
    declined: must(declined, "declined approvals").map((a) => {
      const p = a.payload as Record<string, unknown>;
      return {
        what: `${a.action_type.replace("_", " ")}: ${String(p["text"] ?? p["subject"] ?? p["change"] ?? "")}`.slice(
          0,
          120,
        ),
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
