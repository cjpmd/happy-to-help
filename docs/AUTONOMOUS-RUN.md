# Autonomous build run

These instructions override the "propose a plan and wait for my OK" rule in CLAUDE.md for the duration of this run. Every other rule in CLAUDE.md still applies. Re-read this file whenever you start or resume a session.

## Goal
Complete every remaining item in `docs/PHASES.md`, including the unfinished DESIGN.md restyle and any unfinished work from Phases 0–9, through to the last phase. Keep working until all of it is done and verified. Don't stop to ask me anything.

## How to work
1. Merge `docs/SPEC-additions.md` into `docs/SPEC.md` and `docs/PHASES-additions.md` into `docs/PHASES.md` as additions (don't rewrite existing sections). Update the product summary in CLAUDE.md to match SPEC section A. If this is already done, skip it.
2. Compare PHASES.md with the code and `docs/STATUS.md`. Write the build order at the top of STATUS.md. Finish the restyle first, then the remaining phases in the order that minimises rework (the data-model changes in Phases 10–13 come before real integrations built on the old model).
3. For each phase: write the plan into STATUS.md, then carry it out without waiting for approval. Use a branch `phase-N-short-name`, small commits with clear messages, then merge into `develop` once the phase passes the checks below. Create `develop` from the current main branch if it doesn't exist.
4. Before marking a phase done: typecheck, lint, build, and run tests all pass. Add tests for new logic, RLS policies (a member can access their company's rows; a non-member can't), and the agent executor's approval and escalation rules. Fix what fails. Don't skip or delete tests to get green.
5. Update STATUS.md after each phase: done, mocked, known issues, next step. STATUS.md must always be enough for a fresh session to pick up where you left off.

## Answering your own questions
When something is unclear, decide it yourself, in this order of precedence:
1. SPEC.md (SPEC-additions wins where they conflict)
2. DESIGN.md and the reference HTML
3. CLAUDE.md conventions
4. Existing patterns in the codebase
5. The simplest option that's easy to reverse later

Record every non-trivial decision in `docs/DECISIONS.md`: the question, what you chose, why, and how to change it. Then carry on.

When something breaks (a failed migration, a dependency conflict, a type error, a flaky test, an SDK that doesn't match its docs), diagnose and fix it. If one approach fails twice, try a different one and note it in DECISIONS.md. Don't leave the build broken at the end of a session.

## Hard limits: work around, don't stop
These need me, so never do them yourself. Build the feature fully against a mock provider behind a feature flag (default off), add it to `docs/HANDOFF.md` with exact steps for me, and keep going.
- Anything that spends real money: Stripe live mode, ad spend, buying domains or phone numbers, paid plan upgrades.
- Creating accounts or API keys with external providers (transcription, Recall.ai, Twilio, Ayrshare, Resend, PostHog, Google, Microsoft, Meta). Use env var placeholders in `.env.example`.
- Sending real emails, messages or posts to anyone, or making real calls.
- Running migrations against, or deploying to, the production Supabase project or production hosting. Use the local Supabase stack or a dev branch.
- Committing secrets, or putting a service-role key anywhere in the frontend.
- Force-pushing, rewriting history on `main` or `develop`, or deleting data you didn't create in this run.

## Finishing
You're done when every phase is merged into `develop`, all checks pass, and STATUS.md shows no unfinished items except those in HANDOFF.md. Then write a final summary at the top of STATUS.md:
- what was built
- what's mocked, and what each mock needs to go live (pointing to HANDOFF.md)
- the decisions I should review first (the 10 most consequential from DECISIONS.md)
- known issues and suggested next steps
