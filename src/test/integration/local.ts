// Helpers for tests against the local Supabase stack. The keys come from `supabase status`
// on this machine; they are the stack's well-known local defaults, never real secrets.
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

interface Status {
  API_URL: string;
  PUBLISHABLE_KEY?: string;
  ANON_KEY: string;
  SECRET_KEY?: string;
  SERVICE_ROLE_KEY: string;
  DB_URL: string;
}

let cached: Status | null = null;
export function localStack(): Status {
  cached ??= JSON.parse(
    execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }),
  ) as Status;
  return cached;
}

export function adminClient(): SupabaseClient<Database> {
  const s = localStack();
  return createClient<Database>(s.API_URL, s.SECRET_KEY ?? s.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** A client signed in as a seeded person (by email), through a real magic-link token. */
export async function clientAs(email: string): Promise<SupabaseClient<Database>> {
  const s = localStack();
  const key = s.PUBLISHABLE_KEY ?? s.ANON_KEY;
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const client = createClient<Database>(s.API_URL, key, { auth: { persistSession: false } });
  const res = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (res.error) throw res.error;
  return client;
}

export const AISHA = "aisha.grant@example.com";
export const MORAG = "morag.fraser@example.com";
export const CALLUM = "callum.reid@example.com";
export const JAMIE = "jamie.lowe@example.com";
export const STUDYBUDDY = "c0000000-0000-4000-8000-000000000001";
export const KELPIE = "c0000000-0000-4000-8000-000000000002";
export const THRIFT = "c0000000-0000-4000-8000-000000000003";
