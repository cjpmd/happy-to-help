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
