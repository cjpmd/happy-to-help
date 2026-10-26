-- Integrations (Phase 7): per-company switches, inbound email and unsubscribes.
begin;
\ir _setup.psql
select * from no_plan();

select pg_temp.login('teammate');
select throws_like(format($$select public.set_integration(%L, 'resend', true)$$, pg_temp.id('company_a')), '%Only a founder%',
  'only a founder switches an integration on');
select pg_temp.login('founder');
select throws_like(format($$select public.set_integration(%L, 'mailchimp', true)$$, pg_temp.id('company_a')), 'Unknown integration', 'providers are checked');
select throws_like(format($$select public.set_integration(%L, 'resend', true, '{"api_key": "x"}')$$, pg_temp.id('company_a')),
  'Unknown setting%', 'secrets can''t be put in settings');
select throws_like(format($$select public.set_integration(%L, 'resend', true, '{"reply_to": "nope"}')$$, pg_temp.id('company_a')),
  '%reply-to address%', 'the reply-to address is checked');
select lives_ok(format($$select public.set_integration(%L, 'resend', true, '{"from_name": "A Co", "reply_to": "hi@a.example"}')$$, pg_temp.id('company_a')),
  'a founder switches email on');
reset role;
select results_eq($$select enabled, config ->> 'from_name' from public.integration_settings where company_id = pg_temp.id('company_a') and provider = 'resend'$$,
  $$values (true, 'A Co'::text)$$, 'the switch and settings are saved');
select pg_temp.login('founder');
select throws_ok('select * from public.integration_secrets', '42501', null, 'founders can''t read provider secrets');
select pg_temp.login('viewer');
select is_empty('select 1 from public.integration_settings', 'viewers don''t see integration settings');
select is((select count(*)::integer from public.platform_integrations), 0, 'anyone signed in may read what the platform has set up');

-- Inbound email ---------------------------------------------------------------------------------
select pg_temp.login('founder');
select throws_ok(format($$select public.receive_inbound_email(%L, 'x@y.example', 'X', 'Hi', 'Hello', 'msg_1')$$, pg_temp.id('company_a')),
  '42501', null, 'only the service role files inbound email');
select pg_temp.login_service();
create temp table t1 as select public.receive_inbound_email(pg_temp.id('company_a'), 'Kim@Example.com', 'Kim Lee', 'Wedding cake', 'Do you do tastings?', 'msg_1') as id;
select is((select public.receive_inbound_email(pg_temp.id('company_a'), 'kim@example.com', 'Kim Lee', 'Wedding cake', 'Do you do tastings?', 'msg_1')),
  (select id from t1), 'the same message twice is filed once');
select is((select public.receive_inbound_email(pg_temp.id('company_a'), 'kim@example.com', 'Kim Lee', 'RE: Re: Wedding cake', 'Thanks!', 'msg_2')),
  (select id from t1), 'a reply joins its thread');
reset role;
select is((select count(*)::integer from public.email_messages where thread_id = (select id from t1)), 2, 'with both messages');
select results_eq($$select name, kind::text, source from public.contacts where email = 'kim@example.com'$$,
  $$values ('Kim Lee'::text, 'lead'::text, 'email'::text)$$, 'the sender becomes a contact');

-- Unsubscribe -------------------------------------------------------------------------------------
select pg_temp.login_service();
select ok(public.unsubscribe_contact((select id from public.contacts where email = 'kim@example.com')), 'an unsubscribe is recorded');
reset role;
select results_eq($$select status, source from public.current_consents where purpose = 'marketing' and contact_id = (select id from public.contacts where email = 'kim@example.com')$$,
  $$values ('withdrawn'::text, 'unsubscribe'::text)$$, 'as a withdrawn marketing consent, at once');

select * from finish();
rollback;
