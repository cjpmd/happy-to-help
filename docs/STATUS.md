# Status

## Final summary (autonomous run, 26–27 Oct 2026)

Every phase in `docs/PHASES.md` (0–19) is built, merged into `develop` with `--no-ff`, and passes the full check suite (`scripts/dev/check-all.sh`: database reset and types, typecheck, lint, unit tests, build, pgTAP, integration, agent-service typecheck and tests, and the live end-to-end test). Nothing is deployed and no real provider is switched on: that's the owner's, step by step, in `docs/HANDOFF.md`. Decisions are in `docs/DECISIONS.md` (D1–D88).

### What was built

- **Foundation (Phases 1–2):** the Mission HQ design on every screen; Supabase schema with RLS on every table (pgTAP read matrix for every person and company); magic-link sign-in; one store API with a demo provider (in memory) and a live provider (Supabase, Realtime); writes through checked RPCs. The credits engine: an insert-only ledger with lots, holds, settle and release, cohort pools, expiry, and conversion constants in config.
- **Engine (Phases 3–5, 8, 9):** the agent service (Claude Agent SDK runtime, or a mock runtime by default) that claims jobs, builds company memory, reserves → runs with `maxBudgetUsd` → settles, and refunds platform failures. Streaming chat in an Edge Function. The deterministic approvals executor that re-checks rules and charges per action. The scheduler (routines, the 07:00 brief, the nightly loop, Auto Mode, credit expiry). Error monitoring, cost reconciliation against Anthropic's usage report, rate limits, and a security review.
- **Two entry paths and the v2 model (Phases 10–13):** Start up and Keep going, a stage-aware HQ, brand voice and response policy, capture from conversation (voice notes, debriefs, transcripts and recordings → review cards → routed items), and the link layer (tracked short links, hub pages, lead forms with recorded consent, attribution without cookies).
- **Billing and integrations (Phases 6–7):** Stripe Checkout, the Customer Portal and signed webhooks (test mode only). Resend email in and out, Ayrshare publishing and analytics, PostHog, unsubscribe links, all per company and mocked until both the platform key and the company's switch are on.
- **Customers and growth (Phases 14–17):** the unified inbox (triage → policy → draft → claims check → send, queue or escalate, with a daily budget); consent-checked imports. Campaigns (plan → GO → CAP-checked assets per channel → results through their links). Listening (comments and Google reviews into the inbox, public replies always for a GO, opt-in feedback requests, sentiment and themes in Grow and the brief). Process bots (six templates, consent-checked, approval levels, weekly caps, every step audited).
- **Flagged, off by default (Phases 18–19):** the meeting notetaker (calendar OAuth, per-meeting opt-in, an announced bot) and recorded calls (a spoken notice first), both feeding the capture pipeline with per-minute costs and a daily cap. Paid ads (launch for a GO, daily and monthly caps, spend into attribution), built as a switched-off foundation only (D86).

### Mocks, and what each needs (see `docs/HANDOFF.md`)

| Mocked today | What turns it on | HANDOFF |
|---|---|---|
| Agent runs and chat replies (mock runtime, demo replies) | Anthropic API key, `AGENT_RUNTIME=claude`, chat key on the functions | 1 |
| Everything server-side in production | A production Supabase project: migrations, functions, secrets, hosting | 2 |
| Transcription of recordings | Speechmatics key (EU region) | 3 |
| Short links on the functions URL | A branded short domain | 4 |
| Payments (applied instantly in mock) | Stripe test keys, prices and webhook; live mode is a separate owner decision | 5 |
| Email, social publishing, site analytics | Resend (with a verified domain), Ayrshare Business with per-company profiles, PostHog | 6 |
| Cost reconciliation (our side only) | Anthropic Admin API key | 7 |
| Comments and Google reviews | Ayrshare comments and reviews endpoints on our plan | 8 |
| Invoice and payment reminder bot (can't be switched on) | Stripe Connect for companies' own accounts | 9 |
| Meeting notetaker (demo calendar, mock bot) | Recall.ai (EU), Google and Microsoft OAuth apps, the switches | 10 |
| Calls (demo numbers that never ring) | Twilio account, UK number and regulatory bundle, the switches | 11 |
| Paid ads (mock provider, switched off) | Meta and Google Ads API approval, adapters, the switches; only once there are real customers | 12 |

### The 10 most consequential decisions

1. **D5:** one store API with a demo provider and a live provider, so the Lovable preview keeps working without a backend and every feature has both.
2. **D15:** credit lots inside the insert-only ledger, which gives consumption order, expiry and refunds without ever updating a row.
3. **D22:** a run reserves `max(estimate, min(cap, available))` and `maxBudgetUsd` is that reservation, so no run can spend more than it holds.
4. **D20:** the agent service defaults to a mock runtime that follows each job's playbook through the real tools, gate, audit and credit flow, so everything but the model is exercised without spending money.
5. **D29 / D30:** approved actions are carried out by a deterministic executor in the worker, which re-checks claims, caps and the founders' escalation settings at execution time, and charges only when it acts.
6. **D37 / D75:** reply rules live in the executor, not the prompt. Automatic replies need an approved voice and a reviewed policy, never for escalation categories. Public replies always wait for a GO.
7. **D54:** a real provider needs both the platform key and the company's own switch, so deploying keys can't turn anything on by itself.
8. **D55 / D68 / D79:** a single consent model for PECR. Marketing email needs recorded permission with evidence; service messages don't; every marketing email carries its own unsubscribe link; opt-outs are always respected.
9. **D57:** the scheduler lives in the agent worker, with a unique claim per firing, so restarts and extra workers never double-fire.
10. **D86:** Phase 19 is built switched off on a mock, satisfying the run's "build to the end" instruction, PHASES' "not until real customers", and the no-spending rule together.

### Known issues

- Nothing has run against a real provider: the Claude runtime, Resend, Ayrshare (especially the comments and reviews field names), PostHog, Speechmatics, Recall.ai, Twilio, and the Google and Microsoft calendar APIs are built from their documentation and tested with fakes. Expect small fixes when each is switched on.
- Some older screens may still show founder-only buttons to mentors and viewers; the server refuses those actions with a clear message.
- In the demo, bots and the notetaker can be set up but don't run (their engines are in the agent service).
- Not built: outbound calls, Facebook and Instagram DMs and mentions, broad keyword listening (out of scope until costed), and the Meta and Google Ads adapters.
- Lint passes with 22 warnings (React fast-refresh hints on files that export helpers alongside components).
- `roadmap.md` is Lovable's own checklist and isn't kept up to date; this file is the source of truth.

### Next steps

1. Follow HANDOFF 2 then 1: create the production Supabase project, apply the migrations, deploy the functions, and switch on real agent runs for one test company.
2. HANDOFF 6 and 5: email, social and analytics, then Stripe in test mode; run the end-to-end flows with a real founder.
3. HANDOFF 3, 4, 7 and 8 as needed. Then 10 and 11 (notetaker and calls) once the core is in use.
4. Leave HANDOFF 12 (paid ads) until there are real customers, as PHASES says.
5. **Crew (added 9 Nov 2026, awaiting review, nothing built):** `docs/CREW-PHASES.md` plans Phases 20–24 from `docs/CREW.md` (agent records, crew roster, morning briefing, autonomy ladder, plan unlocks); decisions D89–D104. **Approved 9 Nov 2026**; building them next, alongside HANDOFF 2 and 1, with Phase 23 landing before any real sending provider (HANDOFF 6) is switched on.

## Crew phases (20–24, started 9 Nov 2026)

Plan: `docs/CREW-PHASES.md` (approved 9 Nov 2026). Decisions D89–D108. Review stops: after Phase 20's migrations are written (before applying), after the Phase 21 roster screen, after Phase 23.

| # | Phase | Branch | Status |
|---|---|---|---|
| 20 | Agent records | `phase-20-agent-records` | **Migrations written, not applied: waiting for review** |
| 21 | Crew roster and cards | `phase-21-crew-roster` | To do |
| 22 | Morning briefing | `phase-22-morning-briefing` | To do |
| 23 | Autonomy ladder and simulation | `phase-23-autonomy` | To do |
| 24 | Plan unlocks | `phase-24-plan-unlocks` | To do |

### Phase 20 (in progress)

- **Written:** `20261110100000_crew_enums.sql` (`crew_pillar`, `agent_status`) and `20261110100100_agents.sql` (action types with ceilings, the full catalogue of 46, `job_types.default_agent` / `fallback_agent`, `agents`, `agent_autonomy` with the ceiling trigger, insert-only `agent_autonomy_events`, `agent_runs.agent_id` and `agent_jobs.agent_id`, `seed_crew` on every new company, `agent_for_job`, `attribute_runs`, the backfill with a check that no run is left without an agent, RLS). `supabase/seed.sql` attributes the seeded runs.
- **Not yet run:** neither migration has been applied anywhere, including locally (review stop). No Docker in this sandbox; after review the plan is `scripts/db/test-local.sh` on plain Postgres 16.
- **Next after review:** apply locally, regenerate types, pgTAP (`24_agents.test.sql`, read-access matrix), then the agent-service changes (`crew.ts`, agent on each run, per-run and monthly caps, paused agents refused, crew identity in the workspace), the chat function and executor recording `agent_id`, the demo store's crew, and Starter prompts in `agent-service/prompts/`.

## Autonomous run (started 26 Oct 2026)

Working from `docs/AUTONOMOUS-RUN.md`. Decisions are in `docs/DECISIONS.md`; anything that needs the owner (accounts, keys, money, production) is in `docs/HANDOFF.md`.

### Build order

Restyle first, then the remaining Phase 1 groups, then the engine, then the v2 data-model phases (10–13) before the real integrations (6–9) that would otherwise be built on the old model, then the rest of v2.

| # | Phase | Branch | Status |
|---|---|---|---|
| 0 | Merge SPEC/PHASES additions, CLAUDE.md summary | `phase-0-docs-merge` | Done |
| 1 | Finish Phase 1: restyle step 5 (Telemetry), 1b schema additions, 1c live data layer, 1d server-side writes, 1e bug fixes | `phase-1-finish` | Done |
| 2 | Credits engine | `phase-2-credits` | Done |
| 3 | Agent service | `phase-3-agent-service` | Done |
| 4 | Connect the app to the engine | `phase-4-connect` | Done |
| 5 | Approvals executor | `phase-5-executor` | Done |
| 10 | Two entry paths, stage-aware dashboard | `phase-10-entry-paths` | Done |
| 11 | Brand voice and response policy | `phase-11-voice-policy` | Done |
| 12 | Capture v1 | `phase-12-capture` | Done |
| 13 | Link layer and lead capture | `phase-13-link-layer` | Done |
| 6 | Stripe billing (test mode) | `phase-6-stripe` | Done |
| 7 | Real integrations (flagged, mocked by default) | `phase-7-integrations` | Done |
| 8 | Scheduler, routines, Auto Mode | `phase-8-scheduler` | Done |
| 9 | More skills and hardening | `phase-9-hardening` | Done |
| 14 | Customers: inbox and contacts | `phase-14-inbox` | Done |
| 15 | Campaigns | `phase-15-campaigns` | Done |
| 16 | Listening | `phase-16-listening` | Done |
| 17 | Process bots | `phase-17-bots` | Done |
| 18 | Capture v2: notetaker and calls (flagged) | `phase-18-capture-v2` | Done |
| 19 | Paid ads management (flagged, off) | `phase-19-paid-ads` | Done (switched off) |

Why this order: Phases 10–13 add `entry_path`, voice and policy, captures, contacts, consents and leads. Stripe (6) is independent of them, but Resend inbound, Ayrshare and PostHog (7), the morning brief (8, which needs commitments from 12) and the new skills (9) all read those tables, so they come after. Phase 14 needs 7 (inbound email) and 11 (policy); 17 needs 8 (scheduler).

### Local environment

- `npx supabase start` runs the whole local stack in Docker (Postgres, Auth, REST, Realtime, Storage, Edge Functions). The local DB port is 54332 and the mail port 54334 (moved from the defaults; see DECISIONS.md D2). API: `http://127.0.0.1:54321`.
- `npx supabase test db` runs the pgTAP tests against it; `scripts/db/test-local.sh` still runs them on plain Postgres 16.

### Checks (run before merging each phase)

| Check | Command |
|---|---|
| Types | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Unit tests | `npm test` |
| Build | `npm run build` |
| Database (pgTAP) | `npx supabase test db` (or `scripts/db/test-local.sh`) |
| Integration (API + RLS + Edge Functions) | `npm run test:integration` (local stack running and reset; `npx supabase functions serve` running) |
| Live end to end | `npm run e2e:live` (set `CHROMIUM_PATH` if Playwright's browser isn't installed) |
| Agent service | `cd agent-service && npx tsc --noEmit && npm test` (after `npx supabase db reset`) |
| Everything above, after a reset | `scripts/dev/check-all.sh` |
| HQ fit | `npm run check:fit` |

### Phase 1 (finished 26 Oct 2026)

- **Restyle:** step 5 finished with the Telemetry page (`src/components/mission/Telemetry.tsx`, maths in `src/lib/telemetry.ts`): 14/30/90-day trends as small multiples with hover and keyboard reading, the funnel (activation marked as sample data), and cost per signup by channel in three columns. Every screen now uses the Mission HQ tokens.
- **1b schema:** `20261026100000_mission_timeline.sql` adds `companies.started_at` and `activation_definition`, `stage_gates.target_date` (four gates, none on Grow), `tasks.actor/key/stage`, `compliance_items.statutory`, `user_preferences.theme` and `metrics_daily.activated`. The seed has StudyBuddy's key tasks, run r9 and approval a7.
- **1c data layer:** `src/integrations/supabase/` (client and generated types, `npm run db:types`). The store is now one API with two providers (DECISIONS D5): demo (in memory) and live (Supabase, Realtime refresh). Magic-link sign-in, an auth gate on app routes, and onboarding for people with no company. Seed-only screens now read from the store.
- **1d writes:** `20261026100100_app_rpcs.sql`: `create_company`, `join_cohort`, `accept_invites`, `decide_approval`, `edit_approval`, `ask_why`, `request_ad_budget`, `draft_outreach`, `approve_gate`, `complete_task`, `enqueue_job`, `post_chat_message`, `check_claims`. 71 new pgTAP checks (`06_app_rpcs.test.sql`).
- **1e bugs:** B1 (toasts follow real outcomes), B2 (flagged drafts can be edited), B3 (decisions store ids), B4 (claims checked against the approval's company), B5 (gate approval advances the stage), B6 (onboarding keeps every answer), B7 (StudyBuddy content no longer leaks), B11 (investors move without drag) are fixed. B8 (seed run r8 shows as running forever) is left for the Phase 3 stale-run reaper.
- **Mocked in Phase 1:** Sol's chat replies and all agent work (live mode queues `agent_jobs`; nothing processes them until Phase 3). Approving in live mode records the decision only (D13).
- **Known issues:** mentors and viewers still see founder-only buttons; the server refuses those actions with a clear message. Team invites send no email (Phase 7).

### Phase 2 (finished 26 Oct 2026)

- `20261026110000_credits_engine.sql`: lots in the insert-only ledger (DECISIONS D15–D19). Service-role RPCs `grant_credits` (idempotent on a key such as the Stripe event id), `reserve_credits` (draws a cohort company's shortfall from its pool, capped), `settle_run` (charges actual cost capped at the hold, releases the rest, refuses a second settle), `release_hold`, `refund_run` (exact, once) and `expire_credits` (plan monthly, top-ups after 12 months). `credit_summary` for the app, `credits_for_usd` / `usd_for_credits` from `credit_config`. The balance view shows plan, cohort and top-up balances.
- Billing shows the breakdown, holds and the next expiry (`useCreditSummary`; the demo approximates it).
- Tests: 65 pgTAP checks in `07_credits_engine.test.sql` (insufficient balance, double settle, refund, expiry, cohort caps and pool size, consumption order, idempotent grants, permissions) and `src/test/integration/credits.test.ts`.
- **Not yet wired:** nothing calls reserve/settle until the agent service (Phase 3); `expire_credits` runs once the scheduler exists (Phase 8); grants come from Stripe in Phase 6.

### Phase 3 (finished 26 Oct 2026)

- `agent-service/` (see its README): claims jobs with `claim_agent_job` (`FOR UPDATE SKIP LOCKED`), builds a per-company workspace (CLAUDE.md generated from the database plus skills), estimates, reserves, runs with `maxBudgetUsd` from the reservation, records every tool call in `agent_runs.steps` (`append_run_step`), settles, and refunds platform failures. Two attempts, then Sol explains in chat. A reaper recovers runs a crashed worker left behind (this fixes bug B8 once the worker runs).
- Tools: read tools plus `propose_post`, `propose_email`, `propose_ad_change`, `propose_site_change` (pending approvals only) and `propose_document_update`. The gate denies anything a job doesn't list, and shell, writes and web always.
- Skills: `social-post` (from the prototype, now proposing instead of publishing) and `claims-check`.
- Config: model per tier in env (Haiku routine, Sonnet planning, Opus strategy); cost constants from `credit_config`.
- `npm run run-once` runs one StudyBuddy job end to end.
- **Mocked:** the model (mock runtime by default, DECISIONS D20, HANDOFF 1) and media generation (a placeholder image).
- Tests: 9 in `agent-service/test` (pipeline, chat, retry/refund/escalate, insufficient credits, claim exclusivity, reaper) and 11 pgTAP checks in `08_agent_worker.test.sql`.

### Phase 4 (finished 26 Oct 2026)

- `src/lib/agentClient.ts` is real in live mode with the same signatures: `sendChatMessage` streams from the `chat` Edge Function (optional `onDelta`), `runTask` and the new `enqueueJob` call the `enqueue-job` Edge Function. Demo mode keeps the canned behaviour.
- `job_types` holds every job's estimate and cap (D26); the app shows them before running (`useEstimate`), `enqueue_job` and the agent service use them. `model_prices` prices token usage for chat.
- Chat (D27): reserve → stream → settle → refund on failure, one run per turn. The reply streams into the chat as it's written (`chatDraft`).
- Run progress arrives through Realtime (runs, jobs and steps); LOG shows each run's steps as they're recorded.
- Tests: `src/test/edgeLogic.test.ts` (tier routing, pricing, reservation, SSE parsing), `src/test/integration/edge-functions.test.ts`, and the live browser test now sends a chat message.
- **Mocked:** chat replies until `ANTHROPIC_API_KEY` is set on the functions (HANDOFF 2).

### Phase 5 (finished 26 Oct 2026)

- `20261026140000_approvals_executor.sql`: approvals gain `execution_status` (queued → executing → done / blocked / failed), result, error, attempts, the run that charged them and a NO-GO note. `decide_approval` queues approved actions; `claim_approval_execution` and `settle_run_credits` serve the executor.
- `agent-service/src/executor/`: providers behind one interface (social, email, ads, site, documents; mock now, Phase 7 adds real ones), the rules (D30) and the executor (D29), run by the worker before agent jobs.
- Approval cards show what happened after GO. Sol's memory includes NO-GO notes (D32).
- Tests: 8 rule tests and 7 executor tests in `agent-service/test`, and `09_executor.test.sql`.
- **Mocked:** every provider (nothing leaves the building) until Phase 7.

### Phase 10 (finished 27 Oct 2026)

- `20261026150000_entry_path_enums.sql` and `20261026150100_entry_paths.sql`: `entry_path`, imported gates, socials and Google Business on companies, `contacts.source`, `voice_sources`, `create_company` with the path, `import_contacts` (D33).
- Onboarding asks Start up or Keep going; Keep going imports website, socials, contacts CSV and past emails, and shows Sol's first read of the voice.
- HQ cards depend on path and stage (D34): new Evidence, Leads, Inbox and Response times cards. The stage bar marks imported gates. Customers department added (D35).
- Seed: Harbour Bakes (Rory MacKay, `rory.mackay@example.com`), trading at Grow with contacts, an inbox and posts; also in the demo.
- Tests: `10_entry_paths.test.sql`, voice sources added to the read-access matrix as founder/teammate-only, `src/test/voice.test.ts`, `src/test/stageAware.test.ts`, and the live browser test checks the Keep going HQ.
- **Mocked:** the voice read is rule-based (Phase 11 adds the skill). Website and Google Business aren't fetched; only the link is stored.

### Phase 11 (finished 27 Oct 2026)

- `20261027100000_voice_enums.sql` and `20261027100100_voice_and_policy.sql`: versioned `voice_profiles` (one approved per company), `voice_examples`, `voice_edit_events` (founder/teammate only), `response_policies` (one mode per category; refunds and legal threats locked to escalate by a check constraint) and `response_settings` (AI disclosure, policy reviewed). Every company is seeded with the default voice, draft-only policy and the disclosure (D36).
- RPCs: `set_response_policy`, `update_response_settings`, `save_voice_profile` (founders); `propose_voice_profile` and `adopt_voice_profile` (service role). Edits to Sol's drafts are recorded as voice edit events.
- Skills `voice-analysis` (proposes a profile from voice sources) and `voice-update` (weekly proposal from edit events). Both propose an `update_voice` approval; the voice only changes on GO (D38). The agent's memory uses the approved profile and the founder's example replies.
- Executor (D37): always-escalate categories and triage flags are enforced in code; auto-send only for categories set to auto-send, after the voice is approved and the policy reviewed; Sol-sent replies carry the disclosure.
- App: Customers → Voice & policy (`?tab=voice`): readiness checklist, current voice and pending proposal, "Learn my voice", founder edit, example replies, the policy table (locked rows shown with a padlock), disclosure and "I've reviewed this policy". Works in the demo too (learns from the company's sent emails).
- Tests: `11_voice_policy.test.sql`, `agent-service/test/voice.test.ts` and memory tests, `src/test/voicePolicy.test.ts`, and the live browser test checks the policy screen.
- **Mocked:** the voice analysis runs in the mock runtime (rule-based) until real agent runs are turned on (HANDOFF 1). The weekly voice update is runnable as a job; the schedule comes with Phase 8.

### Phase 12 (finished 27 Oct 2026)

- `20261027110000_capture_enums.sql` and `20261027110100_capture.sql`: `captures`, `transcripts`, `extracted_items`, `ideas`, `commitments`, `feedback`, `memory_facts`, `capture_settings`; tasks gain `assignee_id` and `source_item_id`; a private `captures` storage bucket. Raw captures, transcripts and everything derived from them are founder/teammate only; mentors see just the accepted actions and decisions a founder shares (D43).
- RPCs: `create_capture` (consent and credits checked, queues `capture_process`), `capture_estimate`, `decide_extracted_item`, `accept_all_items`, `share_extracted_item`, `update_capture_settings`, `set_idea_status`, `complete_commitment`; service role `save_transcript` and `save_extraction`. Routing (D40): Sol actions → Sol task plus queued job; people's actions → their task; promises → `commitments` plus a `commitment_followup` job; ideas → idea inbox (a hypothesis with an evidence plan for Start up companies); feedback → `feedback`; facts → an `update_memory` approval; claims → the claims check; every step in the activity log with the timestamp.
- Agent service: `capture_process` transcribes uploaded audio inside the run (charged and refunded with it, D42), deletes the audio by default, then the `capture-extract` skill proposes items; matching to tasks and contacts is checked in the tool (D41). `commitment_followup` drafts the promised email for approval. Approved facts join the company memory. Transcription provider behind an interface: mock by default, Speechmatics EU behind `TRANSCRIPTION_PROVIDER` (HANDOFF 3).
- App: hold-to-talk mic on the Ask Sol bar (a voice note, D44), Debrief page (mobile-first, up to two follow-up questions; a Debrief button on the phone HQ), Meetings (list, review cards, transcript on demand, add a transcript or recording with consent and the cost shown, ideas, promises, recording and auto-accept settings), "From your meeting" cards in GO / NO-GO and in its count. The demo reads typed text with the same rules (`src/lib/demoCapture.ts`).
- Tests: `12_capture.test.sql` and the new tables in the read-access matrix; `agent-service/test/capture.test.ts` (debrief, recording with transcription and deletion, follow-up draft, memory facts); `src/test/capture.test.ts` and `demoCapture.test.ts`; the live browser test adds a transcript and accepts from the review card.
- **Mocked:** transcription (HANDOFF 3) and the extraction model (rule-based `src/lib/capture.ts` in the mock runtime, HANDOFF 1). "Commitments due today" is ready (`commitmentsDue`) for the morning brief, which Phase 8 builds.

### Phase 13 (finished 27 Oct 2026)

- `20261028100000_link_layer.sql`: `hub_pages` (one per company, unpublished until a founder publishes), `forms`, `tracked_links`, `link_clicks` (time, country, device class, referring site; no IP or cookie), `consents` (a history: updates are refused, the latest row is current, erasing a contact removes it), `current_consents` and `link_stats` views, and `leads` with attribution. Every company gets a hub page and a form.
- Public RPCs (D47): `follow_link`, `get_hub`, `get_form`, `submit_lead` (validation, a hidden bot trap, light rate limits, the contact, a service consent on legitimate interests, the marketing opt-in only if ticked with its exact wording, the lead attributed to the link, and the message in the Customers inbox). Signed-in: `create_tracked_link`, `update_tracked_link`, `save_hub_page` and `save_form` (founders), `set_lead_status` (won makes a customer), `record_consent` (the team can record an opt-out, never an opt-in), `attribution`.
- `supabase/functions/link`: the public short-link redirect (D45); device and country parsing in `_shared/logic.ts`.
- App: Grow → Links & forms (what's working, tracked links with copy and QR PNG/SVG, hub page editor and publish, form wording, privacy link and embed code); public `/h/<slug>`, `/f/<id>` and `/l/<code>`; cookie banner on public pages (D48); Customers → Leads and a Marketing column on contacts; the Keep going HQ "Campaigns" card is now clicks → leads → customers.
- Tests: `13_link_layer.test.sql`, the new tables in the read-access matrix (consents and leads founder/teammate only), the anonymous-function allowlist, `src/test/links.test.ts`, edge logic tests, an integration test for the redirect, and the live browser test follows a short link to the hub page and sends the form.
- **Mocked / owner steps:** a branded short domain and per-company subdomains (HANDOFF 4). Campaign objects come in Phase 15; links carry the campaign's name until then.

### Phase 6 (finished 27 Oct 2026)

- `20261028110000_billing.sql`: `billing_products` (the price list, with Stripe price ids to fill in), `stripe_customers`, `subscriptions`, `stripe_events`; service-role `apply_billing_event` (records each event once and applies its actions in one transaction: grant credits with their own idempotency key, track the subscription, remember the customer) and `fail_billing_event`.
- Edge Functions: `billing-checkout` (founders only; subscription or one-off Checkout Session tagged with the company; mock mode applies the purchase straight away), `billing-portal`, `stripe-webhook` (signature checked with WebCrypto, public). Stripe is called with `fetch`; event handling is pure (`_shared/billing.ts`, D51). Live keys and live events are refused (D50).
- Plans: each paid invoice grants the plan's credits into the plan bucket, expiring at the end of that billing period, and sets the company's plan; top-ups and the Launch Pack go into the top-up bucket (12 months).
- App: Billing buttons open Checkout and the Portal when `VITE_BILLING_ENABLED=true` (otherwise "coming soon"), with the subscription's renewal date and a message on return.
- `scripts/dev/replay-stripe-webhooks.mjs` replays signed test events, each twice, and checks the second is a duplicate.
- Tests: `14_billing.test.sql`, Stripe tables in the read-access matrix (customer ids and raw events service-role only), `src/test/billing.test.ts` (signatures, event mapping, checkout parameters, key checks), a price-list parity test, and `src/test/integration/billing.test.ts` (mock checkout, founder-only, idempotent invoice, forged signature).
- **Mocked / owner steps:** Stripe itself (HANDOFF 5). The monthly reconciliation of SDK cost against the Anthropic invoice is Phase 9.

### Phase 7 (finished 27 Oct 2026)

- `20261028120000_integrations.sql`: `integration_settings` (a founder's switch per provider, off by default; founders and teammates read), `integration_secrets` (per-company provider secrets, service role only), `platform_integrations` (what the platform has keys for, reported by the worker); `social_posts` gain provider, external id and sync time; `email_messages` a provider message id. RPCs: `set_integration` (founders), service-role `receive_inbound_email` (threads replies, records the sender, idempotent) and `unsubscribe_contact`.
- Agent service (`src/integrations/`): Resend (sends from `<slug>@<sending domain>`, replies to the founder, idempotency key per approval), Ayrshare (publishes to the company's profile; hourly analytics into `social_posts.metrics`), PostHog (six-hourly visitors and signups into `metrics_daily`). `providersFor` picks real or mock per company (D54); the executor uses it.
- Marketing email (D55): one email per recipient with a signed unsubscribe link and `List-Unsubscribe` headers; anyone who opted out is skipped; real marketing email is refused without `UNSUBSCRIBE_SECRET`.
- Edge Functions: `resend-inbound` (Svix signature, company from the inbound address) and `unsubscribe` (signed link, GET or one-click POST).
- App: Settings → Integrations (switches with platform status, "send as" and reply-to); hub pages send PostHog page views and form signups only after the visitor allows analytics (D56).
- Tests: `15_integrations.test.sql`, the new tables in the read-access matrix, `agent-service/test/integrations.test.ts` (adapters with a fake fetch, per-company selection, analytics sync, unsubscribe links and opt-outs), `src/test/webhooks.test.ts`, and `src/test/integration/integrations.test.ts` (inbound email and unsubscribe through the functions).
- **Mocked / owner steps:** every provider until its keys are set (HANDOFF 6). Inbound email lands in the inbox; triage and drafted replies are Phase 14.

### Phase 8 (finished 27 Oct 2026)

- `20261029100000_scheduler.sql`: routines gain the job they run, a UK run time and last run; `company_automation` (nightly loop with a credit cap, weekly voice review; both off), `schedule_runs` (one firing per kind, company, item and period), `briefs`, `auto_sessions`; job types `routine`, `morning_brief`, `nightly`, `investor_update`. RPCs: `update_automation`, `start_auto_mode` (1 to 8 hours, an affordable cap, one at a time), `stop_auto_mode`, service-role `claim_schedule`.
- Agent service `src/scheduler.ts`, run by the worker every minute (D57, D58): enabled routines when due in UK time (the 07:00 morning brief is a routine); the nightly loop from 02:00 on the highest-leverage Sol task for the stage, within the company's cap (D60); the Monday voice review when there are at least three edits to learn from; daily credit expiry on the database's clock; and Auto Mode, one capped step at a time until the time or the cap runs out, then a summary in chat (D59). Jobs carrying `max_credits` reserve no more than that.
- Morning brief: `get_brief_facts` (approvals waiting, last night's work, yesterday's meetings and actions, promises due today, customers waiting, new leads, balance) and `save_brief` (stored and sent in chat); the `morning-brief` skill; the brief shows at the top of HQ until dismissed.
- App: Auto Mode starts a real capped session in live mode, with the spend and end time in the header and a stop button; routines show their next and last run; "While you sleep" settings for the nightly loop and voice review.
- Batch API: not used (D61).
- Tests: `16_scheduler.test.sql`, the new tables in the read-access matrix, `agent-service/test/scheduler.test.ts` (routine fires once from 07:00 and the brief arrives, the nightly loop within its cap, voice review skipped without edits, Auto Mode steps to the cap and the end), and `src/test/schedule.test.ts` (UK time across BST, cadences, next run, the task picker, the brief text).

### Phase 9 (finished 27 Oct 2026)

- Skills: `morning-brief` (Phase 8), `compliance-calendar` (adds the usual UK Companies House, HMRC, ICO and PECR deadlines from when the company started, flags overdue items; "Check my deadlines" in Stay legal), `investor-update` (a monthly update from the company's own numbers, saved as a draft document; "Draft investor update" in Raise), `evidence-plan` (an idea becomes three assumptions with tests and pass marks, plus a smoke test, on the evidence board; from the Evidence board and from ideas in Meetings). Their plain versions are in `src/lib/skills.ts`.
- `20261029110000_hardening.sql`: `error_events` (admins read), `anthropic_usage` and `cost_reconciliation`, `rate_limit_hits` with `private.limit_inserts` triggers, `report_client_error`, job types `compliance_review` and `evidence_plan`.
- Error monitoring (D63): the worker, runner, executor, scheduler, Edge Functions and the app (uncaught errors, a few per visit) record to `error_events`; admins see them with the 30-day cost check in Settings → Platform health.
- Cost reconciliation (D64): `npm run reconcile` and a monthly import of Anthropic's usage report (HANDOFF 7).
- Rate limits in the database (D65).
- RLS review and Edge Function security pass: `docs/SECURITY-REVIEW.md`; body-size limits, provider timeouts, escaped HTML with a strict CSP, and plain error messages with details sent to monitoring.
- Tests: `17_hardening.test.sql` (pinned direct-write allowlist, policies for every grant, rate limits, error reports, reconciliation), the read matrix (errors admin-only), `agent-service/test/skills.test.ts`, `src/test/skills.test.ts`.

### Phase 14 (finished 27 Oct 2026)

- `20261030100000_inbox.sql`: `inbox_items` (made by a trigger for every received message: inbound email, lead forms, the hub page), the daily inbox budget on `response_settings` (0, off, by default), job types `inbox_triage` and `inbox_draft`, `process_inbox_item` (do it now), `close_inbox_item`, a NO-GO on Sol's reply closing the item, and `import_contacts_checked`. Inbound email now records the sender before the message so items link to contacts. `20261030100100_claims_signoffs.sql`: sign-offs like "Best wishes" are no longer flagged as claims (both checkers).
- Pipeline (D66): the scheduler queues triage for new items within the day's budget (oldest first; past it they wait for tomorrow and the founder is told once). Triage runs on the small model (`inbox-triage` skill) and `save_triage` applies the hard rules and the policy (`src/lib/inbox.ts` `decideMode`); escalations go to the founder in chat with the reason and no draft. Drafts run on the mid-tier model (`inbox-reply` skill) in the company's voice; `propose_reply` claims-checks and either queues an automatic send (the executor re-checks `checkAutoSend`) or waits for a GO. An automatic reply the executor won't send becomes an ordinary pending draft with the reason (D67). Sent replies close the item and carry the disclosure.
- Consent-checked import (D68): a consent column with evidence records an opt-in; "soft" records a soft opt-in only for customers and only if the founder ticks that the conditions apply; everything else is service only and raises a Stay legal task. Onboarding uses the same import.
- App: Customers → Inbox lists items with status, triage, flags and the policy's reason, with "Let Sol handle it", review, close and spam; contacts open a timeline (messages, leads, promises, meetings) with their marketing permission; the daily inbox budget in Voice & policy. The demo runs the same rules.
- Tests: `18_inbox.test.sql`, inbox items in the read matrix, `agent-service/test/inbox.test.ts` (auto-sent booking reply with disclosure, refund escalated without a draft, auto-send held when the voice isn't approved, the daily budget and its single notice), `src/test/inbox.test.ts`, `src/test/demoInbox.test.ts`, and the claims parity fixtures for sign-offs.

### Phase 15 (finished 27 Oct 2026)

- `20261030110000_campaign_enums.sql` (the `approve_campaign` action) and `20261030110100_campaigns.sql`: `campaigns` (goal, metric and target, audience, channels, credit budget, optional ad spend the founder makes themselves, dates, Sol's plan), `campaign_assets`, a campaign link on `tracked_links`, job types `campaign_plan` and `campaign_assets`, a NO-GO declining the plan or the asset, `cancel_campaign` (declines anything pending), and the `campaign_results` view (clicks, leads, customers through the campaign's links).
- Flow: Sol proposes a plan (`campaign-plan` skill, `propose_campaign`) → a founder's GO (D72) → the executor queues the drafting with the campaign's credit budget as its cap → `campaign-assets` drafts each post and email with a tracked link per channel; each passes the claims check plus the CAP Code checks (`src/lib/campaigns.ts`, D69) and waits for its own GO like any post or email. Campaign email goes only to contacts with recorded marketing permission (D70). Ads are drafted and exported for the founder to launch (D71).
- App: Grow → Campaigns (plan from a goal, progress against the target, assets with status, copy ad copy, cancel); the HQ Campaigns card shows the active campaign's progress. The demo runs the same flow (`src/lib/demoCampaigns.ts`).
- Tests: `19_campaigns.test.sql` and the read matrix, `agent-service/test/campaigns.test.ts` (plan → GO → assets with tracked links → GO per asset → scheduled, with results; founder-only plan approval), `src/test/campaigns.test.ts`, `src/test/demoCampaigns.test.ts`.
- **Mocked / owner steps:** publishing and sending go through the Phase 7 providers (mocked until keys are set, HANDOFF 6). Direct ad control is Phase 19 (off).

### Phase 16 (finished 27 Oct 2026)

- `20261031100000_listening_enums.sql` (the `reply_public` action) and `20261031100100_listening.sql`: conversations gain a channel (email, form, hub, social, review), platform, external id and rating, so comments and reviews flow through the Phase 14 inbox pipeline; `receive_listening_item` (service role, idempotent on the provider's id; comments and reviews only, no mentions); `listening_settings` (everything off by default, founder-only `update_listening_settings`); public replies in the claims check and editable like any draft; `feedback_requests` (unguessable token, never readable by the app) with `request_feedback`, the scheduler's `queue_due_feedback`, and the public `get_feedback_request` / `submit_feedback`; the Phase 12 `feedback` table now takes ratings.
- Agent: an Ayrshare listening client (comments on our own posts, Google reviews) and replies, mocked without keys (HANDOFF 8); `syncListening` hourly in the worker; `get_inbox_item` says when a reply is public and gives the stars; `propose_reply` proposes a `reply_public` that always waits for a GO (D75); the executor posts it and records it in the conversation. The scheduler drafts feedback requests at 10:00 for customers won or bookings answered a few days ago (D73). The morning brief gains "what customers said this week" with its top themes.
- App: Grow → Listening (sentiment by week, top themes, comments and reviews, what Sol listens to); Customers → Feedback (answers with stars, feedback-request settings and history); "Ask for feedback" on a contact's timeline; the public `/fb/<token>` page. Themes and the trend are computed in `src/lib/listening.ts` (D74). The demo has Harbour Bakes' reviews, comments and feedback, and runs the same rules.
- Tests: `20_listening.test.sql` (service-only intake and dedupe, settings, reply edits, consent and frequency rules for requests, one answer per link, the daily pass), the read matrix and anonymous-function list, `agent-service/test/listening.test.ts` (parsers; sync → inbox once → triage by stars → public reply blocked without a GO → posted), `src/test/listening.test.ts`, `src/test/demoListening.test.ts`.
- **Mocked / owner steps:** Ayrshare comments and reviews (plan and endpoints to confirm, HANDOFF 8). Facebook and Instagram DMs and mentions aren't read.

### Phase 17 (finished 27 Oct 2026)

- `20261101100000_bots.sql`: `bot_templates` with the six from SPEC L (lead follow-up, review request, invoice and payment reminders, new-customer onboarding, lapsed-customer win-back, weekly performance summary); `bots` (one per template per company, copied from the template, off by default, with trigger, conditions, steps, approval level and weekly credit cap); `bot_runs` (one row per contact and step, unique, so nothing happens twice and every step is audited); founder-only `create_bot`, `update_bot` (wording and timing only, not what a step does; approving wording runs the claims check; new wording needs approving again; switching off skips what was planned) and `delete_bot`; `bot_feedback_request` for the service role.
- Engine (`agent-service/src/bots.ts`, every minute on the scheduler, no model calls): enrols contacts when a trigger happens after the bot was switched on (new lead, lead won, new customer, booking answered, lapsed for 90 days, or Mondays at 09:00), then carries out due steps: emails become approvals (D77), tasks go to the founder, review requests follow the Phase 16 rules, the weekly summary is posted in chat. Sequences stop when the person replies or becomes a customer; marketing steps need recorded permission; the weekly cap counts what each bot has spent (D78).
- App: Run → Bots (add from templates, switch on and off, "Ask me before every email" or "Send with the wording I approve now", weekly cap, edit steps, recent steps and reasons, remove). The demo sets bots up with the same rules; they run on the live service.
- Tests: `21_bots.test.sql` and the read matrix, `agent-service/test/bots.test.ts` (enrol once, first email for a GO, stop on reply, no marketing without permission, approved wording sends within the cap, weekly summary once a week), `src/test/bots.test.ts`, `src/test/demoBots.test.ts` (including the templates matching the migration).
- **Mocked / owner steps:** invoice and payment reminders need the company's own Stripe account (HANDOFF 9); the template shows but can't be switched on (D80).

### Phase 18 (finished 27 Oct 2026)

Everything here is behind switches that are off by default (`VITE_NOTETAKER_ENABLED`, `VITE_CALLS_ENABLED` in the app; `NOTETAKER_ENABLED` on the agent service and the `calendar-connect` function; `CALLS_ENABLED` on the `call-webhook` function) and runs on mocks until the platform sets up the providers (HANDOFF 10 and 11).

- `20261102100000_capture_v2.sql`: captures gain the `notetaker` and `call` sources with their consent records (`bot_announced`, `call_notice`) and a provider recording URL; contacts gain a phone number; provider minutes are priced in USD in `credit_config` (notetaker $0.0083, calls $0.012 a minute) and converted to credits like everything else (D82); a daily recorded-minutes cap in capture settings (default 120). Calendars: `calendar_connections`, `calendar_tokens` (service role only), `calendar_events` (off for every meeting), `notetaker_series`; `set_meeting_recording` (the calendar's owner or a founder; per meeting or per series; video calls only), `connect_mock_calendar`, `disconnect_calendar`. Calls: `phone_numbers` (demo numbers in Ofcom's drama range), `call_sessions`; `update_phone_settings` (the notice must say the call is recorded), `update_minutes_cap`; service-role `call_routing`, `record_call` (finds or adds the caller as a contact; a recording heard after the notice becomes a capture) and `create_notetaker_capture`.
- Notetaker (`agent-service/src/capture/notetaker.ts`): reads connected calendars every 15 minutes, sends a bot to opted-in meetings starting within the hour (skipped, with a message, if it would go over today's minutes), cancels bots for meetings opted out, and turns each finished recording into a capture for the Phase 12 pipeline. The bot joins as "Sol (notetaker for {company})" and posts that it's recording (D81). Providers: mock calendar and bot by default; Google Calendar and Microsoft 365 (read-only, OAuth through the `calendar-connect` function with a signed state) and Recall.ai's Meeting Bot API (EU region by default).
- Calls (`call-webhook` function, `_shared/telephony.ts`): Twilio signature checked; the caller hears the notice before anything is recorded, then is put through to the founder's phone or can leave a message; with today's minutes used up the call is connected without recording or notice (D83). Recordings are fetched from Twilio by the agent service, transcribed, then deleted at Twilio unless the company keeps audio (D84). `scripts/dev/replay-call.mjs` replays a signed call locally.
- App: Meetings → Notetaker (connect Google, Microsoft or a demo calendar; per-meeting switch and "Every time" for a series; bot status; daily minutes); Customers → Calls (the number, where it rings, the notice as callers hear it, recent calls with links to their notes). The demo runs the same rules.
- Tests: `22_capture_v2.test.sql` and the read matrix, `agent-service/test/notetaker.test.ts` (sync, opt-in, bot sent and collected, minutes cost charged, daily cap skip, series opt-in, Recall.ai transcript), `agent-service/test/calls.test.ts`, `src/test/telephony.test.ts`, `src/test/calendar.test.ts`, `src/test/demoCapture2.test.ts`, and an integration check that both functions stay off by default. The webhook was also run end to end locally with calls switched on.
- **Mocked / owner steps:** Recall.ai, Google and Microsoft OAuth apps (HANDOFF 10); Twilio account and a UK number (HANDOFF 11). Outbound calls aren't built.

### Phase 19 (finished 27 Oct 2026, switched off)

PHASES says not to start direct ad management until earlier phases are live with real customers and the platforms' approval requirements are confirmed. This run built only the switched-off foundation, on a mock provider, so it's ready when that happens (D86). Nothing here can spend money: the app hides it (`VITE_ADS_ENABLED`), and the executor refuses to launch unless the platform sets `ADS_ENABLED=1`.

- `20261103100000_paid_ads_enums.sql` (the `launch_ad` action) and `20261103100100_paid_ads.sql`: a monthly cap on the ad account (default £300); `ad_campaigns` (launched from a campaign's exported ad copy, with its tracked link) and `ad_spend_daily`; founder-only `propose_ad_launch` (within the daily hard cap, one launch per ad, waits for a GO), `pause_ad` (immediate: pausing only reduces spend) and `update_ads_monthly_cap`; a NO-GO declines the ad; the service role's `record_ad_spend` updates the ad's totals and its tracked link's spend (so cost per lead appears in attribution) and pauses every ad, telling the founder, when the month's spend reaches the cap (D87).
- Agent: the ads provider gains launch, pause and spend (mock: nothing is spent; it reports 80% of the budget a day); the executor's `launch_ad` (founder-only, within the hard cap and the platform's £100 a day limit, and only with `ADS_ENABLED=1`); `syncAds` hourly when switched on, pushing pauses to the platform.
- App: "Launch for a GO" on a campaign's ad copy and Grow → Ads → Paid ads (spend, clicks, pause, monthly cap), both behind `VITE_ADS_ENABLED`. The demo follows the same rules.
- Tests: `23_paid_ads.test.sql` and the read matrix, `agent-service/test/ads.test.ts` (blocked while off; launched with a GO; spend into the link; paused at the monthly cap; founder-only within caps), `src/test/demoAds.test.ts`.
- **Mocked / owner steps:** the Meta Marketing API and Google Ads API adapters, which need platform approval (HANDOFF 12).

## Phase 0 audit and Phase 1 history (historical)

Phase 0 audit, 22 Oct 2026, at commit `aad3f26`. Updated 23 Oct 2026 during Phase 1 group 1a-design. **This is a snapshot from before the build.** Everything it lists as in progress, missing, mocked or broken was done in the phases above (the bugs in Phase 1e and Phase 3; see "Phase 1" above), except what the final summary at the top lists as mocked or known issues.

## Phase 1 progress

| Group | Status |
|---|---|
| 1a. Repo hygiene | **Done.** npm only (`package-lock.json` committed; `bun.lock` and `bunfig.toml` removed). Product name in `src/lib/brand.ts` (`PRODUCT_NAME = "Gumption"`). Prettier run over `src/` and root configs in its own commit (`c3b4531`). Lint: 0 errors. |
| 1a-design. Mission HQ design | **In progress.** Runs between 1a and 1b, from `docs/DESIGN.md` and `docs/design/hq-reference.dc.html`. Steps 1 to 4 done (see below). Step 5 to do: every other screen, the new Flight plan and Telemetry pages, the nav moves and a light/dark setting. |
| 1b. Supabase schema, auth, RLS, seed | **In progress.** Migrations, RLS, pgTAP tests and seed are written and pass locally (see below). Still to do: apply them to the staging project, generate `src/integrations/supabase/types.ts`, and commit `.env`. Waiting on the project URL and anon key. |
| 1c. Data layer on Supabase | Not started |
| 1d. Server-side writes | Not started |
| 1e. Bug fixes | Not started |

### Design (group 1a-design)

- **Step 1, tokens and theme: done.** `src/styles.css` holds the DESIGN.md tokens on `:root` (light, default) and `.dark`, and the shadcn variables are aliases of them. DESIGN.md's `--muted` (secondary text) is `--muted-ink` in CSS, because shadcn already uses `--muted` for the soft background; in classes it is `text-muted-foreground`. Utilities: `label-caps` (Barlow, uppercase, tracked), `display-num` (Barlow Semi Condensed, tabular), `bg-hero`, `shadow-tile`, `shadow-card`, `shadow-hero`, and radii `rounded-pill`, `rounded-tile`, `rounded-card`, `rounded-hero`. Fonts are self-hosted from `@fontsource` (latin subset).
- **Colour rules:** green (`go`) = done or verified, amber (`hold`) = needs the founder, and one muted red only for errors and destructive confirmations. Everything else is monochrome. Declined, invalidated and passed statuses are now neutral; overdue and stalled are amber.
- **Renamed:** `components/dawn/` is now `components/mission/`. The `dawn-hq-layouts` storage key is now `gumption-hq-layouts` (the old key is read once, then removed). The `bg-dawn` gradient is gone.
- **Step 2, app shell: done.**
  - `AppShell.tsx`: 236px sidebar with the GUMPTION wordmark, mission switcher, HOME, FLIGHT PLAN, GO / NO-GO (amber count), TELEMETRY, LOG and DEPARTMENTS, a fuel box (balance, bar, TOP UP to Billing) and an account menu on the avatar (Team, Ownership, Settings, Billing, demo view-as, theme, sign out). Mentors get a COHORT group at the top. Below 700px it becomes a top bar with a sheet menu (breakpoints `tab:` 700px and `desk:` 1100px).
  - `MissionHeader.tsx`: greeting and mission, phase title, Sol's status line, the next-gate countdown, the gate's headline metric and AUTO MODE with its estimate. `AskSolBar.tsx` sends to Sol and opens the conversation in a side sheet. Auto Mode now lives in `AutoModeDialog.tsx`.
  - Sol's orange image is replaced by an SVG mark (the flight plan's "now" marker) with a status dot: green working, muted idle, amber waiting for you.
  - `src/lib/mission.ts` (tested): mission day, gate days and names, current gate and its metric, Sol's status, the UK greeting. The mock store now has `companies.started_at` and `stage_gates.target_date`. The demo clock is the seed's fixed `NOW` (21 Oct 2026), so StudyBuddy shows T+30 and the Launch gate in 12 days.
  - Overdue **statutory** compliance items (confirmation statement, accounts, tax, ICO fee) are red; other overdue items are amber (`src/lib/compliance.ts`, tested).
  - **Temporary until step 5:** `/flight-plan` and `/telemetry` are placeholders, and Evidence, Routines, Email, Media, Ads and Documents are not in the sidebar yet (still reachable by URL and from HQ widgets). The old Sol chat widget is still on HQ until step 4 rebuilds the grid.
- **Gates (after step 2 review):** one gate per stage transition, named like a launch call for the stage it opens: GO FOR EVIDENCE (day 8), GO FOR BUILD (18), GO FOR LAUNCH (42), GO FOR GROWTH (80). The mock store had a fifth gate on the Grow stage (day 120) with nothing after it; it's removed. Onboarding now creates the default gates for every new company (`defaultGates()` in `src/lib/mission.ts`).
- **Step 3, `FlightPlanArc`: done.** Maths in `src/lib/flightPlan.ts` (pure, tested): geometry, visibility and fade, tiers, no-overlap labels, pan limits, readout, screen-reader summary, parallax and the seeded star field. `src/components/mission/FlightPlanArc.tsx`: four parallax layers, Earlier / Now / Later, swipe or drag over 40px, eased moves, pointer parallax, fixed readout, `prefers-reduced-motion` (no parallax, instant pans), an `aria-label` summary, a visually hidden milestone list and focusable markers calling `onSelectMilestone`. Shown on `/flight-plan` for now, with a simple detail panel for the selected milestone; step 4 puts it on HQ.
  - **Milestones** come from `buildMilestones()`: mission start, the gates and key tasks. Tasks gained `key`, `stage` and `completed_at`; StudyBuddy has seven key tasks (interviews, product spec, waitlist page, daily quiz, Stripe, first paying customer, 50 paying). Seeded done tasks keep "done" only if they have a completion date (the rest are still shown as in progress, as before). Other companies show only their start and gates until they have key tasks.
  - **Narrow screens** (not covered by DESIGN.md): below 750px the arc keeps a readable scale and shows the middle of the arc in a taller box, with the look-ahead shrunk so now stays on screen.
- **Step 4, HQ: done.** `CompanyHQ.tsx` is now the mission header, Ask Sol, the flight plan card and the six-card grid (`HQCards.tsx`, data from `src/lib/hq.ts`, tested).
  - **Fit:** HQ doesn't scroll at 1440×900 or 1440×800 browser content areas, in light and dark. Check with `npm run check:fit` (`scripts/check-fit.mjs`; `playwright-core` pinned to 1.63.0, run `npx playwright-core install chromium` once or set `CHROMIUM_PATH`). Full layout needs 895px. On screens at least 1100px wide it compacts by height (`short:` and `shorter:` variants in `src/styles.css`):
    - under 900px tall (needs 848px): no Telemetry sparkline; the flight plan tiles collapse to one line ("2 done · 1 building · 1 awaiting GO") with Show / Hide tasks.
    - under 870px tall (needs 766px): two rows in Overnight burn, Next windows and Channels, one extra row in GO / NO-GO, no placeholder bars in Vehicle. (Grid rows take their tallest card, so Channels and GO / NO-GO must shrink too.)
  - **The arc on HQ** is capped at about 149px tall by cropping empty sky above the labels and below the readout, not by shrinking it (shrinking dropped the next milestone's label). Crop limits are measured in pixels, so labels aren't clipped at 1024px.
  - **Flight plan tiles:** the current phase's key tasks. Badges are worked out until `tasks.actor` exists: done with full proof = SOL · VERIFIED n/n, done otherwise = YOU · DONE, doing = SOL · BUILDING · ≈ N CR, todo = UP NEXT · ≈ N CR. HOLD · AWAITING GO shows when a pending approval's run belongs to the task: seeded run `r9` and approval `a7` (Stripe checkout) hold Connect Stripe, so StudyBuddy now has 4 approvals waiting.
  - **GO / NO-GO:** GO is disabled while claims are flagged or credits are short (so its toast is always true, unlike bug B1 on the Approvals page). WHY asks Sol and opens the conversation. **EDIT opens the Approvals queue** until draft editing exists (bug B2, group 1e).
  - **Removed from HQ:** the old widgets (Sol chat card, stage bar, live preview iframe, tasks, documents, email, media, ads, compliance, investors, credits) and the regulated-sector banner, replaced by a REGULATED · <SECTOR> pill by the phase title. Claims checks are still stricter for regulated sectors. Customise HQ now covers just the six cards; saved layouts from the old widget list fall back to the default.
  - **Channels** leaves out the waitlist (its signups are in Telemetry). **Next windows** shows open compliance items and dated tasks: amber within two weeks, red for overdue statutory items.
- **Agreed layout decisions** for steps 2 to 5: no third sidebar group. Evidence lives in Flight Plan (selected milestone plus an Evidence tab), Routines in LOG (Past and Scheduled tabs), Email and Documents in Run, Media and Ads in Grow, department pages show their relevant documents, and Team, Ownership, Settings and Billing go in an account menu on the avatar by the fuel box. Mentors get a COHORT group at the top. Old routes redirect. New `/flight-plan` and `/telemetry` pages. HQ keeps customisation for the six grid cards only.
- **Step 5 decisions (agreed 23 Oct 2026):**
  - Credit figures on mission screens read "≈ 40 CR"; only Billing and the ledger spell out "credits" (sentences and screen-reader labels also say credits).
  - Telemetry's cost per signup by channel has three columns: £ ad spend per signup, credits per signup, and all-in £ per signup = ad spend + credits valued at the founder's own plan price per credit (plan price ÷ plan credits, e.g. Founder £79 / 5,000 = 1.58p), labelled as all-in at their plan price.
  - "Activated" in the funnel is a mock figure labelled as sample data until each company defines activation.
  - Theme: Light (default), Dark and Match system.
  - The GO / NO-GO page's decline button says NO-GO; HQ keeps GO / EDIT / WHY.
- **For 1b:** add `tasks.actor` (sol / founder / mentor) and switch the flight plan task badges to it (until then they are derived from status and proof). Add a target or completed date for gates and key tasks (or a view giving each milestone's day from the company start) for `FlightPlanArc`, plus `companies.started_at`. Add `compliance_items.statutory`. Add a `theme` column to `user_preferences` ('light', 'dark', 'system'; default 'light'). Flight plan setup gets a "define activation" step (Sol proposes what counts as activated, the founder confirms) and a `metrics_daily.activated` column. Add run `r9` and approval `a7` (Connect Stripe) to `supabase/seed.sql`. Add `tasks.key`, `tasks.stage` and `tasks.completed_at`, and StudyBuddy's key tasks to `supabase/seed.sql`. `supabase/seed.sql` also creates a fifth gate on the Grow stage for every company: drop it (and update any pgTAP counts) so there are four gates, one per transition. Onboarding should create the company's stage gates (it doesn't today, so a new company's header shows no countdown).

### Database (group 1b)

- **Migrations** in `supabase/migrations/`: 34 tables covering every SPEC part A table, `agent_jobs`, and the part B workspace data (documents and versions, routines, media, email, ads, preferences, HQ layouts, sharing, site versions, grants, contacts, gate comments, team invites, cohort mentors).
- **Roles are per company** (`company_members.role`: founder, teammate, mentor, viewer), plus cohort mentors (`cohort_mentors`) and platform admins (`profiles.is_admin`). The rules are summarised at the top of `20261022150100_access_rules.sql`.
- **RLS on every table.** App users can only read agent output (jobs, runs, approvals, activity, chat), the ledger, posts, metrics, documents, media, email and ads. Founders and teammates edit evidence, tasks (not status or proof), compliance items, investors, grants, contacts and routines. Founders edit the company profile (not stage or plan), invite people and control public sharing. Anonymous visitors can only call `get_public_progress(slug)`.
- **Ledger:** insert-only for everyone (a trigger blocks update, delete and truncate even for the service role), inserted by the service role only. `company_credit_balance` shows `balance` and `held`.
- **Tests:** 694 pgTAP checks in `supabase/tests/database/`. Run them with `scripts/db/test-local.sh` (local Postgres 16 with pgTAP) or `supabase test db`.
- **Seed:** `supabase/seed.sql`, fictional, dates relative to when it runs. Demo accounts have no password.

Everything below the checks table describes the app as it still works today: the in-memory mock store. Items fixed since the audit are marked **Fixed**.

## Summary

- **What Lovable built is a clickable front-end demo, and nothing more.** Every screen in SPEC part A and most of part B exists and renders. All data lives in one in-memory React store (`src/lib/store.tsx`), seeded from `src/lib/seed.ts`, and resets on refresh. The only thing that persists is the HQ widget layout, in `localStorage`.
- **There is no backend.** There is no Supabase project for this app (the account has only `VirtualPMO` and `ArbEdge`), no `supabase/` folder, no migrations, no `src/integrations/supabase/` client, no auth, no RLS, no Edge Functions and no `agent-service/`. The tables exist only as TypeScript interfaces (`src/lib/types.ts`, `src/lib/workspace.ts`).
- **The agent is mocked.** `src/lib/agentClient.ts` returns canned replies after a delay. "Work" is simulated with `simulateWork()`, and fails only if the title contains "fail".
- **No secrets are in the frontend or the repo.** The code reads no environment variables, so there is no API key, service-role key or Stripe key anywhere. The only key-shaped text is the placeholder `sk-ant-...` in `docs/prototype/README.md`.
- **Authorisation is the biggest gap, not leaked secrets.** Without auth or RLS, any visitor can use a "view as" switcher to become any role, and nothing checks roles or membership.
- **Checks:**

  | Check | Result |
  |---|---|
  | `tsc --noEmit` | Passes |
  | `vite build` | Passes |
  | `vitest run` | Passes on a clean `npm ci`: 22 tests. (At the audit it failed because `@testing-library/dom` was missing.) |
  | `npm run lint` | 0 errors, 14 fast-refresh warnings. (At the audit: 851 errors, mostly Prettier.) |

Key: **done** works as the spec describes (against mock data) · **partial** exists but is incomplete or hard-coded · **mocked** looks right but nothing real happens behind it · **missing** is not there.

---

## SPEC part A: Foundation

### Screens

| # | Item | Status | Notes and files |
|---|---|---|---|
| A1 | Sign-in (magic link) | **mocked** | `src/routes/index.tsx`. The form just shows "Check your inbox" and a "Continue to demo" button. There is no auth or session, and Sign out is a link to `/`. |
| A1 | Onboarding wizard | **partial** | `src/routes/onboarding.tsx`. It asks for name, idea, target customer, B2B/B2C, stage, sector, 90-day goal, website and cohort code. **Stage, website and cohort code are collected and then thrown away**: every new company starts at `idea` on the Starter plan, and the cohort code joins nothing. |
| A2 | HQ: stage bar with gate progress | **done** | `StageBar.tsx` |
| A2 | HQ: live preview iframe (Live/Preview, desktop/mobile) | **done (stand-in site)** | `CompanyHQ.tsx` `SitePreview`. It frames `/site/$slug` (`src/routes/site.$slug.tsx`), a fake site whose feature cards ("10 minutes a day", "Learns your weak spots", "Built for SQA") are StudyBuddy copy shown for **every** company. |
| A2 | HQ: Sol chat | **mocked** | `SolChat.tsx`. Replies come from keyword matching in `agentClient.sendChatMessage`. 10 credits are charged before the reply and never refunded. |
| A2 | HQ: "Needs your approval" cards | **done** | `ApprovalCard.tsx`: Approve, Decline and Ask why (Ask why posts the stored `reason` into chat). |
| A2 | HQ: overnight activity | **done** | From `activity_events` |
| A2 | HQ: metrics strip | **partial** | `MetricsStrip` reads `metrics_daily` straight from `seed.ts`, not from the store, so new companies always show zeros. |
| A3 | Approvals queue (exact previews, credits, decisions recorded) | **done** | `src/routes/_app/approvals.tsx`. See bugs B1 to B3. |
| A4 | Activity and runs timeline | **done** | `src/routes/_app/activity.tsx`: expandable steps, model, tokens and cost, and an "Auto-refunded" pill on failed runs. |
| A5 | Build: site versions, changes awaiting approval | **partial** | `build.tsx`. Versions are made up from succeeded build runs plus a hard-coded "v0.8 Quiz engine" row that every company sees. |
| A5 | Grow: content calendar, results per post | **partial** | `grow.tsx`. It is a status kanban, not a calendar. Posts come from `seed.social_posts` (outside the store) merged with approvals. |
| A5 | Run: inbox summary, CRM, tasks | **partial** | `run.tsx`. The inbox summary is hard-coded StudyBuddy text shown for every company. The CRM is a read-only list from `seed.contacts`. |
| A5 | Stay legal: checklist and calendar | **partial** | `legal.tsx`. Read-only, from `seed.compliance_items`; only StudyBuddy has items, and nothing can be ticked off. |
| A5 | Raise: investor kanban, grants | **partial** | `raise.tsx`. Drag and drop works with a mouse only (HTML5 drag events don't fire on touch, and there is no keyboard alternative). The grants list is static and the same for every company. |
| A6 | Evidence board (assumptions, interviews, waitlist, pre-orders) | **partial** | `evidence.tsx`. Read-only: you can't add, edit or change the status of anything. |
| A7 | Billing: plans, balance, ledger | **done** | `billing.tsx` |
| A7 | Billing: top-ups, Launch Pack | **mocked** | The buttons show a "Payments are coming soon" toast. |
| A7 | Low-balance banner at 20% | **done** | `AppShell.tsx` and `credits.isLowBalance`, covered by tests. |
| A8 | Mentor cohort view (stage, health, last activity, credits vs cap, pending gates) | **partial** | `cohort.tsx`. Cohorts come from `seed`, not the store. Health is a guess based on days since the last event, measured from a fixed date (21 Oct 2026). |
| A8 | Read-only HQ with gate approval and comments | **partial** | `cohort.$companyId.tsx`. "Approve gate" marks the gate approved but **doesn't move the company to the next stage or unlock the next gate**. |

### Plans and products

| Item | Status | Notes |
|---|---|---|
| Starter, Founder and Growth prices and credits | **done** | `src/lib/credits.ts` `PLANS`, covered by tests |
| Top-ups £10, £25, £50 | **done (display)** | `TOP_UPS` |
| Launch Pack £49 / 10,000 | **done (display)** | `LAUNCH_PACK`. The ledger has no separate "build credits" bucket: they count towards the same balance. |
| Cohort licence (pooled credits, per-founder caps) | **partial** | `credit_pool` and `credit_cap` are displayed on the cohort page but **never enforced**. |

### Tables (spec) vs what exists

None of these exist in a database. "Type" means a TypeScript interface the mock store follows.

| Spec table | Status | Where |
|---|---|---|
| profiles | type only | `types.ts` `Profile`. Its `role` is global, not per company. |
| companies | type only | `Company`, plus `sector` and `channels` |
| company_members | type only | Roles are `founder`, `teammate`, `mentor` and `viewer` |
| cohorts, cohort_companies | type only | Read straight from `seed`, not the store |
| stage_gates | type only | `criteria` is an embedded array |
| evidence_items | type only | `data` is an untyped `Record` |
| tasks | type only | `ExtendedTask` adds `proof` |
| agent_runs | type only | `steps` and `usage` are embedded |
| approvals | type only | `payload` uses `any` (the lint errors) |
| activity_events | type only | |
| credit_ledger (insert-only) | type only | The store only ever appends to it, which matches the rule. |
| company_credit_balance view | function only | `credits.creditBalance()` is a plain sum. It doesn't separate held from available credits, plan from top-up credits, or handle expiry. |
| chat_messages | type only | |
| social_posts | type only | Seed-only, outside the store |
| compliance_items | type only | Seed-only, outside the store |
| investors | type only | |
| metrics_daily | type only | Seed-only, outside the store |

**Extra types not in the spec table list:** `contacts`, `gate_comments`, `routines`, `documents` (with an embedded `versions` array), `media`, `emails` (threads with embedded messages), `ads`, `layouts`, `preferences`, `sharing` and `team` (invites).

**From SPEC C, missing entirely:** `agent_jobs`.

### RLS (spec) vs what exists

| Spec rule | Status |
|---|---|
| Founders see their own companies | **missing.** The UI filters the company switcher by `company_members`, but `useCompany()` falls back to `companies[0]`, so the admin profile (no memberships) gets full write access to StudyBuddy. |
| Mentors read cohort companies; can update stage_gates and approvals | **missing.** A mentor gets the full founder navigation and can chat, run tasks, spend credits and approve on any company they mentor. Any user can open `/cohort` and `/cohort/$id` directly. |
| Only the service role inserts into credit_ledger and agent_runs | **missing.** The browser writes both. |

### Seed (spec) vs `src/lib/seed.ts`

| Spec | Status |
|---|---|
| StudyBuddy: B2C, stage Build, Founder plan | ✓ |
| Metrics | ✓ 14 days for each of the four companies |
| 8 runs, one failed and refunded | ✓ `r1` to `r8`. `r5` failed, with a hold of −120 then a refund of +120. |
| 3 pending approvals | ✓ `a1` to `a3`, plus one approved, one declined, and one pending for Kelpie (`a6`) |
| Ledger | ✓ StudyBuddy balance is 5,995. Hold `l10` (run `r8`) is never settled or released. |
| Posts, compliance items, investors | ✓ StudyBuddy only |
| "University Venture Programme" with 3 more companies and a mentor | ✓ Kelpie Energy, Thrift Loop, Croft Care and Dr Morag Fraser. Kelpie's Evidence gate is ready for sign-off. |

---

## SPEC part B: Extensions

| # | Item | Status | Notes and files |
|---|---|---|---|
| B1 | Customisable HQ widgets (show/hide, reorder, per user, restore default) | **done** | `CompanyHQ.tsx`, `workspace.defaultLayout`. Persisted in `localStorage` key `dawn-hq-layouts`, per user ID. |
| B2 | Live work stream bar and Sol status (working / idle / waiting for you) via Realtime | **mocked** | The status is worked out locally, with no Realtime. Seed run `r8` is "running" forever, so StudyBuddy always shows Sol as "working". |
| B3 | Auto Mode (1–8 hours, estimate, confirm) | **mocked** | The dialog and estimate are real, but it runs one simulated cycle and charges the full amount upfront as `usage`, not as a hold. |
| B3 | Routines (cadence, monthly estimate, pause) | **mocked** | `RoutinesPage`. The toggles are saved but nothing is scheduled. |
| B4 | "≈ N credits" before every action, balance after, block and offer top-up | **done** | `CostButton` in `WorkControls.tsx`. Costs are hard-coded in three places that already disagree: `credits.ACTION_COSTS`, `agentClient.TASK_CREDITS` and literals in components (120, 400, 40, 90, 30). |
| B5 | Company email: address, inbox, threads, Support and Outreach modes, PECR note, batch approval | **mocked** | `EmailPage`. Every company gets the same seeded StudyBuddy-style threads ("Ms Khan… S5 class"). Outreach batches go to Approvals, and approving one just appends a "sent" message. |
| B6 | Media library: generate, statuses including failed with reason, retry, "Use in post" | **mocked** | `MediaPage`. Every asset is `/media/revision.svg`. |
| B7 | Meta Ads panel: status, budget with hard cap, spend, results, changes via Approvals | **mocked** | `AdsPage`. Every seeded company shows the same sample figures. |
| B8 | Documents (5 types), versions, "Ask Sol to update" | **mocked** | `DocumentsPage`. "Ask Sol to update" appends a fixed paragraph. Every company's roadmap lists StudyBuddy outcomes ("Quiz engine", "Teacher dashboard"). |
| B9 | Proof of done; tasks without evidence are "Unverified" | **partial** | `ProofOfDone` and `hasProof()` are tested, but **no task ever gets proof**. Seed tasks marked done are downgraded to `doing` (`workspaceSeed`), and "Run task" adds no proof, so "Mark done" can never be enabled. |
| B10 | Claims checker badge, flagged phrases and reasons | **partial** | `workspace.checkClaims()` uses three regex rules, stricter for regulated sectors, and is tested. The UI says itself that this is a "demo wording check". See bug B4. |
| B11 | Business-type defaults (B2B vs B2C); sector packs | **partial** | Only the channel labels and the claim strictness change. There is no trust page or waitlist feature. |
| B12 | Learning mode: "Why?" on every action, brief or teach me more | **done** | `Why` component; setting in `SettingsPage` |
| B13 | Escalation rules: spend, outreach volume, publishing, KPI alerts | **partial** | The thresholds are saved in `preferences` but **nothing reads them**. |
| B14 | WhatsApp / Slack (placeholder) | **done (placeholder)** | As the spec asks |
| B15 | Ownership page with "Export everything" | **partial** | `OwnershipPage` downloads a zip of CSVs (with protection against formula injection) and document versions. It **leaves out** `social_posts`, `compliance_items`, `metrics_daily`, `contacts` and cohorts, because those live outside the store. The ownership rows are all "Not connected". |
| B16 | Optional public build-in-public page | **mocked** | `progress.$slug.tsx`. Sharing settings exist only in the founder's open tab, so any other visitor (and the server render) always sees "Progress is private". |
| B17 | Team invites with roles | **mocked** | `TeamPage`. No email is sent and access isn't enforced. |

---

## Bugs and broken flows

1. **B1. Approval toasts can be wrong.** `ApprovalCard.decide()` always shows "Approved — Sol will carry it out", but `decideApproval` quietly does nothing if credits are short, claims are flagged, or the ad budget is over the cap (`store.tsx:90-92`).
2. **B2. Two of StudyBuddy's three seeded approvals can never be approved.** `a1` contains "actually works" (flagged for the education sector), and `a2` contains "weak-spots report" (flagged "Feature not built yet"). Approve is disabled, and there is no way to edit a draft or ask Sol to fix it. That makes the main demo flow a dead end.
3. **B3. Approval history records names instead of IDs.** `decided_by` stores the user's full name, while `approveGate` stores the user ID, so they don't match.
4. **B4. Claims are checked against the wrong company.** `ClaimsCheck` calls `useCompany()` with no ID, so it uses the company in the switcher, not the one being viewed. In the mentor's view of another company, claims are checked against the wrong sector.
5. **B5. Approving a gate doesn't advance the company.** `company.stage` stays the same and the next gate stays `locked`.
6. **B6. Onboarding throws away three answers:** stage, website and cohort code (see A1).
7. **B7. StudyBuddy demo content leaks into every company.** It appears in the stand-in site, the Run inbox summary, the Build versions, the grants list, email threads, the roadmap outcomes and the ad figures.
8. **B8. Seed hold `l10` is never released,** and seed run `r8` never finishes, so Sol always shows as working.
9. **B9. Fixed in 1a.** `hq.tsx` broke the rules of hooks. It calls `useStore()` inside an inline `component` arrow function, which the lint rule flags. It works today, but it is fragile.
10. **B10. Fixed in 1a.** Tests failed on a clean install because `@testing-library/dom` is missing from `package.json`.
11. **B11. Investor drag and drop needs a mouse.** It doesn't work on touch screens or with a keyboard.
12. **B12. Fixed in 1a-design step 5.** Theme choice wasn't saved. Settings now has Light (default), Dark and Match system, saved in the browser and applied before the page draws.

## Risks

- **No auth, no RLS, no server.** Every rule in CLAUDE.md is currently enforced only in browser code, or not at all: the insert-only ledger, service-role-only writes, approvals before external actions, and credit holds. That's expected at this stage, but nothing in the current code can be relied on for security. Phase 1 needs to recreate all of it in Postgres.
- **Credits work differently from the rules.** The UI charges `usage` straight away rather than reserve, settle and release (CLAUDE.md rule 3), and the browser writes the ledger. The UI's labels and flows will need reworking around holds in Phase 2.
- **Approvals are "executed" in the browser.** `decideApproval` changes ad budgets and appends sent emails itself. This logic must move to the executor (Phase 5) and must not be ported into the client.
- **Fixed in 1b.** The seed data looked real (personal email addresses, real school domains, real investor firms and grants, a real university). Both `supabase/seed.sql` and `src/lib/seed.ts` now use fictional data on `example.com`.
- **The demo site makes the claims the checker flags.** The stand-in site shows "Learns your weak spots", which is the "Feature not built yet" claim.
- **The model name is hard-coded.** `seed.ts` writes `claude-sonnet-4.5` into every run. CLAUDE.md wants model IDs in config.
- **Costs are defined in three places** that disagree (see B4 in part B). CLAUDE.md wants one config.
- **Fixed in 1a.** `ApprovalPayload` was all `any`. It's now a union keyed by `action_type` (`src/lib/types.ts`).
- **Fixed in 1a.** The product had three names. It's now Gumption everywhere, from `PRODUCT_NAME` in `src/lib/brand.ts`. The `bg-dawn` colour token and the `components/dawn/` folder keep their names. The `localStorage` key `dawn-hq-layouts` also stays until 1c replaces it with a table.
- **Fixed in 1a: package installs.** The project now uses npm only, and `package-lock.json` resolves everything from the public registry. One npm quirk: with **no** lockfile, npm 10 (bundled with Node 22) crashes while resolving peer dependencies (`Cannot read properties of null (reading 'edgesOut')`). npm 11 doesn't, and with the committed lockfile `npm ci` and `npm install` both work on npm 10. If Lovable's editor installs with bun, `bun.lock` may come back; if it does, add it to `.gitignore`.
- **Fixed.** The prototype's `social-post` skill, dropped by GitHub's web upload, was restored in `78efe76`.
- **Repo housekeeping.** There is a stray empty file `willremovethislater` at the root, and `roadmap.md` is Lovable's own checklist ("Dawn extension"), which will drift from this file.
- **The repo layout differs from what CLAUDE.md describes.** `src/integrations/supabase/`, `supabase/migrations/` and `agent-service/` don't exist yet, and the agent-call boundary is really `store.tsx`, which calls `agentClient`. In `agentClient`, `runTask` and `estimateTaskCredits` are never used.

## What's done, partial, missing or mocked

- **Done (as a demo):** HQ layout and widgets, approvals UI, runs timeline, billing display with low-balance banner, cost-before-action, learning mode, pricing constants, claims-check rules, CSV and zip export.
- **Partial:** onboarding, the pillar pages, evidence board, mentor cohort view and gates, proof of done, escalation rules, business and sector defaults.
- **Mocked:** sign-in, Sol chat and all agent work, Auto Mode, routines, email, media, ads, documents, Stripe, invites, the public progress page, Realtime.
- **Missing:** database, auth, RLS, Edge Functions, `agent_jobs`, agent service, cohort cap enforcement, everything in SPEC C, D and E.

## Recommended order for Phase 1

1. **Done in 1a: repo hygiene.** One item is left: the stray `willremovethislater` file at the root.
2. **Supabase project, auth and a typed client.** Create the project, set up magic-link sign-in, auto-create `profiles` on sign-up, and add `src/integrations/supabase/`. Remove the "view as" switcher, or limit it to local development.
3. **Core schema and RLS, with RLS tests.** Create `companies`, `company_members` (roles per company, not on `profiles`), `cohorts`, `cohort_companies`, `stage_gates`, `gate_comments` and `evidence_items`. Membership policies: founders see their own companies, mentors read their cohort's companies and update gates. A gate-approval RPC that also advances `companies.stage`. Tests for founder, mentor, outsider and admin.
4. **Ledger foundations.** An insert-only `credit_ledger` (with no update or delete grants, and a trigger as a backstop), a `company_credit_balance` view that already separates held from available credits, and inserts by the service role only. The full credits engine stays in Phase 2.
5. **Agent-facing tables.** `agent_runs`, `agent_jobs`, `approvals` (with typed payloads), `activity_events` and `chat_messages`. Clients may only read these; founders and mentors can decide approvals only through an RPC.
6. **Remaining pillar tables.** `tasks` (with proof), `social_posts`, `compliance_items`, `investors`, `contacts`, `metrics_daily`, `documents` and `document_versions`, `routines`, `media_assets`, `email_threads` and `email_messages`, `ad_accounts`, `user_preferences`, `hq_layouts`, `public_sharing` and `team_invites`.
7. **Seed migration.** Port `seed.ts` to SQL with fictional contacts and investors, so `supabase db reset` reproduces the demo.
8. **Swap the store's internals for queries,** keeping the hook signatures: read paths first, then writes through RPCs. Move seed-only screens (Grow, Legal, Run, metrics, cohorts) into the store, and remove StudyBuddy content from generic screens (bug B7).
9. **Fix the UX bugs** B1 to B6, B11 and B12, and add a way to edit or regenerate a flagged draft so approvals aren't a dead end.
10. **Finish the partial part A and B items** that need no engine: evidence board editing, compliance tick-off, onboarding saving stage, website and cohort code, cohort cap display, and the public progress page read from the database.
