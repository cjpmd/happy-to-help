-- Demo data for local development and the staging project. Every person, school, firm and
-- grant here is fictional, and every email address is on example.com.
--
-- StudyBuddy (B2C, Build stage, Founder plan) has metrics, 9 runs (one failed with its hold
-- released), 4 pending approvals (the spec asks for 3; the fourth holds the Connect Stripe key
-- task), a ledger, posts, compliance items, investors and seven flight plan key tasks. The
-- "University Venture Programme" at Taybridge University adds 3 more companies and a mentor.
--
-- Demo accounts have no password: they sign in by magic link, or (staging only) through the
-- dev role switcher once scripts set a password. Never load this into production.
--
-- Dates are relative to when the seed runs, so the demo always looks current.

-- People ----------------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, now(),
  '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', full_name),
  now(), now(), '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'aisha.grant@example.com', 'Aisha Grant'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'morag.fraser@example.com', 'Dr Morag Fraser'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'admin@example.com', 'Platform Admin'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'callum.reid@example.com', 'Callum Reid'),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'jamie.lowe@example.com', 'Jamie Lowe'),
  ('a0000000-0000-4000-8000-000000000006'::uuid, 'rory.mackay@example.com', 'Rory MacKay')
) as people (id, email, full_name);

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now()
from auth.users
where id::text like 'a0000000-0000-4000-8000-%';

update public.profiles set is_admin = true where id = 'a0000000-0000-4000-8000-000000000003';

-- Companies -------------------------------------------------------------------------------

insert into public.companies (
  id, slug, name, description, customer_type, stage, plan, sector, channels, target_customer,
  goal_90d, website_live_url, website_preview_url, created_by, started_at
) values
  ('c0000000-0000-4000-8000-000000000001', 'studybuddy', 'StudyBuddy',
   'Bite-sized revision quizzes for Highers students. Personalised daily practice that adapts to what you get wrong.',
   'B2C', 'build', 'founder', 'education', '{Instagram,TikTok,Waitlist}', 'S5–S6 students sitting Highers',
   '500 weekly active students', '/site/studybuddy', '/site/studybuddy?preview=1', 'a0000000-0000-4000-8000-000000000001', now() - interval '30 days'),
  ('c0000000-0000-4000-8000-000000000002', 'kelpie-energy', 'Kelpie Energy',
   'Smart heating controls for tenement flats. Cuts bills without landlord rewiring.',
   'B2C', 'evidence', 'starter', 'general', '{Instagram,TikTok,Waitlist}', null,
   null, '/site/kelpie-energy', '/site/kelpie-energy?preview=1', 'a0000000-0000-4000-8000-000000000004', now() - interval '14 days'),
  ('c0000000-0000-4000-8000-000000000003', 'thrift-loop', 'Thrift Loop',
   'Inventory and resale software for charity shops. Lists donated stock online in seconds.',
   'B2B', 'launch', 'growth', 'general', '{LinkedIn,"Email outreach","Trust page"}', null,
   null, '/site/thrift-loop', '/site/thrift-loop?preview=1', 'a0000000-0000-4000-8000-000000000004', now() - interval '50 days'),
  ('c0000000-0000-4000-8000-000000000004', 'croft-care', 'Croft Care',
   'Rota and visit-logging for rural home-care agencies. Works offline in remote areas.',
   'B2B', 'idea', 'starter', 'general', '{LinkedIn,"Email outreach","Trust page"}', null,
   null, '/site/croft-care', '/site/croft-care?preview=1', 'a0000000-0000-4000-8000-000000000004', now() - interval '5 days'),
  ('c0000000-0000-4000-8000-000000000005', 'harbour-bakes', 'Harbour Bakes',
   'Sourdough, pastries and celebration cakes from a harbourside bakery in Taybridge. Click and collect, and local delivery on Saturdays.',
   'B2C', 'grow', 'founder', 'general', '{Instagram,TikTok,Waitlist}', 'Local families and cafés',
   'Grow weekly click-and-collect orders to 200', 'https://harbourbakes.example', '/site/harbour-bakes?preview=1', 'a0000000-0000-4000-8000-000000000006', now() - interval '21 days');

-- Harbour Bakes joined already trading (the Keep going path).
update public.companies
set entry_path = 'keep_going',
    existing_website_url = 'https://harbourbakes.example',
    social_handles = '{"instagram": "@harbourbakes", "facebook": "https://facebook.com/harbourbakes.example"}',
    google_business_url = 'https://business.google.com/harbourbakes.example'
where slug = 'harbour-bakes';

insert into public.company_members (company_id, user_id, role) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'founder'),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'teammate'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'founder'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'founder'),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004', 'founder'),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'founder'),
  ('c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000006', 'founder');

-- Cohort ----------------------------------------------------------------------------------

insert into public.cohorts (id, name, institution, credit_pool, join_code) values
  ('b0000000-0000-4000-8000-000000000001', 'University Venture Programme', 'Taybridge University', 60000, 'TAYBRIDGE-2026');
insert into public.cohort_companies (cohort_id, company_id, credit_cap) values
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 15000),
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 8000),
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 20000),
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 5000);
insert into public.cohort_mentors (cohort_id, user_id) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');

-- Stage gates: one per stage transition (GO FOR EVIDENCE on Idea, GO FOR BUILD on Evidence,
-- GO FOR LAUNCH on Build, GO FOR GROWTH on Launch), due on days 8, 18, 42 and 80 of the
-- mission. Stages before the current one are approved by the mentor on their target day, the
-- current one is in progress (Kelpie's Evidence gate is ready for sign-off), later ones are
-- locked.

insert into public.stage_gates (company_id, stage, criteria, status, approved_by, approved_at, target_date)
select
  c.id,
  s.stage,
  case s.stage
    when 'evidence' then c.evidence_criteria
    when 'build' then c.build_criteria
    else '[]'::jsonb
  end,
  case
    when s.idx < c.current_idx then 'approved'
    when s.idx = c.current_idx then case when c.current_ready then 'ready' else 'in_progress' end
    else 'locked'
  end::public.gate_status,
  case when s.idx < c.current_idx then 'a0000000-0000-4000-8000-000000000002'::uuid end,
  case when s.idx < c.current_idx then co.started_at + make_interval(days => s.target_day) end,
  (co.started_at + make_interval(days => s.target_day))::date
from (values
  ('c0000000-0000-4000-8000-000000000001'::uuid, 3, false,
   '[{"label": "Waitlist", "current": 64, "target": 50}, {"label": "Interviews", "current": 8, "target": 8}]'::jsonb,
   '[{"label": "Beta users", "current": 23, "target": 40}, {"label": "Interviews", "current": 5, "target": 8}, {"label": "Pre-orders", "current": 12, "target": 10}]'::jsonb),
  ('c0000000-0000-4000-8000-000000000002'::uuid, 2, true,
   '[{"label": "Waitlist", "current": 31, "target": 50}, {"label": "Interviews", "current": 5, "target": 8}]'::jsonb,
   '[{"label": "Beta users", "current": 0, "target": 40}]'::jsonb),
  ('c0000000-0000-4000-8000-000000000003'::uuid, 4, false,
   '[{"label": "Waitlist", "current": 120, "target": 50}, {"label": "Interviews", "current": 12, "target": 8}]'::jsonb,
   '[{"label": "Beta users", "current": 46, "target": 40}]'::jsonb),
  ('c0000000-0000-4000-8000-000000000004'::uuid, 1, false,
   '[{"label": "Waitlist", "current": 4, "target": 50}, {"label": "Interviews", "current": 1, "target": 8}]'::jsonb,
   '[{"label": "Beta users", "current": 0, "target": 40}]'::jsonb)
) as c (id, current_idx, current_ready, evidence_criteria, build_criteria)
join public.companies co on co.id = c.id
cross join (values ('idea'::public.stage, 1, 8), ('evidence', 2, 18), ('build', 3, 42), ('launch', 4, 80)) as s (stage, idx, target_day);

-- Harbour Bakes was already trading: its gates before Grow are imported.
insert into public.stage_gates (company_id, stage, criteria, status, target_date)
select 'c0000000-0000-4000-8000-000000000005', s, '[]', 'imported', (now() - interval '21 days')::date
from unnest(array['idea', 'evidence', 'build', 'launch']::public.stage[]) s;

insert into public.gate_comments (company_id, author_id, body, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   'Great interview depth. Push on the parent-pays assumption before Launch.', now() - interval '72 hours');

-- Evidence --------------------------------------------------------------------------------

insert into public.evidence_items (company_id, type, title, data, status) values
  ('c0000000-0000-4000-8000-000000000001', 'assumption', 'Students will revise on their phone for 10 minutes a day',
   '{"test": "7-day streak experiment with 20 beta users"}', 'validated'),
  ('c0000000-0000-4000-8000-000000000001', 'assumption', 'Parents will pay £4.99/month for exam-season access',
   '{"test": "Pre-order page with Stripe placeholder"}', 'testing'),
  ('c0000000-0000-4000-8000-000000000001', 'assumption', 'Teachers will recommend it to their classes',
   '{"test": "Outreach to 15 Taybridge schools"}', 'untested'),
  ('c0000000-0000-4000-8000-000000000001', 'assumption', 'Students prefer quizzes over flashcards',
   '{"test": "A/B test in beta"}', 'invalidated'),
  ('c0000000-0000-4000-8000-000000000001', 'interview', 'Ellie, S5, Taybridge Academy',
   jsonb_build_object('note', 'Uses TikTok for revision tips. Hates long videos. Would share streaks with friends.', 'date', now() - interval '9 days'), null),
  ('c0000000-0000-4000-8000-000000000001', 'interview', 'Mark, parent of S6 student',
   jsonb_build_object('note', 'Pays £30/hr for a maths tutor. Would pay for something that shows progress.', 'date', now() - interval '6 days'), null),
  ('c0000000-0000-4000-8000-000000000001', 'interview', 'Ms Khan, Chemistry teacher',
   jsonb_build_object('note', 'Wants class-level dashboards. Budget sits with the department head.', 'date', now() - interval '3 days'), null),
  ('c0000000-0000-4000-8000-000000000001', 'waitlist', 'Waitlist', '{"count": 64}', null),
  ('c0000000-0000-4000-8000-000000000001', 'preorder', 'Exam season pass pre-orders', '{"count": 12, "value_gbp": 59.88}', null);

-- Tasks -----------------------------------------------------------------------------------

insert into public.tasks (id, company_id, pillar, title, status, estimated_credits, due, proof) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'build', 'Add streak counter to quiz results page', 'doing', 150, null,
   '{"passed": 6, "total": 6, "screenshot": "/media/revision.svg", "preview": "/site/studybuddy?preview=1", "pr": "https://github.com/example/studybuddy/pull/12", "source": "agent"}'),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'build', 'Mobile layout for the pricing page', 'todo', 150, null, null),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'grow', 'Draft 5 TikTok scripts for prelims season', 'doing', 200, null, null),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'grow', 'Welcome email sequence', 'doing', 90, null, null),
  ('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'run', 'Reply to 3 teacher enquiries', 'todo', 30, current_date + 1, null),
  ('d0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', 'run', 'Send beta feedback survey', 'todo', 40, current_date + 3, null),
  ('d0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001', 'legal', 'Draft privacy policy (under-16 users)', 'doing', 120, null, null),
  ('d0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001', 'raise', 'Research 10 edtech angels', 'doing', 200, null, null),
  ('d0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', 'raise', 'Tay Founders Award application draft', 'doing', 300, current_date + 12, null);

update public.tasks set actor = 'founder'
where id in ('d0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000009');

-- StudyBuddy's key tasks: the milestones on its flight plan, due on day N of the mission.
insert into public.tasks (id, company_id, pillar, title, status, estimated_credits, due, completed_at, key, stage, actor, proof)
select
  k.id, 'c0000000-0000-4000-8000-000000000001', k.pillar, k.title, k.status, k.credits,
  current_date + (k.day - 30),
  case when k.status = 'done' then now() - make_interval(days => 30 - k.day) end,
  true, k.stage, k.actor, k.proof
from (values
  ('d1000000-0000-4000-8000-000000000001'::uuid, 'Customer interviews', 'run'::public.pillar, 'evidence'::public.stage, 12, 'done'::public.task_status, 0, 'founder'::public.task_actor, null::jsonb),
  ('d1000000-0000-4000-8000-000000000002', 'Approve product spec', 'build', 'build', 22, 'done', 0, 'founder', null),
  ('d1000000-0000-4000-8000-000000000003', 'Waitlist page live', 'build', 'build', 25, 'done', 300, 'sol',
   '{"passed": 6, "total": 6, "screenshot": "/media/revision.svg", "preview": "/site/studybuddy?preview=1", "pr": "Build #12", "source": "agent"}'),
  ('d1000000-0000-4000-8000-000000000004', 'Daily quiz feature', 'build', 'build', 34, 'doing', 420, 'sol', null),
  ('d1000000-0000-4000-8000-000000000005', 'Connect Stripe', 'build', 'build', 38, 'todo', 120, 'sol', null),
  ('d1000000-0000-4000-8000-000000000006', 'First paying customer', 'grow', 'launch', 50, 'todo', 0, 'founder', null),
  ('d1000000-0000-4000-8000-000000000007', '50 paying customers', 'grow', 'launch', 64, 'todo', 0, 'founder', null)
) as k (id, title, pillar, stage, day, status, credits, actor, proof);

-- Agent runs ------------------------------------------------------------------------------

insert into public.agent_runs (
  id, company_id, task_id, task, pillar, model, status, started_at, finished_at, cost_usd,
  credits_charged, usage, steps
)
select
  r.id, 'c0000000-0000-4000-8000-000000000001', r.task_id, r.task, r.pillar, 'claude-sonnet-5-5', r.status,
  now() - make_interval(secs => r.hours_ago * 3600),
  case when r.status in ('running', 'queued') then null
       else now() - make_interval(secs => r.hours_ago * 3600) + make_interval(mins => r.minutes) end,
  round(r.credits * 0.0042, 2),
  case when r.status = 'failed' then 0 else r.credits end,
  jsonb_build_object('input_tokens', r.credits * 210, 'output_tokens', r.credits * 38),
  r.steps
from (values
  ('e0000000-0000-4000-8000-000000000001'::uuid, null::uuid, 'Draft TikTok post: ''The 3-minute Higher Maths warm-up''', 'grow'::public.pillar, 'needs_approval'::public.run_status, 7.0, 2, 40,
   '[{"tool": "web_search", "summary": "Checked trending revision sounds", "credits": 10}, {"tool": "write", "summary": "Drafted caption and script", "credits": 30}]'::jsonb),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000004', 'Write welcome email for new waitlist signups', 'grow', 'needs_approval', 6.5, 3, 30,
   '[{"tool": "read_crm", "summary": "Pulled 9 new signups", "credits": 5}, {"tool": "write", "summary": "Wrote email in StudyBuddy voice", "credits": 25}]'),
  ('e0000000-0000-4000-8000-000000000003', null, 'Plan £30 Instagram test campaign', 'grow', 'needs_approval', 6.0, 4, 90,
   '[{"tool": "analytics", "summary": "Reviewed top-performing posts", "credits": 30}, {"tool": "ads_planner", "summary": "Built audience: 16–18, Scotland", "credits": 60}]'),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'Add streak counter to quiz results', 'build', 'succeeded', 5.0, 11, 420,
   '[{"tool": "repo_read", "summary": "Read results page", "credits": 60}, {"tool": "code_edit", "summary": "Added streak component and storage", "credits": 300}, {"tool": "deploy_preview", "summary": "Deployed to preview URL", "credits": 60}]'),
  ('e0000000-0000-4000-8000-000000000005', null, 'Generate Open Graph images for site', 'build', 'failed', 4.5, 1, 120,
   '[{"tool": "image_gen", "summary": "Provider timeout after 3 retries", "credits": 0}]'),
  ('e0000000-0000-4000-8000-000000000006', null, 'Summarise overnight inbox', 'run', 'succeeded', 3.0, 1, 25,
   '[{"tool": "inbox_read", "summary": "Read 14 emails, flagged 3 teacher enquiries", "credits": 25}]'),
  ('e0000000-0000-4000-8000-000000000007', null, 'Check ICO registration requirements', 'legal', 'succeeded', 2.5, 2, 60,
   '[{"tool": "web_search", "summary": "Confirmed tier 1 fee applies (£52)", "credits": 20}, {"tool": "write", "summary": "Prepared filing summary", "credits": 40}]'),
  ('e0000000-0000-4000-8000-000000000008', null, 'Update investor pipeline', 'raise', 'running', 0.3, 0, 80,
   '[{"tool": "web_search", "summary": "Searching for edtech angels…", "credits": 20}]'),
  ('e0000000-0000-4000-8000-000000000009', 'd1000000-0000-4000-8000-000000000005', 'Prepare Stripe checkout for the pricing page', 'build', 'needs_approval', 26.0, 3, 30,
   '[{"tool": "plan", "summary": "Planned checkout for the £4.99 monthly plan", "credits": 10}, {"tool": "propose_site_change", "summary": "Proposed Stripe checkout for approval", "credits": 20}]')
) as r (id, task_id, task, pillar, status, hours_ago, minutes, credits, steps);

-- Approvals -------------------------------------------------------------------------------
-- The first two are flagged by the claims check on purpose, so the edit-and-resubmit flow
-- has something to work on.

insert into public.approvals (id, company_id, run_id, action_type, payload, estimated_credits, status, decided_by, decided_at, created_at) values
  ('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'publish_post',
   jsonb_build_object('channel', 'TikTok', 'scheduled_for', to_char(now() + interval '9 hours', 'FMDD Mon YYYY, HH24:MI'),
     'text', 'POV: it''s 10 minutes before your Higher Maths prelim 😬 Here''s the 3-minute warm-up that actually works 👇 #HighersRevision #SQA',
     'reason', 'Revision-hack posts drove 71% of last week''s signups. 16:30 is when your audience is most active.'),
   40, 'pending', null, null, now() - interval '7 hours'),
  ('f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'send_email',
   jsonb_build_object('to', '9 new waitlist signups', 'subject', 'You''re in — your first quiz is ready',
     'body', E'Hi {first_name},\n\nThanks for joining StudyBuddy. Your first 10-minute quiz is waiting, built around the topics most Highers students find hardest.\n\nKeep a 3-day streak and we''ll unlock your personal weak-spots report.\n\nAisha, founder',
     'reason', 'Signups who get a welcome email within 24 hours are far more likely to try a first quiz.'),
   30, 'pending', null, null, now() - interval '6.5 hours'),
  ('f0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'ad_spend',
   '{"platform": "Instagram", "amount_gbp": 30, "duration": "5 days", "audience": "Ages 16–18, Scotland, interests: exams, study", "creative": "Reuse best-performing TikTok as Reel", "reason": "Test whether paid reach converts at under £1.50 per signup before prelims."}',
   90, 'pending', null, null, now() - interval '6 hours'),
  ('f0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', null, 'file_document',
   '{"document": "Privacy policy v1", "destination": "studybuddy.example/privacy", "reason": "Required before collecting student emails."}',
   20, 'approved', 'a0000000-0000-4000-8000-000000000001', now() - interval '30 hours', now() - interval '40 hours'),
  ('f0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', null, 'publish_post',
   '{"channel": "X", "text": "Revision is broken. We''re fixing it.", "reason": "Brand awareness"}',
   40, 'declined', 'a0000000-0000-4000-8000-000000000001', now() - interval '50 hours', now() - interval '60 hours'),
  ('f0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000002', null, 'publish_site',
   '{"change": "New landing page hero and waitlist form", "url": "/site/kelpie-energy?preview=1", "reason": "Current page has no clear call to action."}',
   150, 'pending', null, null, now() - interval '10 hours'),
  ('f0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000009', 'publish_site',
   '{"change": "Connect Stripe checkout to the pricing page (£4.99 a month, test mode)", "url": "/site/studybuddy?preview=1", "reason": "Pre-orders passed the Launch gate target (12 of 10). Checkout lets them convert to paying."}',
   120, 'pending', null, null, now() - interval '25.5 hours');

-- The approved filing was carried out at the time.
update public.approvals set execution_status = 'done', executed_at = decided_at where status = 'approved';

-- Activity --------------------------------------------------------------------------------

insert into public.activity_events (company_id, type, summary, run_id, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'build', 'Shipped streak counter to preview', 'e0000000-0000-4000-8000-000000000004', now() - interval '5 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'grow', 'Drafted TikTok post and welcome email for approval', null, now() - interval '6.5 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'run', 'Triaged 14 emails — 3 teacher enquiries need you', 'e0000000-0000-4000-8000-000000000006', now() - interval '3 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'legal', 'Confirmed ICO fee: tier 1, £52, due ' || to_char(current_date + 24, 'FMDD Mon YYYY'),
   'e0000000-0000-4000-8000-000000000007', now() - interval '2.5 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'refund', 'OG image run failed — 120 credits released', 'e0000000-0000-4000-8000-000000000005', now() - interval '4.4 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'evidence', 'Waitlist passed 64 (+9 overnight)', null, now() - interval '8 hours'),
  ('c0000000-0000-4000-8000-000000000002', 'evidence', 'Logged interview with a tenant in a Taybridge tenement', null, now() - interval '12 hours'),
  ('c0000000-0000-4000-8000-000000000003', 'grow', 'Published 3 LinkedIn posts', null, now() - interval '30 hours');

-- Credit ledger -------------------------------------------------------------------------------
-- Inserted as the table owner with the engine's own helpers, so every debit points at the lot
-- it came from (supabase/migrations/*_credits_engine.sql). In the app only the service role
-- writes the ledger, through the credit RPCs.

insert into public.credit_ledger (company_id, entry_type, amount, note, bucket, expires_at, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'grant', 5000, 'Founder plan — monthly grant', 'plan', now() + interval '10 days', now() - interval '20 days'),
  ('c0000000-0000-4000-8000-000000000001', 'topup', 10000, 'Launch Pack (build credits)', 'topup', now() + interval '12 months' - interval '18 days', now() - interval '18 days'),
  ('c0000000-0000-4000-8000-000000000002', 'grant', 1500, 'Starter plan — monthly grant', 'plan', now() + interval '10 days', now() - interval '20 days'),
  ('c0000000-0000-4000-8000-000000000003', 'grant', 12000, 'Growth plan — monthly grant', 'plan', now() + interval '10 days', now() - interval '20 days'),
  ('c0000000-0000-4000-8000-000000000004', 'grant', 1500, 'Starter plan — monthly grant', 'plan', now() + interval '10 days', now() - interval '20 days'),
  ('c0000000-0000-4000-8000-000000000005', 'grant', 5000, 'Founder plan — monthly grant', 'plan', now() + interval '10 days', now() - interval '20 days');

do $$
declare
  sb constant uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  perform private.debit(sb, 'usage', 6240, null, 'Landing page and quiz engine build', now() - interval '13 days');
  perform private.debit(sb, 'usage', 2180, null, 'Week 2 overnight runs', now() - interval '6 days');
  perform private.debit(sb, 'usage', 420, 'e0000000-0000-4000-8000-000000000004', 'Add streak counter', now() - interval '5 hours');
  -- The failed OG image run: held, then released when it failed before using anything.
  perform private.debit(sb, 'hold', 120, 'e0000000-0000-4000-8000-000000000005', 'Hold for OG images', now() - interval '4.5 hours');
  perform private.release_run_holds('e0000000-0000-4000-8000-000000000005', 'Run failed — hold released');
  perform private.debit(sb, 'usage', 25, 'e0000000-0000-4000-8000-000000000006', 'Inbox summary', now() - interval '3 hours');
  perform private.debit(sb, 'usage', 60, 'e0000000-0000-4000-8000-000000000007', 'ICO research', now() - interval '2.5 hours');
  -- The investor pipeline run still running holds its reservation.
  perform private.debit(sb, 'hold', 80, 'e0000000-0000-4000-8000-000000000008', 'Hold for investor pipeline update', now() - interval '18 minutes');
  perform private.debit('c0000000-0000-4000-8000-000000000002', 'usage', 1260, null, 'Research and landing page', now() - interval '9 days');
  perform private.debit('c0000000-0000-4000-8000-000000000003', 'usage', 7400, null, 'Month to date', now() - interval '3 days');
  perform private.debit('c0000000-0000-4000-8000-000000000004', 'usage', 90, null, 'Idea brief', now() - interval '19 days');
  perform private.debit('c0000000-0000-4000-8000-000000000005', 'usage', 640, null, 'Import, voice analysis and first posts', now() - interval '18 days');
end;
$$;

-- Chat ------------------------------------------------------------------------------------

insert into public.chat_messages (company_id, sender, author_id, content, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'founder', 'a0000000-0000-4000-8000-000000000001',
   'Can you focus on prelims this week? Mocks start next month.', now() - interval '14 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'sol', null,
   'On it. Tonight I''ll draft prelim-themed posts, a welcome email for new signups, and a small ad test. Everything will be waiting for your approval.',
   now() - interval '13.9 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'sol', null,
   'Morning Aisha ☀️ 3 things need you today. The streak counter is live on preview — have a look on mobile.',
   now() - interval '30 minutes');

-- Grow ------------------------------------------------------------------------------------

insert into public.social_posts (company_id, approval_id, channel, text, angle, status, scheduled_for, metrics) values
  ('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'TikTok', 'POV: 10 minutes before your Higher Maths prelim…', 'Revision hack', 'awaiting_approval', now() + interval '9 hours', '{"clicks": 0, "signups": 0}'),
  ('c0000000-0000-4000-8000-000000000001', null, 'Instagram', 'Your weak spots, found in 10 minutes a day.', 'Product', 'scheduled', now() + interval '1 day', '{"clicks": 0, "signups": 0}'),
  ('c0000000-0000-4000-8000-000000000001', null, 'TikTok', 'Chemistry Higher: the 5 questions everyone gets wrong', 'Revision hack', 'scheduled', now() + interval '2 days', '{"clicks": 0, "signups": 0}'),
  ('c0000000-0000-4000-8000-000000000001', null, 'LinkedIn', 'Why we''re building StudyBuddy for Scottish students first', 'Founder story', 'draft', now() + interval '4 days', '{"clicks": 0, "signups": 0}'),
  ('c0000000-0000-4000-8000-000000000001', null, 'TikTok', 'How I''d revise English Higher in 2 weeks', 'Revision hack', 'published', now() - interval '2 days', '{"clicks": 412, "signups": 21}'),
  ('c0000000-0000-4000-8000-000000000001', null, 'Instagram', 'Streaks are coming 🔥', 'Product', 'published', now() - interval '4 days', '{"clicks": 138, "signups": 6}'),
  ('c0000000-0000-4000-8000-000000000001', null, 'X', 'Prelims in 3 weeks. Here''s a plan.', 'Revision hack', 'published', now() - interval '6 days', '{"clicks": 54, "signups": 2}');

-- Stay legal ------------------------------------------------------------------------------

insert into public.compliance_items (company_id, title, category, due_date, status, statutory) values
  ('c0000000-0000-4000-8000-000000000001', 'Incorporate at Companies House', 'Incorporation', current_date - 49, 'done', false),
  ('c0000000-0000-4000-8000-000000000001', 'Register for Corporation Tax', 'Incorporation', current_date - 19, 'done', true),
  ('c0000000-0000-4000-8000-000000000001', 'Privacy policy (incl. under-16s)', 'Data protection', current_date - 1, 'done', false),
  ('c0000000-0000-4000-8000-000000000001', 'Cookie notice', 'Data protection', current_date + 7, 'in_progress', false),
  ('c0000000-0000-4000-8000-000000000001', 'Pay ICO data protection fee', 'Data protection', current_date + 24, 'upcoming', true),
  ('c0000000-0000-4000-8000-000000000001', 'Confirmation statement', 'Companies House', current_date + 329, 'upcoming', true),
  ('c0000000-0000-4000-8000-000000000001', 'First annual accounts', 'Companies House', current_date + 590, 'upcoming', true);

-- Raise -----------------------------------------------------------------------------------

insert into public.investors (company_id, name, firm, stage, notes) values
  ('c0000000-0000-4000-8000-000000000001', 'Fiona MacLeod', 'Northgate Angels', 'meeting', 'Intro via the programme. Meeting next week.'),
  ('c0000000-0000-4000-8000-000000000001', 'Tom Hughes', 'Firth Ventures', 'contacted', 'Sent the deck last week.'),
  ('c0000000-0000-4000-8000-000000000001', 'Priya Shah', 'Angel (ex-travel-tech founder)', 'researching', 'Backs edtech and consumer apps.'),
  ('c0000000-0000-4000-8000-000000000001', 'Gregor Wallace', 'Taybridge Growth Fund', 'diligence', 'Reviewing traction data.'),
  ('c0000000-0000-4000-8000-000000000001', 'Laura Kent', 'Larchfield Equity', 'passed', 'Too early. Revisit at £5k MRR.'),
  ('c0000000-0000-4000-8000-000000000001', 'Ross Begg', 'Angel', 'committed', '£10k at SAFE terms.'),
  ('c0000000-0000-4000-8000-000000000001', 'Hannah Ito', 'Lumen Impact Ventures', 'researching', 'Impact focus — education access.');

insert into public.grants (company_id, name, amount, deadline, status) values
  ('c0000000-0000-4000-8000-000000000001', 'Tay Founders Award', 'Up to £50,000', current_date + 12, 'Drafting'),
  ('c0000000-0000-4000-8000-000000000001', 'Campus Spark Challenge', '£10,000 + support', current_date + 90, 'Eligible'),
  ('c0000000-0000-4000-8000-000000000001', 'Northern Innovation Fund', '£25,000–£250,000', current_date + 50, 'Researching');

-- Run -------------------------------------------------------------------------------------

insert into public.contacts (company_id, name, email, kind, value, last_contact_at) values
  ('c0000000-0000-4000-8000-000000000001', 'Ms Khan', 's.khan@example.com', 'lead', 'School licence', now() - interval '20 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'Mark Daly', 'mark.daly@example.com', 'customer', '£4.99/mo', now() - interval '48 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'Taybridge Academy (Maths dept)', 'maths.dept@example.com', 'lead', 'Pilot', now() - interval '70 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'Rachel Boyd', 'rachel.boyd@example.com', 'customer', '£4.99/mo', now() - interval '90 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'Mr Patel', 'r.patel@example.com', 'lead', 'School licence', now() - interval '110 hours');

-- Build -----------------------------------------------------------------------------------

insert into public.site_versions (company_id, version, summary, preview_url, published_at) values
  ('c0000000-0000-4000-8000-000000000001', 'v0.8', 'Quiz engine and landing page', '/site/studybuddy', now() - interval '13 days'),
  ('c0000000-0000-4000-8000-000000000001', 'v0.9', 'Add streak counter to quiz results', '/site/studybuddy?preview=1', now() - interval '5 hours'),
  ('c0000000-0000-4000-8000-000000000002', 'v0.1', 'Landing page and waitlist form', '/site/kelpie-energy', now() - interval '9 days'),
  ('c0000000-0000-4000-8000-000000000003', 'v1.0', 'Public launch', '/site/thrift-loop', now() - interval '25 days');

-- Metrics: 14 days per company, with steady growth and a little day-to-day wobble ----------

insert into public.metrics_daily (company_id, date, visitors, signups, paying_customers, mrr, activated)
select
  c.id,
  current_date - (13 - i),
  round(c.visitors * (1 + c.growth * i) * (1 + ((i * 37) % 11) / 40.0 - 0.12)),
  greatest(0, round(c.signups * (1 + c.growth * i) * (1 + ((i * 37) % 11) / 40.0 - 0.12))),
  round(c.paying + i * case when c.paying > 0 then 0.4 else 0 end),
  round(c.paying + i * case when c.paying > 0 then 0.4 else 0 end) * c.price,
  greatest(0, round(c.signups * 0.6 * (1 + c.growth * i)))
from (values
  ('c0000000-0000-4000-8000-000000000001'::uuid, 140, 4, 7, 4.99, 0.06),
  ('c0000000-0000-4000-8000-000000000002'::uuid, 40, 2, 0, 0, 0.03),
  ('c0000000-0000-4000-8000-000000000003'::uuid, 320, 9, 14, 39, 0.04),
  ('c0000000-0000-4000-8000-000000000004'::uuid, 8, 0, 0, 0, 0.01),
  ('c0000000-0000-4000-8000-000000000005'::uuid, 260, 6, 140, 18.5, 0.02)
) as c (id, visitors, signups, paying, price, growth)
cross join generate_series(0, 13) as i;

-- Workspace: routines, documents, email, ads ---------------------------------------------

insert into public.routines (company_id, title, cadence, credits, job_type)
select c.id, r.title, r.cadence, r.credits, r.job_type
from public.companies c
cross join lateral (values
  ('Morning brief', 'daily'::public.routine_cadence, 25, 'morning_brief'),
  (case when c.customer_type = 'B2B' then 'Post to LinkedIn' else 'Draft Instagram post' end, 'weekdays', 40, 'social_post'),
  ('Weekly investor update', 'weekly', 60, 'investor_update')
) as r (title, cadence, credits, job_type);

with docs as (
  insert into public.documents (company_id, title, outcomes)
  select
    c.id,
    d.title,
    case when d.title = 'Product roadmap' and c.slug = 'studybuddy' then
      '[{"title": "Quiz engine", "complete": true}, {"title": "Waitlist", "complete": true}, {"title": "Daily streaks", "complete": false}, {"title": "Pricing page", "complete": false}, {"title": "Teacher dashboard", "complete": false}, {"title": "Weak-spots report", "complete": false}, {"title": "Accessibility review", "complete": false}, {"title": "Beta launch", "complete": false}]'::jsonb
    end
  from public.companies c
  cross join unnest(array['Company profile', 'Product roadmap', 'Brand & voice guide', 'Privacy policy', 'Pitch one-pager']) as d (title)
  returning id, company_id, title
)
insert into public.document_versions (document_id, company_id, version, content, created_at)
select
  docs.id, docs.company_id, 1,
  case docs.title
    when 'Company profile' then c.name || E'\n\n' || c.description || E'\n\nTarget customer: '
      || coalesce(c.target_customer, c.customer_type::text) || E'.\n90-day goal: '
      || coalesce(c.goal_90d, 'Validate demand with customer interviews') || '.'
    when 'Product roadmap' then 'Outcomes for the next release. Prioritised using customer interviews.'
    when 'Brand & voice guide' then 'Voice: clear, encouraging and honest. Avoid guarantees and unsupported claims.'
    when 'Privacy policy' then E'DRAFT — requires legal review.\n\nWe collect contact details with consent for beta access. We do not sell personal data. Retention periods, lawful bases, rights and contact details must be confirmed before publication.'
    else c.name || E'\n\n' || c.description || E'\n\nProblem, solution and early evidence: see the company evidence board. Funding ask has not been set.'
  end,
  now() - interval '1 day'
from docs
join public.companies c on c.id = docs.company_id;

with thread as (
  insert into public.email_threads (company_id, subject, contact_name, address, mode)
  values ('c0000000-0000-4000-8000-000000000001', 'Classroom beta access', 'Ms Khan', 's.khan@example.com', 'support')
  returning id, company_id
)
insert into public.email_messages (thread_id, company_id, direction, body, created_at)
select thread.id, thread.company_id, m.direction, m.body, m.created_at
from thread, (values
  ('received'::public.email_direction, 'Could we try StudyBuddy with our S5 class? What information do you collect?', now() - interval '22 hours'),
  ('sent', 'Thanks for your interest. We are reviewing the classroom beta and privacy requirements before inviting schools.', now() - interval '20 hours')
) as m (direction, body, created_at);

with thread as (
  insert into public.email_threads (company_id, subject, contact_name, address, mode)
  values ('c0000000-0000-4000-8000-000000000001', 'Pilot invitation draft', 'School pilot batch', '5 reviewed contacts', 'outreach')
  returning id, company_id
)
insert into public.email_messages (thread_id, company_id, direction, body, created_at)
select thread.id, thread.company_id, 'draft', 'Would your team be interested in a short conversation about the pilot?', now() - interval '20 hours'
from thread;

insert into public.ad_accounts (company_id, status, daily_budget, hard_cap, spend, clicks, signups)
select id, 'not_connected', 0, 50, 0, 0, 0 from public.companies where slug <> 'studybuddy';
insert into public.ad_accounts (company_id, status, daily_budget, hard_cap, spend, clicks, signups) values
  ('c0000000-0000-4000-8000-000000000001', 'demo', 6, 50, 30, 122, 20);

-- Harbour Bakes: customers and leads imported at onboarding, an inbox with enquiries waiting,
-- posts, and the writing Sol learned its voice from.

insert into public.contacts (company_id, name, email, kind, value, source, last_contact_at) values
  ('c0000000-0000-4000-8000-000000000005', 'Sarah Patel', 'sarah.patel@example.com', 'customer', 'Weekly sourdough', 'import', now() - interval '2 days'),
  ('c0000000-0000-4000-8000-000000000005', 'Tom Gillespie', 'tom.gillespie@example.com', 'customer', 'Cinnamon buns, Saturdays', 'import', now() - interval '6 days'),
  ('c0000000-0000-4000-8000-000000000005', 'The Quay Café', 'orders@quaycafe.example.com', 'customer', 'Wholesale, 3 days a week', 'import', now() - interval '1 day'),
  ('c0000000-0000-4000-8000-000000000005', 'Fiona Reid', 'fiona.reid@example.com', 'lead', 'Wedding cake enquiry', 'form', now() - interval '5 hours'),
  ('c0000000-0000-4000-8000-000000000005', 'Ahmed Khan', 'ahmed.khan@example.com', 'lead', 'Office breakfast order', 'form', now() - interval '20 hours'),
  ('c0000000-0000-4000-8000-000000000005', 'Lucy Moore', 'lucy.moore@example.com', 'lead', 'Birthday cake', 'import', now() - interval '3 days');

with thread as (
  insert into public.email_threads (company_id, subject, contact_name, address, mode, created_at) values
    ('c0000000-0000-4000-8000-000000000005', 'Wedding cake for 80 guests', 'Fiona Reid', 'fiona.reid@example.com', 'support', now() - interval '5 hours'),
    ('c0000000-0000-4000-8000-000000000005', 'Breakfast for our team on Friday', 'Ahmed Khan', 'ahmed.khan@example.com', 'support', now() - interval '20 hours'),
    ('c0000000-0000-4000-8000-000000000005', 'Gluten-free options?', 'Sarah Patel', 'sarah.patel@example.com', 'support', now() - interval '2 days')
  returning id, company_id, subject, created_at
)
insert into public.email_messages (thread_id, company_id, direction, body, created_at)
select thread.id, thread.company_id, m.direction, m.body, thread.created_at + m.after
from thread
join (values
  ('Wedding cake for 80 guests', 'received'::public.email_direction, 'Hello! We''re getting married in June and would love a three-tier cake for 80 guests. Do you do tastings?', interval '0'),
  ('Breakfast for our team on Friday', 'received', 'Could you deliver pastries for 25 people to our office on Friday at 8:30?', interval '0'),
  ('Gluten-free options?', 'received', 'Do you have anything gluten-free? My daughter is coeliac.', interval '0'),
  ('Gluten-free options?', 'sent', E'Hi Sarah,\n\nThanks for asking. We bake in a kitchen that uses flour, so we can''t promise anything is safe for coeliacs. Our almond cake has no gluten ingredients, but it''s made alongside wheat.\n\nBest wishes\nRory', interval '3 hours')
) as m (subject, direction, body, after) on m.subject = thread.subject;

insert into public.social_posts (company_id, channel, text, angle, status, scheduled_for, metrics) values
  ('c0000000-0000-4000-8000-000000000005', 'Instagram', 'Saturday''s sourdough, fresh from the oven. Order by Thursday for click and collect.', 'Behind the scenes', 'published', now() - interval '3 days', '{"clicks": 210, "signups": 14}'),
  ('c0000000-0000-4000-8000-000000000005', 'TikTok', 'How we laminate 200 croissants before 6am', 'Behind the scenes', 'published', now() - interval '6 days', '{"clicks": 380, "signups": 9}'),
  ('c0000000-0000-4000-8000-000000000005', 'Instagram', 'Cinnamon bun season is back.', 'Product', 'scheduled', now() + interval '1 day', '{"clicks": 0, "signups": 0}');

insert into public.voice_sources (company_id, kind, content, added_by) values
  ('c0000000-0000-4000-8000-000000000005', 'website', 'Sourdough, pastries and celebration cakes, baked every morning by the harbour. Fresh from the oven, as always. Pop in and say hello.', 'a0000000-0000-4000-8000-000000000006'),
  ('c0000000-0000-4000-8000-000000000005', 'email', E'Hi Tom,\n\nYour cinnamon buns are back this Saturday. Fresh from the oven, as always.\n\nBest wishes\nRory', 'a0000000-0000-4000-8000-000000000006');

-- Harbour Bakes' hub page, tracked links, clicks and form leads (Phase 13).
update public.hub_pages set enabled = true,
  headline = 'Harbour Bakes',
  bio = 'Sourdough, pastries and celebration cakes, baked every morning by the harbour in Taybridge.',
  links = '[{"label": "Order for Saturday collection", "url": "https://harbourbakes.example/order"}, {"label": "Celebration cakes", "url": "https://harbourbakes.example/cakes"}]'
where company_id = 'c0000000-0000-4000-8000-000000000005';

insert into public.tracked_links (id, company_id, code, destination, label, channel, medium, campaign, spend_gbp, created_by, created_at) values
  ('b1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005', 'HBinsta01', 'http://127.0.0.1:8080/h/harbour-bakes', 'Instagram bio', 'instagram', 'social', 'always-on', null, 'a0000000-0000-4000-8000-000000000006', now() - interval '20 days'),
  ('b1000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000005', 'HBflyer01', 'http://127.0.0.1:8080/h/harbour-bakes', 'Wedding fair flyer', 'print', 'qr', 'wedding-fair', 45, 'a0000000-0000-4000-8000-000000000006', now() - interval '12 days'),
  ('b1000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000005', 'HBtiktok1', 'https://harbourbakes.example/order', 'Croissant video', 'tiktok', 'social', 'always-on', null, 'a0000000-0000-4000-8000-000000000006', now() - interval '6 days');

insert into public.link_clicks (link_id, company_id, clicked_at, country, device, referrer_host)
select l, 'c0000000-0000-4000-8000-000000000005', now() - (n || ' hours')::interval, 'GB',
  case when n % 4 = 0 then 'desktop' else 'mobile' end,
  case l when 'b1000000-0000-4000-8000-000000000001' then 'l.instagram.com' when 'b1000000-0000-4000-8000-000000000003' then 'www.tiktok.com' end
from (values ('b1000000-0000-4000-8000-000000000001'::uuid, 140), ('b1000000-0000-4000-8000-000000000002'::uuid, 38), ('b1000000-0000-4000-8000-000000000003'::uuid, 90)) as v (l, total),
  generate_series(1, total) n;

-- Fiona and Ahmed came in through the form: Fiona from the wedding fair flyer, Ahmed from Instagram.
with f as (select id from public.forms where company_id = 'c0000000-0000-4000-8000-000000000005' limit 1),
c as (select id, email from public.contacts where company_id = 'c0000000-0000-4000-8000-000000000005' and email in ('fiona.reid@example.com', 'ahmed.khan@example.com', 'tom.gillespie@example.com'))
insert into public.leads (company_id, contact_id, form_id, link_id, channel, campaign, message, status, created_at)
select 'c0000000-0000-4000-8000-000000000005', c.id, f.id, v.link, v.channel, v.campaign, v.message, v.status, now() - v.ago
from f, c join (values
  ('fiona.reid@example.com', 'b1000000-0000-4000-8000-000000000002'::uuid, 'print', 'wedding-fair', 'Three-tier cake for 80 guests in June.', 'new', interval '5 hours'),
  ('ahmed.khan@example.com', 'b1000000-0000-4000-8000-000000000001'::uuid, 'instagram', 'always-on', 'Pastries for 25 on Friday.', 'contacted', interval '20 hours'),
  ('tom.gillespie@example.com', 'b1000000-0000-4000-8000-000000000001'::uuid, 'instagram', 'always-on', 'Do you deliver on Saturdays?', 'won', interval '15 days')
) as v (email, link, channel, campaign, message, status, ago) on v.email = c.email;

insert into public.consents (company_id, contact_id, purpose, status, lawful_basis, wording, source, form_id, created_at)
select 'c0000000-0000-4000-8000-000000000005', c.id, p.purpose, p.status, p.basis, p.wording, 'form', f.id, now() - interval '5 hours'
from public.contacts c, (select id from public.forms where company_id = 'c0000000-0000-4000-8000-000000000005' limit 1) f,
  (values ('service', 'granted', 'legitimate_interests', 'Replies to your enquiry'),
          ('marketing', 'granted', 'consent', 'Send me occasional news and offers by email. I can unsubscribe at any time.')) as p (purpose, status, basis, wording)
where c.company_id = 'c0000000-0000-4000-8000-000000000005' and c.email = 'fiona.reid@example.com';

-- Messages already answered aren't waiting in the inbox (Phase 14).
update public.inbox_items i set status = 'closed'
where exists (
  select 1 from public.email_messages s join public.email_messages m on m.id = i.message_id
  where s.thread_id = i.thread_id and s.direction = 'sent' and s.created_at > m.created_at);

-- Crew (Phase 20): every company got its Starter crew when it was inserted; the seeded runs
-- above have no agent yet, so attribute them the same way the migration backfilled real ones.
select private.attribute_runs();
