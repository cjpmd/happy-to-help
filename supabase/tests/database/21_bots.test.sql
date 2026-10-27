-- Process bots (Phase 17).
begin;
\ir _setup.psql
select * from no_plan();

select is((select count(*)::integer from public.bot_templates), 6, 'the six templates from SPEC L');

select pg_temp.login('teammate');
select throws_like(format($$select public.create_bot(%L, 'lead_follow_up')$$, pg_temp.id('company_a')), '%Only a founder%',
  'only a founder adds a bot');
select pg_temp.login('founder');
select lives_ok(format($$select public.create_bot(%L, 'lead_follow_up')$$, pg_temp.id('company_a')), 'a founder adds one');
select throws_like(format($$select public.create_bot(%L, 'lead_follow_up')$$, pg_temp.id('company_a')), '%already have%',
  'one of each per company');
select throws_like(format($$select public.create_bot(%L, 'nope')$$, pg_temp.id('company_a')), 'Unknown bot', 'templates only');
create temp table lf as select id from public.bots where company_id = pg_temp.id('company_a') and template = 'lead_follow_up';
grant select on lf to authenticated;
select results_eq($$select enabled, approval_level, cap_credits_week from public.bots where id = (select id from lf)$$,
  $$values (false, 'each'::text, 50)$$, 'off, every email waits for a GO, capped at 50 credits a week');

-- Wording and timing can change; what the steps do can't.
select throws_like($$select public.update_bot((select id from lf), p_steps => '[{"after_days": 1}]')$$, '%keeps its steps%',
  'steps can''t be added or removed');
select throws_like($$select public.update_bot((select id from lf), p_steps => '[{"after_days": 1, "subject": "Hi", "body": "Hello"}, {"after_days": 200, "subject": "Hi", "body": "Hello"}]')$$,
  '%between 0 and 90%', 'days are bounded');
select lives_ok($$select public.update_bot((select id from lf), p_steps => '[{"after_days": 2, "subject": "Thanks, {first_name}", "body": "Hello {first_name}", "kind": "task", "marketing": true}, {"after_days": 6, "subject": "Still there?", "body": "Hello again"}]')$$,
  'a founder rewords it');
reset role;
select results_eq($$select steps -> 0 ->> 'kind', (steps -> 0 ->> 'marketing')::boolean, (steps -> 0 ->> 'after_days')::integer, steps -> 1 ->> 'subject' from public.bots where id = (select id from lf)$$,
  $$values ('email'::text, false, 2, 'Still there?'::text)$$, 'its kind and marketing flag stay as they were');

-- Approved wording: claims-checked, and new wording needs approving again.
select pg_temp.login('founder');
select throws_like($$select public.update_bot((select id from lf), p_steps => '[{"after_days": 1, "subject": "Hi", "body": "We are the best bakery in Scotland, guaranteed"}, {"after_days": 6, "subject": "Still there?", "body": "Hello again"}]', p_approval_level => 'approved_wording')$$,
  '%claims check flagged%', 'wording with claims can''t be approved');
select lives_ok($$select public.update_bot((select id from lf), p_approval_level => 'approved_wording', p_enabled => true)$$,
  'a founder approves the wording and switches it on');
reset role;
select results_eq($$select enabled, approval_level, approved_by = pg_temp.id('founder'), enabled_at is not null from public.bots where id = (select id from lf)$$,
  $$values (true, 'approved_wording'::text, true, true)$$, 'recorded who approved it, and from when it listens');
select pg_temp.login('founder');
select lives_ok($$select public.update_bot((select id from lf), p_steps => '[{"after_days": 1, "subject": "Hi", "body": "New words"}, {"after_days": 6, "subject": "Still there?", "body": "Hello again"}]')$$,
  'rewording it');
reset role;
select results_eq($$select approval_level, approved_by from public.bots where id = (select id from lf)$$,
  $$values ('each'::text, null::uuid)$$, 'goes back to a GO for every email');

-- Switching off stops what was planned.
insert into public.bot_runs (bot_id, company_id, step, due_at) select id, pg_temp.id('company_a'), 1, now() + interval '1 day' from lf;
select pg_temp.login('founder');
select lives_ok($$select public.update_bot((select id from lf), p_enabled => false)$$, 'switched off');
reset role;
select is((select status from public.bot_runs where bot_id = (select id from lf) and step = 1), 'skipped', 'its planned steps are skipped');

-- Some templates need a connection we don't have yet.
select pg_temp.login('founder');
select lives_ok(format($$select public.create_bot(%L, 'payment_reminder')$$, pg_temp.id('company_a')), 'the payment bot can be added');
select throws_like(format($$select public.update_bot((select id from public.bots where company_id = %L and template = 'payment_reminder'), p_enabled => true)$$, pg_temp.id('company_a')),
  '%Stripe%', 'but not switched on without Stripe');

-- Viewers and other companies.
select pg_temp.login('founder_b');
select throws_like($$select public.update_bot((select id from lf), p_enabled => true)$$, '%Only a founder%', 'another company''s founder can''t');
select pg_temp.login('viewer');
select is((select count(*)::integer from public.bot_runs where company_id = pg_temp.id('company_a')), 0, 'viewers don''t see who bots reached');
select pg_temp.login('founder');
select lives_ok($$select public.delete_bot((select id from lf))$$, 'a founder removes a bot');
reset role;
select is((select count(*)::integer from public.bot_runs where bot_id = (select id from lf)), 0, 'with its history');

-- The feedback step is the service role's, with the same rules.
select pg_temp.login('founder');
select throws_ok(format($$select public.bot_feedback_request(%L, %L, 'https://app.example')$$, pg_temp.id('company_a'), pg_temp.id('company_a')),
  '42501', null, 'people can''t call the bots'' feedback step');

select * from finish();
rollback;
