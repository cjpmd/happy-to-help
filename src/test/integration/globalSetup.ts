// Waits for the local API to serve the freshly reset schema: right after `supabase db reset`
// PostgREST can still be reloading, which made the first test flaky.
import { localStack } from "./local";

export default async function setup() {
  const s = localStack();
  const key = s.SECRET_KEY ?? s.SERVICE_ROLE_KEY;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${s.API_URL}/rest/v1/job_types?select=job_type&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (res.ok && ((await res.json()) as unknown[]).length) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("The local Supabase API didn't come up; run npx supabase start");
}
