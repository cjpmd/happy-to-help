# Crew phases (20–24)

Plan for `docs/CREW.md`, written 9 Nov 2026 for review. Nothing here is built yet. CREW.md is treated as a spec addition; its proposals and open questions are treated as assumptions and marked **Assumption** below. Decisions taken while writing this are D89–D98 in `docs/DECISIONS.md`.

The AUTONOMOUS-RUN hard limits apply to every phase: no real messages, no real money, no production deploys, and mock providers for every external service. Each phase runs on its own `phase-N-short-name` branch, starts with a plan for review, and ends with `docs/STATUS.md` updated.

---

## 1. What exists, what needs extending, what is new

Read against the code on `main` at `146e315` (Phases 0–19 merged).

### Already exists (reuse as is)

| CREW.md needs | What we have | Where |
|---|---|---|
| Run log with cost per run | `agent_runs` (task, `pillar`, model, status, `cost_usd`, `credits_charged`, `steps`, `usage`) | `20261022150300_agent_tables.sql`, `agent-service/src/runner.ts` |
| Estimate → reserve → run → settle, refunds | Credits engine, insert-only `credit_ledger`, `credit_config` (fx 0.75, markup 3, £0.01) | `20261026110000_credits_engine.sql`, D15–D22 |
| Per-job estimate and cap, model tier | `job_types` (estimate, cap, tier `routine` / `planning` / `strategy`, pillar) | `20261026130000_job_types_and_chat.sql`, `agent-service/src/jobs.ts` |
| Decision queue (Approve, Decline, Ask why) | `approvals` with typed actions, `decide_approval`, `ask_why`, NO-GO notes, the deterministic executor | `20261026140000_approvals_executor.sql`, `agent-service/src/executor/` |
| Evidence gates | `stage_gates`, `evidence_items`, the Evidence board and flight plan | Phase 1, `EvidenceBoard.tsx`, `FlightPlanArc.tsx` |
| Style (voice) | Versioned `voice_profiles`, `voice_examples`, `voice_edit_events` | Phase 11 |
| A fixed autonomy setting | `response_policies` (auto_send / draft / escalate per message category), refunds and legal threats locked to escalate by a check constraint, `checkAutoSend` in the executor | Phase 11, D36, D37, D67 |
| Skills | 13 skills in `agent-service/skills/` | Phases 3–17 |
| Tools, scoped per job | MCP tools in `agent-service/src/tools.ts`, allow-list per job in `jobs.ts`, `canUseTool` gate | `agent-service/src/gate.ts` |
| Triggers | Routines, the nightly loop, Auto Mode, the 07:00 brief, process bots, inbound events | Phase 8 (`scheduler.ts`), Phase 17 (`bots.ts`) |
| Overnight activity | HQ's **Overnight burn** card (`overnightBurn()` in `src/lib/hq.ts`) and the **morning brief** (`briefs`, `get_brief_facts`, `BriefCard.tsx`, `morning-brief` skill) | Phase 1, Phase 8 |
| Plans | `companies.plan` (`starter` / `founder` / `growth`), `PLANS` in `src/lib/credits.ts`, Stripe in test mode setting the plan | Phase 6 |
| Mentor oversight | `private.can_oversee_company`, read-only HQ, gate approval | Phase 1 |
| Company memory | Generated per run from the database, plus `memory_facts` | `agent-service/src/memory.ts`, Phase 12 |

### Needs extending

| Thing | Change | Phase |
|---|---|---|
| `agent_runs` | `agent_id` (FK to `agents`), backfilled | 20 |
| `agent_jobs` | `agent_id`, so a job can name the crew member that runs it | 20 |
| `job_types` | `default_agent` (catalogue key) | 20 |
| `activity_events` | `agent_id` and `outcome` (the outcome key it counts towards) | 21 |
| Overnight burn and the morning brief | Rebuilt into the five-part briefing; `get_brief_facts` returns structured facts per crew member | 22 |
| `approvals` | `agent_id`, `recommendation` (Sol's GO / EDIT / NO-GO with a reason), `autonomy_level`, a `simulated` status | 22, 23 |
| Response policy | Becomes the company-wide ceiling for reply actions; the ladder sits under it per agent and action type | 23 |
| `checkAutoSend` / executor | Generalised into `effectiveLevel()`: the existing automatic-reply path becomes L3 | 23 |
| `company_automation` | `crew_paused` (the kill switch) and `crisis_hold` | 23 |
| Billing events | Changing plan re-syncs which crew is unlocked | 24 |

### New

- `agent_catalogue` (the built-in crew, global), `agents` (per company), `agent_autonomy` (level per agent and action type), `agent_autonomy_events` (insert-only history), `autonomy_action_types` (action types with their ceilings), `crew_config` (hiring rate and promotion thresholds).
- A crew enum separate from `pillar` (see D90).
- The crew roster, crew cards and agent detail sheet; Sol as flight director on HQ.
- Simulated ("would have sent") items in GO / NO-GO.
- Sol's promotion proposals (a new `promote_agent` approval action), mentor holds.
- Locked crew cards with an upgrade prompt.

### Things CREW.md assumes that aren't true today

1. **There are no pillar subagents.** The worker runs one agent per job; `agent_runs.pillar` is a label from `job_types`. Phase 20 gives each job a crew member; it doesn't introduce SDK subagents (D89).
2. **The `pillar` enum has no Customers** (`build`, `grow`, `run`, `legal`, `raise`), and inbox jobs are labelled `run`. Crew grouping uses its own enum (D90).
3. **Most of the catalogue has no engine.** Of the Starter crew, Sol, Iris, Nova, Echo, Eve, Penny, Tilly, Clara and Mo map to work that exists today; Shield partly (document updates); Dex can be computed from `error_events` and failed runs; **Penn has nothing to do until an accounting integration exists**. Agents without an engine show "Standing by" with what they need, never invented numbers (D93).
4. **No numeric 90-day goal.** Onboarding stores the goal as text. The briefing headline uses the current gate's headline metric and countdown, plus the goal text (D95). CREW.md's `goals` table is out of scope here.
5. **Credit example.** "A $0.10 run charges about 24 credits": with the config values it's 0.10 × 0.75 × 3 ÷ 0.01 = 22.5, so 23 credits. No change needed; the config is right.
6. **"New agents start in draft mode"** conflicts with the start levels in the agent tables (many L2, some L3). Resolved in D96.

---

## Phase 20: Agent records

Branch `phase-20-agent-records`.

**Goal.** Every company has a named crew. Every run belongs to a crew member, existing runs included. Budget caps on the agent record are enforced, not decorative.

### Migrations

`20261110100000_crew_enums.sql` (enum additions in their own file, as before):
- `create type public.crew_pillar as enum ('hq', 'build', 'grow', 'customers', 'run', 'legal', 'raise', 'meta')`.
- `create type public.agent_status as enum ('active', 'standing_by', 'paused', 'locked')` (`locked` is used from Phase 24; adding it now avoids a second enum migration).

`20261110100100_agents.sql`:
- **`agent_catalogue`** (global, like `bot_templates`): `key` (pk, e.g. `nova`), `name`, `role`, `crew_pillar`, `summary`, `outcome_metric` jsonb (`{ key, label }`, key from a fixed list, see Phase 21), `style_ref` (prompt file under `agent-service/prompts/`), `tools` text[] (short names from `tools.ts`), `skills` text[], `model_tier` (the existing tier names), `triggers` jsonb, `job_types` text[] (the jobs it runs), `budget_per_run_credits`, `budget_per_month_credits`, `start_autonomy` jsonb (`{ action_type: level }`), `entry_paths`, `stages`, `min_plan` (data now, enforced in Phase 24), `minutes_per_outcome` (for Phase 22), `needs` (text shown when standing by, e.g. "Connect accounting software"), `sort`. Seeded with the full catalogue from CREW.md (Sol plus 45 agents). Readable by signed-in users; written only by the service role.
- **`agents`** (per company): `id`, `company_id`, `catalogue_key` (nullable for custom agents later; unique per company), and the company's own copy of identity, style ref, tools, skills, model tier, triggers, budget caps and `handoffs`, plus `status`, `created_at`, `updated_at`. Copied from the catalogue, so the founder can change caps without touching other companies.
- **`autonomy_action_types`**: `key` (`publish_post`, `send_email`, `reply_inbox`, `reply_public`, `ad_spend`, `launch_ad`, `publish_site`, `file_document`, `update_memory`, `update_voice`, `send_proposal`, `payment_chaser`, `internal_update`), `label`, `external` boolean, `max_level` (2 for money and legal), `public_statement` boolean (capped during a crisis hold). Seeded; service role writes.
- **`agent_autonomy`**: primary key (`agent_id`, `action_type`), `company_id`, `level` smallint 0–3, `mentor_hold_level` (null or 0–2), `held_by`, `held_at`, `updated_at`; check `level <= max_level` via trigger. Seeded from `start_autonomy` using the rule in D96. Phase 23 adds the behaviour; Phase 20 only stores it.
- **`agent_autonomy_events`**: insert-only (`id`, `agent_id`, `action_type`, `from_level`, `to_level`, `kind` in promote / demote / hold / release / seed, `reason`, `evidence` jsonb, `proposed_by_agent`, `decided_by`, `approval_id`, `created_at`). No update or delete grants for anyone, and a trigger refusing both, as with the ledger.
- `agent_runs.agent_id`, `agent_jobs.agent_id` (FK `on delete set null`, indexed), `job_types.default_agent`.
- `private.seed_crew(company)`: Sol plus the Starter crew (Sol, Iris, Nova, Echo, Eve, Penny, Tilly, Clara, Shield, Penn, Dex, Mo), idempotent. Called by an `after insert` trigger on `companies`, so both onboarding paths and `create_company` get it, and once for every existing company.
- **Backfill** of `agent_runs.agent_id` (D91): by the job's `job_type` → `job_types.default_agent`, then a fallback agent, then Sol. Runs with no job (seed data, chat function runs) go by task kind to Sol. Executor charging runs (`approvals.execution_run_id`) go to the agent that proposed the approval. Mapping:

  | Job type | Agent | Fallback if not in the company's crew |
  |---|---|---|
  | `chat`, `task`, `auto_mode`, `nightly`, `routine`, `morning_brief`, `document_update` | Sol | — |
  | `social_post`, `media_image`, `media_video` | Nova | — |
  | `voice_analysis`, `voice_update` | Iris | — |
  | `evidence_plan` | Eve | — |
  | `inbox_triage`, `inbox_draft`, `email_reply` | Tilly | — |
  | `compliance_review` | Clara | — |
  | `capture_process`, `commitment_followup` | Mira | Sol |
  | `campaign_plan`, `campaign_assets` | Lumen | Nova |
  | `investor_update` | Rhea | Sol |

- **RLS** with the existing helpers: `agents`, `agent_autonomy` and `agent_autonomy_events` readable with `private.can_read_company` (members and cohort mentors); no direct writes for `authenticated` (founder changes go through RPCs from Phase 21 on). `agent_catalogue` and `autonomy_action_types` readable by `authenticated`.

### Agent service

- New `agent-service/src/crew.ts`: resolve the agent for a job (`job.agent_id`, else `default_agent`, else fallback, else Sol); refuse a job for a paused or locked agent with a chat note and no charge.
- `runner.ts`: write `agent_runs.agent_id`; the reservation cap becomes `min(job cap, agent per-run cap, agent month cap − credits this month)`, so `maxBudgetUsd` still comes from the reservation (rule 3 unchanged). If the month cap is reached, no run is created and Sol says why (as D22 does for balance).
- `workspace.ts` / `memory.ts`: the generated CLAUDE.md names the crew member, its role and red lines from `style_ref`; skills are the union of the job's and the agent's.
- `agent-service/prompts/<key>.md` for the Starter crew only.

### Files likely to change

`supabase/migrations/` (two new), `supabase/seed.sql` (StudyBuddy and Harbour Bakes crews, a few runs per agent), `src/integrations/supabase/types.ts` (regenerated), `src/lib/types.ts`, `src/lib/demoDb.ts`, `src/lib/seed.ts`, `src/lib/live/load.ts`, `agent-service/src/{crew,runner,jobs,workspace,memory,scheduler,bots}.ts`, `agent-service/src/executor/executor.ts` (charging runs carry the proposer's agent), `supabase/functions/chat` (chat runs carry Sol), `agent-service/prompts/` (new), `supabase/tests/database/02_read_access.test.sql`, new `24_agents.test.sql`, `agent-service/test/crew.test.ts`.

### Acceptance criteria

- After `supabase db reset`, every company has Sol plus 11 Starter agents, each with `agent_autonomy` rows; creating a company (either path) seeds the same; running the seed twice adds nothing.
- Every existing `agent_runs` row has an `agent_id`, following the mapping table; a pgTAP test checks the mapping for each job type, including the fallbacks.
- New runs from the worker, the chat function and the executor record `agent_id`.
- A run never reserves more than the agent's per-run cap; a job for an agent at its month cap creates no run, charges nothing and posts a chat note. Tests for both, plus the existing credit tests still passing unchanged.
- `agent_autonomy_events` refuses update and delete for every role, service role included.
- RLS: a member reads their company's crew; a non-member can't; a cohort mentor can read; no app user can write. Added to the read-access matrix.
- No visible UI change apart from the agent's name on LOG rows.

---

## Phase 21: Crew roster and cards

Branch `phase-21-crew-roster`.

**Goal.** The founder sees a company at work: a crew per pillar in the Mission HQ (Option D) style, each card with its result, and Sol as flight director.

### Migrations

`20261111100000_crew_outcomes.sql`:
- `activity_events.agent_id` and `activity_events.outcome` (text, from the outcome keys below); backfill `agent_id` from `run_id`.
- Outcome keys, a fixed list so no metric runs dynamic SQL: `posts_published` (Echo, from executed `publish_post`), `pieces_drafted` (Nova), `brand_guide_approved` (Iris, adopted voice), `assumptions_tested` (Eve, evidence items moved), `leads_captured` (Penny, `submit_lead`), `messages_handled` (Tilly, triaged without the founder), `deadlines_tracked` (Clara), `policies_current` (Shield), `issues_caught` (Dex, failed runs and integration errors flagged), `facts_added` (Mo, approved `memory_facts`), `runs_completed` (Sol and anyone without a better metric). The executor, tools and RPCs that cause each outcome write the activity event.
- `crew_stats(p_company)` (security definer, `can_read_company`): per agent its outcome count (all time and this month), status (working = a running run; waiting for you = a pending approval from its runs; paused; standing by; idle), last run, credits this month (sum of its runs' `credits_charged`) and month cap.
- `update_agent_settings(p_agent, p_changes)` (founders only): per-run and per-month caps (never above the catalogue's), pause and resume. Every change logged in `activity_events`.

### App

- **`/crew`**: the roster grouped by pillar in the sidebar's order (Build, Grow, Customers, Run, Stay legal, Raise), then "Mission support" for the meta crew. Added to the main nav after GO / NO-GO.
- **Department pages** (`build`, `grow`, `customers`, `run`, `legal`, `raise`) show that pillar's crew as a strip at the top.
- **Crew card** (`--surface` card, console tile on `--soft`): monogram avatar, NAME · ROLE (Barlow uppercase), the outcome as a big number (Barlow Semi Condensed, tabular) with its label ("26 deals scored"), level badge (L0–L3, outlined; amber when waiting for you), status dot (green working, muted idle, amber waiting), last run ("2 h ago"), credits this month against the cap as a thin bar. Standing-by agents say what they need instead of numbers. No new colours: green only for done or verified, amber only for "needs you".
- **Agent sheet** (click a card): recent runs and actions, each with its "Why?" (from the run's steps and the existing `Why` component); autonomy per action type, read-only until Phase 23; the founder's caps and pause.
- **Sol as flight director on HQ**: the mission header's Sol line reads "SOL · FLIGHT DIRECTOR" with the crew on console ("3 of 12 crew working · 2 waiting for you") linking to `/crew`. A compact **Crew** card is added to the HQ card choices but not to the default six, so `npm run check:fit` still passes at 1440×900 (**Assumption**: Overnight burn stays the default until Phase 22 replaces it).
- **Mentors** see the roster read-only on `cohort.$companyId`.
- Demo mode has the same roster from the demo store.

### Files likely to change

`supabase/migrations/` (one new), `src/routes/_app/crew.tsx` (new), `src/components/mission/Crew.tsx` (new: roster, card, sheet), `src/lib/crew.ts` (new: status, formatting, grouping; pure), `AppShell.tsx` (nav), `MissionHeader.tsx`, `HQCards.tsx`, `CompanyHQ.tsx`, `src/lib/hq.ts` (card list), `WorkspacePages.tsx` and the department routes, `src/routes/_app/cohort.$companyId.tsx`, `src/lib/storeContext.ts`, `src/lib/store.tsx`, `src/lib/live/load.ts` (load and Realtime for `agents`), `src/lib/demoDb.ts`, `agent-service/src/executor/executor.ts` and `tools.ts` (outcome events), the `submit_lead` and `adopt_voice_profile` RPCs (outcome events), tests `src/test/crew.test.ts`, `25_crew_stats.test.sql`, the live e2e test.

### Acceptance criteria

- `/crew` lists every unlocked crew member for the company, grouped by pillar, with numbers matching `crew_stats`.
- Approving a post in the demo and in live mode increases Echo's "posts published" by one once the executor has carried it out (e2e).
- Every action in the agent sheet has a "Why?".
- Standing-by agents show their `needs` text and no figures.
- Founders can change caps (never above the catalogue's) and pause; mentors and viewers can't (pgTAP).
- Keyboard reachable, readable by screen reader (cards are list items with a text summary), one column below 700px, light and dark themes.
- `npm run check:fit` passes; lint adds no warnings.

---

## Phase 22: Morning briefing

Branch `phase-22-morning-briefing`.

**Goal.** HQ's Overnight activity becomes the hero briefing: headline, done overnight, needs you, watch, spend.

### Migrations

`20261112100000_briefing.sql`:
- **`crew_config`** (one row, like `credit_config`; service role writes, signed-in users read): `hiring_rate_gbp_per_hour` (default **£15.00**, an **Assumption** for the owner to confirm), `hiring_role_label` (default "an assistant"), `brief_window_start` (default 19:00 UK). Per-agent `minutes_per_outcome` stays in the catalogue (first guesses, to be replaced with pilot measurements).
- `approvals.agent_id`, `approvals.recommendation` (`go` / `edit` / `no_go`) and `approvals.recommendation_reason` (≤ 280 characters), written when an agent proposes.
- `get_brief_facts` returns version 2 (`facts.version = 2`):
  1. **Headline**: stage, the current gate's headline metric and target, days to the gate, the 90-day goal text, days since start.
  2. **Done overnight**: per crew member, the outcomes and runs since the window start (19:00 the previous day, or the last brief if later), with credits.
  3. **Needs you**: pending approvals oldest first, each with its agent, recommendation and reason (simulated items from Phase 23 are listed separately).
  4. **Watch**: deterministic rules, each with a reason: statutory compliance items overdue or due within 14 days; balance under 20%; an agent at 80% of its month cap; failed runs overnight; a post well below the company's 7-day median engagement; negative reviews or a sentiment drop (Phase 16 themes); MRR down week on week; promises due today (Phase 12). Cash is limited to credits and MRR until there is an accounting integration.
  5. **Spend**: credits used overnight and month to date (from `credit_ledger`, the source of truth, not `agent_runs`), forecast to month end (month to date + the daily average of the last 7 days × days left, plus enabled routines' estimates), shown in credits and £ at the company's plan price per credit; and the **equivalent hiring cost**: Σ (outcomes this month × `minutes_per_outcome`) ÷ 60 × `hiring_rate_gbp_per_hour`, as "≈ 14 hours of an assistant's time (≈ £210)".
- `save_brief` stores the structured facts and the text.

### App and agent service

- `BriefCard.tsx` rebuilt as **Morning briefing**, the hero card at the top of HQ until dismissed; after dismissal the grid's Overnight burn card shows the "Done overnight" lines by crew member. Each section has an empty state ("Nothing overnight: the crew was off").
- The equivalent cost line has a "How we work this out" popover with the rate and minutes used, and says it is an estimate. It's for the founder only, never public-facing text.
- `morning-brief` skill and `briefText()` follow the five parts; the brief in chat is the same text.
- Propose tools take an optional recommendation; the mock runtime writes a rule-based one (claims flagged → EDIT, otherwise GO).

### Files likely to change

`supabase/migrations/` (one new), `src/lib/brief.ts`, `src/components/mission/BriefCard.tsx`, `HQCards.tsx` (`OvernightBurnCard`), `src/lib/hq.ts` (`overnightBurn`), `CompanyHQ.tsx`, `ApprovalCard.tsx` (shows the recommendation), `src/lib/demoDb.ts`, `agent-service/skills/morning-brief/SKILL.md`, `agent-service/src/{scheduler,tools}.ts`, `agent-service/src/runtime/mock.ts`, tests `src/test/brief.test.ts` (new), `src/test/hq.test.ts`, `16_scheduler.test.sql` or new `26_briefing.test.sql`, `agent-service/test/scheduler.test.ts`.

### Acceptance criteria

- The 07:00 brief stores version-2 facts with all five parts in order; the HQ card and the chat message show them.
- Spend figures reconcile with `credit_ledger` for the same window (test with a seeded ledger, including a refund).
- The forecast and equivalent-cost formulas have unit tests; changing `hiring_rate_gbp_per_hour` in `crew_config` changes the figure without a deploy.
- A Starter company's "Done overnight" lists only its own crew; standing-by agents are omitted.
- Every "Needs you" item shows its agent and recommendation; GO / EDIT / WHY work from the card.
- Watch rules each have a test that triggers and one that doesn't.
- Dates as "9 Nov 2026", £ with two decimals only where pence matter.

---

## Phase 23: Autonomy ladder and simulation

Branch `phase-23-autonomy`.

**Goal.** Trust grows per agent and per action type, with evidence, without weakening any existing rule.

### The ladder

| Level | What the agent's proposal becomes | Executor |
|---|---|---|
| L0 Simulate | An approval with status `simulated`: shown in GO / NO-GO under "Would have sent", with Looks right / I'd change it / Wrong, and "Send for real" (which creates a normal pending approval) | Never executes a simulated row (database constraint and executor check) |
| L1 Draft | A pending approval marked `draft`: no one-tap GO on cards or the briefing; the founder opens the preview and sends (**Assumption**: our approvals already hold the draft, so "founder sends" means review-then-send rather than a separate draft store) | As today, after the founder's send |
| L2 Approve | A pending approval, as today (Approve, Decline, Ask why) | As today |
| L3 Act and report | An approval inserted approved and queued by the system (the existing `auto_send` path, generalised), reported in the briefing's "Done" | Re-checks the effective level, ceilings, holds and every existing rule at execution time; if anything no longer allows it, it goes back to pending with the reason (as D67) |

**Agents still only propose; the executor acts** (CLAUDE.md rule 4). L3 is the executor acting on a standing permission, not the agent calling an external API.

**Effective level** = the lowest of: the agent's level for that action type; the action type's `max_level`; the mentor hold; for customer replies, the response policy for the category (`auto_send` → up to L3, `draft` → up to L2, `escalate` → nothing is drafted); and L2 for public statements while a crisis hold is on. Existing hard rules stay in force at every level: refunds, legal threats, triage escalation flags, unverified claims, consent and caps (D30, D37, D55, D70, D75, D87).

**Ceilings.** Money (`ad_spend`, `launch_ad`, `payment_chaser`, `send_proposal`), legal (`file_document`) and `reply_public` during a crisis hold are capped at L2 permanently, by a constraint on `agent_autonomy` and again in the executor. **Assumption:** "crisis" is a company `crisis_hold` switch the founder can turn on at once and Sol can propose (an approval) when complaints, negative reviews or a legal threat spike; CREW.md doesn't define it.

**Promotions.** A daily deterministic check in the scheduler (no model call) proposes a `promote_agent` approval when the thresholds in `crew_config` are met:
- L0 → L1: at least 7 days at L0 and 5 simulated items reviewed, none marked Wrong in the last 7 days.
- L1 → L2: 20 drafts approved, fewer than 15% materially edited (from `voice_edit_events`).
- L2 → L3: 50 approvals with no declines in 30 days, and only where `max_level` is 3.

Only a founder can GO a promotion (not a mentor; extends D72). A founder can demote at any time with no approval. A NO-GO, a "Wrong", or an executor block on an L3 action drops that action type to L2 automatically. When an agent's prompt or skills change, any L3 action type drops to L2 and Sol proposes the promotion again (D97). Every change is an `agent_autonomy_events` row.

**Mentor holds.** A cohort mentor can hold an agent (one action type or all) at L2 or below, with a reason. The founder sees a padlock ("HELD AT L2 BY YOUR MENTOR") and can't promote above it; only a mentor of that cohort (or an admin) lifts it (D98).

**Kill switch** (from CREW.md's "added for small businesses"; drop it if you'd rather keep this phase narrow): `company_automation.crew_paused` stops the scheduler and claiming for every agent and leaves L3 items pending. One tap on HQ, founders only, no approval needed (reducing activity, like pausing an ad in D87).

### Migrations

`20261113100000_autonomy_enums.sql`: `approval_status` adds `simulated`; `approval_action` adds `promote_agent` and `crisis_hold`.

`20261113100100_autonomy.sql`:
- `approvals.autonomy_level` and `approvals.mode` (`simulated` / `draft` / `approve` / `auto`); the pending/decided constraint updated so simulated rows have no decision time; a check that simulated rows never leave `execution_status = 'not_started'`; `decide_approval` refuses simulated rows.
- `review_simulated(p_approval, p_verdict, p_edited_payload)` (looks right / would change / wrong; an edit is stored as a voice edit event) and `send_simulated_for_real(p_approval)` (creates a pending L2 approval).
- `set_agent_level` (founder; downward always, upward only through an approved `promote_agent`), `hold_agent` and `release_agent_hold` (cohort mentors), `set_crew_paused`, `set_crisis_hold` (founders).
- `crew_config` gains the promotion thresholds.
- Seeding rule for new agents per D96.

### Agent service

- `agent-service/src/executor/rules.ts`: `effectiveLevel()` (pure, shared with the tools), used when proposing (`tools.ts` chooses simulated / draft / pending / auto) and again at execution (`executor.ts`). `checkAutoSend` becomes one input to it, not a separate path.
- `agent-service/src/autonomy.ts` (new): the daily promotion check and automatic demotions, run by `scheduler.ts`.
- `scheduler.ts` and the claim loop respect `crew_paused`.

### App

GO / NO-GO gains a "Would have sent" tab; the agent sheet's autonomy table becomes editable (demote, review a promotion); the crew card's level badge shows holds; the voice and policy screen explains that the policy is the ceiling for replies; HQ gets the pause-all control; the cohort view gets "Hold at L2".

### Files likely to change

`supabase/migrations/` (two new), `agent-service/src/executor/{rules,executor}.ts`, `agent-service/src/{tools,autonomy,scheduler,worker}.ts`, `src/routes/_app/approvals.tsx`, `ApprovalCard.tsx`, `Crew.tsx`, `VoicePolicy.tsx`, `src/lib/voicePolicy.ts`, `CompanyHQ.tsx`, `src/routes/_app/cohort.$companyId.tsx`, `src/lib/crew.ts`, `src/lib/demoDb.ts`, tests `agent-service/test/autonomy.test.ts` (new), `agent-service/test/executor.test.ts`, `rules` tests, new `27_autonomy.test.sql`, `src/test/crew.test.ts`, `src/test/approvals.test.ts`.

### Acceptance criteria

- At L0 nothing is sent: a simulated approval can't be decided or executed (pgTAP, executor test), and "Send for real" creates a pending approval that still needs a GO.
- Money, legal and crisis-public actions can't be stored above L2 and aren't carried out without a GO even if a row were tampered with (executor test with a forced L3 row).
- An escalate category in the response policy is never drafted or sent at any level; refunds and legal threats still always escalate; every existing executor and voice test passes unchanged.
- Promotions are only proposed when thresholds are met (tests at the boundaries), only founders can GO them, and every change writes an event.
- A mentor hold stops promotion above L2; the founder can't lift it; the mentor can.
- `crew_paused` stops new runs and leaves L3 items pending; un-pausing resumes them.
- Existing companies keep today's behaviour after the migration: external actions at L2, the inbox's existing auto-send categories at L3 (D96).

---

## Phase 24: Plan unlocks

Branch `phase-24-plan-unlocks`.

**Goal.** The plan decides which crew is on duty; locked crew is visible with a way to unlock it.

### Rules (from CREW.md's credits table; the crew per plan is a proposal, so it lives in data)

- Starter: Sol, Iris, Nova, Echo (one social channel), Eve, Penny, Tilly, Clara, Shield, Penn, Dex, Mo.
- Founder: Starter plus the Build crew (Arlo, Kit, Tess, Hook), Forge, Scout, Sage, Quill, Hunter, Rex, Dev, Mira, Harper, Hal, Cass, Flo, Gus, Ada, Otto.
- Growth: everything, including pillar leads (custom agents and MCP access later).
- Launch Pack: the Build crew while the company is in the Build stage and has Launch Pack credits left (**Assumption**: unlocks end when those credits are used or expire).
- Cohort licence: the Founder crew.
- **Assumption:** stage availability ("Crew active" per stage in CREW.md) is shown on the card ("Joins at Build phase") and the scheduler doesn't trigger an agent before its stage, but a founder can still ask for its work.

### Migrations

`20261114100000_plan_unlocks.sql`:
- `agent_catalogue.min_plan` is now enforced; `unlock_via` (`launch_pack`, `cohort`) and `limits` jsonb (e.g. `{ "social_channels": 1 }` for Echo on Starter).
- `private.sync_crew(company)`: creates newly unlocked agents (with D96 start levels) and sets `locked` on agents the plan no longer covers, keeping their history. Called from `apply_billing_event` when the plan changes, from `join_cohort`, when a Launch Pack is granted or used up, and once for every company.
- `enqueue_job` and `claim_agent_job` refuse work for locked agents with a clear reason.
- `crew_catalogue(p_company)`: unlocked and locked agents together, with the plan that unlocks each.

### App

- Locked agents appear on `/crew` and on department strips, greyed with a padlock, their role and the outcome they'd own, and "UNLOCK WITH FOUNDER · £79/MONTH" opening the existing billing checkout (mock in demo, Stripe test mode in live).
- Billing's plan comparison lists the crew each plan unlocks.
- When Sol spots a gap (a goal with no crew member) or the founder asks for a locked agent's work, Sol replies with what it would cost and the upgrade, and queues nothing.

### Files likely to change

`supabase/migrations/` (one new), the `apply_billing_event`, `join_cohort`, `enqueue_job` and `claim_agent_job` functions (redefined in the migration), `supabase/functions/_shared/billing.ts` (if plan-change handling needs a new action), `src/lib/credits.ts` (crew per plan for display, read from the catalogue), `src/routes/_app/billing.tsx`, `Crew.tsx`, `src/lib/crew.ts`, `src/lib/billingClient.ts`, `src/lib/demoDb.ts`, `agent-service/src/{crew,scheduler}.ts`, tests `src/test/billing.test.ts`, `src/test/crew.test.ts`, new `28_plan_unlocks.test.sql`, `agent-service/test/crew.test.ts`, the live e2e test (upgrade in mock mode unlocks Rex).

### Acceptance criteria

- A Starter company has exactly the Starter crew active and everything else visible as locked.
- Upgrading (mock checkout, or a replayed test webhook) unlocks the plan's crew at once; downgrading locks them without deleting runs, outcomes or autonomy history; upgrading again restores their previous levels.
- No job runs for a locked agent, whatever enqueues it (pgTAP and worker test).
- The Launch Pack unlocks the Build crew only in the Build stage and only while its credits last; a cohort company gets the Founder crew.
- Echo on Starter publishes to one channel only (executor check).
- Changing which plan unlocks an agent is a data change (catalogue row), with no code change.
- No real money moves: mock checkout or Stripe test mode only.

---

## Where these phases go

There is **no autonomous run in progress**: the run finished on 27 Oct 2026 with Phases 0–19 merged (PR #3 into `main`). What remains is the owner's HANDOFF list (production, real runtime, providers). So the question is where Phases 20–24 sit relative to that, and to CREW.md's own step 5 (a paid Starter-crew pilot).

**Recommendation: build 20–24 next, in this order, before the pilot, and before any real sending provider is switched on (HANDOFF 6), while the owner works through HANDOFF 2 and 1 in parallel.**

- None of them needs a key or an account, so they don't wait on the owner, and the owner's production and runtime steps don't wait on them.
- **Phase 23 must land before real email or social is switched on.** It adds a second route to automatic execution (L3) and gives the pilot a safe trial mode (L0); switching real providers on first and adding auto-execution afterwards is the wrong way round.
- **Phase 20 must land before the pilot.** CREW.md's pilot exists to measure real credits per agent; without `agent_runs.agent_id` there's nothing to measure per agent, and the per-run figures in CREW.md stay guesses.
- Phases 21 and 22 are what the pilot founders see and what sells the plan; 24 depends on 21's cards and is only needed once pilot pricing is decided, so it could slip until after the pilot starts if time is short.
- HANDOFF 12 (paid ads) stays last, as before.

---

## Open questions for you

1. Hourly rate for the equivalent hiring cost: £15.00 is a placeholder. One rate, or one per role (marketing assistant, bookkeeper, SDR)?
2. Crisis hold: is a founder switch, with Sol able to propose it, the right reading of "public statements in a crisis"?
3. Mentor holds: should a founder be able to lift a mentor's hold (D98 says no)?
4. Start levels for new companies (D96): keep everything external at L2, or start customer-facing actions at L0 for the first week?
5. Should Overnight burn stay a separate grid card once the briefing exists, or be replaced by a Crew card?
6. CREW.md's open question stands: does a full Growth crew fit in 12,000 credits a month? Phase 24 keeps the mapping in data so it can change after the pilot.
