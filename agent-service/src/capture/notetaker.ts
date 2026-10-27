// The meeting notetaker (Phase 18, SPEC P): read the calendars people connected, send a bot to
// the meetings the founder opted in to, and turn each recording into a capture for the Phase 12
// pipeline. Off unless NOTETAKER_ENABLED=1. Providers are behind interfaces: mocks by default,
// Recall.ai for the bot and Google / Microsoft for calendars once the platform has accounts
// (HANDOFF 10). The bot always joins by name and says it's recording.
import type { Db } from "../db/client.js";
import type { Json } from "../db/types.js";
import {
  parseGoogleEvents,
  parseGraphEvents,
  tokenRequest,
  type CalendarProviderName,
} from "../../../supabase/functions/_shared/calendar.js";

const DAY = 86_400_000;

export interface CalendarEvent {
  externalId: string;
  seriesId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  meetingUrl: string | null;
  attendees: string[];
}

export interface CalendarProvider {
  name: string;
  listEvents(
    connection: { id: string; provider: string },
    from: Date,
    to: Date,
  ): Promise<CalendarEvent[]>;
}

export interface NotetakerProvider {
  name: string;
  /** Sends a bot to the meeting at its start time. Returns the provider's bot id. */
  schedule(i: {
    meetingUrl: string;
    joinAt: string;
    botName: string;
    announcement: string;
  }): Promise<string>;
  cancel(botId: string): Promise<void>;
  /** "recording" until the meeting is over and the transcript is ready. */
  result(botId: string): Promise<
    | { status: "recording" }
    | { status: "failed"; reason: string }
    | {
        status: "done";
        seconds: number;
        segments: { speaker: string; text: string; start?: number }[];
      }
  >;
}

/** A demo calendar: a weekly stand-up series and a one-off call, over the next few days. */
export const mockCalendar: CalendarProvider = {
  name: "mock",
  async listEvents(_c, from) {
    const day = (n: number, h: number) =>
      new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + n, h));
    const out: CalendarEvent[] = [];
    for (let n = 0; n < 7; n++) {
      const d = day(n, 9);
      if (d.getUTCDay() !== 1) continue;
      out.push({
        externalId: `mock-standup-${d.toISOString().slice(0, 10)}`,
        seriesId: "mock-standup",
        title: "Weekly team stand-up",
        startsAt: d.toISOString(),
        endsAt: new Date(d.getTime() + 30 * 60_000).toISOString(),
        meetingUrl: "https://meet.example/mock-standup",
        attendees: ["team@example.com"],
      });
    }
    const call = day(1, 14);
    out.push({
      externalId: `mock-call-${call.toISOString().slice(0, 10)}`,
      seriesId: null,
      title: "Call with a supplier",
      startsAt: call.toISOString(),
      endsAt: new Date(call.getTime() + 45 * 60_000).toISOString(),
      meetingUrl: "https://meet.example/mock-supplier",
      attendees: ["supplier@example.com"],
    });
    return out;
  },
};

/** A demo notetaker: nothing joins anything; a short transcript comes back after the meeting. */
export function mockNotetaker(now: () => Date = () => new Date()): NotetakerProvider {
  const ends = new Map<string, number>();
  return {
    name: "mock",
    async schedule(i) {
      const id = `mock-bot-${Buffer.from(i.meetingUrl + i.joinAt)
        .toString("base64url")
        .slice(0, 16)}`;
      ends.set(id, Date.parse(i.joinAt));
      return id;
    },
    async cancel(id) {
      ends.delete(id);
    },
    async result(id) {
      const at = ends.get(id);
      if (at !== undefined && now().getTime() < at) return { status: "recording" };
      return {
        status: "done",
        seconds: 600,
        segments: [
          {
            speaker: "Sol (notetaker)",
            text: "Hello, I'm Sol, the notetaker. I'm recording this meeting.",
          },
          { speaker: "S1", text: "We agreed to move the launch to next Friday." },
          { speaker: "S2", text: "I'll send the updated price list by Wednesday." },
        ],
      };
    },
  };
}

/**
 * Recall.ai's Meeting Bot API (one bot for Zoom, Meet and Teams). The region's base URL decides
 * where data is processed, e.g. https://eu-central-1.recall.ai (HANDOFF 10).
 */
export function recallNotetaker(
  apiKey: string,
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): NotetakerProvider {
  const headers = { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" };
  const api = async (path: string, init: RequestInit = {}) => {
    const res = await fetcher(`${baseUrl}/api/v1${path}`, { ...init, headers });
    if (!res.ok && res.status !== 404) throw new Error(`Recall.ai ${path} failed (${res.status})`);
    return res.status === 204 || res.status === 404 ? null : res.json();
  };
  return {
    name: "recall",
    async schedule(i) {
      const bot = (await api("/bot/", {
        method: "POST",
        body: JSON.stringify({
          meeting_url: i.meetingUrl,
          bot_name: i.botName,
          join_at: i.joinAt,
          // No silent recording: the bot says so in the meeting chat as it joins.
          chat: { on_bot_join: { send_to: "everyone", message: i.announcement } },
          recording_config: { transcript: { provider: { meeting_captions: {} } } },
        }),
      })) as { id: string };
      return bot.id;
    },
    async cancel(id) {
      await api(`/bot/${encodeURIComponent(id)}/`, { method: "DELETE" });
    },
    async result(id) {
      const bot = (await api(`/bot/${encodeURIComponent(id)}/`)) as RecallBot | null;
      if (!bot) return { status: "failed", reason: "The bot was removed" };
      return recallResult(bot, async (url) => (await fetcher(url)).json());
    },
  };
}

interface RecallBot {
  status_changes?: { code: string; sub_code?: string | null }[];
  recordings?: {
    started_at?: string;
    completed_at?: string;
    media_shortcuts?: { transcript?: { data?: { download_url?: string } } };
  }[];
}

/** Reads a Recall.ai bot: still going, failed, or done with its transcript. */
export async function recallResult(
  bot: RecallBot,
  download: (url: string) => Promise<unknown>,
): ReturnType<NotetakerProvider["result"]> {
  const last = bot.status_changes?.at(-1);
  if (last?.code === "fatal")
    return { status: "failed", reason: last.sub_code ?? "the bot couldn't join" };
  if (last?.code !== "done") return { status: "recording" };
  const rec = bot.recordings?.[0];
  const url = rec?.media_shortcuts?.transcript?.data?.download_url;
  if (!rec || !url) return { status: "failed", reason: "no transcript was made" };
  const parts = (await download(url)) as {
    participant?: { name?: string | null };
    words?: { text: string; start_timestamp?: { relative?: number } }[];
  }[];
  const seconds = Math.max(
    1,
    Math.round((Date.parse(rec.completed_at ?? "") - Date.parse(rec.started_at ?? "")) / 1000) || 1,
  );
  return {
    status: "done",
    seconds,
    segments: (parts ?? []).map((p) => ({
      speaker: p.participant?.name || "Someone",
      text: (p.words ?? []).map((w) => w.text).join(" "),
      ...(p.words?.[0]?.start_timestamp?.relative !== undefined
        ? { start: p.words[0].start_timestamp.relative }
        : {}),
    })),
  };
}

export interface NotetakerDeps {
  db: Db;
  calendarFor: (provider: string) => CalendarProvider | null;
  notetaker: NotetakerProvider;
  now?: Date;
}

/** One pass: sync calendars, send or cancel bots, and collect finished recordings. */
export async function runNotetaker(deps: NotetakerDeps) {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const out = { synced: 0, scheduled: 0, cancelled: 0, recorded: 0, skipped: 0 };

  // 1. Calendars, every 15 minutes: the next seven days.
  const { data: conns } = await db
    .from("calendar_connections")
    .select("id, company_id, provider, last_synced_at")
    .eq("status", "connected");
  for (const c of conns ?? []) {
    if (c.last_synced_at && now.getTime() - Date.parse(c.last_synced_at) < 15 * 60_000) continue;
    const cal = deps.calendarFor(c.provider);
    if (!cal) continue;
    const events = await cal.listEvents(c, now, new Date(now.getTime() + 7 * DAY));
    const { data: series } = await db
      .from("notetaker_series")
      .select("series_id")
      .eq("connection_id", c.id);
    const always = new Set((series ?? []).map((s) => s.series_id));
    for (const e of events) {
      const row = {
        company_id: c.company_id,
        connection_id: c.id,
        external_id: e.externalId,
        series_id: e.seriesId,
        title: e.title.slice(0, 300),
        starts_at: e.startsAt,
        ends_at: e.endsAt,
        meeting_url: e.meetingUrl,
        attendees: e.attendees.slice(0, 50),
      };
      const { data: existing } = await db
        .from("calendar_events")
        .select("id")
        .eq("connection_id", c.id)
        .eq("external_id", e.externalId)
        .maybeSingle();
      if (existing) await db.from("calendar_events").update(row).eq("id", existing.id);
      else
        await db.from("calendar_events").insert({
          ...row,
          // A recurring series the founder chose: every new meeting in it is opted in.
          record: !!e.seriesId && always.has(e.seriesId) && !!e.meetingUrl,
        });
      out.synced++;
    }
    await db
      .from("calendar_connections")
      .update({ last_synced_at: now.toISOString() })
      .eq("id", c.id);
  }

  // 2. Bots for opted-in meetings starting within the hour, within today's minutes.
  const soon = new Date(now.getTime() + 60 * 60_000).toISOString();
  const { data: toJoin } = await db
    .from("calendar_events")
    .select("id, company_id, title, starts_at, ends_at, meeting_url, companies(name)")
    .eq("record", true)
    .eq("bot_status", "none")
    .gt("ends_at", now.toISOString())
    .lte("starts_at", soon);
  for (const e of toJoin ?? []) {
    const minutes = Math.ceil((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60_000);
    const { data: left } = await db.rpc("minutes_left_today", { p_company: e.company_id });
    if ((left ?? 0) < minutes) {
      await db
        .from("calendar_events")
        .update({ bot_status: "skipped", bot_note: "Today's recorded minutes are used up" })
        .eq("id", e.id);
      await db.from("chat_messages").insert({
        company_id: e.company_id,
        sender: "sol",
        content: `I won't join "${e.title}": it would go over today's recorded minutes. You can raise the limit in Meetings.`,
      });
      out.skipped++;
      continue;
    }
    const company = (e.companies as { name: string } | null)?.name ?? "the company";
    const botId = await deps.notetaker.schedule({
      meetingUrl: e.meeting_url!,
      joinAt: e.starts_at,
      botName: `Sol (notetaker for ${company})`,
      announcement: `Hello, I'm Sol, the notetaker for ${company}. I'm recording this meeting to take notes. Tell the host if you'd rather I left.`,
    });
    await db
      .from("calendar_events")
      .update({ bot_status: "scheduled", bot_id: botId })
      .eq("id", e.id);
    out.scheduled++;
  }

  // 3. Meetings opted out (or calendars disconnected) after a bot was sent.
  const { data: toCancel } = await db
    .from("calendar_events")
    .select("id, bot_id")
    .eq("record", false)
    .eq("bot_status", "scheduled");
  for (const e of toCancel ?? []) {
    if (e.bot_id) await deps.notetaker.cancel(e.bot_id);
    await db.from("calendar_events").update({ bot_status: "cancelled" }).eq("id", e.id);
    out.cancelled++;
  }

  // 4. Finished meetings: collect the transcript and start the usual pipeline.
  const { data: ended } = await db
    .from("calendar_events")
    .select("id, bot_id")
    .in("bot_status", ["scheduled", "recording"])
    .lt("ends_at", now.toISOString());
  for (const e of ended ?? []) {
    const r = await deps.notetaker.result(e.bot_id!);
    if (r.status === "recording") continue;
    if (r.status === "failed") {
      await db
        .from("calendar_events")
        .update({ bot_status: "failed", bot_note: r.reason })
        .eq("id", e.id);
      continue;
    }
    const { error } = await db.rpc("create_notetaker_capture", {
      p_event: e.id,
      p_duration_seconds: r.seconds,
      p_text: r.segments.map((s) => `${s.speaker}: ${s.text}`).join("\n"),
      // Every segment has a start time, so extracted items can point back to the moment.
      p_segments: r.segments.map((s, i) => ({
        ...s,
        start: s.start ?? (i * r.seconds) / Math.max(1, r.segments.length),
      })) as unknown as Json,
    });
    if (error) throw new Error(`notetaker capture: ${error.message}`);
    out.recorded++;
  }
  return out;
}

/**
 * Google Calendar or Microsoft 365, read with the connection's refresh token (kept in
 * calendar_tokens by the calendar-connect function). Needs the platform's OAuth client.
 */
export function oauthCalendar(
  db: Db,
  provider: CalendarProviderName,
  client: { id: string; secret: string },
  fetcher: typeof fetch = fetch,
): CalendarProvider {
  return {
    name: provider,
    async listEvents(connection, from, to) {
      const { data: tok } = await db
        .from("calendar_tokens")
        .select("refresh_token")
        .eq("connection_id", connection.id)
        .maybeSingle();
      if (!tok) return [];
      const t = tokenRequest(
        provider,
        { refreshToken: tok.refresh_token },
        client.id,
        client.secret,
      );
      const res = await fetcher(t.url, { method: "POST", body: t.body });
      const { access_token: access } = (await res.json()) as { access_token?: string };
      if (!res.ok || !access) throw new Error(`${provider} calendar: couldn't refresh access`);
      const auth = { Authorization: `Bearer ${access}` };
      if (provider === "google") {
        const u = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
        u.searchParams.set("timeMin", from.toISOString());
        u.searchParams.set("timeMax", to.toISOString());
        u.searchParams.set("singleEvents", "true");
        u.searchParams.set("orderBy", "startTime");
        u.searchParams.set("maxResults", "100");
        const r = await fetcher(u, { headers: auth });
        if (!r.ok) throw new Error(`Google Calendar failed (${r.status})`);
        return parseGoogleEvents(await r.json());
      }
      const u = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
      u.searchParams.set("startDateTime", from.toISOString());
      u.searchParams.set("endDateTime", to.toISOString());
      u.searchParams.set("$top", "100");
      const r = await fetcher(u, { headers: { ...auth, Prefer: 'outlook.timezone="UTC"' } });
      if (!r.ok) throw new Error(`Microsoft calendar failed (${r.status})`);
      return parseGraphEvents(await r.json());
    },
  };
}

/** The providers from the environment: real ones only where the platform has set them up. */
export function notetakerFromEnv(db: Db, env: NodeJS.ProcessEnv = process.env) {
  const google = { id: env["GOOGLE_CLIENT_ID"] ?? "", secret: env["GOOGLE_CLIENT_SECRET"] ?? "" };
  const microsoft = {
    id: env["MICROSOFT_CLIENT_ID"] ?? "",
    secret: env["MICROSOFT_CLIENT_SECRET"] ?? "",
  };
  return {
    enabled: env["NOTETAKER_ENABLED"] === "1",
    calendarFor: (p: string): CalendarProvider | null =>
      p === "mock"
        ? mockCalendar
        : p === "google" && google.id
          ? oauthCalendar(db, "google", google)
          : p === "microsoft" && microsoft.id
            ? oauthCalendar(db, "microsoft", microsoft)
            : null,
    notetaker: env["RECALL_API_KEY"]
      ? recallNotetaker(
          env["RECALL_API_KEY"],
          env["RECALL_BASE_URL"] ?? "https://eu-central-1.recall.ai",
        )
      : mockNotetaker(),
  };
}
