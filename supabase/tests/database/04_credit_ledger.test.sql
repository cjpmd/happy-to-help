-- The credit ledger is insert-only and written by the service role only (CLAUDE.md rule 2).
begin;
\ir _setup.psql
select * from no_plan();

-- App users cannot write it at all.
select pg_temp.login('founder');
select throws_ok(format($$insert into public.credit_ledger (company_id, entry_type, amount) values (%L, 'grant', 5000)$$,
  pg_temp.id('company_a')), '42501', null, 'a founder cannot grant themselves credits');

-- The balance view follows the ledger's access rules.
select results_eq($$select company_id, balance, held from public.company_credit_balance$$,
  format($$values (%L::uuid, 1000, 0)$$, pg_temp.id('company_a')), 'a founder sees only their own balance');
select pg_temp.login('outsider');
select is_empty($$select 1 from public.company_credit_balance$$, 'an outsider sees no balances');

-- The service role inserts.
select pg_temp.login_service();
select lives_ok(format($$insert into public.credit_ledger (company_id, entry_type, amount, note, lot_id)
  select %L, 'hold', -100, 'Hold for a run', id from public.credit_ledger where company_id = %1$L and entry_type = 'grant'$$,
  pg_temp.id('company_a')), 'the service role can insert a hold on a lot');
reset role;
select results_eq(format($$select balance, held from public.company_credit_balance where company_id = %L$$, pg_temp.id('company_a')),
  $$values (900, 100)$$, 'a hold reduces the balance and shows as held');

select pg_temp.login_service();
insert into public.credit_ledger (company_id, entry_type, amount, note, lot_id)
  select pg_temp.id('company_a'), 'release', 100, 'Release', id from public.credit_ledger where company_id = pg_temp.id('company_a') and entry_type = 'grant';
reset role;
select results_eq(format($$select balance, held from public.company_credit_balance where company_id = %L$$, pg_temp.id('company_a')),
  $$values (1000, 0)$$, 'releasing the hold restores the balance');

-- Nobody changes or removes rows, the service role and the table owner included.
select pg_temp.login_service();
select throws_ok($$update public.credit_ledger set amount = 999999$$, '42501', null, 'the service role cannot update ledger rows');
select throws_ok($$delete from public.credit_ledger$$, '42501', null, 'the service role cannot delete ledger rows');
reset role;
select throws_ok($$update public.credit_ledger set amount = 999999$$, '42501',
  'credit_ledger is insert-only: UPDATE is not allowed', 'even the owner cannot update ledger rows');
select throws_ok($$delete from public.credit_ledger$$, '42501',
  'credit_ledger is insert-only: DELETE is not allowed', 'even the owner cannot delete ledger rows');
select throws_ok($$truncate public.credit_ledger$$, '42501',
  'credit_ledger is insert-only: TRUNCATE is not allowed', 'even the owner cannot truncate the ledger');
select throws_ok($$delete from public.companies where slug = 'a-co'$$, '23503', null,
  'a company with ledger history cannot be deleted');

-- Signs must match the entry type.
select throws_ok(format($$insert into public.credit_ledger (company_id, entry_type, amount) values (%L, 'grant', -5)$$,
  pg_temp.id('company_a')), '23514', null, 'a grant cannot be negative');
select throws_ok(format($$insert into public.credit_ledger (company_id, entry_type, amount, lot_id)
  select %L, 'usage', 5, id from public.credit_ledger where company_id = %1$L and entry_type = 'grant'$$,
  pg_temp.id('company_a')), '23514', null, 'usage cannot be positive');
select throws_ok(format($$insert into public.credit_ledger (company_id, entry_type, amount) values (%L, 'usage', -5)$$,
  pg_temp.id('company_a')), '23514', null, 'usage must draw from a lot');
select throws_ok(format($$insert into public.credit_ledger (company_id, entry_type, amount, lot_id)
  select %L, 'usage', -5, id from public.credit_ledger where company_id = %L and entry_type = 'grant'$$,
  pg_temp.id('company_a'), pg_temp.id('company_b')), 'P0001', null, 'usage cannot draw from another company''s lot');

select * from finish();
rollback;
