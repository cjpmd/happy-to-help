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

## 7. Cost reconciliation against Anthropic's usage

Built: `agent-service/src/reconcile.ts` imports the organisation's daily usage by model from the Anthropic Admin API into `anthropic_usage` (priced with `model_prices`), and `cost_reconciliation` compares it with what our runs reported. Admins see the 30-day totals in Settings → Platform health. Without a key, only our side shows.

1. In the Anthropic Console, create an **Admin API key** (Settings → Admin keys; organisation admins only).
2. Set `ANTHROPIC_ADMIN_KEY` on the agent service. On the 1st of each month the worker imports the previous month.
3. To check a period now: `cd agent-service && npm run reconcile -- 2026-10-01 2026-10-31`.
4. Keep `model_prices` in line with Anthropic's price list, or the comparison will drift.

## 8. Turn on listening (comments and Google reviews)

Built: `syncListening` in `agent-service/src/integrations/index.ts` pulls new comments on the company's own recent posts and its Google Business reviews through Ayrshare every hour into the inbox, for companies whose founder switched them on (Grow → Listening). Public replies are `reply_public` approvals posted through Ayrshare after a GO. Without Ayrshare everything stays on the mock and nothing is read or posted. No broad keyword listening (SPEC K).

1. Confirm on our Ayrshare plan which endpoints are available: Get Comments (`GET /api/comments/{id}`), Reply to Comment (`POST /api/comments/reply/{commentId}`), Get Reviews (`GET /api/reviews?platform=gmb`) and Reply to Review (`POST /api/reviews`). At the time of writing, comments and reviews need the Premium or Business plan, and reviews need the Google Business Profile linked to the company's Ayrshare profile. If the field names in the responses differ from `parseComments` / `parseReviews` in `agent-service/src/integrations/ayrshare.ts`, adjust those parsers (their tests are in `agent-service/test/listening.test.ts`). Mentions and DMs aren't read; Ayrshare's messaging API is a separate add-on.
2. Complete section 6 (Social) for the company, then have the founder link Google Business Profile in Ayrshare's linking page.
3. The founder switches on "Comments on your posts" and/or "Google reviews" in Grow → Listening.
4. Feedback requests (Customers → Feedback) need no provider beyond email (section 6). Set `APP_URL` on the agent service to the app's public address so the scheduled requests link to `/fb/<token>` on it.

## 9. Invoice and payment reminders (Stripe Connect)

Built: the "Invoice and payment reminders" bot template (trigger `invoice_overdue`, a polite service email for a GO). It can't be switched on until companies can connect their own Stripe account; the engine has no invoice source yet.

1. Decide between Stripe Connect (Standard accounts, OAuth: companies connect their own Stripe to the platform) and asking each company for a restricted read-only key. Connect is the usual route and needs the platform's Stripe account enabled for Connect (an application to Stripe).
2. Add a connect flow in Settings → Integrations that stores the connected account id in `integration_secrets` (provider `stripe_connect`).
3. In `agent-service/src/bots.ts`, implement the `invoice_overdue` case of `triggered`: list the connected account's open invoices past their due date (`GET /v1/invoices?status=open` with `Stripe-Account`), match the customer's email to a contact, and enrol them with the invoice id as the period.
4. Remove the `needs = 'stripe'` refusal in `update_bot` for companies with a connection.

## 10. Turn on the meeting notetaker (Recall.ai, Google, Microsoft)

Built: calendar connections and the notetaker loop in `agent-service/src/capture/notetaker.ts`, the `calendar-connect` Edge Function, and Meetings → Notetaker. All off until switched on; with the switches on but no keys, it uses the demo calendar and a mock bot that joins nothing.

Costs and residency (check before signing up; prices change): Recall.ai's pay-as-you-go rate was about $0.50 per recording hour in early 2026, plus about $0.15 an hour for its own transcription ([pricing](https://www.recall.ai/pricing), [2026 pricing note](https://recall.ai/blog/new-recall-ai-pricing-for-2026)). We use the meeting platforms' captions by default, so no transcription add-on. Recall.ai runs regional deployments; confirm with them that the EU region (`https://eu-central-1.recall.ai`) is available on our plan and sign their DPA. Update `credit_config.notetaker_usd_per_minute` if the rate differs from $0.0083.

1. **Recall.ai:** create an account in the EU region, create an API key, and set `RECALL_API_KEY` and `RECALL_BASE_URL` on the agent service.
2. **Google:** in Google Cloud, create an OAuth client (web application) with redirect URI `https://<project>.supabase.co/functions/v1/calendar-connect`, scope `calendar.events.readonly`. The scope is sensitive: Google's app verification is needed before people outside our test users can connect. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the agent service **and** with `npx supabase secrets set`.
3. **Microsoft:** in Microsoft Entra, register an app (multi-tenant and personal accounts) with the same redirect URI and the delegated `Calendars.Read` and `offline_access` permissions. Set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` in both places.
4. Set `npx supabase secrets set NOTETAKER_ENABLED=1 CALENDAR_STATE_SECRET=<long random> APP_URL=https://<app>` and deploy `npx supabase functions deploy calendar-connect --no-verify-jwt`. Set `NOTETAKER_ENABLED=1` on the agent service and `VITE_NOTETAKER_ENABLED=true` for the app.
5. Add Recall.ai (and the calendar providers) to the privacy notice as sub-processors, and tell customers how the bot announces itself.

## 11. Turn on calls (Twilio)

Built: the `call-webhook` Edge Function, `record_call` and the Calls tab. Off until switched on; demo numbers are in Ofcom's drama range and never ring.

Costs (check the [GB price list](https://www.twilio.com/en-us/voice/pricing/gb)): a UK local number is roughly £1–1.50 a month, and inbound and forwarded minutes and recording storage are charged per minute; the search we ran couldn't confirm current UK inbound rates. Update `credit_config.call_usd_per_minute` (default $0.012) to cover inbound plus forwarding.

1. Create a Twilio account (upgrade from trial), complete the UK regulatory bundle for UK numbers (address and identity), and buy a number for one test company. This spends money: the owner does it.
2. Set the number's voice webhook to `POST https://<project>.supabase.co/functions/v1/call-webhook?event=voice` and the status callback to `...?event=status`.
3. `npx supabase secrets set CALLS_ENABLED=1 TWILIO_AUTH_TOKEN=<auth token> CALLS_WEBHOOK_URL=https://<project>.supabase.co/functions/v1/call-webhook` and deploy with `--no-verify-jwt`. Set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` on the agent service (to fetch and delete recordings) and `VITE_CALLS_ENABLED=true` for the app.
4. Record the number for the company: `insert into public.phone_numbers (company_id, number, provider) values ('<company id>', '+44...', 'twilio');`
5. Call it: you should hear the notice, be put through to the founder's phone (set in Customers → Calls), and see the call and its notes appear. Locally, `node scripts/dev/replay-call.mjs <number>` does the same with signed fake requests.
