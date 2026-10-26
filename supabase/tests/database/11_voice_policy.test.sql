-- Brand voice and response policy (Phase 11).
begin;
\ir _setup.psql
select * from no_plan();

-- Defaults ------------------------------------------------------------------------------------
select is((select count(*)::integer from public.response_policies where company_id = pg_temp.id('company_a')), 10, 'every category has a policy');
select is((select count(*)::integer from public.response_policies where mode = 'auto_send'), 0, 'auto-send is off for every category to begin with');
select results_eq($$select category from public.response_policies where company_id = pg_temp.id('company_a') and mode = 'escalate' order by 1$$,
  array['legal_threat', 'refund_request'], 'refunds and legal threats escalate');
select results_eq($$select version, status::text, source from public.voice_profiles where company_id = pg_temp.id('company_a')$$,
  $$values (1, 'approved', 'default')$$, 'each company starts with an approved default voice');
select is((select disclosure_text from public.response_settings where company_id = pg_temp.id('company_a')), 'Drafted with our AI assistant', 'the AI disclosure is on by default');

-- Policy ----------------------------------------------------------------------------------------
select pg_temp.login('founder');
select lives_ok(format($$select public.set_response_policy(%L, 'general_enquiry', 'auto_send')$$, pg_temp.id('company_a')),
  'a founder turns on auto-send for general enquiries');
select throws_like(format($$select public.set_response_policy(%L, 'refund_request', 'draft')$$, pg_temp.id('company_a')),
  '%always go to you%', 'refunds always escalate');
select throws_like(format($$select public.set_response_policy(%L, 'nonsense', 'draft')$$, pg_temp.id('company_a')), 'Unknown category', 'categories are checked');
select throws_like(format($$select public.update_response_settings(%L, '  ')$$, pg_temp.id('company_a')),
  '%can be reworded but not removed%', 'the disclosure can''t be removed');
select lives_ok(format($$select public.update_response_settings(%L, 'Written with help from our AI assistant', null, true)$$, pg_temp.id('company_a')),
  'a founder rewords the disclosure and marks the policy reviewed');
select pg_temp.login('teammate');
select throws_like(format($$select public.set_response_policy(%L, 'complaint', 'auto_send')$$, pg_temp.id('company_a')),
  '%Only a founder%', 'teammates cannot change the policy');
select pg_temp.login('cohort_mentor');
select throws_like(format($$select public.set_response_policy(%L, 'complaint', 'auto_send')$$, pg_temp.id('company_a')),
  '%Only a founder%', 'mentors cannot change the policy');
select pg_temp.login('founder_b');
select throws_like(format($$select public.save_voice_profile(%L, '{}')$$, pg_temp.id('company_a')),
  '%Only a founder%', 'another company''s founder cannot change the voice');
reset role;
select ok((select policy_reviewed_at is not null from public.response_settings where company_id = pg_temp.id('company_a')), 'the review is recorded');
select throws_ok($$update public.response_policies set mode = 'auto_send' where category = 'legal_threat'$$, '23514', null,
  'even the database refuses auto-send for legal threats');

-- Voice -----------------------------------------------------------------------------------------
select pg_temp.login('founder');
select lives_ok(format($$select public.save_voice_profile(%L, '{"traits": ["Warm", "Plain"], "sign_off": "Best wishes", "emoji": "sparing"}')$$, pg_temp.id('company_a')),
  'a founder edits the voice');
reset role;
select results_eq($$select version, status::text, source, sign_off from public.voice_profiles where company_id = pg_temp.id('company_a') order by version$$,
  $$values (1, 'superseded', 'default', null::text), (2, 'approved', 'manual', 'Best wishes')$$, 'it becomes a new approved version; the old one is kept');

select pg_temp.login_service();
select lives_ok(format($$select public.propose_voice_profile(%L, null, 'analysis', '{"summary": "Warm and local", "traits": ["Warm", "Local"], "changes": "Adds a local feel"}')$$,
  pg_temp.id('company_a')), 'the agent proposes a voice');
reset role;
select is((select status::text from public.voice_profiles where company_id = pg_temp.id('company_a') and version = 3), 'proposed', 'proposals wait');
select is((select status::text from public.voice_profiles where company_id = pg_temp.id('company_a') and version = 2), 'approved', 'and never change the voice silently');
select is((select count(*)::integer from public.approvals where company_id = pg_temp.id('company_a') and action_type = 'update_voice' and status = 'pending'), 1,
  'a proposal is a GO / NO-GO item');
select pg_temp.login('founder');
select lives_ok($$select public.decide_approval((select id from public.approvals where action_type = 'update_voice' and status = 'pending'), 'declined', 'Not us')$$,
  'a founder declines it');
reset role;
select is((select status::text from public.voice_profiles where company_id = pg_temp.id('company_a') and version = 3), 'declined', 'the proposal is declined with it');

select pg_temp.login_service();
select public.propose_voice_profile(pg_temp.id('company_a'), null, 'analysis', '{"summary": "Second try"}');
select lives_ok($$select public.adopt_voice_profile((select id from public.voice_profiles where summary = 'Second try'), null)$$,
  'the executor adopts an approved proposal');
reset role;
select results_eq($$select status::text from public.voice_profiles where company_id = pg_temp.id('company_a') order by version$$,
  array['superseded', 'superseded', 'declined', 'approved'], 'one approved version at a time');
select throws_ok(format($$insert into public.voice_profiles (company_id, version, status, source) values (%L, 9, 'approved', 'manual')$$, pg_temp.id('company_a')),
  '23505', null, 'never two approved versions');

-- Learning from edits ----------------------------------------------------------------------------
select pg_temp.login('founder');
select lives_ok($$select public.edit_approval((select id from public.approvals where company_id = '22222222-0000-4000-8000-00000000000a' and action_type = 'publish_post' and run_id is not null limit 1), '{"text": "Hello from us"}')$$,
  'a founder edits Sol''s draft');
reset role;
select results_eq($$select original, final from public.voice_edit_events where company_id = pg_temp.id('company_a') and final = 'Hello from us'$$,
  $$values ('Hello', 'Hello from us')$$, 'the edit is kept for voice learning');

-- Hard rules --------------------------------------------------------------------------------------
select ok(private.always_escalate('refund_request', '{}'), 'refund requests always escalate');
select ok(private.always_escalate('general_enquiry', '{"vulnerable": true}'), 'signs of vulnerability always escalate');
select ok(private.always_escalate('booking', '{"data_request": true}'), 'data-protection requests always escalate');
select ok(not private.always_escalate('general_enquiry', '{}'), 'an ordinary enquiry follows the policy');

select * from finish();
rollback;
