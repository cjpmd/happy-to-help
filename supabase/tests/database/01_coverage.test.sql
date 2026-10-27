-- Schema-wide guarantees: RLS everywhere, nothing for anonymous visitors, locked-down helpers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  array(
    select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1
  ),
  '{}'::text[],
  'every table in public has row-level security enabled'
);

select is(
  array(
    select distinct table_name::text from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' order by 1
  ),
  '{}'::text[],
  'anonymous visitors have no privileges on any table or view'
);

select is(
  array(
    select distinct table_name::text from information_schema.column_privileges
    where grantee = 'anon' and table_schema = 'public' order by 1
  ),
  '{}'::text[],
  'anonymous visitors have no column privileges either'
);

select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
    order by 1
  ),
  array['follow_link', 'get_feedback_request', 'get_form', 'get_hub', 'get_public_progress', 'submit_feedback', 'submit_lead'],
  'anonymous visitors can call only the public pages: progress, hub, forms, short links and feedback'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anonymous visitors cannot use the private schema'
);

select is(
  array(
    select tablename || ': ' || policyname from pg_policies
    where schemaname = 'public' and roles <> '{authenticated}' order by 1
  ),
  '{}'::text[],
  'every policy applies to signed-in users only'
);

select ok(
  (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.company_credit_balance'::regclass),
  'the balance view applies the ledger''s row-level security'
);

select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not ('search_path=""' = any (coalesce(p.proconfig, '{}')))
    order by 1
  ),
  '{}'::text[],
  'every security-definer function pins an empty search_path'
);

select * from finish();
rollback;
