import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests against the local Supabase stack (npx supabase start && npx supabase db reset).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
