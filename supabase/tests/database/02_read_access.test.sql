-- Who can read what. For every company-scoped table and view, each person sees company A's
-- and company B's rows exactly as the access rules say.
begin;
\ir _setup.psql
select * from no_plan();

-- Tables only the people who run the company can read: raw correspondence and recordings,
-- which mentors, viewers and admins don't see (SPEC part P: mentors never get raw transcripts).
create function pg_temp.private_tables()
returns text[]
language sql
immutable
as $$
  select array['voice_sources', 'voice_edit_events', 'captures', 'transcripts', 'extracted_items',
    'ideas', 'commitments', 'feedback', 'consents', 'current_consents', 'leads', 'subscriptions', 'integration_settings', 'briefs']
$$;

-- Expected readers of each company's data.
create function pg_temp.expected(p_person text, p_company text, p_table text default null)
returns boolean
language sql
immutable
as $$
  select case
    -- Stripe ids and raw events: the service role only.
    when p_table in ('stripe_customers', 'stripe_events', 'integration_secrets', 'schedule_runs') then false
    when p_table = any (pg_temp.private_tables()) then
      case p_company
        when 'company_a' then p_person in ('founder', 'teammate')
        when 'company_b' then p_person = 'founder_b'
      end
    else
      case p_company
        when 'company_a' then p_person in ('founder', 'teammate', 'viewer', 'member_mentor', 'cohort_mentor', 'admin')
        when 'company_b' then p_person in ('founder_b', 'other_mentor', 'admin')
      end
  end
$$;
grant execute on function pg_temp.expected(text, text, text), pg_temp.private_tables() to authenticated;

create temp table people as
select unnest(array[
  'founder', 'teammate', 'viewer', 'member_mentor', 'cohort_mentor', 'other_mentor',
  'outsider', 'admin', 'founder_b'
]) as person;
grant select on people to authenticated;

-- Every company-scoped table, for every person and both companies. Assertions run inside a
-- DO block (to switch person) so their TAP lines are collected and printed afterwards.
create temp table tap_lines (n serial, line text);
grant insert on tap_lines to authenticated;
grant usage on sequence tap_lines_n_seq to authenticated;

do $$
declare
  p text;
begin
  for p in select person from people loop
    perform pg_temp.login(p);
    insert into tap_lines (line)
    select is(
      pg_temp.sees(t, pg_temp.id(c)),
      pg_temp.expected(p, c, t),
      format('%s %s read %s rows of %s', p, case when pg_temp.expected(p, c, t) then 'can' else 'cannot' end, t, c)
    )
    from pg_temp.company_tables() t, unnest(array['company_a', 'company_b']) c;
    reset role;
  end loop;
end;
$$;
select line from tap_lines order by n;

-- Companies themselves (keyed by id, not company_id).
select pg_temp.login('founder');
select results_eq('select slug from public.companies order by 1', array['a-co'], 'a founder sees only their company');
select pg_temp.login('cohort_mentor');
select results_eq('select slug from public.companies order by 1', array['a-co'], 'a cohort mentor sees their cohort''s companies');
select pg_temp.login('other_mentor');
select results_eq('select slug from public.companies order by 1', array['b-co'], 'a mentor does not see companies outside their cohort');
select pg_temp.login('outsider');
select is_empty('select 1 from public.companies', 'an outsider sees no companies');
select pg_temp.login('admin');
select results_eq($$select slug from public.companies where slug in ('a-co', 'b-co') order by 1$$, array['a-co', 'b-co'], 'an admin sees every company');

-- Profiles: the people you work with.
select pg_temp.login('founder');
select results_eq(
  'select email from public.profiles order by 1',
  array['cohort_mentor@test.example.com', 'founder@test.example.com', 'member_mentor@test.example.com', 'teammate@test.example.com', 'viewer@test.example.com'],
  'a founder sees co-members and their cohort''s mentors, and nobody else'
);
select pg_temp.login('cohort_mentor');
select results_eq(
  'select email from public.profiles order by 1',
  array['cohort_mentor@test.example.com', 'founder@test.example.com', 'member_mentor@test.example.com', 'teammate@test.example.com', 'viewer@test.example.com'],
  'a cohort mentor sees the members of their cohort''s companies'
);
select pg_temp.login('outsider');
select results_eq('select email from public.profiles', array['outsider@test.example.com'], 'an outsider sees only their own profile');

-- Cohorts.
select pg_temp.login('founder');
select results_eq('select name from public.cohorts', array['Cohort X'], 'a founder sees their company''s cohort');
select results_eq('select user_id from public.cohort_mentors', array[pg_temp.id('cohort_mentor')], 'a founder sees their cohort''s mentors');
select throws_ok('select join_code from public.cohorts', '42501', null, 'cohort join codes are not readable');
select pg_temp.login('other_mentor');
select results_eq('select name from public.cohorts', array['Cohort Y'], 'a mentor sees only their own cohort');
select pg_temp.login('outsider');
select is_empty('select 1 from public.cohorts', 'an outsider sees no cohorts');

-- Per-user settings are private to their owner.
select pg_temp.login('founder');
select isnt_empty('select 1 from public.user_preferences', 'you see your own preferences');
select isnt_empty('select 1 from public.hq_layouts', 'you see your own HQ layout');
select pg_temp.login('teammate');
select is_empty('select 1 from public.user_preferences', 'you cannot see a co-member''s preferences');
select is_empty('select 1 from public.hq_layouts', 'you cannot see a co-member''s HQ layout');

reset role;
select * from finish();
rollback;
