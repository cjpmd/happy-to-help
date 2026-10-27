import { describe, expect, it } from "vitest";
import { processJob } from "../src/runner.js";
import { claimNext } from "../src/worker.js";
import { mockRuntime } from "../src/runtime/mock.js";
import { fetchExternalAudio } from "../src/capture/prepare.js";
import { testConfig, testDb } from "./local.js";

const db = testDb();
const HARBOUR = "c0000000-0000-4000-8000-000000000005";
const RUN = Date.now().toString().slice(-6);

describe("calls", () => {
  it("records a call the caller was told about, and Sol reads it like a meeting", async () => {
    await db.from("phone_numbers").delete().eq("company_id", HARBOUR);
    const number = `+447700900${RUN.slice(-3)}`;
    await db.from("phone_numbers").insert({ company_id: HARBOUR, number, provider: "mock" });
    // Ofcom's range for drama: never a real phone.
    const caller = `+447700900${String((Number(RUN.slice(-3)) + 1) % 1000).padStart(3, "0")}`;
    const sid = `CA${RUN}${Math.random().toString(36).slice(2, 8)}`;
    const { data: routing } = await db.rpc("call_routing", { p_to: number });
    expect(routing).toMatchObject({ company: "Harbour Bakes", forward_to: null });
    expect((routing as { notice: string }).notice).toMatch(
      /^Hello, you've reached Harbour Bakes\. This call is recorded/,
    );

    expect(
      (
        await db.rpc("record_call", {
          p_external_id: sid,
          p_to: number,
          p_from: caller,
          p_status: "ringing",
          p_recorded: true,
        })
      ).error,
    ).toBeNull();
    const { data: session } = await db.rpc("record_call", {
      p_external_id: sid,
      p_to: number,
      p_from: caller,
      p_status: "completed",
      p_duration_seconds: 90,
      p_recording_url: "mock:recording",
    });
    const { data: call } = await db
      .from("call_sessions")
      .select("status, recorded, capture_id, contacts(name, phone)")
      .eq("id", session!)
      .single();
    expect(call).toMatchObject({
      status: "completed",
      recorded: true,
      contacts: { name: `Caller ${caller}`, phone: caller },
    });
    const { data: cap } = await db
      .from("captures")
      .select("source, consent, status")
      .eq("id", call!.capture_id!)
      .single();
    expect(cap).toEqual({ source: "call", consent: "call_notice", status: "transcribing" });

    await db
      .from("agent_jobs")
      .update({ status: "done" })
      .eq("status", "queued")
      .neq("payload->>capture_id", call!.capture_id!);
    const res = await processJob(
      { db, config: testConfig(), runtime: mockRuntime },
      (await claimNext(db, "test", ["capture_process"]))!,
    );
    expect(res.outcome).toBe("done");
    const { data: run } = await db
      .from("agent_runs")
      .select("cost_usd")
      .eq("id", res.runId!)
      .single();
    // Two minutes of call time ($0.012 a minute) plus transcription.
    expect(Number(run!.cost_usd)).toBeGreaterThanOrEqual(0.024);
    const { data: after } = await db
      .from("captures")
      .select("status")
      .eq("id", call!.capture_id!)
      .single();
    expect(after!.status).toBe("review");
  });

  it("only fetches recordings from Twilio, with the account's credentials", async () => {
    await expect(fetchExternalAudio("https://evil.example/rec", {})).rejects.toThrow(
      /only fetched from Twilio/,
    );
    await expect(
      fetchExternalAudio("https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1", {}),
    ).rejects.toThrow(/aren't set up/);
    let auth = "";
    const fetcher = (async (_u: string, init: RequestInit) => {
      auth = (init.headers as Record<string, string>)["Authorization"]!;
      return new Response("audio");
    }) as unknown as typeof fetch;
    const blob = await fetchExternalAudio(
      "https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1",
      { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok" },
      fetcher,
    );
    expect(await blob.text()).toBe("audio");
    expect(auth).toBe(`Basic ${Buffer.from("AC1:tok").toString("base64")}`);
  });
});
