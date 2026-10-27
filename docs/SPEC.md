# Product spec

The source of truth for what the platform should do. Parts F–P (v2 scope, merged from the SPEC additions on 26 Oct 2026) extend parts A–E; where they conflict, F–P win. The UI was started in Lovable from parts A and B; parts C–E describe the engine Claude Code builds.

## Product definition

Gumption is a platform where businesses at any stage run their company with an AI cofounder, Sol (powered by Claude). Sol builds products, runs marketing and campaigns, captures and nurtures leads, listens to customers, replies in the company's own voice, and automates routine operations. The founder approves anything that matters.

Two kinds of customer, one platform:

| | Start up | Keep going |
|---|---|---|
| Who | Founders at idea or pre-launch stage, including student cohorts | Businesses already trading |
| Enters at | Idea | Grow (gates before Grow marked "imported") |
| Onboarding | Create: idea, evidence plan, brand, voice, site | Import: site, socials, Google Business profile, contacts, past emails, existing tools |
| Gates mean | Prove demand before building | Safety: approve voice and response policy before Sol talks to customers; approve budgets |
| Commercial entry | Launch Pack (paid build month), then lower ongoing plan | Onboarding / import fee, then usage-led plan |
| Default dashboard | Flight plan arc, evidence, roadmap | Leads, campaign results, inbox, response times |

A company can move from Start up to Keep going. Nothing about the data model differs between the two; only defaults, onboarding and gate meaning differ.

## Principles
- **Evidence before building.** Companies move Idea → Evidence → Build → Launch → Grow; Evidence and Build are gates with criteria (e.g. waitlist 50, interviews 8, pre-orders 5) approved by the founder or a mentor.
- **Founder owns everything:** repo, database, domain, Stripe, social accounts.
- **Transparent cost:** every action shows "≈ N credits" before it runs; every run shows what it cost.
- **Proof, not claims:** tasks are only done with evidence (checks, screenshots, links).
- **Teach, don't replace:** every action has a plain-English "Why?".
- **Keep it simple:** websites and basic supporting apps only; the value is in growth, admin, compliance and fundraising.

## Roles
founder · mentor (cohort oversight, gate approvals) · admin. Users can belong to several companies (portfolio switcher).

---

## A. Foundation (Lovable prompt 1)

**Screens**
1. Sign-in (magic link) and onboarding wizard: company name, idea, target customer, B2B/B2C, stage, 90-day goal, optional existing website and cohort code.
2. Company HQ: stage bar with gate progress; live preview iframe (Live/Preview, desktop/mobile); Sol chat; "Needs your approval" cards (Approve / Decline / Ask why); Overnight activity; metrics strip (visitors, signups, paying customers, MRR, credits).
3. Approvals queue with exact previews, estimated credits, decisions recorded.
4. Activity & runs timeline: task, pillar, status, duration, credits; expandable steps; failed runs show auto-refund.
5. Pillar pages: Build (site versions, changes awaiting approval) · Grow (content calendar, results per post) · Run (inbox summary, CRM, tasks) · Stay legal (compliance checklist and calendar) · Raise (investor kanban, grants).
6. Evidence board: assumptions (untested / testing / validated / invalidated), interviews, waitlist, pre-orders.
7. Billing & credits: plans, balance, ledger, top-ups, Launch Pack, low-balance banner at 20%.
8. Mentor cohort view: companies with stage, health, last activity, credits vs cap, pending gates; read-only HQ with gate approval and comments.

**Plans and products**
| Product | Price | Credits |
|---|---|---|
| Starter | £29/mo | 1,500/mo |
| Founder | £79/mo | 5,000/mo |
| Growth | £149/mo | 12,000/mo |
| Top-ups | £10 / £25 / £50 | 500 / 1,300 / 2,800 |
| Launch Pack (build month) | £49 one-off | 10,000 build credits |
| Cohort licence | invoiced | pooled credits, per-founder caps |

**Tables:** profiles, companies, company_members, cohorts, cohort_companies, stage_gates, evidence_items, tasks, agent_runs, approvals, activity_events, credit_ledger (insert-only) + company_credit_balance view, chat_messages, social_posts, compliance_items, investors, metrics_daily.

**RLS:** founders see their companies; mentors read cohort companies and can update stage_gates and approvals; only the service role inserts into credit_ledger and agent_runs.

**Seed:** StudyBuddy (B2C, stage Build, Founder plan) with metrics, 8 runs (one failed + refunded), 3 pending approvals, ledger, posts, compliance items, investors; cohort "University Venture Programme" with 3 more companies and a mentor.

## B. Extensions (Lovable prompt 2)
1. Customisable HQ widgets (show/hide, reorder, per-user, restore default).
2. Live work stream bar and Sol status (working / idle / waiting for you), via Realtime.
3. Auto Mode (1–8 hours, credit estimate, confirm) and Routines (daily / weekdays / weekly jobs with monthly credit estimate, pause).
4. "≈ N credits" before every agent action, with balance after; block and offer top-up if insufficient.
5. Company email: sending address, inbox, threads, Support and Outreach modes; outreach needs PECR note and batch approval.
6. Media library: generate image/video, statuses incl. failed with reason and retry, "Use in post".
7. Meta Ads panel: status, daily budget with hard cap, spend, results; budget changes via Approvals.
8. Documents: Company profile, Product roadmap (outcomes with progress), Brand & voice guide, Privacy policy, Pitch one-pager; versions; "Ask Sol to update".
9. Proof of done: evidence on completed tasks; tasks without evidence are "Unverified".
10. Claims checker badge on public-facing text, with flagged phrases and reasons.
11. Business-type defaults: B2B (LinkedIn, outreach, trust page) vs B2C (Instagram, TikTok, waitlist); sector packs add stricter checks.
12. Learning mode: "Why?" on every action; brief / teach me more.
13. Escalation rules: spend, outreach volume, publishing, KPI alerts.
14. WhatsApp / Slack connection for Sol (placeholder).
15. Ownership page with "Export everything".
16. Optional public build-in-public page.
17. Team invites with roles.

---

## C. Agent engine (Claude Code)
- **agent_jobs** table: company_id, task_id, job_type, payload, status (queued / running / done / failed), scheduled_for, attempts. Edge Function enqueues; agent-service claims jobs (`FOR UPDATE SKIP LOCKED` via RPC) or listens via Realtime.
- **Per run:**
  1. Build the company workspace (CLAUDE.md generated from DB: business, brand voice, goals, rules, stage).
  2. Estimate, then reserve credits.
  3. Run `query()` with the relevant skills, MCP tools, `canUseTool` gate, audit hooks and `maxBudgetUsd`.
  4. Stream steps into `activity_events` and `agent_runs.steps`.
  5. Settle credits from `total_cost_usd`.
- **Approvals pattern:** tools like `propose_post`, `propose_email`, `propose_ad_change` write a pending `approvals` row and return. The executor (Edge Function or agent-service module) carries out approved actions deterministically and records the result.
- **Sol chat:** Edge Function or agent-service endpoint, streaming; short-context Haiku by default, Sonnet when planning.
- **Retries:** max 2 attempts per job, then escalate to the founder with a clear message; no silent credit burn.
- **Model routing** and all cost constants in config.

## D. Billing (Claude Code)
- Stripe Checkout for subscriptions, top-ups and Launch Pack; Customer Portal for plan changes.
- Webhooks (Edge Function) with idempotency on Stripe event ID:
  - `invoice.paid` → monthly grant
  - `checkout.session.completed` → top-up / Launch Pack
- Consumption order: plan credits first (expire monthly), then top-ups (12 months).
- Cohort credits: pool on the cohort, per-company caps enforced at reserve time.
- Monthly reconciliation report: SDK-estimated cost vs Anthropic invoice.

## E. Integrations and skills (Claude Code)
- **Email:** Resend (sending, inbound for support). **Social:** Ayrshare (publish + analytics). **Analytics:** PostHog. **Media:** image model (mock first).
- **Starter skills:**
  - `social-post`
  - `claims-check`
  - `morning-brief`
  - `compliance-calendar`
  - `investor-update`
  - `evidence-plan` (turn an idea into testable assumptions and a smoke test)
- **Scheduler:** routines and nightly loop (pick highest-leverage task per company), morning brief at 07:00 UK time; Batch API where latency doesn't matter.

---

# v2 scope

## F. The loop and departments

Every company runs the same loop: **Build → Reach → Capture → Listen → Respond → Run.**

Sidebar departments:

- **Build:** websites, simple apps, product pages (existing).
- **Grow:** campaigns (Reach), link hub, tracked links, lead capture (Capture), social and review listening (Listen).
- **Customers (new):** unified inbox, contacts (CRM-lite), feedback, replies (Respond).
- **Run:** process bots and routines (extends existing routines).
- **Stay legal:** existing, plus marketing consent and data-protection tasks.
- **Raise:** existing.

Cutting across all departments: **Capture from conversation** (section P). Founders can talk to Sol, debrief after meetings, or let Sol listen to meetings and calls, and Sol turns what was said into actions, ideas and follow-ups routed to the right department.

## G. Brand voice and response policy

Voice and policy are separate objects. Voice says *how* Sol speaks; policy says *what Sol may do without asking*.

### Voice profile (one per company, versioned)
- Traits (3–5), words and phrases to use, words to avoid, reading level, spelling (UK default), sign-off, emoji use.
- Per-channel variants: email, social post, social reply, review reply, SMS/chat.
- Approved example replies (few-shot), tagged by situation.
- **Situational tone rules:** complaint → calm, accountable, no humour, no blame; praise → warm, brief; B2B enquiry → crisp, professional; distressed or vulnerable customer → gentle, escalate.
- Created by: Start up → questionnaire plus brand work; Keep going → Sol analyses website and imported past emails/posts, proposes a profile, founder approves.
- **Learning from edits:** when a founder edits a draft before sending, store original vs final. Weekly, Sol proposes voice-guide changes as an approval item. The voice never changes silently.

### Response policy (one per company)
For each message category (e.g. general enquiry, pricing question, complaint, refund request, booking, review positive, review negative, legal threat, press, spam), set one of:
- **Auto-send:** Sol replies immediately, logged.
- **Draft for approval:** Sol drafts, founder approves or edits.
- **Escalate:** no draft sent; founder notified with summary.

Hard rules regardless of settings (always escalate): refunds or money, legal threats, safety or health concerns, signs of vulnerability or distress, data-protection requests (access, deletion), anything requiring a claim the claims checker can't verify. Auto-send is off for every category until the founder turns it on.

### AI disclosure
Replies sent by Sol carry a configurable disclosure (default on), e.g. "Drafted with our AI assistant". Founder can change wording but not remove disclosure on auto-sent messages.

## H. Link layer and lead capture

The link layer is how Gumption measures effectiveness from its own data, independent of ad-platform APIs.

- **Hub page** per company (link-in-bio style): logo, short bio, links, lead form, socials. Hosted at `{company}.{our-domain}` or custom domain.
- **Tracked links:** short links with UTM parameters, one per campaign/post/asset. Each has a destination, campaign_id, channel, and created_by (Sol or founder).
- **QR codes** generated for any tracked link (PNG/SVG download) for print and events.
- **Click events** logged (timestamp, link, coarse geo, device, referrer). No fingerprinting; cookie consent respected on the hub page.
- **Lead forms** embeddable on hub page and company website. Each submission creates a contact and a lead with source attribution (link → campaign → channel).
- **Consent capture** on every form: separate, unticked marketing opt-in; lawful basis and wording stored with the record.
- **Attribution report:** per campaign and channel: clicks → leads → customers, cost per lead (where spend known), in credits and pounds.

## I. Customers department

### Unified inbox
Sources: inbound email (Resend), lead forms, hub page contact, social comments and DMs (where the provider supports it), Google Business reviews. Later: Zapier bridge for anything else.

Pipeline for each inbound item:
1. **Triage** with the smallest current Claude model: category, sentiment, urgency, language, vulnerability flag, spam.
2. **Policy lookup** for the category → auto-send / draft / escalate.
3. **Draft** with a stronger Claude model, using voice profile, situational tone, contact history, and company memory.
4. **Claims check** on the draft.
5. Send, queue for approval, or escalate. Everything audited.

### Contacts (CRM-lite)
Contact, company (optional), source, stage (lead / customer / lapsed), consent status per channel with evidence, notes, conversation timeline. Not a full CRM; export and Zapier sync for people who have one.

### Imported lists
On import Sol checks each contact's consent evidence. Contacts without a lawful basis for marketing are marked "service only" and excluded from campaigns. Sol raises a Stay legal task explaining why, rather than silently mailing them. PECR soft opt-in is only applied where the founder confirms the conditions are met.

### Feedback
Post-interaction and post-purchase feedback requests (opt-in). Sentiment trends and recurring themes summarised in the morning brief.

## J. Campaigns (Reach)

A campaign has: goal (e.g. 50 signups), audience, channels, budget (credits, and pounds if paid), dates, assets, tracked links, and success metric. Sol proposes a campaign plan → founder approves → Sol drafts assets → claims check and CAP Code check → founder approves → Sol schedules (Ayrshare for organic social, Resend for email) → results via link layer and provider analytics.

**Paid ads:** Sol plans and drafts ad copy, audiences and budgets, and creates tracked links. The founder launches the ad in the platform. Direct ad-spend control is a later phase (see PHASES) behind a feature flag.

Channel defaults depend on business type (B2B vs B2C), as already specified.

## K. Listening

Phase one: the company's own accounts (comments, mentions, DMs where available), Google Business reviews, and inbound email. Items go to the inbox pipeline. Sentiment and theme trends shown in Grow. Broad keyword listening across platforms is out of scope until we've costed API access.

## L. Run: process bots

Templates built on the Phase 8 scheduler and routines:
- lead follow-up sequence (respects consent)
- review request after purchase or booking
- invoice / payment reminders (via Stripe where connected)
- new-customer onboarding sequence
- lapsed-customer win-back (consent-checked)
- weekly performance summary

Each bot: trigger → conditions → actions → approval level → credit cap. "Agents propose, the executor acts" still applies.

## M. Model routing and cost

- Triage, classification, sentiment, spam: smallest current Claude model.
- Drafting replies and content: mid-tier model.
- Campaign strategy, voice analysis, weekly reviews: strongest model, or Batch API overnight.
- Extraction from transcripts (section P): mid-tier model; matching against existing tasks and contacts may use the strongest model for long meetings.
- Speech-to-text is a separate, non-Claude provider behind an interface (`transcription` provider, mock first), chosen for UK/EU data residency and speaker labels.
- Model IDs live in config, not code.
- Every inbound item has a known credit cost; companies set a daily cap for inbox processing. When the cap is hit, items queue and the founder is told.

## N. Compliance additions (UK first)

- UK GDPR: lawful basis per contact and purpose; data subject access and deletion handled as escalations with export tooling; retention periods per data type.
- PECR: consent or soft opt-in for electronic marketing; unsubscribe in every marketing message, honoured immediately.
- CAP Code / ASA: claims check on all promotional content; ads clearly identifiable.
- AI disclosure as above.
- Recording: no silent recording. Notetaker bots announce themselves by name and state that they are recording; phone calls carry a spoken notice. Transcripts linked to contacts are included in data-subject access and deletion handling.
- Platform terms: only use provider APIs within their terms; no scraping.

## O. New tables (indicative; propose exact schema before migrating)

`companies` gains `entry_path` (start_up | keep_going) and `stage`.
New: `voice_profiles`, `voice_examples`, `voice_edit_events`, `response_policies`, `hub_pages`, `tracked_links`, `link_clicks`, `forms`, `contacts`, `consents`, `leads`, `inbox_items`, `replies`, `campaigns`, `campaign_assets`, `feedback`, `bots`, `bot_runs`, `captures`, `transcripts`, `extracted_items`, `ideas`, `commitments`, `calendar_connections`, `call_sessions`.
RLS on all of them, scoped to company membership; mentors get read-only where already specified for cohorts. Mentors never get raw transcripts or audio (see section P).

## P. Capture from conversation

Sol listens to how founders actually work and turns it into a plan. This is a core part of the "AI cofounder" promise, not an add-on.

### Sources
- **Talk to Sol:** mic button on the Ask Sol bar (desktop and mobile). Hold to talk instead of type.
- **Debrief mode:** after a meeting, the founder talks for a minute or two about what happened. Sol asks up to two follow-up questions if owners or dates are missing. Mobile-first.
- **Transcript or recording upload:** paste a transcript, upload a recording, or import a transcript Zoom, Meet or Teams already produced.
- **Meeting notetaker (later):** connect a calendar; the founder chooses which meetings Sol joins. Use a multi-platform bot provider (e.g. Recall.ai) rather than building separate Zoom, Meet and Teams integrations. Default is off for every meeting; the founder opts in per meeting or per recurring series.
- **Calls (later):** a company phone number (e.g. Twilio) for sales and customer calls, with a spoken recording notice. Calls link to contacts and feed the Customers department.

### Pipeline
1. **Capture:** store the audio or text as a `capture` with source, participants (where known) and consent record.
2. **Transcribe:** speech-to-text with speaker labels, unless a platform transcript already exists. Audio deleted after successful transcription by default (company setting can keep it for a fixed period).
3. **Extract** (structured output) into `extracted_items` of these kinds:
   - decision
   - action (owner, due date, department, confidence)
   - idea
   - open question
   - commitment to someone outside the company ("I'll send the deck Friday")
   - customer feedback
   - memory fact
   - claim needing checking
4. **Match:** before creating anything, compare against existing tasks, roadmap items, ideas and contacts. Prefer updating an existing item to creating a duplicate. Link named people to contacts where confident.
5. **Review card:** one "From your meeting" (or "From your note") card listing the items, each with Accept, Edit or Dismiss, plus "Accept all". Nothing is created until accepted, unless the founder turns on auto-accept for their own voice notes.
6. **Route accepted items:**
   - Sol actions → queued jobs with credit cost shown
   - founder actions → founder's task list
   - actions for other team members → assigned and notified
   - commitments to outsiders → tracked as `commitments` with due dates; Sol drafts the follow-up in the company voice for approval
   - ideas → idea inbox; for Start up companies an idea becomes a hypothesis with an evidence plan, not a build task
   - customer feedback → Customers department and the contact's timeline
   - memory facts → proposed memory update (approval item, never silent)
   - claims → claims checker

### Rules
- Vague musings ("maybe TikTok at some point") become ideas, never tasks.
- An action with no clear owner or date is flagged in the card for the founder to complete; Sol does not guess.
- Low-confidence items are shown collapsed under "Possibly".
- Personal or sensitive content heard in a recording (health, money trouble, private matters) is not extracted into tasks or memory unless the founder files it explicitly.
- Every extraction and routing step is audited, with a link back to the transcript timestamp it came from.

### Privacy and consent
- No silent recording: bots announce themselves by name and say they are recording; calls carry a spoken notice.
- Participants' data in transcripts is personal data: retention follows company settings; transcripts linked to a contact are included in access and deletion requests.
- Cohort mentors see accepted actions and decisions the founder chooses to share, never raw transcripts or audio.

### Where it shows up
- Mic on the Ask Sol bar; Debrief button on mobile home.
- "From your meeting" review cards in Approvals.
- Commitments due today in the morning brief, e.g. "From yesterday: 2 meetings, 6 actions, 4 accepted, 1 promise due today".
- Meetings list (date, participants, items extracted, link to transcript).

### Cost
Transcription is charged per minute in credits, shown before upload for recordings. Extraction is charged per capture. Notetaker bot minutes have their own credit rate and count against the company's daily cap.
