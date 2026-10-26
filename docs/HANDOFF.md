# Handoff: things only the owner can do

Everything here is built and tested against a mock provider or the local Supabase stack, behind a flag that is off by default. Each item lists the exact steps to make it live.

## 1. Turn on real agent runs (Anthropic API)

Built: `agent-service/` runs every job on a mock runtime by default (no model calls, no cost).

1. Create an Anthropic API key for the organisation at console.anthropic.com (Settings → API keys), and set a monthly spend limit there.
2. Deploy `agent-service/` as a long-running Node 22 process (e.g. Fly.io, Railway or a small VM). Run `npm ci && npm start` in that folder; it needs the repo's `src/integrations/supabase/types.ts`, so deploy the whole repo or copy it in.
3. Set its environment (see `agent-service/.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (from the Supabase dashboard, API settings; server-side only), `ANTHROPIC_API_KEY`, and `AGENT_RUNTIME=claude`.
4. Check the model IDs in `MODEL_ROUTINE`, `MODEL_PLANNING` and `MODEL_STRATEGY` are the ones you want to pay for.
5. Start one worker, queue a test job from the app (Grow → Write post), and check the run in LOG shows a real cost.

