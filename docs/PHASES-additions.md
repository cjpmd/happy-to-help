# PHASES additions: v2 scope

Append to `docs/PHASES.md` after Phase 9. Same rules as before: one phase per branch, propose a plan first, small commits, keep `docs/STATUS.md` current.

Phases 10–13 change the data model, so they should land before Phases 7–9 build real integrations on top of the old one where possible. Claude Code should flag any ordering conflicts with work already done.

## Phase 10: Two entry paths and stage-aware dashboard
> Add `entry_path` and `stage` to companies. Build the Keep going onboarding: connect or enter website, socials, Google Business profile; upload contacts (CSV); paste or connect past emails for voice analysis (mock the analysis for now). Mark gates before Grow as "imported" for Keep going companies. Make dashboard defaults depend on entry path and stage (Start up: arc and evidence; Keep going: leads, campaigns, inbox, response times) using the existing card components. Add the Customers department to the sidebar as an empty shell. Propose first.

## Phase 11: Brand voice and response policy
> Implement voice_profiles (versioned), voice_examples, response_policies and voice_edit_events per SPEC section C. Build the Voice & Policy settings screen. Add the voice-analysis skill (proposes a profile from website and past emails) and the voice-update skill (weekly proposal from edit events, as an approval item). Enforce the always-escalate rules in the executor, not just the prompt. Auto-send off by default for every category. Propose first.

## Phase 12: Capture v1: talk to Sol, debrief and transcripts
> Implement SPEC section L for the first three sources only: mic on the Ask Sol bar, Debrief mode (mobile-first, up to two follow-up questions), and transcript paste or recording upload. Add the transcription provider behind an interface (mock first, then a UK/EU-resident provider). Build the extract → match → review card → route pipeline with structured output, the idea inbox (ideas become hypotheses with evidence plans for Start up companies), commitments with due dates and drafted follow-ups, and proposed memory updates as approval items. Audio deleted after transcription by default. Add "commitments due today" to the morning brief. Propose first, including the extraction schema and how matching avoids duplicate tasks.

## Phase 13: Link layer and lead capture
> Hub page, tracked short links with UTM, QR code generation, click logging, embeddable lead forms with separate unticked marketing consent, contacts/consents/leads tables, and source attribution. Add an attribution card (clicks → leads → customers per campaign and channel). Cookie consent on hub pages. Propose first, including the short-link domain plan.

## Phase 14: Customers department: inbox and contacts
> Unified inbox fed by Resend inbound email, lead forms and hub contact (social and reviews come in Phase 16). Implement the triage → policy → draft → claims check → send/queue/escalate pipeline with model routing from config (SPEC section I). Contacts timeline view. CSV import with consent checking: no lawful basis means "service only" plus a Stay legal task. Daily inbox credit cap with queueing. AI disclosure on Sol-sent replies. Propose first.

## Phase 15: Campaigns (Reach)
> Campaign object and planner: Sol proposes plan → approval → asset drafts → claims and CAP Code check → approval → schedule via Ayrshare / Resend → results from link layer. Paid-ad drafts are exported for the founder to launch manually, with tracked links attached. Campaign results card on the dashboard. Propose first.

## Phase 16: Listening
> Bring own-account social comments/mentions (where Ayrshare supports them) and Google Business reviews into the inbox pipeline. Sentiment and theme trends in Grow; themes in the morning brief. Feedback requests (opt-in) after purchase or booking. No broad keyword listening. Propose first, including which provider endpoints are actually available on our plan.

## Phase 17: Process bots (Run)
> Bot builder on top of the Phase 8 scheduler: trigger → conditions → actions → approval level → credit cap. Ship the templates in SPEC section H. Every marketing action consent-checked; every run audited. Propose first.

## Phase 18: Capture v2: meeting notetaker and calls
> Calendar connection (Google, Microsoft), per-meeting opt-in, and a notetaker bot via a multi-platform provider (e.g. Recall.ai) that announces itself and that it is recording. Then a company phone number (e.g. Twilio) with a spoken recording notice; calls link to contacts and feed the Customers inbox and contact timelines. Both reuse the Phase 12 pipeline. Per-minute credit rates and daily caps. Mentors never see raw transcripts. Propose first, including provider data-residency options and costs.

## Phase 19 (later, feature-flagged): Paid ads management
> Direct Meta and Google Ads integration: create campaigns, set budgets, pull spend into attribution. Every budget change needs founder approval; hard spend caps per company. Do not start until earlier phases are live with real customers and we've confirmed platform approval requirements. Propose first.
