// Connect a calendar for the notetaker (Phase 18). Off unless NOTETAKER_ENABLED=1.
//   POST /functions/v1/calendar-connect { company_id, provider }  (signed in) → { url }
//   GET  /functions/v1/calendar-connect?code&state                (the provider's redirect)
// Read-only access; the refresh token is kept in calendar_tokens, which only the service role
// can read. Public for the redirect (verify_jwt = false); the POST checks the caller itself.
import { caller, cors, json, readJson, reportEdgeError, serviceClient } from "../_shared/http.ts";
import {
  authUrl,
  signState,
  tokenRequest,
  verifyState,
  type CalendarProviderName,
} from "../_shared/calendar.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const creds = (p: CalendarProviderName) =>
  p === "google"
    ? { id: env("GOOGLE_CLIENT_ID"), secret: env("GOOGLE_CLIENT_SECRET") }
    : { id: env("MICROSOFT_CLIENT_ID"), secret: env("MICROSOFT_CLIENT_SECRET") };

Deno.serve(async (req) => {
  if (Deno.env.get("NOTETAKER_ENABLED") !== "1") return new Response("Not found", { status: 404 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const self = `${env("SUPABASE_URL") || "http://127.0.0.1:54321"}/functions/v1/calendar-connect`;
  const app = env("APP_URL") || "http://127.0.0.1:8080";
  const stateSecret = env("CALENDAR_STATE_SECRET");
  if (!stateSecret) return json({ error: "Calendar connections aren't set up" }, 503);

  if (req.method === "POST") {
    const who = await caller(req);
    if (!who) return json({ error: "Sign in first" }, 401);
    const body = await readJson<{ company_id?: string; provider?: string }>(req);
    if (body instanceof Response) return body;
    const provider = body.provider as CalendarProviderName;
    if (provider !== "google" && provider !== "microsoft")
      return json({ error: "Choose Google or Microsoft" }, 400);
    const c = creds(provider);
    if (!c.id || !c.secret) return json({ error: "This calendar isn't set up yet" }, 503);
    // As the caller (RLS applies): are they a founder or teammate of this company?
    const { data: member } = await who.sb
      .from("company_members")
      .select("role")
      .eq("company_id", body.company_id ?? "")
      .eq("user_id", who.user.id)
      .in("role", ["founder", "teammate"])
      .maybeSingle();
    if (!member) return json({ error: "Only founders and teammates can connect a calendar" }, 403);
    const state = await signState(
      { company: body.company_id!, user: who.user.id, provider, at: Math.floor(Date.now() / 1000) },
      stateSecret,
    );
    return json({ url: authUrl(provider, c.id, self, state) });
  }

  if (req.method !== "GET") return json({ error: "Use POST" }, 405);
  const q = new URL(req.url).searchParams;
  const back = (status: string) => Response.redirect(`${app}/meetings?calendar=${status}`, 302);
  const s = await verifyState(q.get("state") ?? "", stateSecret, Math.floor(Date.now() / 1000));
  if (!s || !q.get("code")) return back("failed");
  try {
    const c = creds(s.provider);
    const t = tokenRequest(s.provider, { code: q.get("code")!, redirectUri: self }, c.id, c.secret);
    const res = await fetch(t.url, { method: "POST", body: t.body });
    const tok = (await res.json()) as { refresh_token?: string; id_token?: string };
    if (!res.ok || !tok.refresh_token) return back("failed");
    // The account's email, from the ID token's claims (signed by the provider; used as a label).
    const claims = tok.id_token
      ? (JSON.parse(atob(tok.id_token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as {
          email?: string;
          preferred_username?: string;
        })
      : {};
    const admin = serviceClient();
    const { data: conn, error } = await admin
      .from("calendar_connections")
      .upsert(
        {
          company_id: s.company,
          user_id: s.user,
          provider: s.provider,
          account_email: claims.email ?? claims.preferred_username ?? "",
          status: "connected",
        },
        { onConflict: "company_id,user_id,provider" },
      )
      .select("id")
      .single();
    if (error || !conn) throw new Error(error?.message ?? "no connection");
    await admin.from("calendar_tokens").upsert({
      connection_id: conn.id,
      refresh_token: tok.refresh_token,
      updated_at: new Date().toISOString(),
    });
    return back("connected");
  } catch (e) {
    await reportEdgeError("calendar-connect", e, { company: s.company });
    return back("failed");
  }
});
