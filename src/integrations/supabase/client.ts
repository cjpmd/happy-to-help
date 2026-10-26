import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * The browser's Supabase client. Only the publishable (anon) key belongs here: row-level
 * security decides what each signed-in user can read and write. Service-role and provider
 * keys live in the agent service and Edge Functions only (CLAUDE.md rule 1).
 *
 * Without VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY the app runs in demo mode on
 * the in-memory store (src/lib/store.tsx), so the Lovable preview works with no backend.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isLiveMode = Boolean(url && key);

let client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!url || !key) throw new Error("Supabase is not configured: the app is in demo mode");
  client ??= createClient<Database>(url, key, {
    auth: {
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
      detectSessionInUrl: typeof window !== "undefined",
      flowType: "pkce",
    },
  });
  return client;
}
