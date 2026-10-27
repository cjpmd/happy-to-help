/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Unset: demo mode on the in-memory store. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable (anon) key. Safe in the browser; RLS protects the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
