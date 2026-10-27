# Security review (Phase 9, 27 Oct 2026)

What was checked, what's enforced by tests, and what's left. Re-run `scripts/dev/check-all.sh` after any schema or function change: the tests below fail if these guarantees slip.

## Row-level security

- **Every table in `public` has RLS on**, and every policy applies to signed-in users only (`01_coverage.test.sql`). Anonymous visitors have no table privileges and can call exactly five functions: the progress page, `get_hub`, `get_form`, `follow_link` and `submit_lead` (D47).
- **The read matrix** (`02_read_access.test.sql`) checks, for every company-scoped table and view, that each of nine people (founder, teammate, viewer, member mentor, cohort mentor, other mentor, outsider, admin, another company's founder) sees exactly the rows they should. Three tiers:
  - *Company data*: members, their cohort's mentors and admins.
  - *Founder and teammate only*: raw correspondence and recordings (voice sources and edits, captures, transcripts, extracted items, ideas, promises, feedback), personal data (consents, leads), integration settings, the subscription, briefs.
  - *Service role only*: Stripe customer ids and events, integration secrets, schedule runs. *Admins only*: error events, Anthropic usage.
- **Direct writes** (`17_hardening.test.sql`): signed-in people can insert, update or delete directly in only 16 reviewed tables (their own profile and preferences, layouts, and company content like tasks, contacts, investors and evidence), each with a matching policy. Everything with money, permissions or external effect (the credit ledger, approvals, agent jobs and runs, consents, leads, billing, captures, voice profiles, policies) is written only through checked `security definer` RPCs or the service role. Adding a direct grant fails the test until the list is updated deliberately.
- **Every readable table has a read policy**, and every `security definer` function pins an empty `search_path` (`01_coverage`, `17_hardening`).
- **The credit ledger is insert-only** (trigger) and consents are a history (updates refused; deletes allowed only for erasure).

## Edge Functions

| Function | Who can call | Checks |
|---|---|---|
| `chat` | Signed in (JWT) | membership via `begin_chat_turn`; 64 KB body; message ≤ 4,000 chars; 30 messages a minute; reserve → settle → refund; errors go to monitoring, people see a plain message |
| `enqueue-job` | Signed in (JWT) | membership and job type via `enqueue_job`; 64 KB body; 120 jobs an hour |
| `billing-checkout`, `billing-portal` | Signed in (JWT) | founders only; 64 KB body; live Stripe keys refused; Stripe calls time out after 15 s |
| `stripe-webhook` | Public | Stripe signature (HMAC, 5-minute tolerance, constant-time); 256 KB body; live events refused; idempotent on event id |
| `resend-inbound` | Public | Svix signature; 1 MB body; only addresses on the inbound domain; idempotent on message id |
| `unsubscribe` | Public | HMAC token per company and address; HTML escaped, with a no-script CSP |
| `link` | Public | short-code format checked; logs no IP |

- The service-role key is used only inside functions and the agent service, never returned. Provider secrets are function secrets or agent-service env, never in the repo (`.env` files are git-ignored; only `.env.example` files with local test values are committed).
- CORS: `ALLOWED_ORIGIN` should be set to the app's domain in production (HANDOFF 2). Bearer tokens, not cookies, authenticate the functions, so `*` locally doesn't expose sessions.

## Rate limits

Database triggers (so RPCs, functions and direct inserts are all covered), per person, fixed windows: agent jobs 120 an hour, chat 30 a minute, recordings 30 an hour, tracked links 100 an hour, voice examples 60 an hour, error reports 20 an hour. Lead forms: 3 an hour per person and 200 an hour per form. The service role isn't limited. Old windows are cleared daily.

## Monitoring

`error_events` collects worker, executor, scheduler, Edge Function and app errors; admins see them in Settings → Platform health with the 30-day cost check. An external service (e.g. Sentry) can be added later; nothing here depends on one.

## Known gaps

- No virus scanning of uploaded audio (only audio and video MIME types, 100 MB, private bucket, deleted after transcription).
- Rate limits are per person, not per IP, for signed-in actions; public endpoints rely on the platform's own limits plus the per-form lead limit.
- Mentors can read approvals for their cohort's companies, including draft email text. That's by design (they review work) but worth confirming with universities.
