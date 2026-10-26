import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { drainApprovals } from "../src/executor/executor.js";
import { mockProviders } from "../src/executor/providers.js";
import { processJob } from "../src/runner.js";
import { claimNext } from "../src/worker.js";
import { mockRuntime } from "../src/runtime/mock.js";
import { toSegments } from "../src/capture/transcription.js";
import { loadMemoryInput } from "../src/workspace.js";
import { companyMemory } from "../src/memory.js";
import { balance, enqueue, testConfig, testDb } from "./local.js";

const db = testDb();
const HARBOUR = "c0000000-0000-4000-8000-000000000005";
const RORY = "a0000000-0000-4000-8000-000000000006";

async function capture(fields: Record<string, unknown>, text?: string) {
  const { data, error } = await db
    .from("captures")
    .insert({ company_id: HARBOUR, created_by: RORY, ...fields } as never)
    .select("id")
    .single();
  if (error) throw error;
  if (text)
    await db
      .from("transcripts")
      .insert({ capture_id: data.id, company_id: HARBOUR, text, provider: "typed" });
  return data.id;
}

async function run(jobType: string, payload: Record<string, string>, estimated = 0) {
  await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
  await enqueue(db, HARBOUR, jobType, payload, estimated);
  return processJob(
    { db, config: testConfig(), runtime: mockRuntime },
    (await claimNext(db, "test", [jobType]))!,
  );
}

describe("reading a debrief", () => {
  it("proposes items for review, matched to contacts, and creates nothing yet", async () => {
    const id = await capture(
      { source: "debrief", consent: "own_voice", status: "extracting" },
      "We agreed to open at 7 on Saturdays. I'll send Fiona the wedding cake quote by Friday. Maybe we could do a pop-up at the harbour festival.",
    );
    const tasksBefore = await db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", HARBOUR);
    const res = await run("capture_process", { capture_id: id });
    expect(res.outcome).toBe("done");
    expect(res.charged).toBeGreaterThan(0);
    const { data: items } = await db
      .from("extracted_items")
      .select("kind, status, contact_id, due_date")
      .eq("capture_id", id);
    expect(items!.map((i) => i.kind).sort()).toEqual(["commitment", "decision", "idea"]);
    expect(items!.every((i) => i.status === "pending")).toBe(true);
    expect(items!.find((i) => i.kind === "commitment")?.contact_id).toBeTruthy();
    const { data: cap } = await db.from("captures").select("status").eq("id", id).single();
    expect(cap!.status).toBe("review");
    const tasksAfter = await db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", HARBOUR);
    expect(tasksAfter.count).toBe(tasksBefore.count);
  });
});

describe("an uploaded recording", () => {
  it("is transcribed inside the run, charged with it, and the audio is deleted", async () => {
    const path = `${HARBOUR}/${randomUUID()}.webm`;
    const up = await db.storage
      .from("captures")
      .upload(path, new Blob([new Uint8Array(64)], { type: "audio/webm" }));
    expect(up.error).toBeNull();
    const id = await capture({
      source: "recording",
      consent: "participants_informed",
      status: "transcribing",
      audio_path: path,
      duration_seconds: 90,
    });
    const before = await balance(db, HARBOUR);
    const res = await run("capture_process", { capture_id: id }, 46);
    expect(res.outcome).toBe("done");
    const { data: t } = await db
      .from("transcripts")
      .select("provider, segments")
      .eq("capture_id", id)
      .single();
    expect(t!.provider).toBe("mock");
    expect((t!.segments as unknown[]).length).toBe(5);
    const { data: cap } = await db
      .from("captures")
      .select("status, audio_deleted_at")
      .eq("id", id)
      .single();
    expect(cap!.audio_deleted_at).not.toBeNull();
    const { data: files } = await db.storage.from("captures").list(HARBOUR);
    expect(files!.some((f) => path.endsWith(f.name))).toBe(false);
    // Two minutes of transcription (5 credits at the default rate) on top of extraction.
    expect(before - (await balance(db, HARBOUR))).toBe(res.charged);
    const { data: items } = await db
      .from("extracted_items")
      .select("kind, at_seconds")
      .eq("capture_id", id);
    expect(items!.length).toBeGreaterThan(2);
    expect(items!.some((i) => i.at_seconds !== null)).toBe(true);
  });

  it("joins provider words into speaker segments", () => {
    expect(
      toSegments([
        {
          type: "word",
          start_time: 0,
          end_time: 0.4,
          alternatives: [{ content: "Hello", speaker: "S1" }],
        },
        {
          type: "punctuation",
          start_time: 0.4,
          end_time: 0.4,
          alternatives: [{ content: ".", speaker: "S1" }],
        },
        {
          type: "word",
          start_time: 1,
          end_time: 1.5,
          alternatives: [{ content: "Hi", speaker: "S2" }],
        },
      ]),
    ).toEqual([
      { speaker: "S1", start: 0, end: 0.4, text: "Hello." },
      { speaker: "S2", start: 1, end: 1.5, text: "Hi" },
    ]);
  });
});

describe("a promised follow-up", () => {
  it("is drafted as an email for approval when the contact has an address", async () => {
    const { data: contact } = await db
      .from("contacts")
      .select("id")
      .eq("company_id", HARBOUR)
      .eq("name", "Fiona Reid")
      .single();
    const { data: c } = await db
      .from("commitments")
      .insert({
        company_id: HARBOUR,
        to_name: "Fiona Reid",
        contact_id: contact!.id,
        what: "I'll send Fiona the wedding cake quote",
        due_date: "2026-10-30",
      })
      .select("id")
      .single();
    const res = await run("commitment_followup", { commitment_id: c!.id });
    expect(res.approvals).toBe(1);
    const { data: after } = await db
      .from("commitments")
      .select("followup_approval_id, approvals(action_type, payload)")
      .eq("id", c!.id)
      .single();
    expect(after!.followup_approval_id).not.toBeNull();
    expect((after!.approvals as unknown as { payload: { to: string } }).payload.to).toBe(
      "fiona.reid@example.com",
    );
  });
});

describe("a fact to remember", () => {
  it("joins the company memory only after a founder's GO", async () => {
    const { data: a } = await db
      .from("approvals")
      .insert({
        company_id: HARBOUR,
        action_type: "update_memory",
        payload: { fact: "We open at 7am on Saturdays." },
        estimated_credits: 0,
        status: "approved",
        decided_by: RORY,
        decided_at: new Date().toISOString(),
        execution_status: "queued",
      })
      .select("id")
      .single();
    expect(await drainApprovals({ db, providers: mockProviders(), workerId: "test" })).toEqual([
      "done",
    ]);
    const { data: fact } = await db
      .from("memory_facts")
      .select("fact")
      .eq("company_id", HARBOUR)
      .single();
    expect(fact!.fact).toBe("We open at 7am on Saturdays.");
    expect(companyMemory(await loadMemoryInput(db, HARBOUR))).toContain(
      "- We open at 7am on Saturdays.",
    );
    expect(a).toBeTruthy();
  });
});
