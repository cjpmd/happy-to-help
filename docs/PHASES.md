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

## v2 phases

Phases 10–13 change the data model, so they land before Phases 7–9 build real integrations on the old one where possible. Section letters below refer to the v2 parts of `docs/SPEC.md`.

## Phase 10: Two entry paths and stage-aware dashboard
> Add `entry_path` and `stage` to companies. Build the Keep going onboarding: connect or enter website, socials, Google Business profile; upload contacts (CSV); paste or connect past emails for voice analysis (mock the analysis for now). Mark gates before Grow as "imported" for Keep going companies. Make dashboard defaults depend on entry path and stage (Start up: arc and evidence; Keep going: leads, campaigns, inbox, response times) using the existing card components. Add the Customers department to the sidebar as an empty shell. Propose first.

## Phase 11: Brand voice and response policy
> Implement voice_profiles (versioned), voice_examples, response_policies and voice_edit_events per SPEC section G. Build the Voice & Policy settings screen. Add the voice-analysis skill (proposes a profile from website and past emails) and the voice-update skill (weekly proposal from edit events, as an approval item). Enforce the always-escalate rules in the executor, not just the prompt. Auto-send off by default for every category. Propose first.

## Phase 12: Capture v1: talk to Sol, debrief and transcripts
> Implement SPEC section P for the first three sources only: mic on the Ask Sol bar, Debrief mode (mobile-first, up to two follow-up questions), and transcript paste or recording upload. Add the transcription provider behind an interface (mock first, then a UK/EU-resident provider). Build the extract → match → review card → route pipeline with structured output, the idea inbox (ideas become hypotheses with evidence plans for Start up companies), commitments with due dates and drafted follow-ups, and proposed memory updates as approval items. Audio deleted after transcription by default. Add "commitments due today" to the morning brief. Propose first, including the extraction schema and how matching avoids duplicate tasks.

## Phase 13: Link layer and lead capture
> Hub page, tracked short links with UTM, QR code generation, click logging, embeddable lead forms with separate unticked marketing consent, contacts/consents/leads tables, and source attribution. Add an attribution card (clicks → leads → customers per campaign and channel). Cookie consent on hub pages. Propose first, including the short-link domain plan.

## Phase 14: Customers department: inbox and contacts
> Unified inbox fed by Resend inbound email, lead forms and hub contact (social and reviews come in Phase 16). Implement the triage → policy → draft → claims check → send/queue/escalate pipeline with model routing from config (SPEC section M). Contacts timeline view. CSV import with consent checking: no lawful basis means "service only" plus a Stay legal task. Daily inbox credit cap with queueing. AI disclosure on Sol-sent replies. Propose first.

## Phase 15: Campaigns (Reach)
> Campaign object and planner: Sol proposes plan → approval → asset drafts → claims and CAP Code check → approval → schedule via Ayrshare / Resend → results from link layer. Paid-ad drafts are exported for the founder to launch manually, with tracked links attached. Campaign results card on the dashboard. Propose first.

## Phase 16: Listening
> Bring own-account social comments/mentions (where Ayrshare supports them) and Google Business reviews into the inbox pipeline. Sentiment and theme trends in Grow; themes in the morning brief. Feedback requests (opt-in) after purchase or booking. No broad keyword listening. Propose first, including which provider endpoints are actually available on our plan.

## Phase 17: Process bots (Run)
> Bot builder on top of the Phase 8 scheduler: trigger → conditions → actions → approval level → credit cap. Ship the templates in SPEC section L. Every marketing action consent-checked; every run audited. Propose first.

## Phase 18: Capture v2: meeting notetaker and calls
> Calendar connection (Google, Microsoft), per-meeting opt-in, and a notetaker bot via a multi-platform provider (e.g. Recall.ai) that announces itself and that it is recording. Then a company phone number (e.g. Twilio) with a spoken recording notice; calls link to contacts and feed the Customers inbox and contact timelines. Both reuse the Phase 12 pipeline. Per-minute credit rates and daily caps. Mentors never see raw transcripts. Propose first, including provider data-residency options and costs.

## Phase 19 (later, feature-flagged): Paid ads management
> Direct Meta and Google Ads integration: create campaigns, set budgets, pull spend into attribution. Every budget change needs founder approval; hard spend caps per company. Do not start until earlier phases are live with real customers and we've confirmed platform approval requirements. Propose first.
