-- Phase 20 (crew): agent records. docs/CREW-PHASES.md, Phase 20; DECISIONS D89-D105.
--
-- agent_catalogue          the built-in crew (global, like bot_templates)
-- agents                   each company's copy of its crew
-- autonomy_action_types    what an agent can propose, with each type's ceiling
-- agent_autonomy           level per agent and action type (stored now; Phase 23 adds behaviour)
-- agent_autonomy_events    insert-only history of every level change
-- agent_runs.agent_id      who did each run, backfilled
-- agent_jobs.agent_id      who a queued job is for
-- job_types.default_agent  who runs each job type, and fallback_agent when the company lacks it
--
-- App users can only read these (members and cohort mentors, via private.can_read_company).
-- Changes come from the service role, or from founder RPCs added in Phases 21 and 23.

-- Action types ----------------------------------------------------------------------------

create table public.autonomy_action_types (
  key text primary key check (key ~ '^[a-z][a-z_]{1,40}$'),
  label text not null,
  -- Reaches someone or something outside the company (publishes, sends, spends, files).
  external boolean not null,
  -- Reaches customers or the public: new companies start these at L2 at most (D96).
  customer_facing boolean not null default false,
  -- Public statements pause or drop to drafts during a crisis hold (Phase 23, D100).
  public_statement boolean not null default false,
  money boolean not null default false,
  legal boolean not null default false,
  -- The highest level this action type may ever reach. Money and legal: L2 (CLAUDE.md rule 4,
  -- CREW.md "Trust and governance"). Public replies: L2 (D75). Voice and memory: L2 (SPEC G, P:
  -- they never change silently).
  max_level smallint not null check (max_level between 0 and 3),
  check (not (money or legal) or max_level <= 2)
);

insert into public.autonomy_action_types
  (key, label, external, customer_facing, public_statement, money, legal, max_level) values
  ('publish_post',     'Publish a post',            true,  true,  true,  false, false, 3),
  ('send_email',       'Send an email',             true,  true,  false, false, false, 3),
  ('reply_inbox',      'Reply to a message',        true,  true,  false, false, false, 3),
  ('reply_public',     'Reply in public',           true,  true,  true,  false, false, 2),
  ('publish_site',     'Publish the website',       true,  true,  true,  false, false, 3),
  ('ad_spend',         'Change ad spend',           true,  false, false, true,  false, 2),
  ('launch_ad',        'Launch an ad',              true,  true,  true,  true,  false, 2),
  ('approve_campaign', 'Start a campaign',          false, false, false, true,  false, 2),
  ('send_proposal',    'Send a proposal or quote',  true,  true,  false, true,  false, 2),
  ('payment_chaser',   'Chase a payment',           true,  true,  false, true,  false, 2),
  ('file_document',    'File or publish a document', true, false, false, false, true,  2),
  ('update_voice',     'Change the brand voice',    false, false, false, false, false, 2),
  ('update_memory',    'Add to company memory',     false, false, false, false, false, 2),
  ('internal_update',  'Update internal records',   false, false, false, false, false, 3);

-- Catalogue -------------------------------------------------------------------------------

create table public.agent_catalogue (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null,
  role text not null,
  crew_pillar public.crew_pillar not null,
  summary text not null,
  -- { "key": "posts_published", "label": "posts published" }. Phase 21 counts only keys from a
  -- fixed list, so no metric definition runs SQL (D94).
  outcome_metric jsonb not null check (jsonb_typeof(outcome_metric) = 'object' and outcome_metric ? 'key' and outcome_metric ? 'label'),
  -- The prompt file in agent-service/prompts/ (style, rules, red lines).
  style_ref text not null,
  model_tier text not null check (model_tier in ('routine', 'planning', 'strategy')),
  -- When it runs, for display and (later) the scheduler. [{ "type": "event", "on": "..." }].
  triggers jsonb not null default '[]' check (jsonb_typeof(triggers) = 'array'),
  -- The job types it runs (job_types.default_agent points back here).
  job_types text[] not null default '{}',
  -- The most it may use, by tool short name (agent-service/src/tools.ts). The runtime uses the
  -- job's tools intersected with these.
  tools text[] not null default '{}',
  skills text[] not null default '{}',
  -- Never below the cap of any job type it runs, so attaching a job to an agent can't shrink a
  -- reservation (D105).
  budget_per_run_credits integer not null check (budget_per_run_credits > 0),
  -- Null: no monthly cap of its own (the balance still limits it). Every agent starts with none;
  -- founders set them (D105).
  budget_per_month_credits integer check (budget_per_month_credits is null or budget_per_month_credits > 0),
  -- Starting level per action type, from CREW.md. An upper bound: seeding applies D96.
  start_autonomy jsonb not null default '{}' check (jsonb_typeof(start_autonomy) = 'object'),
  entry_paths public.entry_path[] not null default '{start_up,keep_going}',
  -- The stage from which it's on duty (CREW.md "Crew active"); display and scheduling only.
  from_stage public.stage not null default 'idea',
  -- Enforced from Phase 24.
  min_plan public.company_plan not null,
  -- Conservative minutes of human work one outcome replaces, for the briefing's estimate (D99).
  minutes_per_outcome numeric(6, 1) not null default 0 check (minutes_per_outcome >= 0),
  -- Whether there's work it can do today. If not, `needs` says what's missing (D93, D103).
  engine boolean not null,
  -- { "label": what's needed, "action": button text or null, "route": app path or null }.
  needs jsonb check (needs is null or (jsonb_typeof(needs) = 'object' and needs ? 'label')),
  prompt_version integer not null default 1 check (prompt_version > 0),
  skills_version integer not null default 1 check (skills_version > 0),
  sort integer not null,
  check (engine or needs is not null)
);

-- The full catalogue from docs/CREW.md (Sol plus 45). Credits per run are CREW.md's upper figure;
-- the update after the job_types columns raises them to each agent's largest job cap.
insert into public.agent_catalogue (
  key, name, role, crew_pillar, summary, outcome_metric, style_ref, model_tier, triggers,
  job_types, tools, skills, budget_per_run_credits, budget_per_month_credits, start_autonomy,
  entry_paths, from_stage, min_plan, minutes_per_outcome, engine, needs, sort
) values
-- HQ
('sol', 'Sol', 'Flight director', 'hq',
 'Your cofounder. Turns goals into plans, runs the overnight loop, holds the decision queue and leads the crew.',
 '{"key": "runs_completed", "label": "jobs done"}', 'prompts/sol.md', 'planning',
 '[{"type": "request"}, {"type": "schedule", "on": "routines, nightly loop, Auto Mode, 07:00 brief"}]',
 '{chat,task,auto_mode,nightly,routine,morning_brief,document_update}',
 '{get_company,get_metrics,list_posts,list_tasks,check_claims,get_document,propose_document_update,propose_site_change,propose_post,propose_email,get_brief_facts,save_brief}',
 '{social-post,claims-check,morning-brief}', 1200, null,
 '{"publish_post": 2, "send_email": 2, "publish_site": 2, "file_document": 2, "internal_update": 3}',
 '{start_up,keep_going}', 'idea', 'starter', 0, true, null, 0),

-- Build
('arlo', 'Arlo', 'Site builder', 'build',
 'Builds and updates the website and landing pages from the brand guide.',
 '{"key": "pages_live", "label": "pages live"}', 'prompts/arlo.md', 'planning',
 '[{"type": "event", "on": "change requested"}]', '{}', '{}', '{}', 500, null,
 '{"publish_site": 2}', '{start_up}', 'build', 'founder', 60, false,
 '{"label": "Arlo needs your GitHub and hosting connected. That connection isn''t available yet.", "action": null, "route": null}', 10),
('kit', 'Kit', 'App builder', 'build',
 'Builds simple supporting apps: booking, forms, portals.',
 '{"key": "features_shipped", "label": "features shipped"}', 'prompts/kit.md', 'planning',
 '[{"type": "event", "on": "change requested"}]', '{}', '{}', '{}', 800, null,
 '{"publish_site": 2}', '{start_up,keep_going}', 'build', 'founder', 60, false,
 '{"label": "Kit needs your GitHub and Supabase connected. That connection isn''t available yet.", "action": null, "route": null}', 11),
('tess', 'Tess', 'QA and accessibility', 'build',
 'Tests each change on desktop and mobile, checks accessibility and broken links.',
 '{"key": "issues_caught", "label": "issues caught before release"}', 'prompts/tess.md', 'routine',
 '[{"type": "event", "on": "before any publish"}]', '{}', '{}', '{}', 30, null,
 '{"internal_update": 3}', '{start_up,keep_going}', 'build', 'founder', 10, false,
 '{"label": "Tess needs browser testing of your preview site, which isn''t available yet.", "action": null, "route": null}', 12),
('hook', 'Hook', 'Integrations', 'build',
 'Connects Stripe, email, calendar and analytics in your own accounts.',
 '{"key": "integrations_working", "label": "integrations working"}', 'prompts/hook.md', 'routine',
 '[{"type": "event", "on": "setup; new tool added"}]', '{}', '{}', '{}', 50, null,
 '{"internal_update": 1}', '{start_up,keep_going}', 'build', 'founder', 15, false,
 '{"label": "Hook can''t connect tools for you yet. You can connect email, social and analytics yourself in Settings.", "action": "Open integrations", "route": "/settings"}', 13),

-- Grow
('iris', 'Iris', 'Brand builder', 'grow',
 'Builds the brand voice, positioning and messaging guide, and keeps the versioned voice current.',
 '{"key": "brand_guide_approved", "label": "voice versions approved"}', 'prompts/iris.md', 'strategy',
 '[{"type": "event", "on": "onboarding; on request"}, {"type": "schedule", "on": "weekly voice review"}]',
 '{voice_analysis,voice_update}',
 '{get_company,get_voice_profile,get_voice_sources,propose_voice_from_analysis,get_edit_events,propose_voice_from_edits}',
 '{voice-analysis,voice-update}', 200, null,
 '{"update_voice": 1}', '{start_up,keep_going}', 'idea', 'starter', 60, true, null, 20),
('eve', 'Eve', 'Evidence runner', 'grow',
 'Designs tests for each assumption, runs landing-page and waitlist tests, and moves cards on the Evidence board.',
 '{"key": "assumptions_tested", "label": "assumptions tested"}', 'prompts/eve.md', 'planning',
 '[{"type": "event", "on": "new idea or assumption"}]', '{evidence_plan}',
 '{get_company,add_assumptions}', '{evidence-plan}', 50, null,
 '{"internal_update": 2, "send_email": 2}', '{start_up}', 'evidence', 'starter', 20, true, null, 21),
('nova', 'Nova', 'Content creator', 'grow',
 'Drafts posts, blogs and emails in the brand voice.',
 '{"key": "pieces_drafted", "label": "pieces drafted"}', 'prompts/nova.md', 'routine',
 '[{"type": "schedule", "on": "weekly content plan"}]', '{social_post,media_image,media_video}',
 '{get_company,get_metrics,list_posts,list_tasks,check_claims,propose_post}',
 '{social-post,claims-check}', 50, null,
 '{"publish_post": 2, "send_email": 2}', '{start_up,keep_going}', 'evidence', 'starter', 15, true, null, 22),
('echo', 'Echo', 'Social manager', 'grow',
 'Schedules and publishes approved posts, and replies to comments.',
 '{"key": "posts_published", "label": "posts out"}', 'prompts/echo.md', 'routine',
 '[{"type": "event", "on": "content approved; new mention"}]', '{}', '{}', '{}', 10, null,
 '{"publish_post": 2, "reply_public": 2}', '{start_up,keep_going}', 'evidence', 'starter', 5, true, null, 23),
('scout', 'Scout', 'Competitor researcher', 'grow',
 'Tracks competitor pricing, launches, hiring and ads.',
 '{"key": "changes_spotted", "label": "changes spotted"}', 'prompts/scout.md', 'planning',
 '[{"type": "schedule", "on": "weekly"}]', '{}', '{}', '{}', 50, null,
 '{"internal_update": 3}', '{start_up,keep_going}', 'idea', 'founder', 15, false,
 '{"label": "Scout needs web research, which isn''t switched on yet.", "action": null, "route": null}', 24),
('lumen', 'Lumen', 'Campaign manager', 'grow',
 'Plans and runs campaigns with tracked links, hub pages and QR codes.',
 '{"key": "campaigns_live", "label": "campaigns live"}', 'prompts/lumen.md', 'strategy',
 '[{"type": "event", "on": "goal set by Sol"}]', '{campaign_plan,campaign_assets}',
 '{get_company,get_metrics,list_posts,propose_campaign,get_campaign,create_campaign_link,propose_campaign_asset,check_claims}',
 '{campaign-plan,campaign-assets,claims-check}', 100, null,
 '{"approve_campaign": 2, "publish_post": 2, "send_email": 2, "ad_spend": 2, "launch_ad": 2}',
 '{keep_going}', 'launch', 'growth', 30, true, null, 25),
('bea', 'Bea', 'Performance analyst', 'grow',
 'Spots wasted budget and weak angles, and recommends where to move spend.',
 '{"key": "spend_redirected", "label": "£ saved or redirected"}', 'prompts/bea.md', 'planning',
 '[{"type": "schedule", "on": "daily"}]', '{}', '{}', '{}', 30, null,
 '{"ad_spend": 1, "internal_update": 1}', '{keep_going}', 'launch', 'growth', 0, false,
 '{"label": "Bea needs ad accounts connected, which isn''t available yet.", "action": null, "route": null}', 26),
('sage', 'Sage', 'SEO and AI search', 'grow',
 'Optimises the site for search and for AI assistants.',
 '{"key": "pages_optimised", "label": "pages optimised"}', 'prompts/sage.md', 'planning',
 '[{"type": "schedule", "on": "monthly"}]', '{}', '{}', '{}', 100, null,
 '{"publish_site": 2}', '{start_up,keep_going}', 'launch', 'founder', 30, false,
 '{"label": "Sage needs Search Console and site access, which aren''t available yet.", "action": null, "route": null}', 27),
('quill', 'Quill', 'PR and awards', 'grow',
 'Finds press, podcast, award and showcase opportunities and drafts pitches.',
 '{"key": "pitches_sent", "label": "pitches sent"}', 'prompts/quill.md', 'planning',
 '[{"type": "schedule", "on": "weekly"}]', '{}', '{}', '{}', 50, null,
 '{"send_email": 2}', '{start_up,keep_going}', 'launch', 'founder', 30, false,
 '{"label": "Quill needs web research, which isn''t switched on yet.", "action": null, "route": null}', 28),

-- Customers
('hunter', 'Hunter', 'Lead finder', 'customers',
 'Builds target lists from your ideal-customer profile.',
 '{"key": "leads_qualified", "label": "qualified leads added"}', 'prompts/hunter.md', 'planning',
 '[{"type": "schedule", "on": "weekly; goal set by Sol"}]', '{}', '{}', '{}', 50, null,
 '{"internal_update": 3}', '{start_up,keep_going}', 'launch', 'founder', 5, false,
 '{"label": "Hunter needs web research, which isn''t switched on yet.", "action": null, "route": null}', 30),
('penny', 'Penny', 'Lead capture', 'customers',
 'Captures leads from your forms, hub page and QR codes, with consent recorded.',
 '{"key": "leads_captured", "label": "leads captured"}', 'prompts/penny.md', 'routine',
 '[{"type": "event", "on": "new form submission"}]', '{}', '{}', '{}', 10, null,
 '{"internal_update": 3}', '{start_up,keep_going}', 'evidence', 'starter', 3, true, null, 31),
('rex', 'Rex', 'Outreach', 'customers',
 'Writes personalised outreach and follow-up sequences.',
 '{"key": "replies_won", "label": "replies"}', 'prompts/rex.md', 'routine',
 '[{"type": "event", "on": "new qualified lead"}]', '{}', '{}', '{}', 20, null,
 '{"send_email": 2}', '{start_up,keep_going}', 'launch', 'founder', 10, false,
 '{"label": "Rex''s outreach sequences aren''t built yet. You can draft outreach yourself from Run → Email.", "action": "Open email", "route": "/email"}', 32),
('zara', 'Zara', 'Deal scorer', 'customers',
 'Scores open deals on fit, intent and engagement.',
 '{"key": "deals_scored", "label": "deals scored"}', 'prompts/zara.md', 'routine',
 '[{"type": "schedule", "on": "daily"}]', '{}', '{}', '{}', 20, null,
 '{"internal_update": 3}', '{keep_going}', 'launch', 'growth', 3, false,
 '{"label": "Zara needs deals in a pipeline, which isn''t built yet.", "action": null, "route": null}', 33),
('dev', 'Dev', 'Proposal writer', 'customers',
 'Drafts proposals and quotes from templates and deal notes.',
 '{"key": "proposals_sent", "label": "proposals sent"}', 'prompts/dev.md', 'planning',
 '[{"type": "event", "on": "deal score above threshold"}]', '{}', '{}', '{}', 50, null,
 '{"send_proposal": 2}', '{start_up,keep_going}', 'launch', 'founder', 45, false,
 '{"label": "Dev needs deals and proposal templates, which aren''t built yet.", "action": null, "route": null}', 34),
('mira', 'Mira', 'Meeting assistant', 'customers',
 'Turns calls, voice notes and meetings into decisions and actions, with consent.',
 '{"key": "actions_routed", "label": "actions routed"}', 'prompts/mira.md', 'planning',
 '[{"type": "event", "on": "meeting or voice note"}]', '{capture_process,commitment_followup}',
 '{get_capture,get_capture_context,propose_extraction,get_company,get_commitment,propose_followup,check_claims}',
 '{capture-extract,claims-check}', 30, null,
 '{"internal_update": 3, "send_email": 2}', '{start_up,keep_going}', 'launch', 'founder', 5, true, null, 35),
('harper', 'Harper', 'Reputation manager', 'customers',
 'Watches reviews, mentions and feedback, and drafts responses within your response policy.',
 '{"key": "reviews_answered", "label": "reviews answered"}', 'prompts/harper.md', 'routine',
 '[{"type": "event", "on": "new review or mention"}]', '{}', '{}', '{}', 20, null,
 '{"reply_public": 1, "reply_inbox": 1}', '{start_up,keep_going}', 'launch', 'founder', 10, false,
 '{"label": "Tilly drafts review replies for now. Harper takes over once listening has its own crew member.", "action": "Open listening", "route": "/grow?tab=listening"}', 36),
('cora', 'Cora', 'CRM keeper', 'customers',
 'Merges duplicates, fills gaps and closes stale deals.',
 '{"key": "records_cleaned", "label": "records cleaned"}', 'prompts/cora.md', 'routine',
 '[{"type": "schedule", "on": "weekly"}]', '{}', '{}', '{}', 20, null,
 '{"internal_update": 3}', '{keep_going}', 'launch', 'growth', 2, false,
 '{"label": "Cora''s contact clean-up isn''t built yet.", "action": "Open contacts", "route": "/customers?tab=contacts"}', 37),
('nell', 'Nell', 'Customer success', 'customers',
 'Onboards new customers, checks in, and spots churn risk and upsell.',
 '{"key": "customers_kept", "label": "customers checked in"}', 'prompts/nell.md', 'routine',
 '[{"type": "event", "on": "new customer; usage drop"}]', '{}', '{}', '{}', 20, null,
 '{"send_email": 2}', '{keep_going}', 'launch', 'growth', 10, false,
 '{"label": "Nell isn''t built yet. The onboarding bot in Run → Bots covers new customers for now.", "action": "Open bots", "route": "/run"}', 38),

-- Run
('tilly', 'Tilly', 'Inbox triage', 'run',
 'Sorts email and messages, drafts replies to routine ones and routes the rest.',
 '{"key": "messages_handled", "label": "messages handled"}', 'prompts/tilly.md', 'routine',
 '[{"type": "event", "on": "new message"}]', '{inbox_triage,inbox_draft,email_reply}',
 '{get_inbox_item,save_triage,propose_reply,check_claims,get_company,get_metrics,list_posts,list_tasks,get_email_thread,propose_email}',
 '{inbox-triage,inbox-reply,claims-check}', 10, null,
 '{"reply_inbox": 2, "internal_update": 3}', '{start_up,keep_going}', 'launch', 'starter', 3, true, null, 40),
('hal', 'Hal', 'Support agent', 'run',
 'Answers customer questions from your knowledge base within the response policy.',
 '{"key": "tickets_resolved", "label": "tickets resolved"}', 'prompts/hal.md', 'routine',
 '[{"type": "event", "on": "new ticket or chat"}]', '{}', '{}', '{}', 10, null,
 '{"reply_inbox": 2}', '{start_up,keep_going}', 'launch', 'founder', 5, false,
 '{"label": "Tilly answers support messages for now. Hal needs a knowledge base, which isn''t built yet.", "action": "Open inbox", "route": "/customers"}', 41),
('nia', 'Nia', 'Supplier scout', 'run',
 'Finds and compares suppliers, tools and quotes.',
 '{"key": "options_found", "label": "options found"}', 'prompts/nia.md', 'planning',
 '[{"type": "request"}]', '{}', '{}', '{}', 100, null,
 '{"send_email": 2}', '{start_up,keep_going}', 'grow', 'growth', 30, false,
 '{"label": "Nia needs web research, which isn''t switched on yet.", "action": null, "route": null}', 42),
('hugo', 'Hugo', 'Contract reviewer', 'run',
 'Reviews contracts and terms and flags risky clauses.',
 '{"key": "clauses_flagged", "label": "issues flagged"}', 'prompts/hugo.md', 'planning',
 '[{"type": "event", "on": "document uploaded"}]', '{}', '{}', '{}', 50, null,
 '{"internal_update": 1}', '{start_up,keep_going}', 'grow', 'growth', 20, false,
 '{"label": "Hugo needs contract upload and partner solicitor sign-off, which aren''t in place yet.", "action": null, "route": null}', 43),
('vera', 'Vera', 'Project monitor', 'run',
 'Tracks tasks and deadlines and flags risks early.',
 '{"key": "risks_flagged", "label": "risks flagged"}', 'prompts/vera.md', 'routine',
 '[{"type": "schedule", "on": "daily"}]', '{}', '{}', '{}', 10, null,
 '{"internal_update": 3}', '{keep_going}', 'grow', 'growth', 5, false,
 '{"label": "Vera''s daily risk check isn''t built yet.", "action": "Open flight plan", "route": "/flight-plan"}', 44),
('wren', 'Wren', 'Daily wrap-up', 'run',
 'Summarises the day''s decisions, meetings and progress for Sol''s briefing.',
 '{"key": "wrap_ups", "label": "wrap-ups written"}', 'prompts/wren.md', 'routine',
 '[{"type": "schedule", "on": "end of day"}]', '{}', '{}', '{}', 20, null,
 '{"internal_update": 3}', '{start_up,keep_going}', 'grow', 'growth', 10, false,
 '{"label": "Wren''s end-of-day summary isn''t built yet; Sol''s morning briefing covers the day.", "action": null, "route": null}', 45),
('pip', 'Pip', 'Process builder', 'run',
 'Writes SOPs and turns repeat work into routines.',
 '{"key": "routines_created", "label": "routines created"}', 'prompts/pip.md', 'planning',
 '[{"type": "event", "on": "repeat task spotted"}]', '{}', '{}', '{}', 50, null,
 '{"internal_update": 1}', '{keep_going}', 'grow', 'growth', 30, false,
 '{"label": "Pip isn''t built yet. You can set up routines yourself.", "action": "Open routines", "route": "/routines"}', 46),
('jade', 'Jade', 'Hiring assistant', 'run',
 'Writes job ads, screens applicants and books interviews.',
 '{"key": "candidates_shortlisted", "label": "candidates shortlisted"}', 'prompts/jade.md', 'planning',
 '[{"type": "event", "on": "role opened"}]', '{}', '{}', '{}', 30, null,
 '{"send_email": 2, "publish_post": 2}', '{keep_going}', 'grow', 'growth', 20, false,
 '{"label": "Jade needs job boards connected, which isn''t available yet.", "action": null, "route": null}', 47),
('penn', 'Penn', 'Bookkeeper', 'run',
 'Categorises transactions, chases receipts and reconciles the books.',
 '{"key": "transactions_categorised", "label": "transactions categorised"}', 'prompts/penn.md', 'routine',
 '[{"type": "schedule", "on": "daily"}]', '{}', '{}', '{}', 10, null,
 '{"internal_update": 2}', '{start_up,keep_going}', 'launch', 'starter', 1, false,
 '{"label": "Penn needs your accounting software (Xero, QuickBooks or FreeAgent) and bank feed. Connecting them isn''t available yet.", "action": null, "route": null}', 48),
('cass', 'Cass', 'Credit control', 'run',
 'Sends invoices and polite, escalating payment reminders.',
 '{"key": "invoices_chased", "label": "invoices chased"}', 'prompts/cass.md', 'routine',
 '[{"type": "event", "on": "invoice due or overdue"}]', '{}', '{}', '{}', 10, null,
 '{"payment_chaser": 2}', '{start_up,keep_going}', 'launch', 'founder', 5, false,
 '{"label": "Cass needs your own Stripe account connected for invoices, which isn''t available yet.", "action": null, "route": null}', 49),
('flo', 'Flo', 'Cash forecaster', 'run',
 'Keeps a rolling 13-week cash forecast and runway, and warns early.',
 '{"key": "forecasts_updated", "label": "forecasts updated"}', 'prompts/flo.md', 'planning',
 '[{"type": "schedule", "on": "weekly"}]', '{}', '{}', '{}', 30, null,
 '{"internal_update": 3}', '{start_up,keep_going}', 'launch', 'founder', 30, false,
 '{"label": "Flo needs your accounting software and bank feed. Connecting them isn''t available yet.", "action": null, "route": null}', 50),

-- Stay legal
('forge', 'Forge', 'Company formation', 'legal',
 'Prepares incorporation, articles, share structure and the bank account checklist.',
 '{"key": "company_registered", "label": "formation steps done"}', 'prompts/forge.md', 'planning',
 '[{"type": "event", "on": "Build stage"}]', '{}', '{}', '{}', 300, null,
 '{"file_document": 1}', '{start_up}', 'build', 'founder', 30, false,
 '{"label": "Forge needs Companies House data and partner solicitor sign-off, which aren''t in place yet.", "action": null, "route": null}', 60),
('clara', 'Clara', 'Compliance calendar', 'legal',
 'Tracks every filing and renewal so no deadline is missed.',
 '{"key": "deadlines_tracked", "label": "deadlines tracked"}', 'prompts/clara.md', 'routine',
 '[{"type": "schedule", "on": "daily"}]', '{compliance_review}', '{get_compliance,add_compliance_items}',
 '{compliance-calendar}', 20, null,
 '{"internal_update": 3}', '{start_up,keep_going}', 'launch', 'starter', 5, true, null, 61),
('shield', 'Shield', 'Policies and GDPR', 'legal',
 'Writes and keeps your privacy policy, terms and cookie notice current.',
 '{"key": "policies_current", "label": "policy versions"}', 'prompts/shield.md', 'planning',
 '[{"type": "event", "on": "Build stage; law or product change"}]', '{}',
 '{get_company,get_metrics,list_posts,list_tasks,check_claims,get_document,propose_document_update}',
 '{claims-check}', 300, null,
 '{"internal_update": 1, "file_document": 1}', '{start_up,keep_going}', 'build', 'starter', 45, true, null, 62),

-- Raise
('gus', 'Gus', 'Grants scout', 'raise',
 'Finds grants, competitions and soft funding, and drafts applications.',
 '{"key": "applications_submitted", "label": "applications submitted"}', 'prompts/gus.md', 'planning',
 '[{"type": "schedule", "on": "weekly"}]', '{}', '{}', '{}', 100, null,
 '{"file_document": 2}', '{start_up,keep_going}', 'grow', 'founder', 60, false,
 '{"label": "Gus needs web research, which isn''t switched on yet. You can track grants yourself in Raise.", "action": "Open raise", "route": "/raise"}', 70),
('ada', 'Ada', 'Investor readiness', 'raise',
 'Builds the pitch deck, financial model, data room and SEIS/EIS pack.',
 '{"key": "readiness_items", "label": "readiness items done"}', 'prompts/ada.md', 'strategy',
 '[{"type": "event", "on": "founder starts a fundraise"}]', '{}', '{}', '{}', 200, null,
 '{"internal_update": 1}', '{start_up,keep_going}', 'grow', 'founder', 60, false,
 '{"label": "Ada isn''t built yet.", "action": "Open documents", "route": "/documents"}', 71),
('finn', 'Finn', 'Fundraising CRM', 'raise',
 'Builds the investor list by fit, drafts intros and runs the investor kanban.',
 '{"key": "investor_meetings", "label": "investor meetings"}', 'prompts/finn.md', 'planning',
 '[{"type": "event", "on": "round open"}]', '{}', '{}', '{}', 50, null,
 '{"send_email": 2}', '{keep_going}', 'grow', 'growth', 20, false,
 '{"label": "Finn isn''t built yet. Your investor kanban is in Raise.", "action": "Open raise", "route": "/raise"}', 72),
('rhea', 'Rhea', 'Board and investor updates', 'raise',
 'Writes monthly investor updates and board packs from live data.',
 '{"key": "updates_written", "label": "updates written"}', 'prompts/rhea.md', 'planning',
 '[{"type": "schedule", "on": "monthly"}]', '{investor_update}',
 '{get_investor_facts,save_investor_update,check_claims}', '{investor-update,claims-check}', 50, null,
 '{"send_email": 2}', '{keep_going}', 'grow', 'growth', 60, true, null, 73),

-- Mission support (meta)
('dex', 'Dex', 'Health monitor', 'meta',
 'Watches every agent and integration and flags failed runs and broken connections.',
 '{"key": "issues_caught", "label": "issues caught"}', 'prompts/dex.md', 'routine',
 '[{"type": "event", "on": "continuous"}]', '{}', '{}', '{}', 10, null,
 '{"internal_update": 3}', '{start_up,keep_going}', 'idea', 'starter', 5, true, null, 80),
('otto', 'Otto', 'Automation finder', 'meta',
 'Spots manual work you keep doing and proposes a routine or a crew member for it.',
 '{"key": "automations_proposed", "label": "automations proposed"}', 'prompts/otto.md', 'planning',
 '[{"type": "schedule", "on": "weekly"}]', '{}', '{}', '{}', 30, null,
 '{"internal_update": 3}', '{start_up,keep_going}', 'grow', 'founder', 0, false,
 '{"label": "Otto isn''t built yet.", "action": null, "route": null}', 81),
('opal', 'Opal', 'Opportunity scout', 'meta',
 'Looks across your data for growth openings.',
 '{"key": "opportunities_raised", "label": "opportunities raised"}', 'prompts/opal.md', 'strategy',
 '[{"type": "schedule", "on": "monthly"}]', '{}', '{}', '{}', 100, null,
 '{"internal_update": 3}', '{start_up,keep_going}', 'grow', 'growth', 0, false,
 '{"label": "Opal isn''t built yet.", "action": null, "route": null}', 82),
('mo', 'Mo', 'Memory keeper', 'meta',
 'Turns decisions, conversations and documents into the company memory every agent reads.',
 '{"key": "facts_added", "label": "facts added"}', 'prompts/mo.md', 'routine',
 '[{"type": "event", "on": "approved memory facts"}]', '{}', '{}', '{}', 20, null,
 '{"update_memory": 2}', '{start_up,keep_going}', 'idea', 'starter', 2, true, null, 83),
('cal', 'Cal', 'Founder coach', 'meta',
 'Reviews how you spend your time and suggests what to delegate next.',
 '{"key": "suggestions_made", "label": "suggestions made"}', 'prompts/cal.md', 'planning',
 '[{"type": "schedule", "on": "weekly"}]', '{}', '{}', '{}', 20, null,
 '{"internal_update": 3}', '{start_up,keep_going}', 'grow', 'growth', 0, false,
 '{"label": "Cal isn''t built yet.", "action": null, "route": null}', 84);

-- Every start_autonomy key must be a known action type.
do $$
begin
  if exists (
    select 1 from public.agent_catalogue c, jsonb_object_keys(c.start_autonomy) k
    where k not in (select key from public.autonomy_action_types)
  ) then
    raise exception 'agent_catalogue.start_autonomy names an unknown action type';
  end if;
end;
$$;

-- Who runs each job type -------------------------------------------------------------------

alter table public.job_types
  add column default_agent text references public.agent_catalogue (key),
  add column fallback_agent text references public.agent_catalogue (key);
create index job_types_default_agent_idx on public.job_types (default_agent);
create index job_types_fallback_agent_idx on public.job_types (fallback_agent);

update public.job_types j set default_agent = m.agent, fallback_agent = m.fallback
from (values
  ('chat', 'sol', null), ('task', 'sol', null), ('auto_mode', 'sol', null),
  ('nightly', 'sol', null), ('routine', 'sol', null), ('morning_brief', 'sol', null),
  ('document_update', 'sol', null),
  ('social_post', 'nova', null), ('media_image', 'nova', null), ('media_video', 'nova', null),
  ('voice_analysis', 'iris', null), ('voice_update', 'iris', null),
  ('evidence_plan', 'eve', null),
  ('inbox_triage', 'tilly', null), ('inbox_draft', 'tilly', null), ('email_reply', 'tilly', null),
  ('compliance_review', 'clara', null),
  ('capture_process', 'mira', 'sol'), ('commitment_followup', 'mira', 'sol'),
  ('campaign_plan', 'lumen', 'nova'), ('campaign_assets', 'lumen', 'nova'),
  ('investor_update', 'rhea', 'sol')
) as m (job_type, agent, fallback)
where j.job_type = m.job_type;

-- New job types must say who runs them.
do $$
begin
  if exists (select 1 from public.job_types where default_agent is null) then
    raise exception 'every job type needs a default_agent';
  end if;
end;
$$;

-- A run's cap is never smaller than the biggest job its agent runs (D105). Shield runs Sol's
-- document updates for policy documents (see public.agent_for_job), so it gets that cap too.
update public.agent_catalogue c set budget_per_run_credits = greatest(
  c.budget_per_run_credits,
  coalesce((select max(j.cap_credits) from public.job_types j
            where j.job_type = any (c.job_types)
               or (c.key = 'shield' and j.job_type = 'document_update')), 0)
);

-- Per-company crew -------------------------------------------------------------------------

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Null for custom agents (later). Unique per company for built-in ones.
  catalogue_key text references public.agent_catalogue (key),
  name text not null check (length(trim(name)) between 1 and 40),
  role text not null check (length(trim(role)) between 1 and 80),
  crew_pillar public.crew_pillar not null,
  outcome_metric jsonb not null check (jsonb_typeof(outcome_metric) = 'object'),
  style_ref text not null,
  model_tier text not null check (model_tier in ('routine', 'planning', 'strategy')),
  triggers jsonb not null default '[]' check (jsonb_typeof(triggers) = 'array'),
  tools text[] not null default '{}',
  skills text[] not null default '{}',
  budget_per_run_credits integer not null check (budget_per_run_credits > 0),
  budget_per_month_credits integer check (budget_per_month_credits is null or budget_per_month_credits > 0),
  -- [{ "when": "score >= threshold", "to": "dev" }]
  handoffs jsonb not null default '[]' check (jsonb_typeof(handoffs) = 'array'),
  -- Phase 23: a change to either starts 7 days of L0 simulation (D97).
  prompt_version integer not null default 1 check (prompt_version > 0),
  skills_version integer not null default 1 check (skills_version > 0),
  status public.agent_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, catalogue_key),
  -- Lets agent_autonomy check its agent belongs to the same company.
  unique (id, company_id)
);
create index agents_catalogue_key_idx on public.agents (catalogue_key);
create trigger agents_updated_at before update on public.agents
  for each row execute function private.set_updated_at();

-- Autonomy (stored now; behaviour in Phase 23) ---------------------------------------------

create table public.agent_autonomy (
  agent_id uuid not null,
  company_id uuid not null,
  action_type text not null references public.autonomy_action_types (key),
  level smallint not null check (level between 0 and 3),
  -- A cohort mentor's hold: the most this action type may reach while it lasts (D98).
  mentor_hold_level smallint check (mentor_hold_level between 0 and 2),
  held_by uuid references public.profiles (id) on delete set null,
  held_at timestamptz,
  hold_reason text check (hold_reason is null or length(trim(hold_reason)) between 3 and 500),
  release_requested_at timestamptz,
  -- Phase 23: L0 simulation runs alongside the normal level until this time (D97, D101).
  simulating_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (agent_id, action_type),
  foreign key (agent_id, company_id) references public.agents (id, company_id) on delete cascade,
  check ((mentor_hold_level is null) = (held_at is null)),
  check (mentor_hold_level is null or hold_reason is not null)
);
create index agent_autonomy_company_id_idx on public.agent_autonomy (company_id);
create index agent_autonomy_action_type_idx on public.agent_autonomy (action_type);
create index agent_autonomy_held_by_idx on public.agent_autonomy (held_by);
create trigger agent_autonomy_updated_at before update on public.agent_autonomy
  for each row execute function private.set_updated_at();

-- No level above the action type's ceiling, however it's written.
create function private.check_autonomy_ceiling()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ceiling smallint;
begin
  select t.max_level into ceiling from public.autonomy_action_types t where t.key = new.action_type;
  if new.level > ceiling then
    raise exception 'level % is above the ceiling (%) for %', new.level, ceiling, new.action_type
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger agent_autonomy_ceiling before insert or update on public.agent_autonomy
  for each row execute function private.check_autonomy_ceiling();

-- Every level change, held forever (like the credit ledger: insert only).
create table public.agent_autonomy_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  action_type text not null references public.autonomy_action_types (key),
  kind text not null check (kind in (
    'seed', 'promote', 'demote', 'hold', 'release', 'release_requested', 'simulate', 'restore')),
  from_level smallint check (from_level between 0 and 3),
  to_level smallint check (to_level between 0 and 3),
  reason text not null check (length(trim(reason)) > 0),
  evidence jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object'),
  -- The agent (usually Sol) that proposed it, and the person who decided it.
  proposed_by_agent uuid references public.agents (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  approval_id uuid references public.approvals (id) on delete set null,
  created_at timestamptz not null default now()
);
create index agent_autonomy_events_company_id_idx on public.agent_autonomy_events (company_id, created_at desc);
create index agent_autonomy_events_agent_id_idx on public.agent_autonomy_events (agent_id);
create index agent_autonomy_events_action_type_idx on public.agent_autonomy_events (action_type);
create index agent_autonomy_events_proposed_by_agent_idx on public.agent_autonomy_events (proposed_by_agent);
create index agent_autonomy_events_decided_by_idx on public.agent_autonomy_events (decided_by);
create index agent_autonomy_events_approval_id_idx on public.agent_autonomy_events (approval_id);

-- No one may update, delete or truncate a history row, the service role included. This is done
-- with privileges, not a trigger (D106): nobody is granted UPDATE, DELETE or TRUNCATE (see
-- Access below), so direct changes are refused, while the foreign-key cascade when a whole
-- company is deleted still works (cascades don't check the caller's privileges).

-- Runs and jobs say who did them -----------------------------------------------------------

-- Nullable for now: the agent service, the chat function and the executor start recording it in
-- this phase, and a later migration makes it NOT NULL once every writer does (D109).
alter table public.agent_runs
  add column agent_id uuid references public.agents (id) on delete set null;
create index agent_runs_agent_id_idx on public.agent_runs (agent_id, started_at desc);

alter table public.agent_jobs
  add column agent_id uuid references public.agents (id) on delete set null;
create index agent_jobs_agent_id_idx on public.agent_jobs (agent_id);

-- Seeding a company's crew -----------------------------------------------------------------

-- The Starter crew (CREW.md credits table). Phase 24 adds the rest by plan.
create function private.starter_crew()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['sol', 'iris', 'nova', 'echo', 'eve', 'penny', 'tilly', 'clara', 'shield', 'penn', 'dex', 'mo'];
$$;

-- Start level for one action type (D96): the lowest of CREW.md's start level, the type's ceiling,
-- and L2 for anything external or customer-facing.
create function private.start_level(p_start smallint, p_action text)
returns smallint
language sql
stable
set search_path = ''
as $$
  select least(
    p_start,
    t.max_level,
    case when t.external or t.customer_facing then 2 else 3 end
  )::smallint
  from public.autonomy_action_types t
  where t.key = p_action;
$$;

-- Adds the given catalogue agents to a company, with their autonomy rows and a 'seed' event for
-- each. Idempotent: agents the company already has are left alone.
create function private.seed_agents(p_company uuid, p_keys text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.agent_catalogue;
  new_agent uuid;
  added integer := 0;
  a record;
begin
  for c in
    select * from public.agent_catalogue where key = any (p_keys) order by sort
  loop
    insert into public.agents (
      company_id, catalogue_key, name, role, crew_pillar, outcome_metric, style_ref, model_tier,
      triggers, tools, skills, budget_per_run_credits, budget_per_month_credits,
      prompt_version, skills_version, status
    ) values (
      p_company, c.key, c.name, c.role, c.crew_pillar, c.outcome_metric, c.style_ref, c.model_tier,
      c.triggers, c.tools, c.skills, c.budget_per_run_credits, c.budget_per_month_credits,
      c.prompt_version, c.skills_version,
      case when c.engine then 'active' else 'standing_by' end::public.agent_status
    )
    on conflict (company_id, catalogue_key) do nothing
    returning id into new_agent;

    continue when new_agent is null;
    added := added + 1;

    for a in
      select s.key as action_type, private.start_level(s.value::smallint, s.key) as level
      from jsonb_each_text(c.start_autonomy) s
    loop
      insert into public.agent_autonomy (agent_id, company_id, action_type, level)
      values (new_agent, p_company, a.action_type, a.level);
      insert into public.agent_autonomy_events (company_id, agent_id, action_type, kind, to_level, reason)
      values (p_company, new_agent, a.action_type, 'seed', a.level, 'Starting level');
    end loop;
  end loop;
  return added;
end;
$$;

create function private.seed_crew(p_company uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.seed_agents(p_company, private.starter_crew());
$$;

-- Every new company gets its crew, whichever path created it.
create function private.seed_crew_for_new_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_crew(new.id);
  return new;
end;
$$;
create trigger companies_seed_crew after insert on public.companies
  for each row execute function private.seed_crew_for_new_company();

-- Finding the agent for a job ----------------------------------------------------------------

-- The company's agent with this catalogue key, if it has one.
create function private.crew_agent(p_company uuid, p_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.agents where company_id = p_company and catalogue_key = p_key;
$$;

-- Who runs a job: Shield for updates to policy documents; otherwise the job type's agent, then
-- its fallback, then Sol (D91). Returns the agent whatever its status: the worker decides what
-- a paused or locked agent means.
create function public.agent_for_job(p_company uuid, p_job_type text, p_payload jsonb default '{}')
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jt public.job_types;
  found uuid;
begin
  if p_job_type = 'document_update' and exists (
    select 1 from public.documents d
    where d.company_id = p_company
      and d.id::text = coalesce(p_payload ->> 'target', p_payload ->> 'document_id', '')
      and d.title ~* '(privacy|terms|cookie)'
  ) then
    found := private.crew_agent(p_company, 'shield');
    if found is not null then
      return found;
    end if;
  end if;

  select * into jt from public.job_types where job_type = p_job_type;
  found := coalesce(
    private.crew_agent(p_company, jt.default_agent),
    private.crew_agent(p_company, jt.fallback_agent),
    private.crew_agent(p_company, 'sol')
  );
  return found;
end;
$$;

-- Who an approval's executor run belongs to: the agent whose run proposed it; for approvals a
-- founder made themselves, by action type; else Sol (D91). Used by the executor and the backfill.
create function public.agent_for_approval(p_approval uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    proposer.agent_id,
    private.crew_agent(a.company_id, case a.action_type::text
      when 'publish_post' then 'echo'
      when 'reply_public' then 'echo'
      when 'send_email' then 'tilly'
      when 'update_voice' then 'iris'
      when 'update_memory' then 'mo'
      when 'file_document' then 'shield'
      when 'ad_spend' then 'nova'
      when 'launch_ad' then 'nova'
      when 'approve_campaign' then 'nova'
      else 'sol' end),
    private.crew_agent(a.company_id, 'sol')
  )
  from public.approvals a
  left join public.agent_runs proposer on proposer.id = a.run_id
  where a.id = p_approval;
$$;

-- Attributes runs that have no agent yet (the backfill, and seed data). Safe to run again.
-- Order matters: job runs first, so executor runs can take their proposer's agent.
create function private.attribute_runs(p_company uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  total integer := 0;
begin
  -- 1. Runs with a job: by job type (D91).
  update public.agent_runs r
  set agent_id = public.agent_for_job(r.company_id, j.job_type, j.payload)
  from public.agent_jobs j
  where j.id = r.job_id and r.agent_id is null
    and (p_company is null or r.company_id = p_company);
  get diagnostics n = row_count; total := total + n;

  -- 2. Streaming chat runs (no job; the chat function names them).
  update public.agent_runs r
  set agent_id = private.crew_agent(r.company_id, 'sol')
  where r.agent_id is null and r.job_id is null and r.task = 'Chat with Sol'
    and (p_company is null or r.company_id = p_company);
  get diagnostics n = row_count; total := total + n;

  -- 3. Other runs without a job that aren't executor runs (seed runs, older rows): the
  --    pillar's Starter crew member, else Sol. Done before executor runs so those can take
  --    their proposer's agent.
  update public.agent_runs r
  set agent_id = coalesce(
    private.crew_agent(r.company_id, case r.pillar
      when 'grow' then 'nova'
      when 'legal' then 'clara'
      when 'run' then 'tilly'
      else 'sol' end),
    private.crew_agent(r.company_id, 'sol')
  )
  where r.agent_id is null
    and not exists (select 1 from public.approvals a where a.execution_run_id = r.id)
    and (p_company is null or r.company_id = p_company);
  get diagnostics n = row_count; total := total + n;

  -- 4. Executor runs: see public.agent_for_approval.
  update public.agent_runs r
  set agent_id = public.agent_for_approval(a.id)
  from public.approvals a
  where a.execution_run_id = r.id and r.agent_id is null
    and (p_company is null or r.company_id = p_company);
  get diagnostics n = row_count; total := total + n;

  -- 5. Anything left: Sol.
  update public.agent_runs r
  set agent_id = private.crew_agent(r.company_id, 'sol')
  where r.agent_id is null
    and (p_company is null or r.company_id = p_company);
  get diagnostics n = row_count; total := total + n;

  -- Jobs: same rule, for queued and finished ones alike.
  update public.agent_jobs j
  set agent_id = public.agent_for_job(j.company_id, j.job_type, j.payload)
  where j.agent_id is null
    and (p_company is null or j.company_id = p_company);

  return total;
end;
$$;

-- Backfill ---------------------------------------------------------------------------------

-- 1. Every EXISTING company gets Sol and the Starter crew here, explicitly. The insert trigger
--    above only covers companies created from now on. This must run before the run backfill,
--    which looks agents up by company.
select private.seed_crew(id) from public.companies;

-- 2. Existing companies keep today's behaviour (D96): where a founder already set a reply
--    category to auto-send, Tilly's replies stay automatic (L3) rather than dropping to drafts in
--    Phase 23. A one-time exception to the 7-day L0 rule before a first L3 (D101), logged.
create function private.keep_auto_replies()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  with kept as (
    update public.agent_autonomy aa
    set level = 3
    from public.agents ag
    where ag.id = aa.agent_id and ag.catalogue_key = 'tilly' and aa.action_type = 'reply_inbox'
      and aa.level < 3
      and exists (
        select 1 from public.response_policies p
        where p.company_id = aa.company_id and p.mode = 'auto_send'
      )
    returning aa.agent_id, aa.company_id, aa.level
  )
  insert into public.agent_autonomy_events (company_id, agent_id, action_type, kind, from_level, to_level, reason)
  select company_id, agent_id, 'reply_inbox', 'seed', 2, 3,
    'Kept automatic replies the founder had already switched on (one-time exception to the 7-day simulation rule, D96)'
  from kept;
  get diagnostics n = row_count;
  return n;
end;
$$;
select private.keep_auto_replies();

-- 3. Attribute every existing run and job.
select private.attribute_runs();

do $$
begin
  if exists (select 1 from public.agent_runs where agent_id is null) then
    raise exception 'backfill left runs without an agent';
  end if;
end;
$$;

-- Access -----------------------------------------------------------------------------------

alter table public.autonomy_action_types enable row level security;
alter table public.agent_catalogue enable row level security;
alter table public.agents enable row level security;
alter table public.agent_autonomy enable row level security;
alter table public.agent_autonomy_events enable row level security;

revoke all on public.autonomy_action_types, public.agent_catalogue, public.agents,
  public.agent_autonomy, public.agent_autonomy_events from anon, authenticated, service_role;

grant select on public.autonomy_action_types, public.agent_catalogue to authenticated, service_role;
grant insert, update on public.autonomy_action_types, public.agent_catalogue to service_role;
create policy "Everyone signed in can read action types" on public.autonomy_action_types
  for select to authenticated using (true);
create policy "Everyone signed in can read the crew catalogue" on public.agent_catalogue
  for select to authenticated using (true);

grant select on public.agents, public.agent_autonomy, public.agent_autonomy_events to authenticated;
grant select, insert, update on public.agents, public.agent_autonomy to service_role;
-- History: insert and read only. No UPDATE, DELETE or TRUNCATE for anyone (D106).
grant select, insert on public.agent_autonomy_events to service_role;
create policy "Read the crew of companies you can read" on public.agents
  for select to authenticated using (private.can_read_company(company_id));
create policy "Read crew autonomy of companies you can read" on public.agent_autonomy
  for select to authenticated using (private.can_read_company(company_id));
create policy "Read crew autonomy history of companies you can read" on public.agent_autonomy_events
  for select to authenticated using (private.can_read_company(company_id));

revoke all on function private.starter_crew(), private.start_level(smallint, text),
  private.seed_agents(uuid, text[]), private.seed_crew(uuid), private.crew_agent(uuid, text),
  private.attribute_runs(uuid), private.seed_crew_for_new_company(),
  private.check_autonomy_ceiling(), private.keep_auto_replies()
  from public;
revoke all on function public.agent_for_job(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.agent_for_job(uuid, text, jsonb) to service_role;
revoke all on function public.agent_for_approval(uuid) from public, anon, authenticated;
grant execute on function public.agent_for_approval(uuid) to service_role;

-- The app refreshes the crew when it changes.
alter publication supabase_realtime add table public.agents, public.agent_autonomy;
