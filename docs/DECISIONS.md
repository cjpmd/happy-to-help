# Decisions

Non-trivial decisions made during the autonomous build run (`docs/AUTONOMOUS-RUN.md`). Each says what the question was, what was chosen, why, and how to change it. Precedence used: SPEC (v2 parts win) → DESIGN → CLAUDE.md → existing code → simplest reversible option.

## D1. Branches and pushing
- **Question:** AUTONOMOUS-RUN asks for `phase-N-*` branches merged into `develop`; this session may only push to `claude/great-babbage-kzczde`.
- **Chosen:** phase branches and `develop` exist locally; every phase is merged into `develop` with `--no-ff`, and `claude/great-babbage-kzczde` is kept identical to `develop` and pushed. The merge commits preserve the phase structure.
- **Change it:** `git push origin claude/great-babbage-kzczde:develop` creates `develop` on GitHub from the pushed branch.

## D2. Local Supabase ports
- **Question:** `supabase start` failed because ports 54322 and 54324 are taken in the build sandbox.
- **Chosen:** `supabase/config.toml` uses 54332 for the database and 54334 for the mail catcher. API (54321) is unchanged.
- **Change it:** set them back to 54322 / 54324 in `config.toml`; nothing else depends on them.

## D3. Merging the SPEC and PHASES additions
- **Question:** the additions reuse letters A–L, which clash with SPEC parts A–E.
- **Chosen:** the additions' section A replaces "Product in one line"; sections B–L became parts F–P under a "v2 scope" heading, with cross-references renumbered (e.g. "section L" → "section P"). The SPEC says F–P win on conflict. The two additions files were removed so there is one source of truth (they're in git history at `b48bee0`).
- **Change it:** restore the files from `b48bee0`.

## D4. Build order
- **Chosen:** 1 → 2 → 3 → 4 → 5 → 10 → 11 → 12 → 13 → 6 → 7 → 8 → 9 → 14 → 15 → 16 → 17 → 18 → 19. See STATUS.md for the reasons.

## D5. Demo store and live store side by side
- **Question:** the app was a demo on an in-memory store; Phase 1 needs Supabase, but the Lovable preview has no backend until the owner connects one.
- **Chosen:** one store API (`src/lib/storeContext.ts`) with two providers. With `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set, `LiveStoreProvider` uses Supabase; otherwise `DemoStoreProvider` runs the seeded demo. Components don't know which. New features get a simple demo version and a real live version.
- **Change it:** to drop the demo, make `StoreProvider` always render the live provider and delete `src/lib/store.tsx`'s demo half and `src/lib/demoDb.ts`.

## D6. How the live store reads
- **Chosen:** on sign-in it loads every row RLS returns for the user (newest 500 runs, events and chat messages; 90 days of metrics), and reloads one group of tables shortly after Realtime reports a change. Simple and correct at early-stage data sizes.
- **Change it:** when a company's data outgrows this, page the long tables in `src/lib/live/load.ts` and fetch on demand.

## D7. How the app writes
- **Chosen:** any write with a rule behind it goes through a SECURITY DEFINER RPC (`*_app_rpcs.sql`) that raises a plain-English message with SQLSTATE P0001 and a short HINT code; the app shows the message as the error toast. Plain edits RLS already allows (evidence, investors, routines, comments, preferences, sharing, invites) go straight to the table.
- **Change it:** add a new RPC per rule; keep messages written for people.

## D8. No free credits at sign-up (live)
- **Question:** the demo gave new companies 1,500 credits. The ledger is service-role only and money rules need care.
- **Chosen:** live companies start with no credits; they come from billing (Phase 6) or the cohort pool (Phase 2). The demo keeps its 1,500 so the flows can be tried.
- **Change it:** grant a trial from `create_company` through `grant_credits` (Phase 2) if you want one.

## D9. Onboarding's stage answer
- **Chosen:** kept as `companies.starting_stage`; every company still starts at Idea, because stages only change through gates. Phase 10 adds the Keep going path that imports gates before Grow.

## D10. Claims check: roadmap-driven "not built yet"
- **Question:** the "Feature not built yet" rule listed StudyBuddy's phrases for every company.
- **Chosen:** the rule now flags the company's unfinished Product roadmap outcomes. The same rules run in SQL (`private.claims_flags`), which is what blocks approval; `src/test/integration/claims-parity.test.ts` checks the two agree. StudyBuddy's roadmap gained "Weak-spots report" so its seeded email stays flagged for the edit flow.
- **Change it:** edit both `checkClaims` and `private.claims_flags`; the parity test fails until they match.

## D11. Proof of done for founder tasks
- **Chosen:** Sol's tasks (`actor = 'sol'`) need full proof before they're done. Founder and mentor tasks can be marked done without it and show as Unverified.

## D12. Gate approval
- **Chosen:** founders and mentors approve a gate when it's ready, or in progress with every criterion met. Approval moves the company to the next stage and opens the next gate. The button lives on the Flight plan's stage bar and the mentor's company view (it had no home after the HQ rebuild).

## D13. Approving doesn't spend or act yet (live)
- **Chosen:** in live mode `decide_approval` only checks and records the decision. Charging credits and carrying out the action is the executor's job (Phases 2 and 5). The demo still deducts the estimate on GO.

## D14. Local env and magic-link redirects
- **Chosen:** local values go in `.env.local` (ignored by git); `.env.example` documents them. `config.toml` allows magic-link redirects to localhost dev ports.

## D15. Credit lots inside the insert-only ledger
- **Question:** consumption order, expiry and refunds need to know which credits a debit used, but the ledger can't be updated.
- **Chosen:** every grant or top-up row is a lot; every other row carries `lot_id`, the lot it draws from or gives back to. A lot's remaining credits are its amount plus the rows pointing at it. Balance is still the sum of all rows. A constraint makes every debit point at a lot of the same company.
- **Change it:** the model is in `20261026110000_credits_engine.sql`; `private.company_lots()` is the one place that orders lots.

## D16. Consumption order with cohort pools
- **Chosen:** plan credits first, then credits already drawn from the cohort pool, then top-ups and the Launch Pack. A cohort company draws from its pool only when its own credits run out, and only the shortfall, at reserve time, up to the smaller of its cap and what's left in the pool. Drawn credits stay with the company if the hold is released.
- **Why:** SPEC D says plan first, then top-ups; drawing the pool just in time keeps the institution's credits unspent until needed.
- **Change it:** reorder the `case` in `private.company_lots()`, or draw the pool earlier in `reserve_credits`.

## D17. The Launch Pack is a top-up
- **Chosen:** its 10,000 build credits are a `topup` lot that lasts 12 months, not a separate "build only" bucket.
- **Change it:** add a `launch` bucket if build credits must only pay for build work.

## D18. Settling caps at the reservation
- **Chosen:** a run is charged `min(credits for its actual cost, what it held)`, rounded up to whole credits; `maxBudgetUsd` is set from the hold so this rarely bites. Settling twice is refused. Refunds return exactly what was charged, to the lots it came from.

## D19. Conversion constants live in the database
- **Chosen:** `credit_config` (one row: fx 0.75, markup 3, £0.01 a credit, plan expiry 1 month, top-up expiry 12 months), readable by signed-in users and changeable only by the service role. `credits_for_usd()` and `usd_for_credits()` use it, so the agent service and the database never disagree.

## D20. The agent service defaults to a mock runtime
- **Question:** real runs call the Anthropic API, which spends money and needs a key this run can't create.
- **Chosen:** `AGENT_RUNTIME=mock` is the default. The mock follows each job's playbook through the same tools, gate, audit hook and credit flow, so everything but the model is exercised. `AGENT_RUNTIME=claude` with `ANTHROPIC_API_KEY` switches to the Agent SDK. See HANDOFF.md.

## D21. The worker talks to Supabase through the API with the service role
- **Chosen:** `@supabase/supabase-js` with the service-role key, and RPCs for anything that must be atomic (claiming with `FOR UPDATE SKIP LOCKED`, credits, step appends). Works the same against hosted Supabase as locally, with no direct database connection to manage.

## D22. How much a run reserves
- **Chosen:** each job type has an estimate (shown before running) and a cap. A run reserves `max(estimate, min(cap, balance + cohort headroom))`; `maxBudgetUsd` is the reservation in USD (and never more than `MAX_RUN_USD`, default $5). If the available credits are below the estimate, no run is created and Sol says why in chat.

## D23. What an approval's credits mean now
- **Chosen:** approvals the agent proposes carry the executor's cost of carrying the action out (`ACTION_CREDITS` in `agent-service/src/tools.ts`: e.g. 5 for a post). The drafting was already paid for when the run settled. Seeded approvals keep their old figures.

## D24. Internal document updates need no approval
- **Chosen:** `propose_document_update` saves a new document version directly (it's internal and every version is kept), so it isn't an approval. Publishing a document externally (`file_document`) still is.

## D25. Chat runs through the worker until Phase 4
- **Chosen:** in live mode a chat message queues a `chat` job; the worker writes Sol's reply as a chat message. Phase 4 adds the streaming endpoint.

## D26. One catalogue for job estimates
- **Question:** credit estimates lived in three places that disagreed (`ACTION_COSTS`, `agentClient.TASK_CREDITS`, literals in components).
- **Chosen:** the `job_types` table holds each job's estimate and cap. `enqueue_job` uses it (a caller can't lower an estimate), the agent service reserves from it, and the app shows it through `useEstimate()`. The demo uses `ACTION_COSTS`. Approval fees for founder-made approvals (30 outreach, 90 ad budget) stay in their RPCs.
- **Change it:** update rows in `job_types` with the service role; the app picks them up through Realtime.

## D27. Streaming chat in an Edge Function, mocked without a key
- **Chosen:** `supabase/functions/chat` streams Sol's reply as server-sent events and runs the full credit flow per turn (reserve, settle from token usage and `model_prices`, refund on failure). Haiku by default; Sonnet when the message asks for planning. Without `ANTHROPIC_API_KEY` (or with `CHAT_MOCK=1`) it streams the demo's replies and charges the estimate, so the flow is testable at no cost.

## D28. Local Edge Functions behind a TLS-re-signing proxy
- **Question:** the local edge runtime couldn't download npm packages in the build sandbox ("invalid peer certificate").
- **Chosen:** `scripts/dev/warm-functions-cache.sh` fills the runtime's cache from a Deno 2.1.4 container that trusts the proxy's CA. Not needed on a normal machine or on hosted Supabase.

## D29. Where and how approved actions are carried out
- **Chosen:** the executor is a deterministic module in the agent service (`agent-service/src/executor/`), polled by the same worker loop (approvals first). `decide_approval` queues approved actions (`execution_status = 'queued'`); the executor claims them with `FOR UPDATE SKIP LOCKED`, re-checks the rules, charges the approval's credits through its own run (reserve → `settle_run_credits`), calls the provider, and records the result on the approval and in activity. Provider failures are refunded and retried once; rule failures are blocked with no charge and explained in chat.

## D30. Executor rules
- **Chosen:** checked again at execution time, whatever was approved: the claims check; ad budgets never over their hard cap or the platform maximum (£100/day); outreach batches never over 50 recipients; and the founders' own settings as escalation rules: an ad budget over the "Ad change alert (£)", an outreach batch over the "Outreach volume alert", or any publishing when "Ask before publishing" is on must have been approved by a founder, not a mentor. Where founders differ, the strictest setting wins.
- **Why:** the settings existed but nothing read them (STATUS B13). Using them to decide who may approve keeps every action approved while letting mentors handle routine work.
- **Change it:** limits in `DEFAULT_LIMITS` (`agent-service/src/executor/rules.ts`); the founder rules in `checkRules`.

## D31. Cohort headroom counts when approving
- **Chosen:** `decide_approval` now accepts an approval the balance plus the cohort pool's headroom can cover, matching what `reserve_credits` will actually allow.

## D32. NO-GO notes
- **Chosen:** `decide_approval` takes an optional note; it's stored on the approval and shown in the agent's company memory under "Recently declined", so Sol doesn't propose the same thing again unchanged. The app doesn't ask for a note yet.

## D33. Keep going companies
- **Chosen:** `companies.entry_path` (start_up | keep_going). Keep going companies are created at Grow with the four earlier gates marked `imported` (a new gate status), their website as the live URL, and their socials and Google Business link stored on the company. Their safety approvals (voice, response policy) come in Phase 11.
- **Onboarding** asks the path first. Keep going adds: website and socials, a contacts CSV (imported with `import_contacts`, deduplicated by email) and pasted past emails (saved as `voice_sources`, readable only by founders and teammates) with Sol's first read of the voice (`src/lib/voice.ts`, rule-based until the Phase 11 skill runs).

## D34. Stage-aware HQ
- **Chosen:** `dashboardCards()` picks the six HQ cards: Start up at Idea or Evidence sees Evidence instead of Vehicle; Start up from Build sees the original six; Keep going sees GO / NO-GO, Leads, Inbox, Response times, Campaigns (the Channels card until Phase 15) and Telemetry, and no flight plan arc. A saved layout is used only when it has the same cards as the company's dashboard.

## D35. Customers department
- **Chosen:** `/customers` with Inbox (conversations waiting for a reply), Contacts (moved from Run, with CSV import) and Feedback (empty until Phase 16). Run links to it.

## D36. Voice and policy model
- **Chosen:** voice profiles are versioned rows (never edited in place) with one `approved` per company enforced by a partial unique index; proposals sit as `proposed` until decided. The response policy is one row per message category with `auto_send | draft | escalate`. Every company starts with a default voice, `draft` for everything, and `escalate` for refunds and legal threats (a check constraint, so no RPC or service-role bug can loosen it). The disclosure can be reworded but not removed.
- **Why:** SPEC G: the voice never changes silently, auto-send is off by default, and money and legal always reach the founder.

## D37. Reply rules live in the executor
- **Chosen:** the executor (not the prompt) blocks auto-sending for always-escalate categories and for triage flags (money, legal, safety, vulnerable, data request, unverified claim); allows auto-send only when the category is set to `auto_send`, the voice has been approved beyond the default and the policy has been reviewed; and appends the disclosure to Sol-sent replies (and to approved ones while "also add it to replies I approve" is on). Phase 14 feeds it.

## D38. Adopting a voice is an approval
- **Chosen:** the agent's voice proposals become an `update_voice` approval (0 credits) shown on the GO / NO-GO card and the Voice tab. GO runs through the executor, which calls `adopt_voice_profile`; NO-GO declines the proposal (a trigger). A founder's own edit is saved directly as a new approved version, since it's their decision.

## D39. Capture schema
- **Chosen:** one `captures` row per note, debrief, transcript or recording, with how participants were told (`own_voice`, `participants_informed`, `platform_transcript`; meetings can't be added without one of the last two). `transcripts` hold text and speaker segments. Sol's findings are `extracted_items` (decision, action, idea, question, commitment, feedback, memory_fact, claim) with owner, due date, department, confidence, sensitivity, quote and timestamp, and they stay `pending` until the founder accepts. Feedback and memory facts got their own small tables now; Phase 16 extends feedback.
- **Why:** SPEC P's pipeline and its rule that nothing is created until accepted.

## D40. Routing accepted items in the database
- **Chosen:** `private.route_item` does the routing in one transaction for the RPCs and for auto-accept, so a half-routed item can't happen. Sol actions become a Sol task and a queued job only if credits allow (otherwise the task waits); actions with no owner or date can't be accepted until the founder fills them in; sensitive items need an explicit "file it anyway"; facts become an approval, never a silent memory write; and for Start up companies an idea becomes an untested assumption with a standard evidence plan.

## D41. Matching against what exists
- **Chosen:** in `propose_extraction`, before saving: an action matches an open task when the Jaccard similarity of their meaningful words is at least 0.5 (it then updates that task's due date instead of creating one); a named person links to a contact only on an exact full-name match or a first name that only one contact has. The skill also asks the model to word matches like the existing task. Pure functions in `src/lib/capture.ts`, shared with the demo.
- **Why:** cheap, predictable and testable; it errs towards creating a new item over merging two different ones.

## D42. Transcription is part of the run
- **Chosen:** a recording's transcription happens inside its `capture_process` run, so the estimate (extraction plus the started minutes at `credit_config.transcription_usd_per_minute`) is reserved up front, the provider's cost is settled with the model cost, and a failure refunds both. Audio is deleted from storage as soon as it's transcribed unless the founder keeps it (up to 90 days; the worker purges expired audio every minute).

## D43. Who sees captures
- **Chosen:** captures, transcripts, items, ideas, promises and feedback are readable by founders and teammates only. Mentors see an item only when it's an accepted action or decision a founder has shared; viewers and admins see none of it. Memory facts are readable like other company documents. Memory approvals must be given by a founder.

## D44. The mic records a voice note
- **Chosen:** holding the mic on the Ask Sol bar records a voice note that goes through the capture pipeline (transcribed by the configured provider, then a "From your note" card), rather than dictating into the chat box with the browser's speech recognition.
- **Why:** browser speech recognition sends audio to the browser vendor, outside our UK/EU provider and consent records (SPEC M), and doesn't work in every browser. In the demo, and where recording isn't available, the mic opens Debrief to type.

## D45. Short links and their domain
- **Chosen:** codes are 8 characters from an unambiguous alphabet, made from `gen_random_uuid()` bytes. The canonical short link is the public `link` Edge Function (a real 302, works without the app loaded); the app's `/l/<code>` route does the same for the demo. A branded short domain is a purchase, so it's in HANDOFF 4 behind `VITE_SHORT_LINK_BASE`.
- **Why:** no cost or DNS needed now, and moving to a short domain later is a proxy rule and one setting, with old links still working.

## D46. Attribution without cookies
- **Chosen:** a link to one of our hub pages or forms carries `l=<code>` with its UTM tags; the form sends that code with the submission, so the lead is tied to the link, its channel and campaign. Leads without one count as "direct". Cost per lead uses the spend the founder enters on a link (pounds and credits) until campaigns (Phase 15) carry spend.

## D47. What anonymous visitors can call
- **Chosen:** exactly five functions: the progress page, `get_hub`, `get_form`, `follow_link` and `submit_lead`. They return only what the founder published and never read back personal data; submissions are validated, rate-limited per person and per form, and a hidden field catches simple bots. The coverage test pins the list.

## D48. Cookie consent on public pages
- **Chosen:** hub pages set no cookies. A small banner asks before any analytics; the choice is kept in local storage (strictly necessary), and `analyticsAllowed()` is what Phase 7's PostHog must check before loading.

## D49. Consents as a history
- **Chosen:** each change is a new `consents` row (updates refused by a trigger; deletes allowed so erasure requests work), and `current_consents` shows the latest per contact, channel and purpose. A form records a service consent on legitimate interests (to reply) and the marketing opt-in separately; leaving the box unticked never cancels an earlier opt-in, and the team can record an opt-out but not an opt-in (PECR: it must come from the person, or a confirmed soft opt-in in Phase 14).

## D50. Stripe stays in test mode
- **Chosen:** the billing functions refuse `sk_live_` keys and `livemode` events unless `STRIPE_ALLOW_LIVE=1`, and the app hides payments unless `VITE_BILLING_ENABLED=true`. Without a key, `BILLING_MOCK=1` applies purchases directly so the whole flow can be tested locally.
- **Why:** AUTONOMOUS-RUN's hard limit on real money; switching to live is a deliberate owner step.

## D51. No Stripe SDK in the Edge Functions
- **Chosen:** Checkout and Portal sessions are two form-encoded `fetch` calls, and webhook signatures are verified with WebCrypto (HMAC-SHA256 over `t.payload`, 5-minute tolerance, constant-time compare, any `v1` matches). The event-to-action mapping is pure TypeScript shared with vitest.
- **Why:** the edge runtime's npm downloads are fragile here (D28), the surface we use is small, and pure functions are easy to test.

## D52. Idempotency in two layers
- **Chosen:** `stripe_events` records each event id and `apply_billing_event` refuses to apply one twice; each grant also carries `stripe:<checkout session or invoice id>` as its ledger idempotency key, so even two different events for the same payment grant once. Failures are recorded and answered with a 500 so Stripe retries.

## D53. When credits are granted
- **Chosen:** subscriptions are granted on `invoice.paid` (each month, plan bucket, expiring at that period's end), not on the checkout, so renewals and the first month work the same way; one-off products on `checkout.session.completed` when `payment_status` is `paid`. Subscription changes update `subscriptions` and the company's plan.

## D54. Real providers need two keys turned
- **Chosen:** a provider is real for a company only when the platform has its key (agent-service env) and the company's founder has switched it on (`integration_settings`). Otherwise the mock is used. Per-company secrets (Ayrshare profile keys) live in `integration_secrets`, readable only by the service role. The worker reports which platform keys exist so the app can say "Not set up yet".
- **Why:** PHASES asks for per-company flags so each company can stay mocked; this also means deploying keys can't switch anything on by itself.

## D55. Marketing email and PECR
- **Chosen:** outreach is sent one recipient at a time so each email carries its own unsubscribe link (an HMAC of company and address) and `List-Unsubscribe` / one-click headers; the unsubscribe function records a withdrawn consent at once; the executor skips anyone whose current marketing consent is withdrawn and refuses real marketing email if the signing secret isn't configured. Consent checks before campaigns (who may be emailed at all) come with Phase 14 imports and Phase 15 campaigns.

## D56. One PostHog project, tagged by company
- **Chosen:** the platform has one PostHog project (EU); hub pages send `$pageview` and `signed_up` with `company_slug`, only after the visitor allows analytics, using PostHog's capture API (no SDK or cookies). The worker queries each company's daily numbers with HogQL. Platform keys are used rather than per-company PostHog accounts.

## D57. The scheduler lives in the agent worker
- **Chosen:** every minute the worker computes what's due and claims each firing with `claim_schedule` (a unique index on kind, company, item and period) before queueing the job, so restarts and extra workers never double-fire. No pg_cron.
- **Why:** the worker already holds the service role and runs continuously; one clock in TypeScript is easier to test than SQL schedules, and the unique index gives the same guarantee.

## D58. UK time for schedules
- **Chosen:** schedules are computed in Europe/London with `Intl` (so 07:00 stays 07:00 across BST), by a pure module (`src/lib/schedule.ts`) shared by the worker and the app. A routine that was missed (worker down) runs when the worker is back, the same day (or the same week for weekly ones).

## D59. Auto Mode is a capped run of steps
- **Chosen:** a session (1 to 8 hours, a cap the balance can cover, one at a time) is advanced by the scheduler one `auto_mode` job at a time; each step may reserve only what's left of the cap; the session ends when time or cap runs out, and Sol posts what it did. Stopping prevents new steps; the current one finishes. The cost shown before starting is the cap.

## D60. The nightly loop
- **Chosen:** opt-in per company with a nightly credit cap (default 300 when switched on). The scheduler picks the task deterministically (Sol's open tasks; key tasks for the current stage, then overdue, then soonest due) and the run works on it, proposing anything external for the morning.

## D61. No Batch API for now
- **Chosen:** overnight work runs as normal agent runs. The Claude Agent SDK runs multi-turn tool loops, which the Message Batches API can't serve; batching only fits single-call jobs (e.g. a brief written from precomputed facts), which can move to batches later without changing the scheduler.

## D62. Credit expiry uses the database clock
- **Chosen:** the scheduler only decides that expiry is due; `expire_credits` always runs with the database's `now()`. Found when a test clock in the future expired real credits.

## D63. Error monitoring in our own database
- **Chosen:** an `error_events` table fed by every part of the system and read by platform admins in the app, rather than an external service now. Recording never throws. Sentry or similar can be added later without changing callers.
- **Why:** no new account or data processor needed (HANDOFF rules), and errors sit next to the runs and companies they concern.

## D64. What "reconciliation" compares
- **Chosen:** each run's SDK-reported cost (`agent_runs.cost_usd`) against Anthropic's own usage report for the organisation, priced with `model_prices`, per day and model; mock runs excluded. A gap means token accounting or prices drifted; the invoice itself is the final check.

## D65. Rate limits as insert triggers
- **Chosen:** fixed-window counters keyed by person and action, enforced by `before insert` triggers on the tables behind costly or abusable actions (agent jobs, chat, recordings, links, examples), so every path is covered whichever RPC or function inserts. The service role is exempt. Limits are generous for real use and documented in SECURITY-REVIEW.md.

## D66. The inbox pipeline is two jobs
- **Chosen:** triage (smallest model) and drafting (mid-tier) are separate jobs, because a run uses one model and SPEC M routes them differently. The policy decision is code (`decideMode`, mirroring the executor's hard rules), not the model's choice; the model only classifies. Processing starts only within a daily budget the founder sets (default 0, so nothing spends credits until they choose), with a "do it now" button per message.

## D67. A refused automatic reply becomes a draft
- **Chosen:** when the executor's `checkAutoSend` refuses an automatic reply (voice not approved, policy not reviewed, a hard rule), the approval goes back to pending with the reason and the founder is told, rather than ending as "blocked".
- **Why:** the customer still needs an answer; the rules decide who sends it, not whether there's a reply.

## D68. Imports and PECR
- **Chosen:** a contact imported with an opt-in needs evidence (a date or source) to count as consent; a soft opt-in counts only for customers and only when the founder confirms the conditions; everyone else is recorded as "not given" (service only), and a Stay legal task explains what to do. Never inferred from a "subscribed" column alone without evidence.

## D69. CAP Code checks on campaign copy
- **Chosen:** a small rule set on top of the claims check for promotional copy: "free" only with no catch (CAP 3.23), urgency and discounts need a stated end (CAP 8.17), comparisons must be verifiable (CAP 3.33). A flagged asset is refused at proposal, so Sol rewrites it before it reaches the founder. Deliberately conservative: false positives cost a rewrite, false negatives cost a complaint.

## D70. Campaign email is consent-only
- **Chosen:** a campaign email is addressed only to contacts whose current marketing permission is "granted" (consent or soft opt-in, D68). With none, no email asset is drafted and Sol says why. PECR.

## D71. Ads in campaigns are exported, not launched
- **Chosen:** Sol drafts ad copy with its tracked link and marks it "exported" for the founder to paste into the ad platform. Direct ad control is Phase 19, flagged and off (AUTONOMOUS-RUN hard limit on spending money).

## D72. Only a founder approves a campaign plan
- **Chosen:** the plan approval (`approve_campaign`) is founder-only in the executor, like budgets, because it commits the credit budget and starts outward-facing work. Each asset is then approved as usual.

## D73. Feedback requests are opt-in on both sides
- **Chosen:** the founder switches automatic requests on (off by default), and a request goes only to a contact whose current marketing permission is "granted", at most once every 90 days, as a marketing email (unsubscribe link, opt-outs skipped) that waits for a GO. Triggers: a lead marked won, or a booking enquiry answered, a set number of days before (default 2).
- **Why:** SPEC says "opt-in"; ICO guidance treats customer-satisfaction emails as direct marketing when they promote anything, and the safe reading is to treat them as marketing. A manual request from a contact's timeline follows the same rules.

## D74. Themes are computed, not stored
- **Chosen:** themes come from a small keyword list (`themesFor` in `src/lib/listening.ts`) applied wherever the text is read (Grow, the brief), rather than a column filled at triage. Sentiment uses triage where it ran, otherwise the stars or the triage rules.
- **Why:** anonymous feedback can't run TypeScript at insert time, a SQL copy would need parity tests, and recomputing lets the list improve without a backfill. A model-written summary can replace it later.

## D75. Public replies always wait for a GO
- **Chosen:** replies to comments and reviews are a separate action (`reply_public`) that is never sent automatically, whatever the response policy says. The executor treats an undecided one as blocked.
- **Why:** a public reply can't be unsent from people's view and carries more reputational risk than a private email; the policy's auto-send was designed and tested for email.

## D76. Listening uses the company's own Ayrshare profile
- **Chosen:** comments are read only for posts Sol published through Ayrshare (their ids are known), and reviews from the linked Google Business Profile. No broad keyword listening, mentions or DMs (SPEC K, and their APIs need separate access and costs).

## D77. Bot emails: a GO each time, or wording approved once
- **Chosen:** two approval levels. "Ask me before every email" (the default) makes each email a pending approval. "Send with the wording I approve now" lets the executor send the bot's emails as already approved by the founder who approved that wording, after it passed the claims check; any change to the wording returns the bot to a GO for every email. Tasks and summaries are internal and need no GO.
- **Why:** SPEC L asks for an approval level per bot, and rule 4 (agents propose, the executor acts) still holds: the founder approves the exact text, the deterministic executor sends it, and it re-checks claims, consent and its rules each time.

## D78. Bots are deterministic and capped per week
- **Chosen:** the engine fills templates rather than asking a model to write, so a bot costs only its actions (5 credits an email, through the usual reserve and settle at execution). Each bot has a weekly credit cap (default 50); a step that would go over is skipped with the reason and tried again by the next enrolment.
- **Why:** predictable cost and behaviour for routine follow-ups. Sol-written personalisation can be added as a step kind later, with its own estimate.

## D79. Which emails need consent
- **Chosen:** each email step is marked service or marketing in its template, and that can't be edited. Service steps (replying to an enquiry, welcoming a new customer, an invoice reminder) go to the contact; marketing steps (a second follow-up, tips, win-backs) only to contacts with recorded marketing permission. Opt-outs are always respected by the executor.
- **Why:** PECR; replying to someone's own enquiry and transactional messages aren't direct marketing, follow-ups and promotions are.

## D80. Invoice reminders wait for Stripe Connect
- **Chosen:** the template is listed with "Needs Stripe" and `update_bot` refuses to switch it on. Reading a company's invoices needs Stripe Connect (or the company's own key), which is an account and onboarding decision for the owner (HANDOFF 9).
