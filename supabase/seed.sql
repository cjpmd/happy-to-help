-- Demo data for local development and the staging project. Every person, school, firm and
-- grant here is fictional, and every email address is on example.com.
--
-- StudyBuddy (B2C, Build stage, Founder plan) has metrics, 8 runs (one failed with its hold
-- released), 3 pending approvals, a ledger, posts, compliance items and investors. The
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
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'jamie.lowe@example.com', 'Jamie Lowe')
) as people (id, email, full_name);

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now()
from auth.users
where id::text like 'a0000000-0000-4000-8000-%';

update public.profiles set is_admin = true where id = 'a0000000-0000-4000-8000-000000000003';

-- Companies -------------------------------------------------------------------------------

insert into public.companies (
  id, slug, name, description, customer_type, stage, plan, sector, channels, target_customer,
  goal_90d, website_live_url, website_preview_url, created_by
) values
  ('c0000000-0000-4000-8000-000000000001', 'studybuddy', 'StudyBuddy',
   'Bite-sized revision quizzes for Highers students. Personalised daily practice that adapts to what you get wrong.',
   'B2C', 'build', 'founder', 'education', '{Instagram,TikTok,Waitlist}', 'S5–S6 students sitting Highers',
   '500 weekly active students', '/site/studybuddy', '/site/studybuddy?preview=1', 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002', 'kelpie-energy', 'Kelpie Energy',
   'Smart heating controls for tenement flats. Cuts bills without landlord rewiring.',
   'B2C', 'evidence', 'starter', 'general', '{Instagram,TikTok,Waitlist}', null,
   null, '/site/kelpie-energy', '/site/kelpie-energy?preview=1', 'a0000000-0000-4000-8000-000000000004'),
  ('c0000000-0000-4000-8000-000000000003', 'thrift-loop', 'Thrift Loop',
   'Inventory and resale software for charity shops. Lists donated stock online in seconds.',
   'B2B', 'launch', 'growth', 'general', '{LinkedIn,"Email outreach","Trust page"}', null,
   null, '/site/thrift-loop', '/site/thrift-loop?preview=1', 'a0000000-0000-4000-8000-000000000004'),
  ('c0000000-0000-4000-8000-000000000004', 'croft-care', 'Croft Care',
   'Rota and visit-logging for rural home-care agencies. Works offline in remote areas.',
   'B2B', 'idea', 'starter', 'general', '{LinkedIn,"Email outreach","Trust page"}', null,
   null, '/site/croft-care', '/site/croft-care?preview=1', 'a0000000-0000-4000-8000-000000000004');

insert into public.company_members (company_id, user_id, role) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'founder'),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'teammate'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'founder'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'founder'),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004', 'founder'),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'founder');

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

-- Stage gates: stages before the current one are approved by the mentor, the current one is
-- in progress (Kelpie's Evidence gate is ready for sign-off), later ones are locked.

insert into public.stage_gates (company_id, stage, criteria, status, approved_by, approved_at)
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
  case when s.idx < c.current_idx then now() - make_interval(days => 20 * (c.current_idx - s.idx)) end
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
cross join (values ('idea'::public.stage, 1), ('evidence', 2), ('build', 3), ('launch', 4), ('grow', 5)) as s (stage, idx);

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
   '[{"tool": "web_search", "summary": "Searching for edtech angels…", "credits": 20}]')
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
   150, 'pending', null, null, now() - interval '10 hours');

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

-- Credit ledger (inserted as the table owner here; in the app only the service role inserts) ----

insert into public.credit_ledger (company_id, entry_type, amount, run_id, note, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'grant', 5000, null, 'Founder plan — monthly grant', date_trunc('month', now())),
  ('c0000000-0000-4000-8000-000000000001', 'topup', 10000, null, 'Launch Pack (build credits)', date_trunc('month', now()) + interval '2 days 10 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'usage', -6240, null, 'Landing page and quiz engine build', now() - interval '13 days'),
  ('c0000000-0000-4000-8000-000000000001', 'usage', -2180, null, 'Week 2 overnight runs', now() - interval '6 days'),
  ('c0000000-0000-4000-8000-000000000001', 'usage', -420, 'e0000000-0000-4000-8000-000000000004', 'Add streak counter', now() - interval '5 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'hold', -120, 'e0000000-0000-4000-8000-000000000005', 'Hold for OG images', now() - interval '4.5 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'release', 120, 'e0000000-0000-4000-8000-000000000005', 'Run failed — hold released', now() - interval '4.4 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'usage', -25, 'e0000000-0000-4000-8000-000000000006', 'Inbox summary', now() - interval '3 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'usage', -60, 'e0000000-0000-4000-8000-000000000007', 'ICO research', now() - interval '2.5 hours'),
  ('c0000000-0000-4000-8000-000000000001', 'hold', -80, 'e0000000-0000-4000-8000-000000000008', 'Hold for investor pipeline update', now() - interval '18 minutes'),
  ('c0000000-0000-4000-8000-000000000002', 'grant', 1500, null, 'Starter plan — monthly grant', date_trunc('month', now())),
  ('c0000000-0000-4000-8000-000000000002', 'usage', -1260, null, 'Research and landing page', now() - interval '9 days'),
  ('c0000000-0000-4000-8000-000000000003', 'grant', 12000, null, 'Growth plan — monthly grant', date_trunc('month', now())),
  ('c0000000-0000-4000-8000-000000000003', 'usage', -7400, null, 'Month to date', now() - interval '3 days'),
  ('c0000000-0000-4000-8000-000000000004', 'grant', 1500, null, 'Starter plan — monthly grant', date_trunc('month', now())),
  ('c0000000-0000-4000-8000-000000000004', 'usage', -90, null, 'Idea brief', now() - interval '19 days');

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

insert into public.compliance_items (company_id, title, category, due_date, status) values
  ('c0000000-0000-4000-8000-000000000001', 'Incorporate at Companies House', 'Incorporation', current_date - 49, 'done'),
  ('c0000000-0000-4000-8000-000000000001', 'Register for Corporation Tax', 'Incorporation', current_date - 19, 'done'),
  ('c0000000-0000-4000-8000-000000000001', 'Privacy policy (incl. under-16s)', 'Data protection', current_date - 1, 'done'),
  ('c0000000-0000-4000-8000-000000000001', 'Cookie notice', 'Data protection', current_date + 7, 'in_progress'),
  ('c0000000-0000-4000-8000-000000000001', 'Pay ICO data protection fee', 'Data protection', current_date + 24, 'upcoming'),
  ('c0000000-0000-4000-8000-000000000001', 'Confirmation statement', 'Companies House', current_date + 329, 'upcoming'),
  ('c0000000-0000-4000-8000-000000000001', 'First annual accounts', 'Companies House', current_date + 590, 'upcoming');

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

insert into public.metrics_daily (company_id, date, visitors, signups, paying_customers, mrr)
select
  c.id,
  current_date - (13 - i),
  round(c.visitors * (1 + c.growth * i) * (1 + ((i * 37) % 11) / 40.0 - 0.12)),
  greatest(0, round(c.signups * (1 + c.growth * i) * (1 + ((i * 37) % 11) / 40.0 - 0.12))),
  round(c.paying + i * case when c.paying > 0 then 0.4 else 0 end),
  round(c.paying + i * case when c.paying > 0 then 0.4 else 0 end) * c.price
from (values
  ('c0000000-0000-4000-8000-000000000001'::uuid, 140, 4, 7, 4.99, 0.06),
  ('c0000000-0000-4000-8000-000000000002'::uuid, 40, 2, 0, 0, 0.03),
  ('c0000000-0000-4000-8000-000000000003'::uuid, 320, 9, 14, 39, 0.04),
  ('c0000000-0000-4000-8000-000000000004'::uuid, 8, 0, 0, 0, 0.01)
) as c (id, visitors, signups, paying, price, growth)
cross join generate_series(0, 13) as i;

-- Workspace: routines, documents, email, ads ---------------------------------------------

insert into public.routines (company_id, title, cadence, credits)
select c.id, r.title, r.cadence, r.credits
from public.companies c
cross join lateral (values
  ('Morning brief', 'daily'::public.routine_cadence, 25),
  (case when c.customer_type = 'B2B' then 'Post to LinkedIn' else 'Draft Instagram post' end, 'weekdays', 40),
  ('Weekly investor update', 'weekly', 60)
) as r (title, cadence, credits);

with docs as (
  insert into public.documents (company_id, title, outcomes)
  select
    c.id,
    d.title,
    case when d.title = 'Product roadmap' and c.slug = 'studybuddy' then
      '[{"title": "Quiz engine", "complete": true}, {"title": "Waitlist", "complete": true}, {"title": "Daily streaks", "complete": false}, {"title": "Pricing page", "complete": false}, {"title": "Teacher dashboard", "complete": false}, {"title": "Accessibility review", "complete": false}, {"title": "Beta launch", "complete": false}]'::jsonb
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
