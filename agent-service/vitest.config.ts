import { defineConfig } from "vitest/config";

// Most tests run against the local Supabase stack (npx supabase start && npx supabase db reset).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
