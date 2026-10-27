import { describe, expect, it } from "vitest";
import { demoDb } from "@/lib/demoDb";
import {
  demoAddPhoneNumber,
  demoCalendarEvents,
  demoConnectCalendar,
  demoDisconnectCalendar,
  demoSetRecording,
  demoUpdatePhone,
} from "@/lib/demoCapture2";

const now = new Date("2031-01-05T12:00:00Z"); // a Sunday
let n = 0;
const uid = (p: string) => `${p}${n++}`;

describe("demo notetaker", () => {
  it("connects a demo calendar where every meeting starts switched off", () => {
    const db = demoConnectCalendar(demoDb(), "c5", "u6", "cal1", now);
    const events = db.calendar_events.filter((e) => e.connection_id === "cal1");
    expect(events.map((e) => e.title)).toEqual([
      "Weekly team stand-up",
      "Call with a flour supplier",
      "Lunch with the landlord",
    ]);
    expect(events.every((e) => !e.record)).toBe(true);
    expect(demoConnectCalendar(db, "c5", "u6", "cal2", now)).toBe(db);
  });

  it("joins only video calls, a whole series if asked, and stops on disconnect", () => {
    let db = demoConnectCalendar(demoDb(), "c5", "u6", "cal1", now);
    const lunch = db.calendar_events.find((e) => e.title.startsWith("Lunch"))!;
    expect(demoSetRecording(db, lunch.id, true, false)).toHaveProperty("error");
    const standup = db.calendar_events.find((e) => e.series_id)!;
    const r = demoSetRecording(db, standup.id, true, true);
    if ("error" in r) throw new Error(r.error);
    db = r.db;
    expect(db.calendar_events.filter((e) => e.series_id === "standup").every((e) => e.record)).toBe(
      true,
    );
    db = demoDisconnectCalendar(db, "cal1");
    expect(db.calendar_events.some((e) => e.record)).toBe(false);
    expect(demoCalendarEvents("c5", "x", now).length).toBe(3);
  });
});

describe("demo calls", () => {
  it("adds a number that never rings, with example calls", () => {
    const db = demoAddPhoneNumber(demoDb(), "c5", uid, now);
    expect(db.phone_numbers[0]!.number).toMatch(/^\+447700900\d{3}$/);
    expect(db.call_sessions.filter((c) => c.company_id === "c5")).toHaveLength(2);
    expect(demoAddPhoneNumber(db, "c5", uid, now)).toBe(db);
  });

  it("refuses a notice that doesn't say the call is recorded", () => {
    const db = demoAddPhoneNumber(demoDb(), "c5", uid, now);
    expect(
      demoUpdatePhone(db, "c5", { recording_notice: "Hello and thanks for calling us." }),
    ).toHaveProperty("error");
    expect(demoUpdatePhone(db, "c5", { forward_to: "07700 900123" })).toHaveProperty("error");
    const r = demoUpdatePhone(db, "c5", {
      forward_to: "+44 7700 900123",
      recording_notice: "Hello from Harbour Bakes. We record calls to follow up properly.",
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.db.phone_numbers[0]).toMatchObject({ forward_to: "+447700900123" });
  });
});
