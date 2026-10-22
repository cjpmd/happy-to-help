# Product spec

The source of truth for what the platform should do. The UI was started in Lovable from parts A and B; parts C–E describe the engine Claude Code builds.

## Product in one line
Early-stage founders (especially student founders) start up and keep going with an AI cofounder, Sol, who works overnight on marketing, admin, compliance and simple website builds, with every external action approved by the founder and overseen by mentors.

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
