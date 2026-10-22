# Delivery phases

Each phase runs on its own branch, starts with a plan for review, and ends with `docs/STATUS.md` updated. Paste the prompt for a phase into Claude Code when you're ready for it.

## Phase 0: Audit (no code changes)
> Read CLAUDE.md, docs/SPEC.md and the whole repo. Write docs/STATUS.md: for every item in SPEC parts A and B, mark done / partial / missing / mocked, with file references. List the database tables, RLS policies and seed data that exist vs the spec. List bugs, broken screens and anything risky (secrets in frontend, missing RLS). Finish with a recommended order for Phase 1. Don't change any code.

## Phase 1: Finish and harden the UI and database
> Using docs/STATUS.md, propose a plan to complete the missing and partial items from SPEC parts A and B. Group the work into small commits. Include migrations for missing tables, RLS for every table, RLS tests, and seed data updates. Wait for my OK, then work through it one group at a time, showing me a summary after each.

## Phase 2: Credits engine
> Propose the credit engine design in SQL: RPC functions reserve_credits, settle_run, release_hold, refund_run and grant_credits, the balance view with plan credits consumed before top-ups, expiry handling, and cohort pool caps. All service-role only, ledger insert-only. Include tests for: insufficient balance, double-settle, refund, expiry and cohort caps. Wait for my OK before writing migrations.

## Phase 3: Agent service
> Create agent-service/ based on docs/prototype/. Propose the plan first. Scope:
> - job claiming from agent_jobs
> - per-company workspace generation from the DB
> - reserve, run, settle using the Phase 2 RPCs
> - maxBudgetUsd from the reserved amount
> - audit hooks writing activity_events and agent_runs.steps
> - propose_* tools that create pending approvals
> - the social-post and claims-check skills
> - config for models and cost constants
> - a local dev script that runs one job end to end against the seeded StudyBuddy company

## Phase 4: Connect the app to the engine
> Replace the mocks in src/lib/agentClient.ts with real calls: enqueue jobs through an Edge Function, show estimates before running, stream run progress through Realtime, and run Sol chat through a streaming endpoint. Keep the same function signatures so components don't change. Propose first.

## Phase 5: Approvals executor
> Build the executor that carries out approved actions deterministically: publish post, send email, change ad budget. Use mock providers behind an interface first. Record the outcome on the approval and in activity_events. Declined approvals notify the agent's next run. Propose first.

## Phase 6: Stripe billing
> Implement Stripe Checkout for plans, top-ups and the Launch Pack, plus the Customer Portal and webhook Edge Functions with idempotency, wired to grant_credits. Test mode only. Include a script to replay test webhooks. Propose first.

## Phase 7: Real integrations
> Swap mock providers for Resend (email, including inbound support), Ayrshare (publish and analytics into social_posts.metrics) and PostHog (metrics_daily). Feature flags per company so each can stay mocked. Propose first.

## Phase 8: Scheduler, routines and Auto Mode
> Implement routines, Auto Mode (time-boxed with a credit cap), the nightly loop that picks the highest-leverage task per company, and the 07:00 UK morning brief. Use the Batch API for non-urgent overnight work if the runtime supports it. Propose first.

## Phase 9: More skills and hardening
> Add the skills morning-brief, compliance-calendar, investor-update and evidence-plan. Then add:
> - error monitoring
> - a cost reconciliation report (SDK estimates vs Anthropic usage)
> - rate limits
> - an RLS review
> - a security pass on Edge Functions
> Propose first.
