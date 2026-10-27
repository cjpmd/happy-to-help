-- Listening and feedback requests (Phase 16).
begin;
\ir _setup.psql
select * from no_plan();

-- Comments and reviews come in through the service role only ------------------------------------
select pg_temp.login('founder');
select throws_ok(format($$select public.receive_listening_item(%L, 'google', 'review', 'r1', 'Priya', 'Lovely', 5)$$, pg_temp.id('company_a')),
  '42501', null, 'people can''t inject reviews');
select pg_temp.login_service();
select isnt(public.receive_listening_item(pg_temp.id('company_a'), 'Google', 'review', 'r1', 'Priya', 'Lovely bread', 5), null,
  'a review arrives');
select is(public.receive_listening_item(pg_temp.id('company_a'), 'google', 'review', 'r1', 'Priya', 'Lovely bread', 5), null,
  'the same review again is ignored');
select isnt(public.receive_listening_item(pg_temp.id('company_a'), 'instagram', 'comment', 'c1', '@kim', 'Do you deliver?', null, null, 'post_1'), null,
  'a comment arrives');
select throws_like(format($$select public.receive_listening_item(%L, 'x', 'mention', 'm1', 'Sam', 'Hi')$$, pg_temp.id('company_a')),
  'Unknown listening item', 'no broad mentions');
reset role;
select results_eq($$select i.channel, t.platform, t.rating, i.status from public.inbox_items i join public.email_threads t on t.id = i.thread_id
  where t.company_id = pg_temp.id('company_a') and t.external_id in ('r1', 'c1') order by 1$$,
  $$values ('review'::text, 'google'::text, 5::smallint, 'new'::text), ('social', 'instagram', null, 'new')$$,
  'both wait in the inbox with their channel');

-- Settings ------------------------------------------------------------------------------------
select is((select count(*)::integer from public.listening_settings where company_id = pg_temp.id('company_a') and (social_comments or reviews or feedback_requests)), 0,
  'everything is off by default');
select pg_temp.login('teammate');
select throws_like(format($$select public.update_listening_settings(%L, true)$$, pg_temp.id('company_a')), '%Only a founder%',
  'only a founder chooses what Sol listens to');
select pg_temp.login('founder');
select lives_ok(format($$select public.update_listening_settings(%L, p_reviews => true, p_feedback_requests => true, p_feedback_delay_days => 0)$$, pg_temp.id('company_a')),
  'a founder switches reviews and feedback requests on');
reset role;
select results_eq($$select social_comments, reviews, feedback_requests, feedback_delay_days from public.listening_settings where company_id = pg_temp.id('company_a')$$,
  $$values (false, true, true, 0)$$, 'saved, leaving the rest as it was');

-- Public replies are approvals; their text is claims-checked and editable ------------------------
insert into public.approvals (company_id, action_type, payload, estimated_credits)
values (pg_temp.id('company_a'), 'reply_public', '{"platform": "google", "kind": "review", "external_id": "r1", "text": "Thank you, Priya."}', 5);
select is(private.approval_text('reply_public', '{"text": "Thanks"}'), 'Thanks', 'the claims check reads the reply');
select pg_temp.login('founder');
select lives_ok($$select public.edit_approval((select id from public.approvals where action_type = 'reply_public' limit 1), '{"text": "Thank you so much, Priya."}')$$,
  'a founder rewords the reply');
select throws_like($$select public.edit_approval((select id from public.approvals where action_type = 'reply_public' limit 1), '{"external_id": "other"}')$$,
  '%only change the wording%', 'but not where it goes');

-- Feedback requests ---------------------------------------------------------------------------
reset role;
insert into public.contacts (company_id, name, email, kind) values
  (pg_temp.id('company_a'), 'Ola Ade', 'ola@example.com', 'customer'),
  (pg_temp.id('company_a'), 'Ben Cole', 'ben@example.com', 'customer');
insert into public.consents (company_id, contact_id, purpose, status, lawful_basis, source)
select company_id, id, 'marketing', 'granted', 'consent', 'form' from public.contacts where email = 'ola@example.com';
create temp table who as select id, email from public.contacts where email in ('ola@example.com', 'ben@example.com');
grant select on who to authenticated;

select pg_temp.login('teammate');
select throws_like($$select public.request_feedback((select id from who where email = 'ben@example.com'), 'https://app.example')$$,
  '%hasn''t opted in%', 'not without permission (PECR)');
select throws_like($$select public.request_feedback((select id from who where email = 'ola@example.com'), 'javascript:alert(1)')$$,
  '%app''s address%', 'links only to the app');
select lives_ok($$select public.request_feedback((select id from who where email = 'ola@example.com'), 'https://app.example')$$,
  'a teammate asks a customer who opted in');
select throws_like($$select public.request_feedback((select id from who where email = 'ola@example.com'), 'https://app.example')$$,
  '%recently%', 'once in a while, not again and again');
select pg_temp.login('viewer');
select throws_like($$select public.request_feedback((select id from who where email = 'ola@example.com'), 'https://app.example')$$,
  'Contact not found', 'viewers can''t');
select pg_temp.login('founder');
select throws_ok('select token from public.feedback_requests', '42501', null, 'the link''s token stays server-side');
reset role;
select results_eq($$select a.action_type::text, a.status::text, a.payload ->> 'to', (a.payload ->> 'outreach')::boolean, a.payload ->> 'body' like '%https://app.example/fb/%'
  from public.feedback_requests f join public.approvals a on a.id = f.approval_id join who on who.id = f.contact_id$$,
  $$values ('send_email', 'pending', 'ola@example.com', true, true)$$,
  'the request is a marketing email waiting for a GO, with its link');

-- The customer answers, once ------------------------------------------------------------------
create temp table tok as select f.token from public.feedback_requests f join who on who.id = f.contact_id;
grant select on tok to anon;
update public.approvals set status = 'approved', decided_at = now(), execution_status = 'done' where id = (select approval_id from public.feedback_requests f join who on who.id = f.contact_id);
select is((select f.status from public.feedback_requests f join who on who.id = f.contact_id), 'sent', 'sent once the email went');
set local role anon;
select is(public.get_feedback_request((select token from tok)) ->> 'name', 'Ola', 'the page greets them by first name');
select is(public.get_feedback_request('not-a-token'), null, 'an unknown link shows nothing');
select throws_like($$select public.submit_feedback((select token from tok), 9)$$, '%1 to 5%', 'stars are 1 to 5');
select ok(public.submit_feedback((select token from tok), 2, 'Waited too long'), 'they answer');
select ok(not public.submit_feedback((select token from tok), 5, ''), 'once');
reset role;
select results_eq($$select source, rating, sentiment, body from public.feedback f join who on who.id = f.contact_id$$,
  $$values ('request'::text, 2::smallint, 'negative'::text, 'Waited too long'::text)$$, 'recorded as feedback');
select ok(exists (select 1 from public.chat_messages where company_id = pg_temp.id('company_a') and content like 'Ola Ade gave 2 stars%'),
  'an unhappy customer goes straight to the founder');

-- The scheduler's daily pass ------------------------------------------------------------------
insert into public.leads (company_id, contact_id, status, updated_at)
select company_id, id, 'won', now() - interval '1 day' from public.contacts where email = 'ben@example.com';
insert into public.consents (company_id, contact_id, purpose, status, lawful_basis, source)
select company_id, id, 'marketing', 'granted', 'soft_opt_in', 'import' from public.contacts where email = 'ben@example.com';
select pg_temp.login_service();
select is(public.queue_due_feedback('https://app.example'), 1, 'a customer won yesterday is asked (delay 0 days)');
select is(public.queue_due_feedback('https://app.example'), 0, 'and only once');
reset role;
select is((select f.trigger from public.feedback_requests f join who on who.id = f.contact_id where who.email = 'ben@example.com'), 'purchase',
  'as a purchase');

select * from finish();
rollback;
