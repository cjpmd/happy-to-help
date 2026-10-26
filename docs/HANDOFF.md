# Handoff: things only the owner can do

Everything here is built and tested against a mock provider or the local Supabase stack, behind a flag that is off by default. Each item lists the exact steps to make it live.

## 1. Turn on real agent runs (Anthropic API)

Built: `agent-service/` runs every job on a mock runtime by default (no model calls, no cost).

1. Create an Anthropic API key for the organisation at console.anthropic.com (Settings → API keys), and set a monthly spend limit there.
2. Deploy `agent-service/` as a long-running Node 22 process (e.g. Fly.io, Railway or a small VM). Run `npm ci && npm start` in that folder; it needs the repo's `src/integrations/supabase/types.ts`, so deploy the whole repo or copy it in.
3. Set its environment (see `agent-service/.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (from the Supabase dashboard, API settings; server-side only), `ANTHROPIC_API_KEY`, and `AGENT_RUNTIME=claude`.
4. Check the model IDs in `MODEL_ROUTINE`, `MODEL_PLANNING` and `MODEL_STRATEGY` are the ones you want to pay for.
5. Start one worker, queue a test job from the app (Grow → Write post), and check the run in LOG shows a real cost.

## 2. Deploy the Edge Functions (chat and enqueue)

Built: `supabase/functions/chat` and `supabase/functions/enqueue-job`. Chat streams demo replies until a key is set.

1. Link the CLI to the project: `npx supabase link --project-ref <ref>`.
2. Set secrets: `npx supabase secrets set ANTHROPIC_API_KEY=... ALLOWED_ORIGIN=https://<your app domain>` (optionally `MODEL_ROUTINE`, `MODEL_PLANNING`).
3. Deploy: `npx supabase functions deploy chat enqueue-job`.
4. In the app, send Sol a message and check the run in LOG shows a real cost.


## 3. Turn on real transcription (Speechmatics, EU region)

Built: recordings and voice notes are transcribed by `agent-service/src/capture/transcription.ts`. The default is a mock that returns a fixed sample transcript and sends nothing anywhere. Typed notes and pasted transcripts don't need a provider.

1. Check the provider meets your data-protection needs: create a Speechmatics account, choose the EU processing region, and sign their data processing agreement. Add them to the privacy notice as a sub-processor.
2. Create an API key in the Speechmatics portal (Settings → API keys) and set a usage limit.
3. Check the price per minute and set it in the database: `update public.credit_config set transcription_usd_per_minute = <price>;` (default 0.01). Credits per minute follow the usual conversion.
4. Set on the agent service: `TRANSCRIPTION_PROVIDER=speechmatics`, `SPEECHMATICS_API_KEY=...` (and `SPEECHMATICS_URL` if you use a different region).
5. Restart the worker; its start-up line should say "speechmatics transcription". Record a 30-second debrief on your phone and check the transcript under Meetings → Show transcript, and that the audio is gone from the `captures` storage bucket.

## 4. A branded short-link domain and hub page addresses

Built: short links work now at `<Supabase project URL>/functions/v1/link/<code>` (the `link` Edge Function, public, with a 302 redirect), and in the app at `/l/<code>`. Hub pages are at `/h/<slug>` and forms at `/f/<id>` on the app's own domain.

1. Choose and buy a short domain (e.g. a 4–6 letter `.to` or `.co` domain). This costs money, so it's yours to do.
2. Deploy the function: `npx supabase functions deploy link --no-verify-jwt` (the `verify_jwt = false` setting in `supabase/config.toml` does the same).
3. Point the domain at it: with a proxy that supports path rewriting (e.g. Cloudflare in front of the domain), forward `https://<short-domain>/<code>` to `https://<project>.supabase.co/functions/v1/link/<code>`, keeping the visitor's `User-Agent` and `Referer` headers. Cloudflare also adds the `cf-ipcountry` header the function reads for the coarse country.
4. Set `VITE_SHORT_LINK_BASE=https://<short-domain>` for the frontend build and redeploy it. New links copy with the short domain; existing ones keep working on both addresses.
5. Subdomains per company (`{company}.<our-domain>`) or a company's own domain for its hub page need wildcard DNS and hosting rules on the app's host; until then the `/h/<slug>` address works everywhere. Update the links in seed data (`supabase/seed.sql`) if you use them for demos.
