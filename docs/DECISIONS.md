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
