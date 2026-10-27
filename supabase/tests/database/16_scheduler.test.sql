-- Scheduler, routines and Auto Mode (Phase 8).
begin;
\ir _setup.psql
select * from no_plan();

select is((select count(*)::integer from public.job_types where job_type in ('routine', 'morning_brief', 'nightly', 'investor_update')), 4,
  'the scheduled job types exist');
select throws_ok(format($$insert into public.routines (company_id, title, cadence, credits, job_type) values (%L, 'X', 'daily', 10, 'nonsense')$$,
  pg_temp.id('company_a')), '23503', null, 'a routine runs a known job type');

-- What Sol does on its own --------------------------------------------------------------------
select pg_temp.login('viewer');
select throws_like(format($$select public.update_automation(%L, true)$$, pg_temp.id('company_a')), '%Only founders and teammates%',
  'viewers can''t switch on the nightly loop');
select pg_temp.login('teammate');
select throws_like(format($$select public.update_automation(%L, true, 9000)$$, pg_temp.id('company_a')), '%between 0 and 5,000%', 'the nightly cap is bounded');
select lives_ok(format($$select public.update_automation(%L, true, 200, true)$$, pg_temp.id('company_a')), 'a teammate switches on the nightly loop with a cap');
reset role;
select results_eq($$select nightly_enabled, nightly_cap_credits, voice_review_enabled from public.company_automation where company_id = pg_temp.id('company_a')$$,
  $$values (true, 200, true)$$, 'it''s saved');

-- Auto Mode -----------------------------------------------------------------------------------
select pg_temp.login('founder');
select throws_like(format($$select public.start_auto_mode(%L, 9, 100)$$, pg_temp.id('company_a')), '%1 to 8 hours%', 'Auto Mode is time-boxed');
select throws_like(format($$select public.start_auto_mode(%L, 2, 0)$$, pg_temp.id('company_a')), 'Set a credit cap', 'and capped');
select throws_like(format($$select public.start_auto_mode(%L, 2, 1000000)$$, pg_temp.id('company_a')), 'Not enough credits%', 'the cap must be affordable');
select lives_ok(format($$select public.start_auto_mode(%L, 2, 300)$$, pg_temp.id('company_a')), 'a founder starts Auto Mode');
select throws_like(format($$select public.start_auto_mode(%L, 1, 100)$$, pg_temp.id('company_a')), 'Auto Mode is already running', 'one session at a time');
reset role;
select ok((select ends_at between now() + interval '119 minutes' and now() + interval '121 minutes' from public.auto_sessions where company_id = pg_temp.id('company_a') and status = 'running'),
  'it ends after the hours chosen');
select pg_temp.login('cohort_mentor');
select is((select count(*)::integer from public.auto_sessions where company_id = pg_temp.id('company_a') and status = 'running'), 1, 'mentors can see it''s running');
select throws_like(format($$select public.stop_auto_mode(%L)$$, pg_temp.id('company_a')), '%Only founders and teammates%', 'but not stop it');
select pg_temp.login('teammate');
select lives_ok(format($$select public.stop_auto_mode(%L)$$, pg_temp.id('company_a')), 'a teammate stops it');
reset role;
select results_eq($$select status, stopped_by = pg_temp.id('teammate') from public.auto_sessions where company_id = pg_temp.id('company_a') and cap_credits = 300$$,
  $$values ('stopped'::text, true)$$, 'and it stops, recording who stopped it');

-- Firing once ---------------------------------------------------------------------------------
select pg_temp.login('founder');
select throws_ok($$select public.claim_schedule('routine', null, null, '2026-10-28')$$, '42501', null, 'only the worker claims schedules');
select pg_temp.login_service();
select ok(public.claim_schedule('expire_credits', null, null, '2026-10-28'), 'the first claim for a period wins');
select ok(not public.claim_schedule('expire_credits', null, null, '2026-10-28'), 'a second one (another worker) doesn''t');
select ok(public.claim_schedule('routine', pg_temp.id('company_a'), gen_random_uuid(), '2026-10-28'), 'per company and routine');
reset role;

select pg_temp.login('founder');
select is((select content from public.briefs where company_id = pg_temp.id('company_a')), 'Good morning.', 'founders read their briefs');
select pg_temp.login('cohort_mentor');
select is_empty('select 1 from public.briefs', 'mentors don''t');

select * from finish();
rollback;
