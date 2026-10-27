// CORS, JSON responses and the two Supabase clients every function needs.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** A client acting as the signed-in caller: row-level security and RPC checks apply. */
export function userClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
}

/** The service-role client, for credits and agent writes. Never returned to the caller. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** The signed-in user, or null. */
export async function caller(req: Request) {
  const sb = userClient(req);
  const { data } = await sb.auth.getUser();
  return data.user ? { sb, user: data.user } : null;
}

/** Request bodies larger than this are refused (Phase 9 security pass). */
export const MAX_BODY_BYTES = 256 * 1024;

/**
 * The raw body as text, refused if it's larger than the limit (by the declared length, and by
 * what actually arrives). Returns null when too large.
 */
export async function readBody(req: Request, maxBytes = MAX_BODY_BYTES): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  const text = await req.text();
  return new TextEncoder().encode(text).length > maxBytes ? null : text;
}

/** A JSON body, or an error response to return (too large, or not JSON). */
export async function readJson<T>(req: Request, maxBytes = 64 * 1024): Promise<T | Response> {
  const text = await readBody(req, maxBytes);
  if (text === null) return json({ error: "That request is too large" }, 413);
  try {
    return JSON.parse(text || "{}") as T;
  } catch {
    return json({ error: "Send a JSON body" }, 400);
  }
}

/** fetch with a timeout, so a slow provider can't hold a function open. */
export function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15_000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

/** Escapes text for an HTML page. */
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Headers for the few HTML pages functions serve: no scripts, no framing, no sniffing. */
export const htmlHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/** Records a function's unexpected failure for platform admins (never throws). */
export async function reportEdgeError(
  fn: string,
  error: unknown,
  context: Record<string, unknown> = {},
) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${fn}] ${message}`);
  try {
    await serviceClient()
      .from("error_events")
      .insert({ source: "edge", message: message.slice(0, 2000), context: { fn, ...context } });
  } catch {
    // Logged above.
  }
}
