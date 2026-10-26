-- Billing (Phase 6): Stripe events are applied once, and only by the service role.
begin;
\ir _setup.psql
select * from no_plan();

select is((select count(*)::integer from public.billing_products where active), 7, 'three plans, three top-ups and the Launch Pack');
select pg_temp.login('viewer');
select is((select credits from public.billing_products where product = 'launch_pack'), 10000, 'anyone signed in can read the price list');
select throws_ok(format($$select public.apply_billing_event('evt_x', 'invoice.paid', '[{"kind": "grant", "company_id": "%s", "product": "topup_t10"}]')$$,
  pg_temp.id('company_a')), '42501', null, 'people cannot apply Stripe events themselves');

select pg_temp.login_service();
create temp table before as select balance from public.company_credit_balance where company_id = pg_temp.id('company_a');
select is(public.apply_billing_event('evt_topup', 'checkout.session.completed',
  format('[{"kind": "customer", "company_id": "%s", "customer_id": "cus_new"}, {"kind": "grant", "company_id": "%s", "product": "topup_t25", "key": "stripe:cs_1"}]',
    pg_temp.id('company_a'), pg_temp.id('company_a'))::jsonb), 'applied', 'a paid top-up is applied');
select is(public.apply_billing_event('evt_topup', 'checkout.session.completed',
  format('[{"kind": "grant", "company_id": "%s", "product": "topup_t25", "key": "stripe:cs_1"}]', pg_temp.id('company_a'))::jsonb),
  'duplicate', 'the same event again is a duplicate');
select is(public.apply_billing_event('evt_topup_retry', 'checkout.session.completed',
  format('[{"kind": "grant", "company_id": "%s", "product": "topup_t25", "key": "stripe:cs_1"}]', pg_temp.id('company_a'))::jsonb),
  'applied', 'a different event for the same checkout');
select is((select balance from public.company_credit_balance where company_id = pg_temp.id('company_a')) - (select balance from before), 1300,
  'grants the credits only once (the grant''s own key)');
select is((select customer_id from public.stripe_customers where company_id = pg_temp.id('company_a')), 'cus_new', 'and remembers the Stripe customer');
select results_eq($$select bucket::text, entry_type::text from public.credit_ledger where idempotency_key = 'stripe:cs_1'$$,
  $$values ('topup', 'topup')$$, 'top-ups go in the top-up bucket (12 months)');

select is(public.apply_billing_event('evt_invoice', 'invoice.paid',
  format('[{"kind": "grant", "company_id": "%s", "product": "plan_growth", "key": "stripe:in_1", "expires_at": "2026-12-01T00:00:00Z"}]', pg_temp.id('company_a'))::jsonb),
  'applied', 'a paid invoice is applied');
select results_eq($$select bucket::text, amount, expires_at from public.credit_ledger where idempotency_key = 'stripe:in_1'$$,
  $$values ('plan'::text, 12000, '2026-12-01T00:00:00Z'::timestamptz)$$, 'plan credits expire at the end of the billing period');
select is((select plan::text from public.companies where id = pg_temp.id('company_a')), 'growth', 'and the company moves to that plan');

select is(public.apply_billing_event('evt_sub', 'customer.subscription.updated',
  format('[{"kind": "subscription", "company_id": "%s", "subscription_id": "sub_1", "customer_id": "cus_new", "status": "active", "product": "plan_growth", "cancel_at_period_end": true}]',
    pg_temp.id('company_a'))::jsonb), 'applied', 'subscription changes are tracked');
select results_eq($$select status, plan::text, cancel_at_period_end from public.subscriptions where company_id = pg_temp.id('company_a')$$,
  $$values ('active'::text, 'growth'::text, true)$$, 'with plan and cancellation');

select is(public.apply_billing_event('evt_other', 'charge.refunded', '[]'), 'ignored', 'events we don''t need are recorded and ignored');
select throws_like($$select public.apply_billing_event('evt_bad', 'invoice.paid', '[{"kind": "grant", "company_id": "00000000-0000-0000-0000-000000000000", "product": "topup_t10"}]')$$,
  '%Unknown company%', 'an event for an unknown company fails (and Stripe retries)');
select is((select processed_at from public.stripe_events where id = 'evt_bad'), null, 'a failed event is not marked processed');
select lives_ok($$select public.fail_billing_event('evt_bad', 'invoice.paid', 'Unknown company')$$, 'its error is recorded');
select is((select error from public.stripe_events where id = 'evt_bad'), 'Unknown company', 'for the audit trail');

reset role;
select pg_temp.login('founder');
select is((select status from public.subscriptions where company_id = pg_temp.id('company_a')), 'active', 'founders see their subscription');
select pg_temp.login('cohort_mentor');
select is_empty('select 1 from public.subscriptions', 'mentors don''t');

select * from finish();
rollback;
