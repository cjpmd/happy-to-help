-- Capture v2: the meeting notetaker and calls (Phase 18).
begin;
\ir _setup.psql
select * from no_plan();

create temp table ev as select e.id from public.calendar_events e where e.company_id = pg_temp.id('company_a');
grant select on ev to authenticated;

-- Meetings are off until someone opts in; only the calendar's owner or a founder can.
select is((select record from public.calendar_events where id = (select id from ev)), false, 'off for every meeting by default');
select pg_temp.login('teammate');
select throws_like($$select public.set_meeting_recording((select id from ev), true)$$, '%owner or a founder%',
  'a teammate can''t send Sol to someone else''s meeting');
select pg_temp.login('founder');
select lives_ok($$select public.set_meeting_recording((select id from ev), true, true)$$, 'the founder opts in, every time');
reset role;
select results_eq($$select e.record, exists (select 1 from public.notetaker_series s where s.series_id = 'series1') from public.calendar_events e where id = (select id from ev)$$,
  $$values (true, true)$$, 'the meeting and its series are opted in');
update public.calendar_events set meeting_url = null where id = (select id from ev);
select pg_temp.login('founder');
select throws_like($$select public.set_meeting_recording((select id from ev), true)$$, '%no video call link%', 'Sol only joins video calls');
select lives_ok($$select public.disconnect_calendar((select connection_id from public.calendar_events where id = (select id from ev)))$$,
  'disconnecting the calendar');
reset role;
select results_eq($$select c.status, e.record, (select count(*)::integer from public.notetaker_series s where s.connection_id = c.id)
  from public.calendar_events e join public.calendar_connections c on c.id = e.connection_id where e.id = (select id from ev)$$,
  $$values ('revoked'::text, false, 0)$$, 'stops everything it had opted in');

-- Refresh tokens are the service role's only.
select pg_temp.login('founder');
select throws_ok('select * from public.calendar_tokens', '42501', null, 'nobody in the app reads calendar tokens');
select lives_ok(format($$select public.connect_mock_calendar(%L)$$, pg_temp.id('company_a')), 'a demo calendar can be connected again');

-- Phone settings: the notice must say the call is recorded.
select pg_temp.login('teammate');
select throws_like(format($$select public.update_phone_settings(%L, '+447700900500')$$, pg_temp.id('company_a')), '%Only a founder%',
  'only a founder changes the phone settings');
select pg_temp.login('founder');
select throws_like(format($$select public.update_phone_settings(%L, null, 'Hello, thanks for calling us today.')$$, pg_temp.id('company_a')),
  '%must tell callers%', 'no silent recording');
select lives_ok(format($$select public.update_phone_settings(%L, '+44 7700 900500', 'Hello from A Co. This call is recorded to help us follow up.')$$, pg_temp.id('company_a')),
  'a founder sets where calls ring and the notice');
select throws_like(format($$select public.update_minutes_cap(%L, 5000)$$, pg_temp.id('company_a')), '%daily_minutes_cap%', 'the daily cap is bounded');
reset role;
select results_eq($$select forward_to, recording_notice from public.phone_numbers where company_id = pg_temp.id('company_a')$$,
  $$values ('+447700900500'::text, 'Hello from A Co. This call is recorded to help us follow up.'::text)$$, 'saved');

-- What the telephony webhook can do (service role only).
select pg_temp.login('founder');
select throws_ok($$select public.record_call('CA1', '+447700900101', '+447700900301', 'ringing')$$, '42501', null,
  'people can''t fake calls');
select pg_temp.login_service();
select is(public.call_routing('+447700900101') ->> 'notice', 'Hello from A Co. This call is recorded to help us follow up.', 'the webhook gets the notice');
select is((public.call_routing('+447700900101') ->> 'minutes_left')::integer, 120, 'and today''s recorded minutes left');
select lives_ok($$select public.record_call('CA1', '+447700900101', '+447700900301', 'ringing', null, null, false)$$, 'a call comes in, not recorded');
select lives_ok($$select public.record_call('CA1', '+447700900101', '+447700900301', 'completed', 60, 'mock:rec')$$, 'it ends');
select throws_like($$select public.record_call('CA2', '+440000000000', '+447700900301', 'ringing')$$, 'Unknown number', 'only our numbers');
reset role;
select results_eq($$select s.status, s.recorded, s.capture_id is null, c.phone from public.call_sessions s join public.contacts c on c.id = s.contact_id where s.external_id = 'CA1'$$,
  $$values ('completed'::text, false, true, '+447700900301'::text)$$, 'without the notice there''s no capture, and the caller is a contact');

select pg_temp.login_service();
select lives_ok($$select public.record_call('CA3', '+447700900101', '+447700900301', 'ringing', null, null, true)$$, 'a call where the notice played');
select lives_ok($$select public.record_call('CA3', '+447700900101', '+447700900301', 'completed', 125, 'mock:rec3')$$, 'and its recording');
reset role;
select results_eq($$select c.source, c.consent, c.status, c.duration_seconds, j.estimated_credits >= public.minutes_estimate('call', 125)
  from public.call_sessions s join public.captures c on c.id = s.capture_id join public.agent_jobs j on j.id = c.job_id where s.external_id = 'CA3'$$,
  $$values ('call'::text, 'call_notice'::text, 'transcribing'::text, 125, true)$$, 'becomes a capture whose estimate includes the call minutes');
select is((select count(*)::integer from public.contacts where phone = '+447700900301'), 1, 'the same caller is the same contact');
select is(public.minutes_estimate('notetaker', 600), 10 * public.credits_for_usd(0.0083), 'notetaker minutes priced from config');

-- Mentors and viewers never see who called or what was said.
select pg_temp.login('member_mentor');
select is((select count(*)::integer from public.call_sessions), 0, 'mentors don''t see calls');
select is((select count(*)::integer from public.captures where source = 'call'), 0, 'or their captures');

select * from finish();
rollback;
