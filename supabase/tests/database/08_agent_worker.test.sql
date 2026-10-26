-- Agent worker RPCs (supabase/migrations/20261026120000_agent_worker.sql).
begin;
\ir _setup.psql
select * from no_plan();

-- Only the fixture jobs count here: anything else in the database is set aside (rolled back).
update public.agent_jobs set status = 'done'
where status = 'queued' and company_id not in (pg_temp.id('company_a'), pg_temp.id('company_b'));

select pg_temp.login('founder');
select throws_ok($$select * from public.claim_agent_job('sneaky')$$, '42501', null, 'app users cannot claim jobs');
select throws_ok($$select public.reap_stale_runs()$$, '42501', null, 'app users cannot reap runs');
select throws_ok(format($$select public.append_run_step(%L, '{}')$$, gen_random_uuid()), '42501', null, 'app users cannot write run steps');

select pg_temp.login_service();
-- _setup queued one social_post job per company.
select is((select count(*)::integer from public.claim_agent_job('w1', array['social_post'])), 1, 'a worker claims one job');
select is((select count(*)::integer from public.claim_agent_job('w2', array['social_post'])), 1, 'a second worker gets the other job');
select is((select count(*)::integer from public.claim_agent_job('w3', array['social_post'])), 0, 'then nothing is left');
select results_eq($$select status::text, attempts, locked_by is not null from public.agent_jobs where job_type = 'social_post' and company_id in (pg_temp.id('company_a'), pg_temp.id('company_b')) order by locked_by$$,
  $$values ('running', 1, true), ('running', 1, true)$$, 'claimed jobs are running, counted and locked');
select ok(public.heartbeat_agent_job((select id from public.agent_jobs where locked_by = 'w1'), 'w1'), 'the owner can heartbeat its job');
select is(public.heartbeat_agent_job((select id from public.agent_jobs where locked_by = 'w1'), 'w2'), null, 'another worker cannot');

-- A stale job with attempts left goes back on the queue; one without fails.
reset role;
update public.agent_jobs set heartbeat_at = now() - interval '1 hour' where locked_by in ('w1', 'w2');
update public.agent_jobs set max_attempts = 1 where locked_by = 'w2';
select pg_temp.login_service();
select lives_ok($$select public.reap_stale_runs(interval '15 minutes')$$, 'the reaper runs');
select results_eq($$select status::text from public.agent_jobs where job_type = 'social_post' and company_id in (pg_temp.id('company_a'), pg_temp.id('company_b')) order by max_attempts$$,
  $$values ('failed'), ('queued')$$, 'stale jobs are requeued, or failed when out of attempts');

select * from finish();
rollback;
