-- Who can change what. RLS failures on insert raise 42501; on update and delete they
-- silently match no rows, so those checks look at the data afterwards.
begin;
\ir _setup.psql
select * from no_plan();

-- Companies ---------------------------------------------------------------------------------

select pg_temp.login('founder');
select lives_ok($$update public.companies set name = 'A renamed' where slug = 'a-co'$$, 'a founder can rename their company');
select throws_ok($$update public.companies set stage = 'grow' where slug = 'a-co'$$, '42501', null, 'a founder cannot change the stage directly');
select throws_ok($$update public.companies set plan = 'growth' where slug = 'a-co'$$, '42501', null, 'a founder cannot change the plan directly');
select throws_ok($$insert into public.companies (slug, name, customer_type) values ('new-co', 'New', 'B2B')$$, '42501', null, 'companies are not created by direct insert');
select throws_ok($$delete from public.companies where slug = 'a-co'$$, '42501', null, 'companies cannot be deleted by app users');
update public.companies set name = 'Hijacked' where slug = 'b-co';
select pg_temp.login('teammate');
update public.companies set name = 'Teammate edit' where slug = 'a-co';
select pg_temp.login('admin');
update public.companies set name = 'Admin edit' where slug = 'a-co';
reset role;
select results_eq($$select name from public.companies order by slug$$, array['A renamed', 'Company B'],
  'teammates, admins and other founders cannot edit a company profile');

-- Membership and cohorts are changed only through RPCs or the service role ------------------

select pg_temp.login('founder');
select throws_ok(format($$insert into public.company_members (company_id, user_id, role) values (%L, %L, 'founder')$$,
  pg_temp.id('company_a'), pg_temp.id('outsider')), '42501', null, 'a founder cannot add members directly');
select pg_temp.login('outsider');
select throws_ok(format($$insert into public.company_members (company_id, user_id, role) values (%L, %L, 'founder')$$,
  pg_temp.id('company_a'), pg_temp.id('outsider')), '42501', null, 'nobody can add themselves to a company');
select throws_ok(format($$insert into public.cohort_mentors (cohort_id, user_id) values (%L, %L)$$,
  pg_temp.id('cohort_x'), pg_temp.id('outsider')), '42501', null, 'nobody can make themselves a cohort mentor');
select throws_ok($$update public.profiles set is_admin = true$$, '42501', null, 'nobody can make themselves an admin');

-- Content founders and teammates edit --------------------------------------------------------

select pg_temp.login('teammate');
select lives_ok(format($$insert into public.evidence_items (company_id, type, title) values (%L, 'interview', 'Spoke to a customer')$$,
  pg_temp.id('company_a')), 'a teammate can add evidence');
select lives_ok(format($$insert into public.tasks (company_id, pillar, title) values (%L, 'run', 'Reply to emails')$$,
  pg_temp.id('company_a')), 'a teammate can add a task');
select throws_ok($$update public.tasks set status = 'done'$$, '42501', null, 'nobody marks a task done directly (proof is checked by an RPC)');
select throws_ok($$update public.tasks set proof = '{}'$$, '42501', null, 'nobody writes task proof directly');
select throws_ok(format($$update public.evidence_items set company_id = %L$$, pg_temp.id('company_b')),
  '42501', null, 'rows cannot be moved to another company');
select lives_ok($$update public.investors set stage = 'meeting'$$, 'a teammate can move an investor');
select lives_ok(format($$insert into public.routines (company_id, title, cadence, credits) values (%L, 'Weekly update', 'weekly', 60)$$,
  pg_temp.id('company_a')), 'a teammate can add a routine');

do $$
declare
  p text;
begin
  foreach p in array array['viewer', 'member_mentor', 'cohort_mentor', 'admin', 'outsider', 'founder_b'] loop
    perform pg_temp.login(p);
    begin
      insert into public.evidence_items (company_id, type, title) values (pg_temp.id('company_a'), 'interview', 'Sneaky');
      raise exception 'insert by % was allowed', p;
    exception when insufficient_privilege then
      null;
    end;
    update public.investors set stage = 'passed' where company_id = pg_temp.id('company_a');
    delete from public.tasks where company_id = pg_temp.id('company_a');
    update public.routines set enabled = true where company_id = pg_temp.id('company_a');
    reset role;
  end loop;
end;
$$;
select pass('viewers, mentors, admins and outsiders cannot add evidence to company A');
select results_eq(format($$select stage::text from public.investors where company_id = %L$$, pg_temp.id('company_a')),
  array['meeting'], 'only founders and teammates move investors');
select results_eq(format($$select count(*)::int from public.tasks where company_id = %L$$, pg_temp.id('company_a')),
  array[2], 'only founders and teammates delete tasks');
select is_empty(format($$select 1 from public.routines where company_id = %L and enabled$$, pg_temp.id('company_a')),
  'only founders and teammates enable routines');

-- Comments ---------------------------------------------------------------------------------

select pg_temp.login('cohort_mentor');
select lives_ok(format($$insert into public.gate_comments (company_id, body) values (%L, 'Push on pricing')$$,
  pg_temp.id('company_a')), 'a cohort mentor can comment');
select throws_ok(format($$insert into public.gate_comments (company_id, author_id, body) values (%L, %L, 'Forged')$$,
  pg_temp.id('company_a'), pg_temp.id('founder')), '42501', null, 'nobody can comment as someone else');
delete from public.gate_comments where author_id = pg_temp.id('founder');
select pg_temp.login('other_mentor');
select throws_ok(format($$insert into public.gate_comments (company_id, body) values (%L, 'Not my cohort')$$,
  pg_temp.id('company_a')), '42501', null, 'a mentor cannot comment outside their cohort');
reset role;
select results_eq(format($$select count(*)::int from public.gate_comments where company_id = %L$$, pg_temp.id('company_a')),
  array[2], 'nobody can delete someone else''s comment');

-- Team invites and sharing are founder-only --------------------------------------------------

select pg_temp.login('founder');
select lives_ok(format($$insert into public.team_invites (company_id, email, role) values (%L, 'new.person@example.com', 'viewer')$$,
  pg_temp.id('company_a')), 'a founder can invite people');
select lives_ok($$update public.company_sharing set enabled = true where company_id = (select id from public.companies where slug = 'a-co')$$,
  'a founder can turn on public sharing');
select pg_temp.login('teammate');
select throws_ok(format($$insert into public.team_invites (company_id, email, role) values (%L, 'another@example.com', 'founder')$$,
  pg_temp.id('company_a')), '42501', null, 'a teammate cannot invite people');
update public.company_sharing set mrr = true;
reset role;
select is_empty($$select 1 from public.company_sharing where mrr$$, 'a teammate cannot change sharing settings');

-- Per-user settings --------------------------------------------------------------------------

select pg_temp.login('teammate');
select lives_ok($$insert into public.user_preferences (explanation) values ('more')$$, 'you can save your own preferences');
select throws_ok(format($$insert into public.hq_layouts (user_id, layout) values (%L, '[]')$$, pg_temp.id('founder')),
  '42501', null, 'you cannot save settings for someone else');
update public.user_preferences set slack = true where user_id = pg_temp.id('founder');
reset role;
select is_empty(format($$select 1 from public.user_preferences where user_id = %L and slack$$, pg_temp.id('founder')),
  'you cannot change someone else''s preferences');

-- Tables written only by the agent, integrations or RPCs -------------------------------------

create temp table tap_lines (n serial, line text);
grant insert on tap_lines to authenticated;
grant usage on sequence tap_lines_n_seq to authenticated;

do $$
declare
  t text;
  op text;
  ok boolean;
begin
  perform pg_temp.login('founder');
  foreach t in array array[
    'stage_gates', 'agent_jobs', 'agent_runs', 'approvals', 'activity_events', 'chat_messages',
    'credit_ledger', 'social_posts', 'site_versions', 'metrics_daily', 'documents',
    'document_versions', 'media_assets', 'email_threads', 'email_messages', 'ad_accounts',
    'company_members', 'cohort_companies', 'cohort_mentors', 'cohorts'
  ] loop
    foreach op in array array[
      format('insert into public.%I default values', t),
      format('update public.%I set created_at = created_at', t),
      format('delete from public.%I', t)
    ] loop
      begin
        execute op;
        ok := false;
      exception when insufficient_privilege then
        ok := true;
      when undefined_column then
        -- Tables without created_at: try a column every table here has.
        begin
          execute format('update public.%I set %I = %I', t,
            case when t in ('cohorts', 'cohort_mentors', 'cohort_companies') then 'cohort_id' else 'company_id' end,
            case when t in ('cohorts', 'cohort_mentors', 'cohort_companies') then 'cohort_id' else 'company_id' end);
          ok := false;
        exception when insufficient_privilege or undefined_column then
          ok := true;
        end;
      end;
      insert into tap_lines (line) select ok(ok, format('a founder cannot run: %s', op));
    end loop;
  end loop;
  reset role;
end;
$$;
select line from tap_lines order by n;

reset role;
select * from finish();
rollback;
