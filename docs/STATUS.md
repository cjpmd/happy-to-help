# Status

Phase 0 audit, 22 Oct 2026, at commit `aad3f26`. Updated 23 Oct 2026 during Phase 1 group 1a-design.

## Phase 1 progress

| Group | Status |
|---|---|
| 1a. Repo hygiene | **Done.** npm only (`package-lock.json` committed; `bun.lock` and `bunfig.toml` removed). Product name in `src/lib/brand.ts` (`PRODUCT_NAME = "Gumption"`). Prettier run over `src/` and root configs in its own commit (`c3b4531`). Lint: 0 errors. |
| 1a-design. Mission HQ design | **In progress.** Runs between 1a and 1b, from `docs/DESIGN.md` and `docs/design/hq-reference.dc.html`. Steps 1 to 3 done (see below). Steps 4 and 5 to do: the HQ grid, then every other screen plus a light/dark setting. |
| 1b. Supabase schema, auth, RLS, seed | **In progress.** Migrations, RLS, pgTAP tests and seed are written and pass locally (see below). Still to do: apply them to the staging project, generate `src/integrations/supabase/types.ts`, and commit `.env`. Waiting on the project URL and anon key. |
| 1c. Data layer on Supabase | Not started |
| 1d. Server-side writes | Not started |
| 1e. Bug fixes | Not started |

### Design (group 1a-design)

- **Step 1, tokens and theme: done.** `src/styles.css` holds the DESIGN.md tokens on `:root` (light, default) and `.dark`, and the shadcn variables are aliases of them. DESIGN.md's `--muted` (secondary text) is `--muted-ink` in CSS, because shadcn already uses `--muted` for the soft background; in classes it is `text-muted-foreground`. Utilities: `label-caps` (Barlow, uppercase, tracked), `display-num` (Barlow Semi Condensed, tabular), `bg-hero`, `shadow-tile`, `shadow-card`, `shadow-hero`, and radii `rounded-pill`, `rounded-tile`, `rounded-card`, `rounded-hero`. Fonts are self-hosted from `@fontsource` (latin subset).
- **Colour rules:** green (`go`) = done or verified, amber (`hold`) = needs the founder, and one muted red only for errors and destructive confirmations. Everything else is monochrome. Declined, invalidated and passed statuses are now neutral; overdue and stalled are amber.
- **Renamed:** `components/dawn/` is now `components/mission/`. The `dawn-hq-layouts` storage key is now `gumption-hq-layouts` (the old key is read once, then removed). The `bg-dawn` gradient is gone.
- **Step 2, app shell: done.**
  - `AppShell.tsx`: 236px sidebar with the GUMPTION wordmark, mission switcher, HOME, FLIGHT PLAN, GO / NO-GO (amber count), TELEMETRY, LOG and DEPARTMENTS, a fuel box (balance, bar, TOP UP to Billing) and an account menu on the avatar (Team, Ownership, Settings, Billing, demo view-as, theme, sign out). Mentors get a COHORT group at the top. Below 700px it becomes a top bar with a sheet menu (breakpoints `tab:` 700px and `desk:` 1100px).
  - `MissionHeader.tsx`: greeting and mission, phase title, Sol's status line, the next-gate countdown, the gate's headline metric and AUTO MODE with its estimate. `AskSolBar.tsx` sends to Sol and opens the conversation in a side sheet. Auto Mode now lives in `AutoModeDialog.tsx`.
  - Sol's orange image is replaced by an SVG mark (the flight plan's "now" marker) with a status dot: green working, muted idle, amber waiting for you.
  - `src/lib/mission.ts` (tested): mission day, gate days and names, current gate and its metric, Sol's status, the UK greeting. The mock store now has `companies.started_at` and `stage_gates.target_date`. The demo clock is the seed's fixed `NOW` (21 Oct 2026), so StudyBuddy shows T+30 and the Launch gate in 12 days.
  - Overdue **statutory** compliance items (confirmation statement, accounts, tax, ICO fee) are red; other overdue items are amber (`src/lib/compliance.ts`, tested).
  - **Temporary until step 5:** `/flight-plan` and `/telemetry` are placeholders, and Evidence, Routines, Email, Media, Ads and Documents are not in the sidebar yet (still reachable by URL and from HQ widgets). The old Sol chat widget is still on HQ until step 4 rebuilds the grid.
- **Gates (after step 2 review):** one gate per stage transition, named like a launch call for the stage it opens: GO FOR EVIDENCE (day 8), GO FOR BUILD (18), GO FOR LAUNCH (42), GO FOR GROWTH (80). The mock store had a fifth gate on the Grow stage (day 120) with nothing after it; it's removed. Onboarding now creates the default gates for every new company (`defaultGates()` in `src/lib/mission.ts`).
- **Step 3, `FlightPlanArc`: done.** Maths in `src/lib/flightPlan.ts` (pure, tested): geometry, visibility and fade, tiers, no-overlap labels, pan limits, readout, screen-reader summary, parallax and the seeded star field. `src/components/mission/FlightPlanArc.tsx`: four parallax layers, Earlier / Now / Later, swipe or drag over 40px, eased moves, pointer parallax, fixed readout, `prefers-reduced-motion` (no parallax, instant pans), an `aria-label` summary, a visually hidden milestone list and focusable markers calling `onSelectMilestone`. Shown on `/flight-plan` for now, with a simple detail panel for the selected milestone; step 4 puts it on HQ.
  - **Milestones** come from `buildMilestones()`: mission start, the gates and key tasks. Tasks gained `key`, `stage` and `completed_at`; StudyBuddy has seven key tasks (interviews, product spec, waitlist page, daily quiz, Stripe, first paying customer, 50 paying). Seeded done tasks keep "done" only if they have a completion date (the rest are still shown as in progress, as before). Other companies show only their start and gates until they have key tasks.
  - **Narrow screens** (not covered by DESIGN.md): below 750px the arc keeps a readable scale and shows the middle of the arc in a taller box, with the look-ahead shrunk so now stays on screen.
- **Agreed layout decisions** for steps 2 to 5: no third sidebar group. Evidence lives in Flight Plan (selected milestone plus an Evidence tab), Routines in LOG (Past and Scheduled tabs), Email and Documents in Run, Media and Ads in Grow, department pages show their relevant documents, and Team, Ownership, Settings and Billing go in an account menu on the avatar by the fuel box. Mentors get a COHORT group at the top. Old routes redirect. New `/flight-plan` and `/telemetry` pages. HQ keeps customisation for the six grid cards only.
- **For 1b:** add `tasks.actor` (sol / founder / mentor) and switch the flight plan task badges to it (until then they are derived from status and proof). Add a target or completed date for gates and key tasks (or a view giving each milestone's day from the company start) for `FlightPlanArc`, plus `companies.started_at`. Add `compliance_items.statutory`. Add `tasks.key`, `tasks.stage` and `tasks.completed_at`, and StudyBuddy's key tasks to `supabase/seed.sql`. `supabase/seed.sql` also creates a fifth gate on the Grow stage for every company: drop it (and update any pgTAP counts) so there are four gates, one per transition. Onboarding should create the company's stage gates (it doesn't today, so a new company's header shows no countdown).

### Database (group 1b)

- **Migrations** in `supabase/migrations/`: 34 tables covering every SPEC part A table, `agent_jobs`, and the part B workspace data (documents and versions, routines, media, email, ads, preferences, HQ layouts, sharing, site versions, grants, contacts, gate comments, team invites, cohort mentors).
- **Roles are per company** (`company_members.role`: founder, teammate, mentor, viewer), plus cohort mentors (`cohort_mentors`) and platform admins (`profiles.is_admin`). The rules are summarised at the top of `20261022150100_access_rules.sql`.
- **RLS on every table.** App users can only read agent output (jobs, runs, approvals, activity, chat), the ledger, posts, metrics, documents, media, email and ads. Founders and teammates edit evidence, tasks (not status or proof), compliance items, investors, grants, contacts and routines. Founders edit the company profile (not stage or plan), invite people and control public sharing. Anonymous visitors can only call `get_public_progress(slug)`.
- **Ledger:** insert-only for everyone (a trigger blocks update, delete and truncate even for the service role), inserted by the service role only. `company_credit_balance` shows `balance` and `held`.
- **Tests:** 694 pgTAP checks in `supabase/tests/database/`. Run them with `scripts/db/test-local.sh` (local Postgres 16 with pgTAP) or `supabase test db`.
- **Seed:** `supabase/seed.sql`, fictional, dates relative to when it runs. Demo accounts have no password.

Everything below the checks table describes the app as it still works today: the in-memory mock store. Items fixed since the audit are marked **Fixed**.

## Summary

- **What Lovable built is a clickable front-end demo, and nothing more.** Every screen in SPEC part A and most of part B exists and renders. All data lives in one in-memory React store (`src/lib/store.tsx`), seeded from `src/lib/seed.ts`, and resets on refresh. The only thing that persists is the HQ widget layout, in `localStorage`.
- **There is no backend.** There is no Supabase project for this app (the account has only `VirtualPMO` and `ArbEdge`), no `supabase/` folder, no migrations, no `src/integrations/supabase/` client, no auth, no RLS, no Edge Functions and no `agent-service/`. The tables exist only as TypeScript interfaces (`src/lib/types.ts`, `src/lib/workspace.ts`).
- **The agent is mocked.** `src/lib/agentClient.ts` returns canned replies after a delay. "Work" is simulated with `simulateWork()`, and fails only if the title contains "fail".
- **No secrets are in the frontend or the repo.** The code reads no environment variables, so there is no API key, service-role key or Stripe key anywhere. The only key-shaped text is the placeholder `sk-ant-...` in `docs/prototype/README.md`.
- **Authorisation is the biggest gap, not leaked secrets.** Without auth or RLS, any visitor can use a "view as" switcher to become any role, and nothing checks roles or membership.
- **Checks:**

  | Check | Result |
  |---|---|
  | `tsc --noEmit` | Passes |
  | `vite build` | Passes |
  | `vitest run` | Passes on a clean `npm ci`: 22 tests. (At the audit it failed because `@testing-library/dom` was missing.) |
  | `npm run lint` | 0 errors, 14 fast-refresh warnings. (At the audit: 851 errors, mostly Prettier.) |

Key: **done** works as the spec describes (against mock data) · **partial** exists but is incomplete or hard-coded · **mocked** looks right but nothing real happens behind it · **missing** is not there.

---

## SPEC part A: Foundation

### Screens

| # | Item | Status | Notes and files |
|---|---|---|---|
| A1 | Sign-in (magic link) | **mocked** | `src/routes/index.tsx`. The form just shows "Check your inbox" and a "Continue to demo" button. There is no auth or session, and Sign out is a link to `/`. |
| A1 | Onboarding wizard | **partial** | `src/routes/onboarding.tsx`. It asks for name, idea, target customer, B2B/B2C, stage, sector, 90-day goal, website and cohort code. **Stage, website and cohort code are collected and then thrown away**: every new company starts at `idea` on the Starter plan, and the cohort code joins nothing. |
| A2 | HQ: stage bar with gate progress | **done** | `StageBar.tsx` |
| A2 | HQ: live preview iframe (Live/Preview, desktop/mobile) | **done (stand-in site)** | `CompanyHQ.tsx` `SitePreview`. It frames `/site/$slug` (`src/routes/site.$slug.tsx`), a fake site whose feature cards ("10 minutes a day", "Learns your weak spots", "Built for SQA") are StudyBuddy copy shown for **every** company. |
| A2 | HQ: Sol chat | **mocked** | `SolChat.tsx`. Replies come from keyword matching in `agentClient.sendChatMessage`. 10 credits are charged before the reply and never refunded. |
| A2 | HQ: "Needs your approval" cards | **done** | `ApprovalCard.tsx`: Approve, Decline and Ask why (Ask why posts the stored `reason` into chat). |
| A2 | HQ: overnight activity | **done** | From `activity_events` |
| A2 | HQ: metrics strip | **partial** | `MetricsStrip` reads `metrics_daily` straight from `seed.ts`, not from the store, so new companies always show zeros. |
| A3 | Approvals queue (exact previews, credits, decisions recorded) | **done** | `src/routes/_app/approvals.tsx`. See bugs B1 to B3. |
| A4 | Activity and runs timeline | **done** | `src/routes/_app/activity.tsx`: expandable steps, model, tokens and cost, and an "Auto-refunded" pill on failed runs. |
| A5 | Build: site versions, changes awaiting approval | **partial** | `build.tsx`. Versions are made up from succeeded build runs plus a hard-coded "v0.8 Quiz engine" row that every company sees. |
| A5 | Grow: content calendar, results per post | **partial** | `grow.tsx`. It is a status kanban, not a calendar. Posts come from `seed.social_posts` (outside the store) merged with approvals. |
| A5 | Run: inbox summary, CRM, tasks | **partial** | `run.tsx`. The inbox summary is hard-coded StudyBuddy text shown for every company. The CRM is a read-only list from `seed.contacts`. |
| A5 | Stay legal: checklist and calendar | **partial** | `legal.tsx`. Read-only, from `seed.compliance_items`; only StudyBuddy has items, and nothing can be ticked off. |
| A5 | Raise: investor kanban, grants | **partial** | `raise.tsx`. Drag and drop works with a mouse only (HTML5 drag events don't fire on touch, and there is no keyboard alternative). The grants list is static and the same for every company. |
| A6 | Evidence board (assumptions, interviews, waitlist, pre-orders) | **partial** | `evidence.tsx`. Read-only: you can't add, edit or change the status of anything. |
| A7 | Billing: plans, balance, ledger | **done** | `billing.tsx` |
| A7 | Billing: top-ups, Launch Pack | **mocked** | The buttons show a "Payments are coming soon" toast. |
| A7 | Low-balance banner at 20% | **done** | `AppShell.tsx` and `credits.isLowBalance`, covered by tests. |
| A8 | Mentor cohort view (stage, health, last activity, credits vs cap, pending gates) | **partial** | `cohort.tsx`. Cohorts come from `seed`, not the store. Health is a guess based on days since the last event, measured from a fixed date (21 Oct 2026). |
| A8 | Read-only HQ with gate approval and comments | **partial** | `cohort.$companyId.tsx`. "Approve gate" marks the gate approved but **doesn't move the company to the next stage or unlock the next gate**. |

### Plans and products

| Item | Status | Notes |
|---|---|---|
| Starter, Founder and Growth prices and credits | **done** | `src/lib/credits.ts` `PLANS`, covered by tests |
| Top-ups £10, £25, £50 | **done (display)** | `TOP_UPS` |
| Launch Pack £49 / 10,000 | **done (display)** | `LAUNCH_PACK`. The ledger has no separate "build credits" bucket: they count towards the same balance. |
| Cohort licence (pooled credits, per-founder caps) | **partial** | `credit_pool` and `credit_cap` are displayed on the cohort page but **never enforced**. |

### Tables (spec) vs what exists

None of these exist in a database. "Type" means a TypeScript interface the mock store follows.

| Spec table | Status | Where |
|---|---|---|
| profiles | type only | `types.ts` `Profile`. Its `role` is global, not per company. |
| companies | type only | `Company`, plus `sector` and `channels` |
| company_members | type only | Roles are `founder`, `teammate`, `mentor` and `viewer` |
| cohorts, cohort_companies | type only | Read straight from `seed`, not the store |
| stage_gates | type only | `criteria` is an embedded array |
| evidence_items | type only | `data` is an untyped `Record` |
| tasks | type only | `ExtendedTask` adds `proof` |
| agent_runs | type only | `steps` and `usage` are embedded |
| approvals | type only | `payload` uses `any` (the lint errors) |
| activity_events | type only | |
| credit_ledger (insert-only) | type only | The store only ever appends to it, which matches the rule. |
| company_credit_balance view | function only | `credits.creditBalance()` is a plain sum. It doesn't separate held from available credits, plan from top-up credits, or handle expiry. |
| chat_messages | type only | |
| social_posts | type only | Seed-only, outside the store |
| compliance_items | type only | Seed-only, outside the store |
| investors | type only | |
| metrics_daily | type only | Seed-only, outside the store |

**Extra types not in the spec table list:** `contacts`, `gate_comments`, `routines`, `documents` (with an embedded `versions` array), `media`, `emails` (threads with embedded messages), `ads`, `layouts`, `preferences`, `sharing` and `team` (invites).

**From SPEC C, missing entirely:** `agent_jobs`.

### RLS (spec) vs what exists

| Spec rule | Status |
|---|---|
| Founders see their own companies | **missing.** The UI filters the company switcher by `company_members`, but `useCompany()` falls back to `companies[0]`, so the admin profile (no memberships) gets full write access to StudyBuddy. |
| Mentors read cohort companies; can update stage_gates and approvals | **missing.** A mentor gets the full founder navigation and can chat, run tasks, spend credits and approve on any company they mentor. Any user can open `/cohort` and `/cohort/$id` directly. |
| Only the service role inserts into credit_ledger and agent_runs | **missing.** The browser writes both. |

### Seed (spec) vs `src/lib/seed.ts`

| Spec | Status |
|---|---|
| StudyBuddy: B2C, stage Build, Founder plan | ✓ |
| Metrics | ✓ 14 days for each of the four companies |
| 8 runs, one failed and refunded | ✓ `r1` to `r8`. `r5` failed, with a hold of −120 then a refund of +120. |
| 3 pending approvals | ✓ `a1` to `a3`, plus one approved, one declined, and one pending for Kelpie (`a6`) |
| Ledger | ✓ StudyBuddy balance is 5,995. Hold `l10` (run `r8`) is never settled or released. |
| Posts, compliance items, investors | ✓ StudyBuddy only |
| "University Venture Programme" with 3 more companies and a mentor | ✓ Kelpie Energy, Thrift Loop, Croft Care and Dr Morag Fraser. Kelpie's Evidence gate is ready for sign-off. |

---

## SPEC part B: Extensions

| # | Item | Status | Notes and files |
|---|---|---|---|
| B1 | Customisable HQ widgets (show/hide, reorder, per user, restore default) | **done** | `CompanyHQ.tsx`, `workspace.defaultLayout`. Persisted in `localStorage` key `dawn-hq-layouts`, per user ID. |
| B2 | Live work stream bar and Sol status (working / idle / waiting for you) via Realtime | **mocked** | The status is worked out locally, with no Realtime. Seed run `r8` is "running" forever, so StudyBuddy always shows Sol as "working". |
| B3 | Auto Mode (1–8 hours, estimate, confirm) | **mocked** | The dialog and estimate are real, but it runs one simulated cycle and charges the full amount upfront as `usage`, not as a hold. |
| B3 | Routines (cadence, monthly estimate, pause) | **mocked** | `RoutinesPage`. The toggles are saved but nothing is scheduled. |
| B4 | "≈ N credits" before every action, balance after, block and offer top-up | **done** | `CostButton` in `WorkControls.tsx`. Costs are hard-coded in three places that already disagree: `credits.ACTION_COSTS`, `agentClient.TASK_CREDITS` and literals in components (120, 400, 40, 90, 30). |
| B5 | Company email: address, inbox, threads, Support and Outreach modes, PECR note, batch approval | **mocked** | `EmailPage`. Every company gets the same seeded StudyBuddy-style threads ("Ms Khan… S5 class"). Outreach batches go to Approvals, and approving one just appends a "sent" message. |
| B6 | Media library: generate, statuses including failed with reason, retry, "Use in post" | **mocked** | `MediaPage`. Every asset is `/media/revision.svg`. |
| B7 | Meta Ads panel: status, budget with hard cap, spend, results, changes via Approvals | **mocked** | `AdsPage`. Every seeded company shows the same sample figures. |
| B8 | Documents (5 types), versions, "Ask Sol to update" | **mocked** | `DocumentsPage`. "Ask Sol to update" appends a fixed paragraph. Every company's roadmap lists StudyBuddy outcomes ("Quiz engine", "Teacher dashboard"). |
| B9 | Proof of done; tasks without evidence are "Unverified" | **partial** | `ProofOfDone` and `hasProof()` are tested, but **no task ever gets proof**. Seed tasks marked done are downgraded to `doing` (`workspaceSeed`), and "Run task" adds no proof, so "Mark done" can never be enabled. |
| B10 | Claims checker badge, flagged phrases and reasons | **partial** | `workspace.checkClaims()` uses three regex rules, stricter for regulated sectors, and is tested. The UI says itself that this is a "demo wording check". See bug B4. |
| B11 | Business-type defaults (B2B vs B2C); sector packs | **partial** | Only the channel labels and the claim strictness change. There is no trust page or waitlist feature. |
| B12 | Learning mode: "Why?" on every action, brief or teach me more | **done** | `Why` component; setting in `SettingsPage` |
| B13 | Escalation rules: spend, outreach volume, publishing, KPI alerts | **partial** | The thresholds are saved in `preferences` but **nothing reads them**. |
| B14 | WhatsApp / Slack (placeholder) | **done (placeholder)** | As the spec asks |
| B15 | Ownership page with "Export everything" | **partial** | `OwnershipPage` downloads a zip of CSVs (with protection against formula injection) and document versions. It **leaves out** `social_posts`, `compliance_items`, `metrics_daily`, `contacts` and cohorts, because those live outside the store. The ownership rows are all "Not connected". |
| B16 | Optional public build-in-public page | **mocked** | `progress.$slug.tsx`. Sharing settings exist only in the founder's open tab, so any other visitor (and the server render) always sees "Progress is private". |
| B17 | Team invites with roles | **mocked** | `TeamPage`. No email is sent and access isn't enforced. |

---

## Bugs and broken flows

1. **B1. Approval toasts can be wrong.** `ApprovalCard.decide()` always shows "Approved — Sol will carry it out", but `decideApproval` quietly does nothing if credits are short, claims are flagged, or the ad budget is over the cap (`store.tsx:90-92`).
2. **B2. Two of StudyBuddy's three seeded approvals can never be approved.** `a1` contains "actually works" (flagged for the education sector), and `a2` contains "weak-spots report" (flagged "Feature not built yet"). Approve is disabled, and there is no way to edit a draft or ask Sol to fix it. That makes the main demo flow a dead end.
3. **B3. Approval history records names instead of IDs.** `decided_by` stores the user's full name, while `approveGate` stores the user ID, so they don't match.
4. **B4. Claims are checked against the wrong company.** `ClaimsCheck` calls `useCompany()` with no ID, so it uses the company in the switcher, not the one being viewed. In the mentor's view of another company, claims are checked against the wrong sector.
5. **B5. Approving a gate doesn't advance the company.** `company.stage` stays the same and the next gate stays `locked`.
6. **B6. Onboarding throws away three answers:** stage, website and cohort code (see A1).
7. **B7. StudyBuddy demo content leaks into every company.** It appears in the stand-in site, the Run inbox summary, the Build versions, the grants list, email threads, the roadmap outcomes and the ad figures.
8. **B8. Seed hold `l10` is never released,** and seed run `r8` never finishes, so Sol always shows as working.
9. **B9. Fixed in 1a.** `hq.tsx` broke the rules of hooks. It calls `useStore()` inside an inline `component` arrow function, which the lint rule flags. It works today, but it is fragile.
10. **B10. Fixed in 1a.** Tests failed on a clean install because `@testing-library/dom` is missing from `package.json`.
11. **B11. Investor drag and drop needs a mouse.** It doesn't work on touch screens or with a keyboard.
12. **B12. Theme choice isn't saved.** Dark mode resets on every reload. Being fixed in 1a-design step 5 (a light/dark setting).

## Risks

- **No auth, no RLS, no server.** Every rule in CLAUDE.md is currently enforced only in browser code, or not at all: the insert-only ledger, service-role-only writes, approvals before external actions, and credit holds. That's expected at this stage, but nothing in the current code can be relied on for security. Phase 1 needs to recreate all of it in Postgres.
- **Credits work differently from the rules.** The UI charges `usage` straight away rather than reserve, settle and release (CLAUDE.md rule 3), and the browser writes the ledger. The UI's labels and flows will need reworking around holds in Phase 2.
- **Approvals are "executed" in the browser.** `decideApproval` changes ad budgets and appends sent emails itself. This logic must move to the executor (Phase 5) and must not be ported into the client.
- **Fixed in 1b.** The seed data looked real (personal email addresses, real school domains, real investor firms and grants, a real university). Both `supabase/seed.sql` and `src/lib/seed.ts` now use fictional data on `example.com`.
- **The demo site makes the claims the checker flags.** The stand-in site shows "Learns your weak spots", which is the "Feature not built yet" claim.
- **The model name is hard-coded.** `seed.ts` writes `claude-sonnet-4.5` into every run. CLAUDE.md wants model IDs in config.
- **Costs are defined in three places** that disagree (see B4 in part B). CLAUDE.md wants one config.
- **Fixed in 1a.** `ApprovalPayload` was all `any`. It's now a union keyed by `action_type` (`src/lib/types.ts`).
- **Fixed in 1a.** The product had three names. It's now Gumption everywhere, from `PRODUCT_NAME` in `src/lib/brand.ts`. The `bg-dawn` colour token and the `components/dawn/` folder keep their names. The `localStorage` key `dawn-hq-layouts` also stays until 1c replaces it with a table.
- **Fixed in 1a: package installs.** The project now uses npm only, and `package-lock.json` resolves everything from the public registry. One npm quirk: with **no** lockfile, npm 10 (bundled with Node 22) crashes while resolving peer dependencies (`Cannot read properties of null (reading 'edgesOut')`). npm 11 doesn't, and with the committed lockfile `npm ci` and `npm install` both work on npm 10. If Lovable's editor installs with bun, `bun.lock` may come back; if it does, add it to `.gitignore`.
- **Fixed.** The prototype's `social-post` skill, dropped by GitHub's web upload, was restored in `78efe76`.
- **Repo housekeeping.** There is a stray empty file `willremovethislater` at the root, and `roadmap.md` is Lovable's own checklist ("Dawn extension"), which will drift from this file.
- **The repo layout differs from what CLAUDE.md describes.** `src/integrations/supabase/`, `supabase/migrations/` and `agent-service/` don't exist yet, and the agent-call boundary is really `store.tsx`, which calls `agentClient`. In `agentClient`, `runTask` and `estimateTaskCredits` are never used.

## What's done, partial, missing or mocked

- **Done (as a demo):** HQ layout and widgets, approvals UI, runs timeline, billing display with low-balance banner, cost-before-action, learning mode, pricing constants, claims-check rules, CSV and zip export.
- **Partial:** onboarding, the pillar pages, evidence board, mentor cohort view and gates, proof of done, escalation rules, business and sector defaults.
- **Mocked:** sign-in, Sol chat and all agent work, Auto Mode, routines, email, media, ads, documents, Stripe, invites, the public progress page, Realtime.
- **Missing:** database, auth, RLS, Edge Functions, `agent_jobs`, agent service, cohort cap enforcement, everything in SPEC C, D and E.

## Recommended order for Phase 1

1. **Done in 1a: repo hygiene.** One item is left: the stray `willremovethislater` file at the root.
2. **Supabase project, auth and a typed client.** Create the project, set up magic-link sign-in, auto-create `profiles` on sign-up, and add `src/integrations/supabase/`. Remove the "view as" switcher, or limit it to local development.
3. **Core schema and RLS, with RLS tests.** Create `companies`, `company_members` (roles per company, not on `profiles`), `cohorts`, `cohort_companies`, `stage_gates`, `gate_comments` and `evidence_items`. Membership policies: founders see their own companies, mentors read their cohort's companies and update gates. A gate-approval RPC that also advances `companies.stage`. Tests for founder, mentor, outsider and admin.
4. **Ledger foundations.** An insert-only `credit_ledger` (with no update or delete grants, and a trigger as a backstop), a `company_credit_balance` view that already separates held from available credits, and inserts by the service role only. The full credits engine stays in Phase 2.
5. **Agent-facing tables.** `agent_runs`, `agent_jobs`, `approvals` (with typed payloads), `activity_events` and `chat_messages`. Clients may only read these; founders and mentors can decide approvals only through an RPC.
6. **Remaining pillar tables.** `tasks` (with proof), `social_posts`, `compliance_items`, `investors`, `contacts`, `metrics_daily`, `documents` and `document_versions`, `routines`, `media_assets`, `email_threads` and `email_messages`, `ad_accounts`, `user_preferences`, `hq_layouts`, `public_sharing` and `team_invites`.
7. **Seed migration.** Port `seed.ts` to SQL with fictional contacts and investors, so `supabase db reset` reproduces the demo.
8. **Swap the store's internals for queries,** keeping the hook signatures: read paths first, then writes through RPCs. Move seed-only screens (Grow, Legal, Run, metrics, cohorts) into the store, and remove StudyBuddy content from generic screens (bug B7).
9. **Fix the UX bugs** B1 to B6, B11 and B12, and add a way to edit or regenerate a flagged draft so approvals aren't a dead end.
10. **Finish the partial part A and B items** that need no engine: evidence board editing, compliance tick-off, onboarding saving stage, website and cohort code, cohort cap display, and the public progress page read from the database.
