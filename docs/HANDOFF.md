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

## 5. Turn on Stripe billing (test mode)

Built: Checkout for the three plans, three top-ups and the Launch Pack, the Customer Portal, and a webhook that grants credits once per payment (`supabase/functions/billing-checkout`, `billing-portal`, `stripe-webhook`; the rules in `apply_billing_event`). The functions refuse live keys (`sk_live_…`) and live events unless `STRIPE_ALLOW_LIVE=1`, which only you should ever set. Locally, `BILLING_MOCK=1` applies purchases without Stripe, and `node scripts/dev/replay-stripe-webhooks.mjs` sends signed test events.

1. Create a Stripe account (or use the existing one) and stay in **test mode**.
2. Create the products and monthly prices in GBP to match `billing_products` (Starter £29, Founder £79, Growth £149 as monthly subscriptions; £10, £25 and £50 top-ups and the £49 Launch Pack as one-off prices). Then record each price id: `update public.billing_products set stripe_price_id = 'price_…' where product = 'plan_starter';` (and so on for the other six).
3. In the Stripe dashboard, turn on the Customer Portal (Settings → Billing → Customer portal) and allow plan switching between the three plan prices and cancellation.
4. Add a webhook endpoint for `https://<project>.supabase.co/functions/v1/stripe-webhook` with these events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy its signing secret.
5. Set the function secrets: `npx supabase secrets set STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… APP_URL=https://<your app domain>`, then deploy: `npx supabase functions deploy billing-checkout billing-portal stripe-webhook` (the webhook needs `--no-verify-jwt`, set in `supabase/config.toml`).
6. Build the app with `VITE_BILLING_ENABLED=true`, buy a top-up with Stripe's test card 4242 4242 4242 4242, and check the credits appear in the ledger once.
7. Locally with the Stripe CLI: `stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook` and put the `whsec_…` it prints in `supabase/functions/.env`.

## 6. Turn on real email, social publishing and site analytics

Built: Resend, Ayrshare and PostHog adapters in `agent-service/src/integrations/`, the `resend-inbound` and `unsubscribe` Edge Functions, and per-company switches in Settings → Integrations. A provider is real only when the platform key below is set **and** the company's founder switches it on; Settings shows "Not set up yet" until the worker reports the key.

**Unsubscribe links (do this first).** Pick a long random secret and set it in both places: `UNSUBSCRIBE_SECRET` on the agent service and `npx supabase secrets set UNSUBSCRIBE_SECRET=...` for the functions. Deploy `npx supabase functions deploy unsubscribe --no-verify-jwt`. Without it the executor refuses to send real marketing email.

**Email (Resend).**
1. Create a Resend account and verify a sending domain (e.g. `mail.<your domain>`: add the SPF, DKIM and DMARC records Resend shows).
2. Create an API key with sending access. Set on the agent service: `RESEND_API_KEY`, `RESEND_SENDING_DOMAIN=mail.<your domain>`.
3. Inbound: set up Resend inbound for a receiving domain (e.g. `in.<your domain>`, MX records as Resend shows), add a webhook for `email.received` pointing at `https://<project>.supabase.co/functions/v1/resend-inbound`, and set `npx supabase secrets set RESEND_WEBHOOK_SECRET=whsec_... INBOUND_DOMAIN=in.<your domain> RESEND_API_KEY=re_...` (the key lets the function fetch the message body). Deploy with `--no-verify-jwt`. Set `VITE_INBOUND_DOMAIN` for the app.
4. Switch Email on for one test company, approve a reply to your own address, and check it arrives from `<slug>@mail.<your domain>` with replies going to the founder.

**Social (Ayrshare).**
1. Create an Ayrshare Business account (profiles per company). Set `AYRSHARE_API_KEY` on the agent service.
2. For each company: create a profile, have the founder link their social accounts through Ayrshare's linking page, then store the profile key: `insert into public.integration_secrets (company_id, provider, secret) values ('<company id>', 'ayrshare', '<profile key>');`
3. The founder switches Social on; approved posts publish, and the worker pulls post analytics hourly into Grow.

**Site analytics (PostHog).**
1. Create a PostHog project on EU Cloud. Set the project's public key as `VITE_POSTHOG_KEY` for the app (events are sent only after a visitor allows analytics on the hub page).
2. Create a personal API key with query access; set `POSTHOG_PROJECT_ID` and `POSTHOG_PERSONAL_API_KEY` on the agent service.
3. The founder switches Site analytics on; the worker fills `metrics_daily` (visitors, signups) every six hours. Add PostHog to the privacy notice as a sub-processor.
