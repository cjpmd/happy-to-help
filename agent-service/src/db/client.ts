import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config.js";
import type { Database } from "./types.js";

export type Db = SupabaseClient<Database>;

/** The service-role client. Server-side only: this key bypasses row-level security. */
export function serviceClient(config: Pick<Config, "supabaseUrl" | "serviceRoleKey">): Db {
  if (!config.serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient<Database>(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Unwraps a Supabase response, throwing its error with context. */
export function must<T>(
  res: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: no data`);
  return res.data as NonNullable<T>;
}
