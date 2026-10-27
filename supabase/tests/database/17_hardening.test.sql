-- Hardening (Phase 9): rate limits, error monitoring, cost reconciliation, and an RLS review
-- that pins exactly what signed-in people may write directly.
begin;
\ir _setup.psql
select * from no_plan();

-- RLS review --------------------------------------------------------------------------------
-- Everything else (credits, approvals, agent work, consents, billing, captures…) is written
-- only through checked RPCs or by the service role. Adding a direct write grant must be a
-- deliberate change to this list (docs/SECURITY-REVIEW.md).
select is(
  array(
    select table_name || ': ' || string_agg(distinct privilege_type, ', ' order by privilege_type)
    from (
      select table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      union
      select table_name, privilege_type from information_schema.column_privileges
      where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE')
    ) g group by table_name order by 1
  ),
  array[
    'companies: UPDATE', 'company_sharing: INSERT, UPDATE', 'compliance_items: DELETE, INSERT, UPDATE',
    'contacts: DELETE, INSERT, UPDATE', 'evidence_items: DELETE, INSERT, UPDATE', 'gate_comments: DELETE, INSERT',
    'grants: DELETE, INSERT, UPDATE', 'hq_layouts: DELETE, INSERT, UPDATE', 'investors: DELETE, INSERT, UPDATE',
    'profiles: UPDATE', 'routines: DELETE, INSERT, UPDATE', 'tasks: DELETE, INSERT, UPDATE',
    'team_invites: DELETE, INSERT', 'user_preferences: DELETE, INSERT, UPDATE', 'voice_examples: DELETE, INSERT',
    'voice_sources: DELETE, INSERT'
  ],
  'signed-in people can write directly only to the reviewed tables'
);

select is(
  array(
    select distinct t.table_name::text from information_schema.role_table_grants t
    where t.grantee = 'authenticated' and t.table_schema = 'public' and t.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and not exists (
        select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name
          and (p.cmd = 'ALL' or p.cmd = t.privilege_type)
      )
    order by 1
  ),
  '{}'::text[],
  'every direct write grant has a matching row-level policy'
);

select is(
  array(
    select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('authenticated', c.oid, 'select')
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.cmd in ('SELECT', 'ALL'))
    order by 1
  ),
  '{}'::text[],
  'every table signed-in people can read has a read policy'
);

-- Rate limits ---------------------------------------------------------------------------------
select pg_temp.login('founder');
do $$
begin
  for i in 1..30 loop
    perform public.begin_chat_turn(pg_temp.id('company_a'), 'Message ' || i);
  end loop;
end;
$$;
select throws_like(format($$select public.begin_chat_turn(%L, 'One too many')$$, pg_temp.id('company_a')),
  '%a lot at once%', 'the 31st chat message in a minute is refused');
select pg_temp.login_service();
select lives_ok(format($$insert into public.agent_jobs (company_id, job_type) select %L, 'task' from generate_series(1, 130)$$, pg_temp.id('company_a')),
  'the service role isn''t rate-limited');
reset role;

-- Error monitoring ----------------------------------------------------------------------------
select pg_temp.login('teammate');
select lives_ok(format($$select public.report_client_error('TypeError: x is undefined', '{"page": "/hq"}', %L)$$, pg_temp.id('company_a')),
  'the app reports its errors');
select is_empty('select 1 from public.error_events', 'people can''t read error reports');
select pg_temp.login('admin');
select results_eq($$select source, message, context ->> 'page' from public.error_events where source = 'app'$$,
  $$values ('app'::text, 'TypeError: x is undefined'::text, '/hq'::text)$$, 'platform admins can');
set local role anon;
select throws_ok($$select public.report_client_error('x')$$, '42501', null, 'anonymous visitors can''t report errors');
reset role;

-- Cost reconciliation ---------------------------------------------------------------------------
insert into public.agent_runs (company_id, task, pillar, model, status, started_at, cost_usd)
values (pg_temp.id('company_a'), 'Test', 'run', 'claude-haiku-5-5', 'succeeded', '2030-05-01 10:00Z', 0.5),
       (pg_temp.id('company_a'), 'Mock', 'run', 'claude-haiku-5-5 (mock)', 'succeeded', '2030-05-01 11:00Z', 9);
insert into public.anthropic_usage (day, model, cost_usd) values ('2030-05-01', 'claude-haiku-5-5', 0.6);
select pg_temp.login('admin');
select results_eq($$select runs, estimated_usd, actual_usd, difference_pct from public.cost_reconciliation('2030-05-01', '2030-05-01')$$,
  $$values (1::bigint, 0.5::numeric, 0.6::numeric, 16.7::numeric)$$, 'admins compare our estimates with Anthropic''s usage (mock runs excluded)');
select pg_temp.login('founder');
select is_empty($$select * from public.cost_reconciliation('2030-05-01', '2030-05-01')$$, 'founders don''t see platform costs');

select * from finish();
rollback;
