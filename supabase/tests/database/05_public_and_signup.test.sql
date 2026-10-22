-- Anonymous visitors, the public progress page, and profile creation on sign-up.
begin;
\ir _setup.psql
select * from no_plan();

-- Anonymous visitors cannot read any table or view.
create temp table tap_lines (n serial, line text);
grant insert on tap_lines to anon;
grant usage on sequence tap_lines_n_seq to anon;

do $$
declare
  t text;
  denied boolean;
begin
  perform pg_temp.login_anon();
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v') order by 1
  loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      denied := false;
    exception when insufficient_privilege then
      denied := true;
    end;
    insert into tap_lines (line) select ok(denied, format('an anonymous visitor cannot read %s', t));
  end loop;
  reset role;
end;
$$;
select line from tap_lines order by n;

select pg_temp.login_anon();
select throws_ok(format($$select private.can_read_company(%L)$$, pg_temp.id('company_a')), '42501', null,
  'an anonymous visitor cannot call the access helpers');

-- The public progress page.
select is(public.get_public_progress('a-co'), null, 'a company that has not turned on sharing shows nothing');
select is(public.get_public_progress('no-such-company'), null, 'an unknown slug shows nothing');
select is(
  public.get_public_progress('b-co'),
  '{"name": "Company B", "description": "Second test company.", "stage": "idea", "milestones": ["idea"]}'::jsonb,
  'a sharing company shows its name, stage and milestones, but no metrics by default'
);
reset role;
update public.company_sharing set stage = false, signups = true where company_id = pg_temp.id('company_b');
select pg_temp.login_anon();
select is(
  public.get_public_progress('b-co'),
  '{"name": "Company B", "description": "Second test company.", "milestones": ["idea"], "metrics": {"date": "2026-10-21", "signups": 5}}'::jsonb,
  'only the metrics the founder chose are shared'
);

-- Signing up creates a profile.
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values ('44444444-0000-4000-8000-000000000001', 'new.founder@example.com', '{"full_name": "New Founder"}');
insert into auth.users (id, email)
values ('44444444-0000-4000-8000-000000000002', 'no.name@example.com');
select results_eq(
  $$select email, full_name, is_admin from public.profiles where id::text like '44444444%' order by email$$,
  $$values ('new.founder@example.com', 'New Founder', false), ('no.name@example.com', 'no.name', false)$$,
  'signing up creates a non-admin profile, named from sign-up data or the email'
);

select * from finish();
rollback;
