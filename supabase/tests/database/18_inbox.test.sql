-- The inbox pipeline and consent-checked imports (Phase 14).
begin;
\ir _setup.psql
select * from no_plan();

select is((select count(*)::integer from public.inbox_items where company_id = pg_temp.id('company_a')), 1,
  'messages already received become inbox items');

-- New messages ----------------------------------------------------------------------------------
select pg_temp.login_service();
select lives_ok(format($$select public.receive_inbound_email(%L, 'kim@example.com', 'Kim', 'Booking', 'A table for two?', 'msg_inbox_1')$$, pg_temp.id('company_a')),
  'an email arrives');
reset role;
select results_eq($$select i.channel, i.status, i.contact_id is not null from public.inbox_items i join public.email_threads t on t.id = i.thread_id where t.address = 'kim@example.com'$$,
  $$values ('email'::text, 'new'::text, true)$$, 'it waits in the inbox, linked to the contact');
create temp table form_a as select id from public.forms where company_id = pg_temp.id('company_a') limit 1;
grant select on form_a to anon;
set local role anon;
select ok(public.submit_lead((select id from form_a), 'Lee', 'lee@example.com', 'Do you cater?'), 'a form arrives');
reset role;
select is((select i.channel from public.inbox_items i join public.email_threads t on t.id = i.thread_id where t.address = 'lee@example.com'), 'form', 'and lands in the same inbox');

-- Daily budget ---------------------------------------------------------------------------------
select pg_temp.login('teammate');
select throws_like(format($$select public.update_response_settings(%L, null, null, false, 100)$$, pg_temp.id('company_a')), '%Only a founder%',
  'only a founder sets the inbox budget');
select pg_temp.login('founder');
select throws_like(format($$select public.update_response_settings(%L, null, null, false, 9000)$$, pg_temp.id('company_a')), '%between 0 and 5,000%', 'the budget is bounded');
select lives_ok(format($$select public.update_response_settings(%L, null, null, false, 200)$$, pg_temp.id('company_a')), 'a founder sets it');
reset role;
select is((select inbox_daily_cap from public.response_settings where company_id = pg_temp.id('company_a')), 200, 'saved');
select is((select inbox_daily_cap from public.response_settings where company_id = pg_temp.id('company_b')), 0, 'off by default');

-- Doing it now, or closing it --------------------------------------------------------------------
create temp table kim as select i.id from public.inbox_items i join public.email_threads t on t.id = i.thread_id where t.address = 'kim@example.com';
grant select on kim to authenticated;
select pg_temp.login('viewer');
select throws_like('select public.process_inbox_item((select id from kim))', 'Message not found', 'viewers can''t process the inbox');
select pg_temp.login('teammate');
select lives_ok('select public.process_inbox_item((select id from kim))', 'a teammate asks Sol to deal with it now');
select throws_like('select public.process_inbox_item((select id from kim))', '%already looked%', 'once');
reset role;
select is((select status from public.inbox_items where id = (select id from kim)), 'triaging', 'it''s being triaged');
select is((select count(*)::integer from public.agent_jobs where job_type = 'inbox_triage' and payload ->> 'item_id' = (select id::text from kim)), 1, 'by a triage job');

-- A NO-GO on Sol's reply closes the item.
insert into public.approvals (company_id, action_type, payload, estimated_credits)
values (pg_temp.id('company_a'), 'send_email', jsonb_build_object('to', 'kim@example.com', 'subject', 'Re: Booking', 'body', 'Yes!', 'inbox_item_id', (select id from kim)), 5);
select pg_temp.login('founder');
select lives_ok($$select public.decide_approval((select id from public.approvals where payload ->> 'inbox_item_id' = (select id::text from kim)), 'declined')$$, 'the founder says NO-GO to the reply');
reset role;
select is((select status from public.inbox_items where id = (select id from kim)), 'closed', 'and the item is closed');
select pg_temp.login('cohort_mentor');
select is_empty('select 1 from public.inbox_items', 'mentors don''t see the inbox');

-- Consent-checked import -----------------------------------------------------------------------
select pg_temp.login('teammate');
select is(public.import_contacts_checked(pg_temp.id('company_a'), $j$[
  {"name": "Ann", "email": "ann@example.com", "kind": "lead", "consent": "consent", "consent_evidence": "Signed up at the fair, 3 Oct 2026"},
  {"name": "Bob", "email": "bob@example.com", "kind": "lead", "consent": "consent"},
  {"name": "Cat", "email": "cat@example.com", "kind": "customer", "consent": "soft_opt_in"},
  {"name": "Dan", "email": "dan@example.com", "kind": "lead"},
  {"name": "Bad", "email": "not-an-email"}
]$j$), '{"added": 4, "consent": 1, "soft_opt_in": 0, "service_only": 3}'::jsonb,
  'consent needs evidence; soft opt-in needs the founder''s confirmation; the rest are service only');
select is(public.import_contacts_checked(pg_temp.id('company_a'), '[{"name": "Eve", "email": "eve@example.com", "kind": "customer", "consent": "soft_opt_in"}]', true),
  '{"added": 1, "consent": 0, "soft_opt_in": 1, "service_only": 0}'::jsonb, 'a confirmed soft opt-in applies to existing customers');
reset role;
select results_eq($$select c.email, cc.status, cc.lawful_basis from public.current_consents cc join public.contacts c on c.id = cc.contact_id
  where c.email in ('ann@example.com', 'dan@example.com', 'eve@example.com') order by 1$$,
  $$values ('ann@example.com'::text, 'granted'::text, 'consent'::text), ('dan@example.com', 'not_given', null), ('eve@example.com', 'granted', 'soft_opt_in')$$,
  'each contact''s marketing permission is recorded');
select ok(exists (select 1 from public.compliance_items where company_id = pg_temp.id('company_a') and title like '3 imported contacts can''t be sent marketing' and source = 'sol'),
  'service-only contacts raise a Stay legal task');

select * from finish();
rollback;
