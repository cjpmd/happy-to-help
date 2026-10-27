import { beforeAll, describe, expect, it } from "vitest";
import { processJob } from "../src/runner.js";
import { claimNext } from "../src/worker.js";
import { mockRuntime } from "../src/runtime/mock.js";
import {
  mockCalendar,
  mockNotetaker,
  recallResult,
  runNotetaker,
} from "../src/capture/notetaker.js";
import { testConfig, testDb } from "./local.js";

const db = testDb();
const HARBOUR = "c0000000-0000-4000-8000-000000000005";
const RORY = "a0000000-0000-4000-8000-000000000006";
// A Sunday: the demo calendar has Monday's stand-up and a supplier call.
const SUNDAY = new Date("2031-01-05T12:00:00Z");
const at = (iso: string) => new Date(iso);

let clock = SUNDAY;
const notetaker = mockNotetaker(() => clock);
const pass = (now: Date) => {
  clock = now;
  return runNotetaker({
    db,
    calendarFor: (p) => (p === "mock" ? mockCalendar : null),
    notetaker,
    now,
  });
};
const event = async (externalId: string) =>
  (
    await db
      .from("calendar_events")
      .select("id, record, bot_status, bot_note, capture_id")
      .eq("company_id", HARBOUR)
      .eq("external_id", externalId)
      .single()
  ).data!;

beforeAll(async () => {
  // This suite's own calendar from an earlier run, with its meetings.
  await db.from("calendar_connections").delete().eq("company_id", HARBOUR);
  await db
    .from("calendar_connections")
    .insert({ company_id: HARBOUR, user_id: RORY, provider: "mock" });
  await db.from("capture_settings").upsert({ company_id: HARBOUR, daily_minutes_cap: 120 });
});

describe("meeting notetaker", () => {
  it("reads the calendar, and joins nothing until the founder opts in", async () => {
    expect((await pass(SUNDAY)).synced).toBe(2);
    expect(await event("mock-call-2031-01-06")).toMatchObject({
      record: false,
      bot_status: "none",
    });
    const r = await pass(at("2031-01-06T13:45:00Z"));
    expect(r.scheduled).toBe(0);
  });

  it("sends a bot to an opted-in meeting and turns its recording into a capture", async () => {
    const e = await event("mock-call-2031-01-06");
    await db.from("calendar_events").update({ record: true }).eq("id", e.id);
    expect((await pass(at("2031-01-06T13:45:00Z"))).scheduled).toBe(1);
    expect((await event("mock-call-2031-01-06")).bot_status).toBe("scheduled");
    expect((await pass(at("2031-01-06T14:30:00Z"))).recorded).toBe(0); // still going
    expect((await pass(at("2031-01-06T15:00:00Z"))).recorded).toBe(1);
    const done = await event("mock-call-2031-01-06");
    expect(done.bot_status).toBe("done");
    const { data: cap } = await db
      .from("captures")
      .select("source, consent, status, duration_seconds, transcripts(text)")
      .eq("id", done.capture_id!)
      .single();
    expect(cap).toMatchObject({
      source: "notetaker",
      consent: "bot_announced",
      status: "extracting",
      duration_seconds: 600,
    });
    expect((cap!.transcripts as { text: string } | null)!.text).toMatch(
      /I'm recording this meeting/,
    );

    await db
      .from("agent_jobs")
      .update({ status: "done" })
      .eq("status", "queued")
      .neq("payload->>capture_id", done.capture_id!);
    const job = (await claimNext(db, "test", ["capture_process"]))!;
    expect((job.payload as { capture_id: string }).capture_id).toBe(done.capture_id);
    const res = await processJob({ db, config: testConfig(), runtime: mockRuntime }, job);
    expect(res.outcome).toBe("done");
    const { data: run } = await db
      .from("agent_runs")
      .select("cost_usd")
      .eq("id", res.runId!)
      .single();
    // Ten minutes of notetaker time at $0.0083 a minute is part of the run's cost.
    expect(Number(run!.cost_usd)).toBeGreaterThanOrEqual(0.083);
  });

  it("skips a meeting that would go over today's recorded minutes, and says so", async () => {
    await db.from("capture_settings").update({ daily_minutes_cap: 0 }).eq("company_id", HARBOUR);
    const e = await event("mock-standup-2031-01-06");
    await db.from("calendar_events").update({ record: true, bot_status: "none" }).eq("id", e.id);
    expect((await pass(at("2031-01-06T08:30:00Z"))).skipped).toBe(1);
    expect(await event("mock-standup-2031-01-06")).toMatchObject({ bot_status: "skipped" });
    await db.from("capture_settings").update({ daily_minutes_cap: 120 }).eq("company_id", HARBOUR);
  });

  it("opts in every new meeting of a series the founder chose", async () => {
    const { data: conn } = await db
      .from("calendar_connections")
      .select("id")
      .eq("company_id", HARBOUR)
      .single();
    await db
      .from("notetaker_series")
      .insert({ connection_id: conn!.id, series_id: "mock-standup", company_id: HARBOUR });
    await db.from("calendar_connections").update({ last_synced_at: null }).eq("id", conn!.id);
    await pass(at("2031-01-12T12:00:00Z"));
    expect((await event("mock-standup-2031-01-13")).record).toBe(true);
  });

  it("reads a Recall.ai bot's transcript", async () => {
    const bot = {
      status_changes: [{ code: "joining_call" }, { code: "done" }],
      recordings: [
        {
          started_at: "2031-01-06T14:00:00Z",
          completed_at: "2031-01-06T14:20:00Z",
          media_shortcuts: { transcript: { data: { download_url: "https://x/t.json" } } },
        },
      ],
    };
    const r = await recallResult(bot, async () => [
      {
        participant: { name: "Rory" },
        words: [{ text: "Launch", start_timestamp: { relative: 3 } }, { text: "Friday." }],
      },
    ]);
    expect(r).toEqual({
      status: "done",
      seconds: 1200,
      segments: [{ speaker: "Rory", text: "Launch Friday.", start: 3 }],
    });
    expect(
      await recallResult({ status_changes: [{ code: "in_call_recording" }] }, async () => []),
    ).toEqual({ status: "recording" });
    expect(
      await recallResult(
        { status_changes: [{ code: "fatal", sub_code: "meeting_not_found" }] },
        async () => [],
      ),
    ).toEqual({
      status: "failed",
      reason: "meeting_not_found",
    });
  });
});
