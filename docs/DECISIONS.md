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
