// Calendar connections (Phase 18): OAuth for Google Calendar and Microsoft 365, read-only, and
// reading events back. Free of Deno so vitest can test it (src/test/calendar.test.ts) and the
// agent service can share the event parsers. The OAuth state is signed so a callback can't be
// replayed for another person or company.

export type CalendarProviderName = "google" | "microsoft";

const AUTH: Record<CalendarProviderName, { auth: string; token: string; scope: string }> = {
  google: {
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar.events.readonly openid email",
  },
  microsoft: {
    auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access openid email Calendars.Read",
  },
};

export function authUrl(
  p: CalendarProviderName,
  clientId: string,
  redirectUri: string,
  state: string,
) {
  const u = new URL(AUTH[p].auth);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", AUTH[p].scope);
  u.searchParams.set("state", state);
  if (p === "google") {
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
  }
  return u.toString();
}

/** The token request for an authorisation code or a refresh token. */
export function tokenRequest(
  p: CalendarProviderName,
  g: { code: string; redirectUri: string } | { refreshToken: string },
  clientId: string,
  clientSecret: string,
) {
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  if ("code" in g) {
    body.set("grant_type", "authorization_code");
    body.set("code", g.code);
    body.set("redirect_uri", g.redirectUri);
  } else {
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", g.refreshToken);
  }
  return { url: AUTH[p].token, body };
}

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))),
  );
}

export interface OAuthState {
  company: string;
  user: string;
  provider: CalendarProviderName;
  /** Unix seconds; states are good for ten minutes. */
  at: number;
}

export async function signState(s: OAuthState, secret: string) {
  const data = b64url(new TextEncoder().encode(JSON.stringify(s)));
  return `${data}.${await hmac(secret, data)}`;
}

export async function verifyState(
  state: string,
  secret: string,
  nowSeconds: number,
): Promise<OAuthState | null> {
  const [data, sig] = state.split(".");
  if (!data || !sig || (await hmac(secret, data)) !== sig) return null;
  try {
    const s = JSON.parse(atob(data.replace(/-/g, "+").replace(/_/g, "/"))) as OAuthState;
    return nowSeconds - s.at <= 600 && nowSeconds >= s.at - 60 ? s : null;
  } catch {
    return null;
  }
}

export interface ParsedEvent {
  externalId: string;
  seriesId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  meetingUrl: string | null;
  attendees: string[];
}

const MEETING =
  /https:\/\/(?:[a-z0-9-]+\.)?(?:zoom\.us\/j\/|meet\.google\.com\/|teams\.microsoft\.com\/l\/meetup-join\/)[^\s"<>]+/i;

/** Google Calendar's events.list items. All-day events (no dateTime) are skipped. */
export function parseGoogleEvents(body: unknown): ParsedEvent[] {
  const items = ((body ?? {}) as { items?: Record<string, unknown>[] }).items ?? [];
  return items.flatMap((e) => {
    const start = (e["start"] as { dateTime?: string } | undefined)?.dateTime;
    const end = (e["end"] as { dateTime?: string } | undefined)?.dateTime;
    if (!start || !end || e["status"] === "cancelled") return [];
    const link =
      (e["hangoutLink"] as string | undefined) ??
      (
        (
          e["conferenceData"] as
            { entryPoints?: { entryPointType: string; uri: string }[] } | undefined
        )?.entryPoints ?? []
      ).find((p) => p.entryPointType === "video")?.uri ??
      String(e["description"] ?? "").match(MEETING)?.[0] ??
      String(e["location"] ?? "").match(MEETING)?.[0] ??
      null;
    return [
      {
        externalId: String(e["id"]),
        seriesId: (e["recurringEventId"] as string | undefined) ?? null,
        title: String(e["summary"] ?? "(No title)"),
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        meetingUrl: link,
        attendees: ((e["attendees"] as { email?: string }[] | undefined) ?? []).flatMap((a) =>
          a.email ? [a.email] : [],
        ),
      },
    ];
  });
}

/** Microsoft Graph's calendarView values (times in UTC when asked with Prefer: outlook.timezone="UTC"). */
export function parseGraphEvents(body: unknown): ParsedEvent[] {
  const items = ((body ?? {}) as { value?: Record<string, unknown>[] }).value ?? [];
  return items.flatMap((e) => {
    if (e["isAllDay"] || e["isCancelled"]) return [];
    const t = (k: string) => (e[k] as { dateTime?: string } | undefined)?.dateTime;
    const start = t("start");
    const end = t("end");
    if (!start || !end) return [];
    const utc = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).toISOString();
    return [
      {
        externalId: String(e["id"]),
        seriesId: (e["seriesMasterId"] as string | undefined) ?? null,
        title: String(e["subject"] ?? "(No title)"),
        startsAt: utc(start),
        endsAt: utc(end),
        meetingUrl:
          (e["onlineMeeting"] as { joinUrl?: string } | null | undefined)?.joinUrl ??
          String((e["body"] as { content?: string } | undefined)?.content ?? "").match(
            MEETING,
          )?.[0] ??
          null,
        attendees: (
          (e["attendees"] as { emailAddress?: { address?: string } }[] | undefined) ?? []
        ).flatMap((a) => (a.emailAddress?.address ? [a.emailAddress.address] : [])),
      },
    ];
  });
}
