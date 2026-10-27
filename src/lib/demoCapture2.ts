// The demo's notetaker and calls (Phase 18): a demo calendar, a phone number in Ofcom's drama
// range, and the same rules as set_meeting_recording and update_phone_settings. Nothing joins a
// meeting or rings in the demo. Pure; tested in src/test/demoCapture2.test.ts.
import type { CalendarEvent, CallSession, DB } from "./storeContext";

type R = { db: DB } | { error: string };
const MIN = 60_000;

/** A weekly stand-up (a series) and a supplier call, over the coming week. */
export function demoCalendarEvents(
  companyId: string,
  connectionId: string,
  now: Date,
): CalendarEvent[] {
  const day = (n: number, h: number) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n, h));
  const base = {
    company_id: companyId,
    connection_id: connectionId,
    record: false,
    bot_status: "none" as const,
    bot_note: null,
    capture_id: null,
  };
  const out: CalendarEvent[] = [];
  for (let n = 1; n <= 7; n++) {
    const d = day(n, 9);
    if (d.getUTCDay() === 1)
      out.push({
        ...base,
        id: `${connectionId}-standup-${n}`,
        series_id: "standup",
        title: "Weekly team stand-up",
        starts_at: d.toISOString(),
        ends_at: new Date(d.getTime() + 30 * MIN).toISOString(),
        meeting_url: "https://meet.example/standup",
        attendees: ["team@example.com"],
      });
  }
  const call = day(1, 14);
  out.push({
    ...base,
    id: `${connectionId}-supplier`,
    series_id: null,
    title: "Call with a flour supplier",
    starts_at: call.toISOString(),
    ends_at: new Date(call.getTime() + 45 * MIN).toISOString(),
    meeting_url: "https://meet.example/supplier",
    attendees: ["sales@supplier.example"],
  });
  const lunch = day(2, 12);
  out.push({
    ...base,
    id: `${connectionId}-lunch`,
    series_id: null,
    title: "Lunch with the landlord",
    starts_at: lunch.toISOString(),
    ends_at: new Date(lunch.getTime() + 60 * MIN).toISOString(),
    meeting_url: null,
    attendees: [],
  });
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export function demoConnectCalendar(
  db: DB,
  companyId: string,
  userId: string,
  uid: string,
  now: Date,
): DB {
  if (
    db.calendar_connections.some(
      (c) => c.company_id === companyId && c.user_id === userId && c.status === "connected",
    )
  )
    return db;
  return {
    ...db,
    calendar_connections: [
      ...db.calendar_connections,
      {
        id: uid,
        company_id: companyId,
        user_id: userId,
        provider: "mock",
        account_email: "demo calendar",
        status: "connected",
        last_synced_at: now.toISOString(),
      },
    ],
    calendar_events: [...db.calendar_events, ...demoCalendarEvents(companyId, uid, now)],
  };
}

export function demoDisconnectCalendar(db: DB, id: string): DB {
  return {
    ...db,
    calendar_connections: db.calendar_connections.map((c) =>
      c.id === id ? { ...c, status: "revoked" } : c,
    ),
    calendar_events: db.calendar_events.map((e) =>
      e.connection_id === id ? { ...e, record: false } : e,
    ),
  };
}

export function demoSetRecording(db: DB, eventId: string, record: boolean, series: boolean): R {
  const e = db.calendar_events.find((x) => x.id === eventId);
  if (!e) return { error: "Meeting not found" };
  if (record && !e.meeting_url)
    return { error: "This meeting has no video call link for Sol to join" };
  const hit = (x: CalendarEvent) =>
    series && e.series_id
      ? x.connection_id === e.connection_id && x.series_id === e.series_id
      : x.id === e.id;
  return {
    db: {
      ...db,
      calendar_events: db.calendar_events.map((x) =>
        hit(x) && (!record || x.meeting_url)
          ? {
              ...x,
              record,
              bot_status: record
                ? "scheduled"
                : x.bot_status === "scheduled"
                  ? "cancelled"
                  : x.bot_status,
            }
          : x,
      ),
    },
  };
}

/** A number that never rings (07700 900xxx), with two example calls. */
export function demoAddPhoneNumber(
  db: DB,
  companyId: string,
  uid: (p: string) => string,
  now: Date,
): DB {
  if (db.phone_numbers.some((n) => n.company_id === companyId)) return db;
  const ago = (min: number) => new Date(now.getTime() - min * MIN).toISOString();
  const contact = db.contacts.find((c) => c.company_id === companyId);
  const calls: CallSession[] = [
    {
      id: uid("call"),
      company_id: companyId,
      direction: "inbound",
      from_number: "+447700900345",
      contact_id: contact?.id ?? null,
      status: "completed",
      duration_seconds: 184,
      recorded: true,
      capture_id: null,
      started_at: ago(90),
    },
    {
      id: uid("call"),
      company_id: companyId,
      direction: "inbound",
      from_number: "+447700900678",
      contact_id: null,
      status: "missed",
      duration_seconds: null,
      recorded: false,
      capture_id: null,
      started_at: ago(30),
    },
  ];
  return {
    ...db,
    phone_numbers: [
      ...db.phone_numbers,
      {
        id: uid("num"),
        company_id: companyId,
        number: "+447700900123",
        provider: "mock",
        forward_to: null,
        recording_notice:
          "Hello, you've reached {company}. This call is recorded so we can follow up properly.",
      },
    ],
    call_sessions: [...calls, ...db.call_sessions],
  };
}

export function demoUpdatePhone(
  db: DB,
  companyId: string,
  patch: { forward_to?: string; recording_notice?: string },
): R {
  const notice = patch.recording_notice?.trim();
  if (notice !== undefined && !/record/i.test(notice))
    return { error: "The notice must tell callers the call is recorded" };
  if (notice !== undefined && (notice.length < 20 || notice.length > 300))
    return { error: "The notice should be between 20 and 300 characters" };
  const forward = patch.forward_to?.replace(/[\s()-]/g, "");
  if (forward && !/^\+[0-9]{8,15}$/.test(forward))
    return { error: "Use the full number with the country code, e.g. +44 7700 900123" };
  return {
    db: {
      ...db,
      phone_numbers: db.phone_numbers.map((n) =>
        n.company_id === companyId
          ? {
              ...n,
              ...(forward !== undefined ? { forward_to: forward || null } : {}),
              ...(notice ? { recording_notice: notice } : {}),
            }
          : n,
      ),
    },
  };
}
