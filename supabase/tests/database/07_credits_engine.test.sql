-- The credits engine (supabase/migrations/20261026110000_credits_engine.sql): reserve, settle,
-- release, refund, grants, expiry, consumption order and cohort pools.
begin;
\ir _setup.psql
select * from no_plan();

-- Fixtures: company A starts with a 1000-credit plan lot (from _setup). Runs to charge.
create function pg_temp.run(p_n integer, p_company text default 'company_a') returns uuid language sql immutable as $$
  select ('66666666-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;
insert into public.agent_runs (id, company_id, task, pillar, model, status)
select pg_temp.run(n), pg_temp.id(case when n >= 20 then 'company_b' else 'company_a' end), 'Run ' || n, 'grow', 'test-model', 'running'
from unnest(array[1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 21]) n;
-- Company A's cohort place starts with no cap, so its own credits are all it has until the
-- cohort section below.
update public.cohort_companies set credit_cap = 0 where company_id = pg_temp.id('company_a');
create function pg_temp.balance(p_company text default 'company_a') returns integer language sql as $$
  select coalesce(sum(amount), 0)::integer from public.credit_ledger where company_id = pg_temp.id(p_company)
$$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- Only the service role ------------------------------------------------------------------------

select pg_temp.login('founder');
select throws_ok(format($$select public.grant_credits(%L, 100, 'topup', 'Free money')$$, pg_temp.id('company_a')),
  '42501', null, 'a founder cannot grant credits');
select throws_ok(format($$select public.reserve_credits(%L, %L, 10)$$, pg_temp.id('company_a'), pg_temp.run(1)),
  '42501', null, 'a founder cannot reserve credits directly');
select throws_ok(format($$select public.refund_run(%L)$$, pg_temp.run(1)), '42501', null, 'a founder cannot refund a run');
select throws_ok($$select public.expire_credits()$$, '42501', null, 'a founder cannot run expiry');
select pg_temp.login_anon();
select throws_ok(format($$select public.settle_run(%L, 1)$$, pg_temp.run(1)), '42501', null, 'anonymous visitors cannot settle');

-- Conversion -----------------------------------------------------------------------------------

select pg_temp.login_service();
select is(public.credits_for_usd(1), 225, '$1 = 1 × 0.75 × 3 ÷ £0.01 = 225 credits');
select is(public.credits_for_usd(0.001), 1, 'any cost rounds up to at least one credit');
select is(public.credits_for_usd(0), 0, 'no cost, no credits');
select is(public.usd_for_credits(225), 1.0000::numeric, '225 credits pay for $1 (maxBudgetUsd)');

-- Reserve and settle ----------------------------------------------------------------------------

select is(public.reserve_credits(pg_temp.id('company_a'), pg_temp.run(1), 300), 300, 'reserving holds the credits');
select is(pg_temp.balance(), 700, 'the balance drops by the hold');
select is((select held from public.company_credit_balance where company_id = pg_temp.id('company_a')), 300, 'and shows as held');
select throws_like(format($$select public.reserve_credits(%L, %L, 800)$$, pg_temp.id('company_a'), pg_temp.run(2)),
  'Not enough credits%', 'a reservation the balance can''t cover is refused (insufficient balance)');
select is(pg_temp.balance(), 700, 'a refused reservation holds nothing');

-- $0.40 = 90 credits of a 300 hold: 90 charged, 210 released.
select is(public.settle_run(pg_temp.run(1), 0.40), 90, 'settling charges the actual cost');
select is(pg_temp.balance(), 910, 'and releases the rest of the hold');
select is((select held from public.company_credit_balance where company_id = pg_temp.id('company_a')), 0, 'nothing stays held');
select is((select credits_charged from public.agent_runs where id = pg_temp.run(1)), 90, 'the run records what it was charged');
select throws_like(format($$select public.settle_run(%L, 0.40)$$, pg_temp.run(1)),
  '%nothing reserved%', 'settling twice is refused (double-settle)');
select is(pg_temp.balance(), 910, 'a second settle charges nothing');

-- A run that costs more than it held is capped at the hold.
select public.reserve_credits(pg_temp.id('company_a'), pg_temp.run(3), 50);
select is(public.settle_run(pg_temp.run(3), 10), 50, 'a run is never charged more than it reserved');
select is(pg_temp.balance(), 860, 'the cap holds in the balance');

-- Release ---------------------------------------------------------------------------------------

select public.reserve_credits(pg_temp.id('company_a'), pg_temp.run(4), 100);
select is(public.release_hold(pg_temp.run(4)), 100, 'releasing gives back the whole hold');
select is(public.release_hold(pg_temp.run(4)), 0, 'releasing again gives back nothing');
select is(pg_temp.balance(), 860, 'the balance is whole again');

-- Refund ----------------------------------------------------------------------------------------

select is(public.refund_run(pg_temp.run(1), 'Provider outage'), 90, 'refunding returns what the run was charged');
select is(pg_temp.balance(), 950, 'the refund is in the balance');
select throws_like(format($$select public.refund_run(%L)$$, pg_temp.run(1)), '%already refunded%', 'refunding twice is refused');
select is(pg_temp.balance(), 950, 'a second refund adds nothing');
select is((select credits_charged from public.agent_runs where id = pg_temp.run(1)), 0, 'the refunded run shows no charge');
select ok(exists (select 1 from public.activity_events where run_id = pg_temp.run(1) and type = 'refund'), 'the refund is in the activity log');
-- A run refunded while still holding gets its hold back too.
select public.reserve_credits(pg_temp.id('company_a'), pg_temp.run(5), 40);
select is(public.refund_run(pg_temp.run(5)), 0, 'a run that was never charged refunds nothing');
select is(pg_temp.balance(), 950, 'but its hold is released');

-- Grants and idempotency ------------------------------------------------------------------------

select lives_ok(format($$select public.grant_credits(%L, 500, 'topup', 'Top-up £10', null, 'evt_test_1')$$, pg_temp.id('company_a')),
  'the service role grants a top-up');
select is(public.grant_credits(pg_temp.id('company_a'), 500, 'topup', 'Top-up £10', null, 'evt_test_1'),
  (select id from public.credit_ledger where idempotency_key = 'evt_test_1'), 'the same event id returns the first grant');
select is((select count(*)::integer from public.credit_ledger where idempotency_key = 'evt_test_1'), 1, 'and records it once');
select is(pg_temp.balance(), 1450, 'the top-up counts once');
select ok((select expires_at between now() + interval '11 months' and now() + interval '13 months' from public.credit_ledger where idempotency_key = 'evt_test_1'),
  'top-ups expire after 12 months');
select throws_like(format($$select public.grant_credits(%L, 0, 'plan', 'Nothing')$$, pg_temp.id('company_a')), '%positive%', 'a grant must be positive');

-- Consumption order: plan before top-ups ---------------------------------------------------------

-- Plan lot: 1000 - 90 - 50 + 90 (refund) = 950 left; top-up 500.
select public.reserve_credits(pg_temp.id('company_a'), pg_temp.run(6), 1000);
select results_eq(
  format($$select l.bucket::text, (-sum(h.amount))::integer from public.credit_ledger h join public.credit_ledger l on l.id = h.lot_id
    where h.run_id = %L and h.entry_type = 'hold' group by l.bucket order by l.bucket$$, pg_temp.run(6)),
  $$values ('plan', 950), ('topup', 50)$$,
  'plan credits are used before top-ups');
select public.settle_run(pg_temp.run(6), 4.4445); -- 1000 credits
select is((select plan_balance from public.company_credit_balance where company_id = pg_temp.id('company_a')), 0, 'the plan lot is used up');
select is((select topup_balance from public.company_credit_balance where company_id = pg_temp.id('company_a')), 450, 'the top-up has the rest');

-- Expiry ----------------------------------------------------------------------------------------

select public.grant_credits(pg_temp.id('company_b'), 300, 'plan', 'Plan grant', now() + interval '1 day');
select public.grant_credits(pg_temp.id('company_b'), 200, 'topup', 'Old top-up', now() + interval '2 days');
select is(public.expire_credits(now()), 0, 'nothing expires early');
select is(public.expire_credits(now() + interval '36 hours'), 300, 'unused plan credits expire at the end of the period');
select is(public.expire_credits(now() + interval '36 hours'), 0, 'expiring again expires nothing');
select is(public.expire_credits(now() + interval '3 days'), 200, 'top-ups expire too');
select is(pg_temp.balance('company_b'), 1000, 'only the expired credits left the balance (B''s _setup grant has no expiry)');
-- An expired lot can't be spent even before expiry has run.
select public.grant_credits(pg_temp.id('company_b'), 50, 'topup', 'Already expired', now() - interval '1 minute');
select public.reserve_credits(pg_temp.id('company_b'), pg_temp.run(20, 'company_b'), 1040);
select is((select coalesce(sum(amount), 0)::integer from public.credit_ledger where company_id = pg_temp.id('company_b') and bucket = 'cohort'), 40,
  'expired lots are not spendable: the 40 short came from the cohort pool, not the expired 50');
select public.release_hold(pg_temp.run(20, 'company_b'));

-- Cohort pools and caps --------------------------------------------------------------------------

-- Cohort X has a 10,000 pool; company A's cap is 5,000. A has 450 of its own.
reset role;
update public.cohorts set credit_pool = 6000 where id = pg_temp.id('cohort_x');
update public.cohort_companies set credit_cap = 5000 where company_id = pg_temp.id('company_a');
insert into public.companies (id, slug, name, customer_type) values ('22222222-0000-4000-8000-00000000000c', 'c-co', 'Company C', 'B2C');
insert into public.cohort_companies (cohort_id, company_id, credit_cap) values (pg_temp.id('cohort_x'), '22222222-0000-4000-8000-00000000000c', 4000);
select pg_temp.login_service();
select is(public.reserve_credits(pg_temp.id('company_a'), pg_temp.run(7), 2450), 2450, 'a cohort company draws its shortfall from the pool');
select is((select sum(amount)::integer from public.credit_ledger where company_id = pg_temp.id('company_a') and bucket = 'cohort'), 2000,
  'only the shortfall is drawn');
select throws_like(format($$select public.reserve_credits(%L, %L, 3001)$$, pg_temp.id('company_a'), pg_temp.run(8)),
  '%cohort pool allows 3000 more%', 'the per-company cap is enforced at reserve time');
select is(public.reserve_credits(pg_temp.id('company_a'), pg_temp.run(8), 3000), 3000, 'up to the cap is allowed');
-- The pool now has 6000 - 5000 = 1000 left, whatever company C's cap says.
select throws_like(format($$select public.reserve_credits(%L, %L, 1500)$$, '22222222-0000-4000-8000-00000000000c', pg_temp.run(30)),
  '%Run not found%', 'a run must belong to the company');
reset role;
insert into public.agent_runs (id, company_id, task, pillar, model) values
  ('66666666-0000-4000-8000-000000000031', '22222222-0000-4000-8000-00000000000c', 'C run', 'grow', 'test-model');
select pg_temp.login_service();
select throws_like($$select public.reserve_credits('22222222-0000-4000-8000-00000000000c', '66666666-0000-4000-8000-000000000031', 1500)$$,
  '%cohort pool allows 1000 more%', 'the pool''s size caps every company together');
select is(public.reserve_credits('22222222-0000-4000-8000-00000000000c', '66666666-0000-4000-8000-000000000031', 1000), 1000,
  'the last of the pool can be drawn');
-- Releasing a hold keeps the drawn credits with the company (they count against its cap).
select is(public.release_hold(pg_temp.run(8)), 3000, 'a released cohort hold goes back to the company''s cohort lot');
select is((select cohort_balance from public.company_credit_balance where company_id = pg_temp.id('company_a')), 3000,
  'and is spendable by that company');
select throws_like(format($$select public.reserve_credits(%L, %L, 3001)$$, pg_temp.id('company_a'), pg_temp.run(9)),
  '%cohort pool allows 0 more%', 'but drawing more is still capped');
select is(public.reserve_credits(pg_temp.id('company_a'), pg_temp.run(9), 3000), 3000, 'using the drawn credits needs no new draw');
-- A company outside any cohort gets the plain message.
reset role;
insert into public.companies (id, slug, name, customer_type) values ('22222222-0000-4000-8000-00000000000d', 'd-co', 'Company D', 'B2B');
insert into public.agent_runs (id, company_id, task, pillar, model) values
  ('66666666-0000-4000-8000-000000000041', '22222222-0000-4000-8000-00000000000d', 'D run', 'grow', 'test-model');
select pg_temp.login_service();
select throws_like($$select public.reserve_credits('22222222-0000-4000-8000-00000000000d', '66666666-0000-4000-8000-000000000041', 10)$$,
  'Not enough credits: this needs 10 and 0 are available.', 'outside a cohort there is no pool to draw on');

-- Credit summary --------------------------------------------------------------------------------

select pg_temp.login('founder');
select is((public.credit_summary(pg_temp.id('company_a')) ->> 'cohort_headroom')::integer, 0, 'founders see their cohort headroom');
select is((public.credit_summary(pg_temp.id('company_a')) ->> 'held')::integer, 5450, 'and what is held');
select pg_temp.login('outsider');
select throws_like(format($$select public.credit_summary(%L)$$, pg_temp.id('company_a')), '%access%', 'outsiders cannot read it');

-- The ledger stays insert-only through all of this.
reset role;
select throws_ok($$update public.credit_ledger set amount = 1 where entry_type = 'usage'$$, '42501', null, 'still no updates');
select is((select count(*)::integer from public.credit_ledger where entry_type not in ('grant', 'topup') and lot_id is null), 0,
  'every debit and credit-back points at a lot');

select * from finish();
rollback;
