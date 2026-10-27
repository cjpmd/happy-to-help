import { describe, expect, it } from "vitest";
import {
  authUrl,
  parseGoogleEvents,
  parseGraphEvents,
  signState,
  tokenRequest,
  verifyState,
} from "../../supabase/functions/_shared/calendar";

describe("calendar OAuth", () => {
  it("asks for read-only calendar access, offline for Google", () => {
    const u = new URL(authUrl("google", "cid", "https://x/cb", "st"));
    expect(u.searchParams.get("scope")).toContain("calendar.events.readonly");
    expect(u.searchParams.get("access_type")).toBe("offline");
    const m = new URL(authUrl("microsoft", "cid", "https://x/cb", "st"));
    expect(m.searchParams.get("scope")).toBe("offline_access openid email Calendars.Read");
    const t = tokenRequest("google", { refreshToken: "r" }, "cid", "sec");
    expect(t.body.get("grant_type")).toBe("refresh_token");
  });

  it("signs the state and refuses tampered or stale ones", async () => {
    const s = { company: "c", user: "u", provider: "google" as const, at: 1_000_000 };
    const state = await signState(s, "secret");
    expect(await verifyState(state, "secret", 1_000_100)).toEqual(s);
    expect(await verifyState(state, "other", 1_000_100)).toBeNull();
    expect(await verifyState(state, "secret", 1_000_700)).toBeNull();
    const [data, sig] = state.split(".");
    const forged = btoa(JSON.stringify({ ...s, company: "evil" })).replace(/=+$/, "");
    expect(await verifyState(`${forged}.${sig}`, "secret", 1_000_100)).toBeNull();
    expect(data).toBeTruthy();
  });
});

describe("reading events", () => {
  it("reads Google events, their series and video links, skipping all-day ones", () => {
    const events = parseGoogleEvents({
      items: [
        {
          id: "e1",
          summary: "Stand-up",
          recurringEventId: "s1",
          start: { dateTime: "2031-01-06T09:00:00Z" },
          end: { dateTime: "2031-01-06T09:30:00Z" },
          hangoutLink: "https://meet.google.com/abc-defg-hij",
          attendees: [{ email: "a@x.com" }, {}],
        },
        {
          id: "e2",
          start: { dateTime: "2031-01-06T14:00:00+01:00" },
          end: { dateTime: "2031-01-06T15:00:00+01:00" },
          description: "Join: https://zoom.us/j/123456?pwd=x thanks",
        },
        { id: "e3", start: { date: "2031-01-07" }, end: { date: "2031-01-08" } },
        {
          id: "e4",
          status: "cancelled",
          start: { dateTime: "2031-01-06T10:00:00Z" },
          end: { dateTime: "2031-01-06T11:00:00Z" },
        },
      ],
    });
    expect(events).toEqual([
      {
        externalId: "e1",
        seriesId: "s1",
        title: "Stand-up",
        startsAt: "2031-01-06T09:00:00.000Z",
        endsAt: "2031-01-06T09:30:00.000Z",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        attendees: ["a@x.com"],
      },
      {
        externalId: "e2",
        seriesId: null,
        title: "(No title)",
        startsAt: "2031-01-06T13:00:00.000Z",
        endsAt: "2031-01-06T14:00:00.000Z",
        meetingUrl: "https://zoom.us/j/123456?pwd=x",
        attendees: [],
      },
    ]);
  });

  it("reads Microsoft events in UTC with their Teams links", () => {
    const [e] = parseGraphEvents({
      value: [
        {
          id: "m1",
          subject: "Supplier call",
          seriesMasterId: null,
          start: { dateTime: "2031-01-06T14:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2031-01-06T14:45:00.0000000", timeZone: "UTC" },
          onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/xyz" },
          attendees: [{ emailAddress: { address: "s@x.com" } }],
        },
        {
          id: "m2",
          isAllDay: true,
          start: { dateTime: "2031-01-07T00:00:00" },
          end: { dateTime: "2031-01-08T00:00:00" },
        },
      ],
    });
    expect(e).toMatchObject({
      externalId: "m1",
      seriesId: null,
      startsAt: "2031-01-06T14:00:00.000Z",
      meetingUrl: "https://teams.microsoft.com/l/meetup-join/xyz",
      attendees: ["s@x.com"],
    });
  });
});
