-- Phase 20: agent records. The catalogue, seeding the Starter crew, start levels and ceilings,
-- who runs each job, attributing runs, insert-only autonomy history, and who may write.
-- (Who may read agents, agent_autonomy and agent_autonomy_events is covered by the
-- read-access matrix in 02_read_access.)
begin;
\ir _setup.psql
select * from no_plan();

-- Catalogue -------------------------------------------------------------------------------

select is((select count(*)::int from public.agent_catalogue), 46, 'the catalogue has Sol and 45 crew members');
select is(
  (select array_agg(key order by key) from public.agent_catalogue where min_plan = 'starter'),
  (select array_agg(k order by k) from unnest(private.starter_crew()) k),
  'the starter crew is exactly the catalogue''s Starter-plan agents'
);
select is_empty(
  $$select key from public.agent_catalogue where not engine and needs is null$$,
  'every agent with no work yet says what it needs'
);
select is_empty(
  $$select key from public.agent_catalogue where engine and needs is not null$$,
  'active agents show no "needs" call to action'
);
select is_empty(
  $$select key from public.agent_catalogue where budget_per_month_credits is not null$$,
  'every agent starts with no monthly cap of its own (D105)'
);
select is_empty(
  $$select j.job_type from public.job_types j where j.default_agent is null$$,
  'every job type names the agent that runs it'
);
select is_empty(
  $$select c.key from public.agent_catalogue c, public.job_types j
    where j.job_type = any (c.job_types) and c.budget_per_run_credits < j.cap_credits$$,
  'no agent''s per-run cap is below the cap of a job it runs (D105)'
);

-- Seeding ---------------------------------------------------------------------------------

select is(
  (select count(*)::int from public.agents where company_id = pg_temp.id('company_a')),
  12, 'a new company gets Sol and the 11 Starter crew members'
);
select is(
  (select array_agg(catalogue_key order by catalogue_key) from public.agents where company_id = pg_temp.id('company_b')),
  (select array_agg(k order by k) from unnest(private.starter_crew()) k),
  'both companies get the same Starter crew'
);
select is(private.seed_crew(pg_temp.id('company_a')), 0, 'seeding again adds nobody');
select is(
  (select count(*)::int from public.agents where company_id = pg_temp.id('company_a')),
  12, 'and the crew is unchanged'
);
select is_empty(
  $$select id from public.companies c where not exists (select 1 from public.agents a where a.company_id = c.id and a.catalogue_key = 'sol')$$,
  'every company, including the seeded ones, has Sol'
);
select is(
  (select status::text from public.agents where company_id = pg_temp.id('company_a') and catalogue_key = 'penn'),
  'standing_by', 'Penn, with nothing to connect yet, stands by'
);
select is(
  (select status::text from public.agents where company_id = pg_temp.id('company_a') and catalogue_key = 'nova'),
  'active', 'Nova is active'
);

-- Start levels (D96) ----------------------------------------------------------------------

select is(
  (select count(*)::int from public.agent_autonomy aa join public.agents a on a.id = aa.agent_id
   where a.company_id = pg_temp.id('company_a')),
  (select count(*)::int from public.agent_catalogue c, jsonb_object_keys(c.start_autonomy)
   where c.key = any (private.starter_crew())),
  'every Starter agent has a level for each of its action types'
);
select is_empty(
  $$select aa.action_type from public.agent_autonomy aa
    join public.autonomy_action_types t on t.key = aa.action_type
    where aa.company_id = (select id from public.companies where slug = 'a-co')
      and (t.external or t.customer_facing) and aa.level > 2$$,
  'a new company starts nothing external or customer-facing above L2'
);
select is(
  (select aa.level::int from public.agent_autonomy aa join public.agents a on a.id = aa.agent_id
   where a.company_id = pg_temp.id('company_a') and a.catalogue_key = 'tilly' and aa.action_type = 'reply_inbox'),
  2, 'Tilly''s replies start at L2 for a new company'
);
select is(
  (select aa.level::int from public.agent_autonomy aa join public.agents a on a.id = aa.agent_id
   where a.company_id = pg_temp.id('company_a') and a.catalogue_key = 'clara' and aa.action_type = 'internal_update'),
  3, 'internal work can start at L3 (Clara keeping the calendar)'
);
select is(
  (select aa.level::int from public.agent_autonomy aa join public.agents a on a.id = aa.agent_id
   where a.company_id = pg_temp.id('company_a') and a.catalogue_key = 'iris' and aa.action_type = 'update_voice'),
  1, 'Iris starts at CREW.md''s L1 for the voice'
);
select is(
  (select count(*)::int from public.agent_autonomy_events where company_id = pg_temp.id('company_a') and kind = 'seed'),
  (select count(*)::int from public.agent_autonomy where company_id = pg_temp.id('company_a')),
  'each starting level is recorded in the history'
);

-- Ceilings --------------------------------------------------------------------------------

select throws_ok(
  $$update public.agent_autonomy set level = 3
    where company_id = (select id from public.companies where slug = 'a-co') and action_type = 'reply_public'$$,
  '23514', null, 'public replies can''t be set above L2'
);
insert into public.agent_autonomy (agent_id, company_id, action_type, level)
select id, company_id, 'ad_spend', 2 from public.agents where company_id = pg_temp.id('company_a') and catalogue_key = 'nova';
select throws_ok(
  $$update public.agent_autonomy set level = 3
    where company_id = (select id from public.companies where slug = 'a-co') and action_type = 'ad_spend'$$,
  '23514', null, 'money actions can''t be set above L2'
);
select throws_ok(
  $$insert into public.agent_autonomy (agent_id, company_id, action_type, level)
    select id, company_id, 'file_document', 3 from public.agents
    where company_id = (select id from public.companies where slug = 'a-co') and catalogue_key = 'clara'$$,
  '23514', null, 'legal actions can''t be inserted above L2'
);
select throws_ok(
  $$insert into public.agent_autonomy (agent_id, company_id, action_type, level)
    select id, (select id from public.companies where slug = 'b-co'), 'send_email', 1 from public.agents
    where company_id = (select id from public.companies where slug = 'a-co') and catalogue_key = 'penn'$$,
  '23503', null, 'an autonomy row must belong to its agent''s company'
);

-- Who runs each job (D91, D107) -----------------------------------------------------------

create function pg_temp.runner(p_job_type text, p_payload jsonb default '{}')
returns text
language sql
as $$
  select a.catalogue_key from public.agents a
  where a.id = public.agent_for_job(pg_temp.id('company_a'), p_job_type, p_payload)
$$;

select is(pg_temp.runner('chat'), 'sol', 'chat runs as Sol');
select is(pg_temp.runner('social_post'), 'nova', 'social posts run as Nova');
select is(pg_temp.runner('voice_analysis'), 'iris', 'voice analysis runs as Iris');
select is(pg_temp.runner('evidence_plan'), 'eve', 'evidence plans run as Eve');
select is(pg_temp.runner('inbox_triage'), 'tilly', 'inbox triage runs as Tilly');
select is(pg_temp.runner('compliance_review'), 'clara', 'compliance reviews run as Clara');
select is(pg_temp.runner('capture_process'), 'sol', 'capture falls back to Sol when the company has no Mira');
select is(pg_temp.runner('campaign_plan'), 'nova', 'campaign planning falls back to Nova when the company has no Lumen');
select is(pg_temp.runner('investor_update'), 'sol', 'investor updates fall back to Sol when the company has no Rhea');
select is(pg_temp.runner('no_such_job'), 'sol', 'an unknown job type goes to Sol');
select is(
  pg_temp.runner('document_update', jsonb_build_object('target',
    (select id from public.documents where company_id = pg_temp.id('company_a') order by created_at limit 1))),
  (select case when title ~* '(privacy|terms|cookie)' then 'shield' else 'sol' end
   from public.documents where company_id = pg_temp.id('company_a') order by created_at limit 1),
  'document updates go to Shield only for policy documents'
);
insert into public.documents (id, company_id, title)
values ('44444444-0000-4000-8000-000000000001', pg_temp.id('company_a'), 'Privacy policy');
select is(
  pg_temp.runner('document_update', '{"target": "44444444-0000-4000-8000-000000000001"}'),
  'shield', 'an update to the privacy policy runs as Shield'
);

-- With Mira in the crew, capture goes to her rather than the fallback.
select private.seed_agents(pg_temp.id('company_a'), array['mira']);
select is(pg_temp.runner('capture_process'), 'mira', 'capture runs as Mira once the company has her');

-- Attributing runs ------------------------------------------------------------------------

select col_not_null('public', 'agent_runs', 'agent_id', 'every run has an agent once every writer records it (D109)');

-- The backfill as the migration ran it, before the column became required: switch off the
-- safety-net trigger and the NOT NULL inside this test's transaction (rolled back at the end).
alter table public.agent_runs disable trigger agent_runs_fill_agent;
alter table public.agent_runs alter column agent_id drop not null;

insert into public.agent_jobs (id, company_id, job_type) values
  ('55555555-0000-4000-8000-000000000001', pg_temp.id('company_a'), 'social_post'),
  ('55555555-0000-4000-8000-000000000002', pg_temp.id('company_a'), 'compliance_review');
insert into public.agent_runs (id, company_id, job_id, task, pillar, model) values
  ('66666666-0000-4000-8000-000000000001', pg_temp.id('company_a'), '55555555-0000-4000-8000-000000000001', 'Post', 'grow', 'm'),
  ('66666666-0000-4000-8000-000000000002', pg_temp.id('company_a'), '55555555-0000-4000-8000-000000000002', 'Deadlines', 'legal', 'm'),
  ('66666666-0000-4000-8000-000000000003', pg_temp.id('company_a'), null, 'Chat with Sol', 'run', 'm'),
  ('66666666-0000-4000-8000-000000000004', pg_temp.id('company_a'), null, 'Old inbox summary', 'run', 'm'),
  ('66666666-0000-4000-8000-000000000005', pg_temp.id('company_a'), null, 'Old build work', 'build', 'm'),
  ('66666666-0000-4000-8000-000000000006', pg_temp.id('company_a'), null, 'Carry out post', 'grow', 'executor (mock)'),
  ('66666666-0000-4000-8000-000000000007', pg_temp.id('company_a'), null, 'Carry out voice', 'grow', 'executor (mock)');
-- Run 6 carried out an approval proposed by run 2 (Clara); run 7 a founder-made voice approval.
insert into public.approvals (company_id, run_id, action_type, payload, status, decided_at, execution_status, execution_run_id) values
  (pg_temp.id('company_a'), '66666666-0000-4000-8000-000000000002', 'publish_post', '{}', 'approved', now(), 'done', '66666666-0000-4000-8000-000000000006'),
  (pg_temp.id('company_a'), null, 'update_voice', '{}', 'approved', now(), 'done', '66666666-0000-4000-8000-000000000007');

select ok(private.attribute_runs(pg_temp.id('company_a')) >= 7, 'attribute_runs attributes the new runs');
-- The shared fixtures' runs were attributed on insert by the safety-net trigger.
select is(private.attribute_runs(), 0, 'attribute_runs with no company finds nothing else to attribute');

create function pg_temp.run_agent(p_run text)
returns text
language sql
as $$
  select a.catalogue_key from public.agent_runs r join public.agents a on a.id = r.agent_id
  where r.id = p_run::uuid
$$;
select is(pg_temp.run_agent('66666666-0000-4000-8000-000000000001'), 'nova', 'a job run takes its job type''s agent');
select is(pg_temp.run_agent('66666666-0000-4000-8000-000000000002'), 'clara', 'a job run takes its job type''s agent (Clara)');
select is(pg_temp.run_agent('66666666-0000-4000-8000-000000000003'), 'sol', 'a streaming chat run is Sol''s');
select is(pg_temp.run_agent('66666666-0000-4000-8000-000000000004'), 'tilly', 'an old Run run without a job goes to the pillar''s Starter agent');
select is(pg_temp.run_agent('66666666-0000-4000-8000-000000000005'), 'sol', 'an old Build run without a job goes to Sol');
select is(pg_temp.run_agent('66666666-0000-4000-8000-000000000006'), 'clara', 'an executor run goes to the agent that proposed the approval');
select is(pg_temp.run_agent('66666666-0000-4000-8000-000000000007'), 'iris', 'an executor run for a founder-made approval goes by action type');
select is(
  (select a.catalogue_key from public.agent_jobs j join public.agents a on a.id = j.agent_id
   where j.id = '55555555-0000-4000-8000-000000000001'),
  'nova', 'jobs are attributed too'
);
select is_empty($$select id from public.agent_runs where agent_id is null$$, 'no run is left without an agent');
select is(private.attribute_runs(), 0, 'attributing again changes nothing');
alter table public.agent_runs alter column agent_id set not null;
alter table public.agent_runs enable trigger agent_runs_fill_agent;

-- The safety net: a writer that leaves agent_id out gets the same rule.
insert into public.agent_jobs (id, company_id, job_type) values
  ('55555555-0000-4000-8000-000000000003', pg_temp.id('company_a'), 'evidence_plan');
insert into public.agent_runs (id, company_id, job_id, task, pillar, model) values
  ('66666666-0000-4000-8000-000000000011', pg_temp.id('company_a'), '55555555-0000-4000-8000-000000000003', 'Plan', 'grow', 'm'),
  ('66666666-0000-4000-8000-000000000012', pg_temp.id('company_a'), null, 'Chat with Sol', 'run', 'm'),
  ('66666666-0000-4000-8000-000000000013', pg_temp.id('company_a'), null, 'Check a deadline', 'legal', 'm');
select is(pg_temp.run_agent('66666666-0000-4000-8000-000000000011'), 'eve', 'a run inserted without an agent takes its job type''s agent');
select is(pg_temp.run_agent('66666666-0000-4000-8000-000000000012'), 'sol', 'a chat run inserted without an agent is Sol''s');
select is(pg_temp.run_agent('66666666-0000-4000-8000-000000000013'), 'clara', 'a jobless run inserted without an agent goes to its pillar''s agent');
select throws_ok(
  $$insert into public.agent_runs (company_id, agent_id, task, pillar, model)
    values ((select id from public.companies where slug = 'a-co'),
            (select id from public.agents where company_id = (select id from public.companies where slug = 'b-co') and catalogue_key = 'sol'),
            'Wrong company', 'run', 'm')$$,
  '23503', null, 'a run can''t belong to another company''s agent'
);
select is(
  (select a.catalogue_key from public.agents a where a.id = public.agent_for_approval(
    (select id from public.approvals where execution_run_id = '66666666-0000-4000-8000-000000000006'))),
  'clara', 'agent_for_approval gives the executor the proposer''s agent'
);

-- Keeping automatic replies a founder already had (D96, run once by the migration) --------

update public.response_policies set mode = 'auto_send'
where company_id = pg_temp.id('company_b') and category = 'general_enquiry';
select is(private.keep_auto_replies(), 1, 'a company already auto-sending keeps Tilly''s replies automatic');
select is(
  (select aa.level::int from public.agent_autonomy aa join public.agents a on a.id = aa.agent_id
   where a.company_id = pg_temp.id('company_b') and a.catalogue_key = 'tilly' and aa.action_type = 'reply_inbox'),
  3, 'at L3'
);
select is(
  (select count(*)::int from public.agent_autonomy_events
   where company_id = pg_temp.id('company_b') and action_type = 'reply_inbox' and to_level = 3 and reason like '%one-time exception%'),
  1, 'logged as the one-time exception to the 7-day rule'
);
select is(private.keep_auto_replies(), 0, 'running it again changes nothing');
select is(
  (select aa.level::int from public.agent_autonomy aa join public.agents a on a.id = aa.agent_id
   where a.company_id = pg_temp.id('company_a') and a.catalogue_key = 'tilly' and aa.action_type = 'reply_inbox'),
  2, 'a company that never auto-sent stays at L2'
);

-- Autonomy history is insert-only (D106) --------------------------------------------------

select pg_temp.login_service();
select lives_ok(
  $$insert into public.agent_autonomy_events (company_id, agent_id, action_type, kind, from_level, to_level, reason)
    select company_id, id, 'internal_update', 'demote', 3, 2, 'Test'
    from public.agents where company_id = (select id from public.companies where slug = 'a-co') and catalogue_key = 'clara'$$,
  'the service role can add history'
);
select throws_ok($$update public.agent_autonomy_events set reason = 'changed'$$, '42501', null, 'the service role cannot change history');
select throws_ok($$delete from public.agent_autonomy_events$$, '42501', null, 'the service role cannot delete history');
select throws_ok($$truncate public.agent_autonomy_events$$, '42501', null, 'the service role cannot truncate history');
select throws_ok($$delete from public.agents$$, '42501', null, 'the service role cannot delete agents');
reset role;

select pg_temp.login('founder');
select throws_ok($$delete from public.agent_autonomy_events$$, '42501', null, 'a founder cannot delete history');
select throws_ok($$update public.agent_autonomy_events set reason = 'x'$$, '42501', null, 'a founder cannot change history');
select throws_ok(
  $$insert into public.agent_autonomy_events (company_id, agent_id, action_type, kind, to_level, reason)
    select company_id, id, 'internal_update', 'promote', 3, 'x' from public.agents limit 1$$,
  '42501', null, 'a founder cannot write history directly'
);
select throws_ok($$update public.agent_autonomy set level = 0$$, '42501', null, 'a founder cannot change levels directly');
select throws_ok($$update public.agents set budget_per_run_credits = 1$$, '42501', null, 'a founder cannot change agents directly');
select throws_ok(
  $$insert into public.agents (company_id, name, role, crew_pillar, outcome_metric, style_ref, model_tier, budget_per_run_credits)
    values ((select id from public.companies where slug = 'a-co'), 'X', 'Y', 'grow', '{}', 'p', 'routine', 1)$$,
  '42501', null, 'a founder cannot add agents directly'
);
select throws_ok($$select public.agent_for_job((select id from public.companies limit 1), 'chat')$$, '42501', null, 'app users cannot call agent_for_job');
reset role;

-- Deleting a whole company still works, history and all: the cascade isn't blocked.
insert into public.companies (id, slug, name, description, customer_type)
values ('22222222-0000-4000-8000-00000000000c', 'c-co', 'Company C', 'Throwaway.', 'B2C');
insert into public.agent_autonomy_events (company_id, agent_id, action_type, kind, from_level, to_level, reason)
select company_id, id, 'internal_update', 'demote', 3, 2, 'History to cascade'
from public.agents where company_id = '22222222-0000-4000-8000-00000000000c' and catalogue_key = 'clara';
select ok(
  (select count(*) from public.agent_autonomy_events where company_id = '22222222-0000-4000-8000-00000000000c') > 1,
  'the throwaway company has autonomy history'
);
select lives_ok(
  $$delete from public.companies where id = '22222222-0000-4000-8000-00000000000c'$$,
  'a company with autonomy history can be deleted'
);
select is_empty(
  $$select 1 from public.agent_autonomy_events where company_id = '22222222-0000-4000-8000-00000000000c'$$,
  'its history went with it'
);
select is_empty(
  $$select 1 from public.agents where company_id = '22222222-0000-4000-8000-00000000000c'$$,
  'and so did its crew'
);

select * from finish();
rollback;
