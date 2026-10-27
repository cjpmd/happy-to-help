-- The approvals executor's database side (supabase/migrations/20261026140000_approvals_executor.sql).
begin;
\ir _setup.psql
select * from no_plan();

-- Set aside other queued executions (rolled back at the end).
update public.approvals set execution_status = 'done' where execution_status = 'queued';

select pg_temp.login('founder');
select lives_ok($$select public.decide_approval((select id from public.approvals where company_id = '22222222-0000-4000-8000-00000000000a' limit 1), 'approved')$$,
  'a founder approves');
reset role;
select is((select execution_status::text from public.approvals where company_id = pg_temp.id('company_a')), 'queued',
  'an approved action is queued for the executor');

select pg_temp.login('founder');
select throws_ok($$select * from public.claim_approval_execution('sneaky')$$, '42501', null, 'app users cannot claim executions');
select throws_ok(format($$select public.settle_run_credits(%L, 1)$$, gen_random_uuid()), '42501', null, 'app users cannot settle');

select pg_temp.login_service();
select is((select count(*)::integer from public.claim_approval_execution('w1')), 1, 'the executor claims it');
select is((select count(*)::integer from public.claim_approval_execution('w2')), 0, 'no one else gets it');
reset role;
select results_eq($$select execution_status::text, execution_attempts from public.approvals where company_id = '22222222-0000-4000-8000-00000000000a'$$,
  $$values ('executing', 1)$$, 'claimed executions are counted');

-- Declining with a note keeps it for the agent, and queues nothing.
insert into public.approvals (company_id, action_type, payload, estimated_credits)
values (pg_temp.id('company_a'), 'publish_post', '{"channel": "X", "text": "Another post"}', 5);
select pg_temp.login('member_mentor');
select lives_ok($$select public.decide_approval((select id from public.approvals where payload ->> 'text' = 'Another post'), 'declined', 'Too salesy')$$,
  'a mentor declines with a note');
reset role;
select results_eq($$select execution_status::text, decision_note from public.approvals where payload ->> 'text' = 'Another post'$$,
  $$values ('not_started', 'Too salesy')$$, 'a declined action is never executed and keeps its note');
select throws_ok($$update public.approvals set execution_status = 'queued' where payload ->> 'text' = 'Another post'$$,
  '23514', null, 'only approved actions can be queued');

-- Settling in credits.
insert into public.agent_runs (id, company_id, task, pillar, model) values
  ('77777777-0000-4000-8000-000000000001', pg_temp.id('company_a'), 'Carry out', 'grow', 'executor');
select pg_temp.login_service();
select public.reserve_credits(pg_temp.id('company_a'), '77777777-0000-4000-8000-000000000001', 20);
select is(public.settle_run_credits('77777777-0000-4000-8000-000000000001', 5), 5, 'settling in credits charges exactly that');
select is((select balance from public.company_credit_balance where company_id = pg_temp.id('company_a')), 995, 'and releases the rest');

select * from finish();
rollback;
