-- Phase 21: the crew roster's figures (crew_stats) and founder settings (update_agent_settings).
begin;
\ir _setup.psql
select * from no_plan();

create function pg_temp.agent(p_company text, p_key text)
returns uuid
language sql
as $$
  select id from public.agents where company_id = pg_temp.id(p_company) and catalogue_key = p_key
$$;
grant execute on function pg_temp.agent(text, text) to authenticated;

-- What the shared fixtures already gave Nova, before this test adds its own.
create temp table base as
select private.agent_outcomes(pg_temp.agent('company_a', 'nova'), '-infinity') as nova_total,
       private.agent_outcomes(pg_temp.agent('company_a', 'nova'), date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London') as nova_month;
grant select on base to authenticated;

-- Some work for company A: a post Nova drafted, approved and published; a run in progress for
-- Clara; a lead; a pending approval from Tilly's run.
insert into public.agent_runs (id, company_id, agent_id, task, pillar, model, status, credits_charged, created_at) values
  ('77777777-0000-4000-8000-000000000001', pg_temp.id('company_a'), pg_temp.agent('company_a', 'nova'), 'Post', 'grow', 'm', 'succeeded', 30, now()),
  ('77777777-0000-4000-8000-000000000002', pg_temp.id('company_a'), pg_temp.agent('company_a', 'clara'), 'Deadlines', 'legal', 'm', 'running', 0, now()),
  ('77777777-0000-4000-8000-000000000003', pg_temp.id('company_a'), pg_temp.agent('company_a', 'tilly'), 'Reply', 'run', 'm', 'needs_approval', 12, now()),
  ('77777777-0000-4000-8000-000000000004', pg_temp.id('company_a'), pg_temp.agent('company_a', 'nova'), 'Old post', 'grow', 'm', 'succeeded', 40, now() - interval '70 days');
insert into public.approvals (company_id, run_id, action_type, payload, status, decided_at, execution_status, executed_at, created_at) values
  (pg_temp.id('company_a'), '77777777-0000-4000-8000-000000000001', 'publish_post', '{}', 'approved', now(), 'done', now(), now()),
  (pg_temp.id('company_a'), '77777777-0000-4000-8000-000000000004', 'publish_post', '{}', 'approved', now() - interval '70 days', 'done', now() - interval '70 days', now() - interval '70 days');
insert into public.approvals (company_id, run_id, action_type, payload, status) values
  (pg_temp.id('company_a'), '77777777-0000-4000-8000-000000000003', 'send_email', '{}', 'pending');

create function pg_temp.stat(p_key text, p_col text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  execute format('select (%I)::text from public.crew_stats(%L) where agent_id = %L',
    p_col, pg_temp.id('company_a'), pg_temp.agent('company_a', p_key)) into v;
  return v;
end;
$$;
grant execute on function pg_temp.stat(text, text) to authenticated;

select pg_temp.login('founder');
select is((select count(*)::int from public.crew_stats(pg_temp.id('company_a'))), 12, 'a founder sees figures for the whole crew');
select is(pg_temp.stat('nova', 'outcome_total')::int, (select nova_total from base) + 2, 'Nova''s drafts count all time');
select is(pg_temp.stat('nova', 'outcome_month')::int, (select nova_month from base) + 1, 'and this month');
select is(pg_temp.stat('echo', 'outcome_total')::int,
  (select count(*)::int from public.approvals where company_id = pg_temp.id('company_a') and action_type = 'publish_post' and execution_status = 'done'),
  'Echo counts every post the executor published');
select is(pg_temp.stat('nova', 'credits_month')::int, 30, 'credits this month count only this month''s runs');
select is(pg_temp.stat('clara', 'activity'), 'working', 'an agent with a running run is working');
select is(pg_temp.stat('tilly', 'activity'), 'waiting', 'an agent with a pending approval is waiting for you');
select is(pg_temp.stat('tilly', 'waiting')::int, 1, 'with how many approvals');
select is(pg_temp.stat('iris', 'activity'), 'idle', 'an agent with nothing on is idle');
select is(pg_temp.stat('penn', 'activity'), 'standing_by', 'Penn is standing by');
select is(pg_temp.stat('penn', 'outcome_total'), null, 'and shows no figures, not even zero (D103)');
select is(pg_temp.stat('iris', 'outcome_total')::int, 0, 'the default voice doesn''t count as Iris''s work');
reset role;

select pg_temp.login('cohort_mentor');
select is((select count(*)::int from public.crew_stats(pg_temp.id('company_a'))), 12, 'a cohort mentor sees the crew''s figures');
select pg_temp.login('viewer');
select is((select count(*)::int from public.crew_stats(pg_temp.id('company_a'))), 12, 'a viewer sees them too');
select pg_temp.login('outsider');
select throws_ok($$select * from public.crew_stats('22222222-0000-4000-8000-00000000000a')$$, '42501', null, 'an outsider can''t');
select pg_temp.login('founder_b');
select throws_ok($$select * from public.crew_stats('22222222-0000-4000-8000-00000000000a')$$, '42501', null, 'nor can another company''s founder');
reset role;

-- Settings -----------------------------------------------------------------------------------

select pg_temp.login('founder');
select lives_ok(
  format($$select public.update_agent_settings(%L, '{"budget_per_run_credits": 60, "budget_per_month_credits": 900}')$$, pg_temp.agent('company_a', 'nova')),
  'a founder can set Nova''s caps'
);
reset role;
select is(
  (select array[budget_per_run_credits, budget_per_month_credits] from public.agents where id = pg_temp.agent('company_a', 'nova')),
  array[60, 900], 'and they''re saved'
);
select isnt_empty(
  $$select 1 from public.activity_events where type = 'crew' and summary like 'Nova: limit 60 credits a run, cap 900 credits a month'$$,
  'the change is in the activity log'
);

select pg_temp.login('founder');
select throws_ok(
  format($$select public.update_agent_settings(%L, '{"budget_per_run_credits": 100000}')$$, pg_temp.agent('company_a', 'nova')),
  '23514', null, 'a per-run limit can''t go above the catalogue''s'
);
select throws_ok(
  format($$select public.update_agent_settings(%L, '{"budget_per_month_credits": 0}')$$, pg_temp.agent('company_a', 'nova')),
  '23514', null, 'a monthly cap must be positive'
);
select lives_ok(
  format($$select public.update_agent_settings(%L, '{"budget_per_month_credits": null}')$$, pg_temp.agent('company_a', 'nova')),
  'a monthly cap can be removed'
);
select lives_ok(format($$select public.update_agent_settings(%L, '{"paused": true}')$$, pg_temp.agent('company_a', 'nova')), 'a founder can pause Nova');
select is(pg_temp.stat('nova', 'activity'), 'paused', 'Nova shows as paused');
select lives_ok(format($$select public.update_agent_settings(%L, '{"paused": false}')$$, pg_temp.agent('company_a', 'nova')), 'and resume her');
select is(pg_temp.stat('nova', 'activity') <> 'paused', true, 'Nova is back on duty');
select lives_ok(format($$select public.update_agent_settings(%L, '{"paused": true}')$$, pg_temp.agent('company_a', 'penn')), 'pausing Penn works');
select lives_ok(format($$select public.update_agent_settings(%L, '{"paused": false}')$$, pg_temp.agent('company_a', 'penn')), 'resuming Penn');
select is(pg_temp.stat('penn', 'activity'), 'standing_by', 'returns him to standing by, not active');
reset role;
select is(
  (select budget_per_month_credits from public.agents where id = pg_temp.agent('company_a', 'nova')),
  null, 'the monthly cap was removed'
);

select pg_temp.login('teammate');
select throws_ok(format($$select public.update_agent_settings(%L, '{"paused": true}')$$, pg_temp.agent('company_a', 'nova')), '42501', null, 'a teammate can''t change the crew');
select pg_temp.login('cohort_mentor');
select throws_ok(format($$select public.update_agent_settings(%L, '{"paused": true}')$$, pg_temp.agent('company_a', 'nova')), '42501', null, 'nor can a mentor');
select pg_temp.login('founder_b');
select throws_ok(format($$select public.update_agent_settings(%L, '{"paused": true}')$$, pg_temp.agent('company_a', 'nova')), '42501', null, 'nor another company''s founder');
reset role;

select * from finish();
rollback;
