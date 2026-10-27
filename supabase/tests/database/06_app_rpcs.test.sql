-- The app's server-side writes (supabase/migrations/20261026100100_app_rpcs.sql): who can
-- call each one, and the rules each enforces.
begin;
\ir _setup.psql
select * from no_plan();

-- Fixtures: a pending post with a flagged claim, a clean one, an expensive one and an ad change.
create function pg_temp.approval(p_name text) returns uuid language sql immutable as $$
  select case p_name
    when 'flagged' then '44444444-0000-4000-8000-000000000001'
    when 'clean' then '44444444-0000-4000-8000-000000000002'
    when 'pricey' then '44444444-0000-4000-8000-000000000003'
    when 'over_cap' then '44444444-0000-4000-8000-000000000004'
    when 'email' then '44444444-0000-4000-8000-000000000005'
    when 'b_clean' then '44444444-0000-4000-8000-000000000006'
  end::uuid
$$;
grant execute on function pg_temp.approval(text) to authenticated, service_role;

insert into public.approvals (id, company_id, action_type, payload, estimated_credits) values
  (pg_temp.approval('flagged'), pg_temp.id('company_a'), 'publish_post', '{"channel": "X", "text": "The best app in Scotland"}', 40),
  (pg_temp.approval('clean'), pg_temp.id('company_a'), 'publish_post', '{"channel": "X", "text": "Ten minutes a day", "reason": "Signups like it"}', 40),
  -- More than company A's 1,000 credits plus its 5,000 cohort headroom.
  (pg_temp.approval('pricey'), pg_temp.id('company_a'), 'publish_post', '{"channel": "X", "text": "Hello again"}', 7000),
  (pg_temp.approval('over_cap'), pg_temp.id('company_a'), 'ad_spend', '{"platform": "Meta Ads", "amount_gbp": 80, "daily_budget": 80, "duration": "per day", "audience": "All", "creative": "Reel"}', 10),
  (pg_temp.approval('email'), pg_temp.id('company_a'), 'send_email', '{"to": "a@example.com", "subject": "Hi", "body": "We guarantee results"}', 10),
  (pg_temp.approval('b_clean'), pg_temp.id('company_b'), 'publish_post', '{"channel": "X", "text": "Hello from B"}', 40);
update public.documents set outcomes = '[{"title": "Teacher dashboard", "complete": false}, {"title": "Quiz engine", "complete": true}]'
where company_id = pg_temp.id('company_a') and title = 'Company profile';
update public.documents set title = 'Product roadmap' where company_id = pg_temp.id('company_a') and title = 'Company profile';

-- Claims check ------------------------------------------------------------------------------

select pg_temp.login('founder');
select is(jsonb_array_length(public.check_claims(pg_temp.id('company_a'), 'Ten minutes a day')), 0, 'clean text passes the claims check');
select is(public.check_claims(pg_temp.id('company_a'), 'The best quiz') -> 0 ->> 'reason', 'Unverifiable superlative', 'superlatives are flagged');
select is(public.check_claims(pg_temp.id('company_a'), 'See the teacher dashboard') -> 0 ->> 'reason', 'Feature not built yet',
  'incomplete roadmap outcomes are flagged as not built');
select is(jsonb_array_length(public.check_claims(pg_temp.id('company_a'), 'Our quiz engine')), 0, 'complete outcomes are not flagged');
select is(jsonb_array_length(public.check_claims(pg_temp.id('company_a'), 'It actually works')), 0, 'regulated phrases pass for a general company');
reset role;
update public.companies set sector = 'education' where id = pg_temp.id('company_a');
select pg_temp.login('founder');
select is(public.check_claims(pg_temp.id('company_a'), 'It actually works') -> 0 ->> 'reason', 'Regulated claim needs supporting evidence',
  'regulated phrases are flagged for a regulated sector');
select pg_temp.login('outsider');
select throws_ok(format($$select public.check_claims(%L, 'x')$$, pg_temp.id('company_a')), 'P0001', null, 'outsiders cannot run another company''s claims check');

-- Deciding approvals ------------------------------------------------------------------------

select pg_temp.login('teammate');
select throws_like(format($$select public.decide_approval(%L, 'approved')$$, pg_temp.approval('clean')),
  '%founder or mentor%', 'a teammate cannot decide approvals');
select pg_temp.login('viewer');
select throws_like(format($$select public.decide_approval(%L, 'approved')$$, pg_temp.approval('clean')),
  '%founder or mentor%', 'a viewer cannot decide approvals');
select pg_temp.login('outsider');
select throws_like(format($$select public.decide_approval(%L, 'approved')$$, pg_temp.approval('clean')),
  'Approval not found', 'an outsider cannot see the approval');
select pg_temp.login('founder_b');
select throws_like(format($$select public.decide_approval(%L, 'approved')$$, pg_temp.approval('clean')),
  'Approval not found', 'another company''s founder cannot decide it');

select pg_temp.login('founder');
select throws_like(format($$select public.decide_approval(%L, 'approved')$$, pg_temp.approval('flagged')),
  '%claims check flagged%', 'a flagged draft cannot be approved');
select throws_like(format($$select public.decide_approval(%L, 'approved')$$, pg_temp.approval('email')),
  '%claims check flagged%', 'a flagged email cannot be approved');
select throws_like(format($$select public.decide_approval(%L, 'approved')$$, pg_temp.approval('pricey')),
  'Not enough credits%', 'an approval the balance can''t cover is blocked');
select throws_like(format($$select public.decide_approval(%L, 'approved')$$, pg_temp.approval('over_cap')),
  '%over the hard cap%', 'an ad budget over the cap is blocked');
select is(public.decide_approval(pg_temp.approval('clean'), 'approved'), 'approved'::public.approval_status, 'a founder approves a clean draft');
select throws_like(format($$select public.decide_approval(%L, 'declined')$$, pg_temp.approval('clean')),
  'This was already approved', 'a decision cannot be changed');
select is(public.decide_approval(pg_temp.approval('flagged'), 'declined'), 'declined'::public.approval_status, 'a flagged draft can still be declined');
reset role;
select is((select decided_by from public.approvals where id = pg_temp.approval('clean')), pg_temp.id('founder'),
  'the decision records the person''s id, not their name');
select ok(exists (select 1 from public.activity_events where company_id = pg_temp.id('company_a') and summary like '%gave GO%'),
  'the decision is in the activity log');

select pg_temp.login('cohort_mentor');
select throws_like(format($$select public.decide_approval(%L, 'approved')$$, pg_temp.approval('pricey')),
  'Not enough credits%', 'a cohort mentor can decide (and is held to the same rules)');
select pg_temp.login('member_mentor');
select is(public.decide_approval(pg_temp.approval('pricey'), 'declined'), 'declined'::public.approval_status, 'a member mentor can decline');

-- Editing drafts ----------------------------------------------------------------------------

select pg_temp.login('teammate');
select lives_ok(format($$select public.edit_approval(%L, '{"body": "We hope you like it"}')$$, pg_temp.approval('email')),
  'a teammate can reword a pending email');
select throws_like(format($$select public.edit_approval(%L, '{"to": "everyone@example.com"}')$$, pg_temp.approval('email')),
  '%only change the wording%', 'recipients cannot be changed by editing');
select throws_like(format($$select public.edit_approval(%L, '{"text": "x"}')$$, pg_temp.approval('over_cap')),
  '%only change the wording%', 'ad changes have no editable wording');
select pg_temp.login('viewer');
select throws_like(format($$select public.edit_approval(%L, '{"body": "x"}')$$, pg_temp.approval('email')),
  '%can''t edit%', 'a viewer cannot edit drafts');
reset role;
select is((select original_payload ->> 'body' from public.approvals where id = pg_temp.approval('email')), 'We guarantee results',
  'the original draft is kept');
select pg_temp.login('founder');
select is(public.decide_approval(pg_temp.approval('email'), 'approved'), 'approved'::public.approval_status, 'the edited email now passes and is approved');

-- Ask why -----------------------------------------------------------------------------------

select lives_ok(format($$select public.ask_why(%L)$$, pg_temp.approval('clean')), 'a founder can ask why');
reset role;
select is((select content from public.chat_messages where company_id = pg_temp.id('company_a') and sender = 'sol' order by created_at desc limit 1),
  'Signups like it', 'Sol answers with the stored reason');

-- Gates -------------------------------------------------------------------------------------

select pg_temp.login('teammate');
select throws_like(format($$select public.approve_gate(%L)$$, (select id from public.stage_gates where company_id = pg_temp.id('company_a') and stage = 'evidence')),
  '%founder or mentor%', 'a teammate cannot approve a gate');
select pg_temp.login('cohort_mentor');
select is(public.approve_gate((select id from public.stage_gates where company_id = pg_temp.id('company_a') and stage = 'evidence')),
  'build'::public.stage, 'a cohort mentor approves the Evidence gate');
reset role;
select is((select stage from public.companies where id = pg_temp.id('company_a')), 'build'::public.stage, 'the company moves to the next stage');
select pg_temp.login('founder');
select throws_like(format($$select public.approve_gate(%L)$$, (select id from public.stage_gates where company_id = pg_temp.id('company_a') and stage = 'evidence')),
  '%isn''t open%', 'an approved gate cannot be approved again');
select pg_temp.login('other_mentor');
select throws_like(format($$select public.approve_gate(%L)$$, (select id from public.stage_gates where company_id = pg_temp.id('company_a') and stage = 'evidence')),
  'Gate not found', 'another cohort''s mentor cannot see the gate');
reset role;
select throws_ok(format($$insert into public.stage_gates (company_id, stage) values (%L, 'grow')$$, pg_temp.id('company_b')),
  '23514', null, 'there is no gate on the last stage');

-- Tasks -------------------------------------------------------------------------------------

insert into public.tasks (id, company_id, pillar, title, actor, proof) values
  ('55555555-0000-4000-8000-000000000001', pg_temp.id('company_a'), 'build', 'Sol task without proof', 'sol', '{"passed": 5, "total": 6}'),
  ('55555555-0000-4000-8000-000000000002', pg_temp.id('company_a'), 'build', 'Sol task with proof', 'sol',
   '{"passed": 6, "total": 6, "screenshot": "s.png", "preview": "/p", "pr": "Build #1"}'),
  ('55555555-0000-4000-8000-000000000003', pg_temp.id('company_a'), 'run', 'Founder task', 'founder', null);
select pg_temp.login('teammate');
select throws_like($$select public.complete_task('55555555-0000-4000-8000-000000000001')$$, '%needs proof%', 'Sol''s work needs full proof');
select lives_ok($$select public.complete_task('55555555-0000-4000-8000-000000000002')$$, 'Sol''s work with proof can be completed');
select lives_ok($$select public.complete_task('55555555-0000-4000-8000-000000000003')$$, 'a founder task can be completed without proof');
select pg_temp.login('viewer');
select throws_like($$select public.complete_task('55555555-0000-4000-8000-000000000001')$$, '%founders and teammates%', 'a viewer cannot complete tasks');
reset role;
select results_eq($$select status::text from public.tasks where id::text like '55555555%' order by id$$, array['todo', 'done', 'done'],
  'only the tasks that met the rule are done');
select ok((select completed_at is not null from public.tasks where id = '55555555-0000-4000-8000-000000000002'), 'completion is dated');

-- Creating a company ------------------------------------------------------------------------

select pg_temp.login('outsider');
select lives_ok($$select public.create_company('Brand New', 'A new idea', 'B2C', 'general', 'Students', '100 users', 'build', 'https://brand.example.com', 'join-x')$$,
  'anyone signed in can create a company, with a cohort code in any case');
reset role;
select is((select role::text from public.company_members m join public.companies c on c.id = m.company_id where c.slug = 'brand-new' and m.user_id = pg_temp.id('outsider')),
  'founder', 'the creator is its founder');
select results_eq($$select g.stage::text || ':' || g.status::text from public.stage_gates g join public.companies c on c.id = g.company_id where c.slug = 'brand-new' order by g.stage$$,
  array['idea:in_progress', 'evidence:locked', 'build:locked', 'launch:locked'], 'four gates, the first one open');
select results_eq($$select starting_stage || ' ' || existing_website_url || ' ' || stage::text from public.companies where slug = 'brand-new'$$,
  array['build https://brand.example.com idea'], 'onboarding keeps the stage and website answers (bug B6) and starts at Idea');
select is((select count(*)::integer from public.cohort_companies cc join public.companies c on c.id = cc.company_id where c.slug = 'brand-new' and cc.cohort_id = pg_temp.id('cohort_x')),
  1, 'the cohort code joins the cohort');
select is((select count(*)::integer from public.documents d join public.companies c on c.id = d.company_id where c.slug = 'brand-new'), 5, 'five documents');
select is((select count(*)::integer from public.routines r join public.companies c on c.id = r.company_id where c.slug = 'brand-new' and not r.enabled), 3, 'three paused routines');
select is((select count(*)::integer from public.credit_ledger l join public.companies c on c.id = l.company_id where c.slug = 'brand-new'), 0,
  'no credits are granted at sign-up');
select pg_temp.login('outsider');
select lives_ok($$select public.create_company('Brand New', '', 'B2B')$$, 'a second company with the same name is allowed');
reset role;
select ok(exists (select 1 from public.companies where slug = 'brand-new-2'), 'and gets a unique slug');
select pg_temp.login('outsider');
select throws_like($$select public.create_company('Bad Code', '', 'B2B', 'general', null, null, null, null, 'NOPE')$$, '%isn''t recognised%', 'a bad cohort code is refused');
select throws_like($$select public.create_company('  ', '', 'B2B')$$, '%name%', 'a company needs a name');
select pg_temp.login_anon();
select throws_ok($$select public.create_company('Anon', '', 'B2B')$$, '42501', null, 'anonymous visitors cannot create companies');

-- Joining a cohort and accepting invites ----------------------------------------------------

select pg_temp.login('founder_b');
select throws_like(format($$select public.join_cohort(%L, 'JOIN-X')$$, pg_temp.id('company_b')), '%already in a cohort%', 'a company is in at most one cohort');
select pg_temp.login('teammate');
select throws_like(format($$select public.join_cohort(%L, 'JOIN-X')$$, pg_temp.id('company_a')), '%Only a founder%', 'only founders join cohorts');

reset role;
insert into public.team_invites (company_id, email, role, invited_by) values (pg_temp.id('company_b'), 'outsider@test.example.com', 'viewer', pg_temp.id('founder_b'));
select pg_temp.login('outsider');
select is(exists (select 1 from public.companies where id = pg_temp.id('company_b')), false, 'before accepting, the invitee cannot see the company');
select is(public.accept_invites(), 1, 'signing in accepts the invite');
select is(exists (select 1 from public.companies where id = pg_temp.id('company_b')), true, 'and the invitee can now read the company');

-- Agent requests ----------------------------------------------------------------------------

select pg_temp.login('teammate');
select lives_ok(format($$select public.enqueue_job(%L, 'social_post', '{}', null, 40)$$, pg_temp.id('company_a')), 'a teammate can ask Sol to work');
select throws_like(format($$select public.enqueue_job(%L, 'social_post', '{}', null, 999999)$$, pg_temp.id('company_a')), 'Not enough credits%', 'work the balance can''t cover is refused');
select throws_like(format($$select public.enqueue_job(%L, 'DROP TABLE', '{}', null, 0)$$, pg_temp.id('company_a')), 'Unknown job type', 'job types are validated');
select lives_ok(format($$select public.post_chat_message(%L, 'Hello Sol')$$, pg_temp.id('company_a')), 'a teammate can chat');
select pg_temp.login('cohort_mentor');
select throws_like(format($$select public.enqueue_job(%L, 'social_post', '{}', null, 0)$$, pg_temp.id('company_a')), '%founders and teammates%', 'mentors cannot spend a company''s credits');
select throws_like(format($$select public.post_chat_message(%L, 'Hi')$$, pg_temp.id('company_a')), '%founders and teammates%', 'mentors cannot chat as the company');
reset role;
select is((select count(*)::integer from public.agent_jobs where company_id = pg_temp.id('company_a') and job_type = 'chat'), 1, 'a chat message queues a chat job');

select pg_temp.login('founder');
select throws_like(format($$select public.request_ad_budget(%L, 60, 50)$$, pg_temp.id('company_a')), '%hard cap%', 'a budget over its cap is refused');
select lives_ok(format($$select public.request_ad_budget(%L, 10, 50)$$, pg_temp.id('company_a')), 'a founder can propose a budget');
select lives_ok(format($$select public.draft_outreach(%L, '5 reviewed contacts', 'Pilot', 'Would you like a pilot?')$$, pg_temp.id('company_a')),
  'a founder can draft outreach for approval');
reset role;
select is((select count(*)::integer from public.approvals where company_id = pg_temp.id('company_a') and requested_by = pg_temp.id('founder')), 2,
  'both are pending approvals, not actions');

select * from finish();
rollback;
