-- Capture from conversation (Phase 12).
begin;
\ir _setup.psql
select * from no_plan();

-- Starting a capture ----------------------------------------------------------------------------
select pg_temp.login('founder');
select throws_like(format($$select public.create_capture(%L, 'transcript', 'own_voice', 'Sales call', 'Hi.')$$, pg_temp.id('company_a')),
  '%Confirm everyone knew%', 'a meeting transcript needs everyone to have known it was recorded');
select throws_like(format($$select public.create_capture(%L, 'debrief', 'own_voice', '', '  ')$$, pg_temp.id('company_a')),
  '%either the text or a recording%', 'a capture needs text or audio');
select throws_like(format($$select public.create_capture(%L, 'recording', 'participants_informed', 'Call', null, %L, 60)$$,
  pg_temp.id('company_a'), pg_temp.id('company_b') || '/x.webm'), '%your company''s folder%', 'audio must be in the company''s own folder');
select lives_ok(format($$select public.create_capture(%L, 'debrief', 'own_voice', 'After the pitch',
  'We agreed to raise in spring. I''ll send Jo the deck by Friday. Maybe a podcast one day.')$$, pg_temp.id('company_a')),
  'a founder records a debrief');
reset role;
select results_eq($$select c.status, t.provider, j.job_type, j.estimated_credits
  from public.captures c join public.transcripts t on t.capture_id = c.id join public.agent_jobs j on j.id = c.job_id
  where c.title = 'After the pitch'$$,
  $$values ('extracting'::text, 'typed'::text, 'capture_process'::text, 40)$$, 'it''s queued for Sol to read, with its estimate');

select pg_temp.login('founder');
select lives_ok(format($$select public.create_capture(%L, 'recording', 'participants_informed', 'Supplier call', null, %L, 125)$$,
  pg_temp.id('company_a'), pg_temp.id('company_a') || '/call.webm'), 'a founder uploads a recording');
reset role;
-- 3 started minutes at 0.01 USD (3 credits each at the default conversion) plus extraction.
select is((select j.estimated_credits from public.captures c join public.agent_jobs j on j.id = c.job_id where c.title = 'Supplier call'),
  40 + 3 * public.credits_for_usd(0.01), 'recordings add transcription by the minute');
select pg_temp.login('viewer');
select throws_like(format($$select public.create_capture(%L, 'debrief', 'own_voice', '', 'Hi')$$, pg_temp.id('company_a')),
  '%Only founders and teammates%', 'viewers cannot add captures');
select pg_temp.login('cohort_mentor');
select is_empty('select 1 from public.captures', 'mentors never see captures');
select is_empty('select 1 from public.transcripts', 'or transcripts');

-- Extraction ------------------------------------------------------------------------------------
select pg_temp.login_service();
select is(public.save_extraction((select id from public.captures where title = 'After the pitch'), null, $j$[
  {"kind": "decision", "text": "Raise in spring", "confidence": 0.9},
  {"kind": "commitment", "text": "Send Jo the deck", "contact_name": "Jo", "owner": "founder", "due_date": "2026-10-30", "confidence": 0.85},
  {"kind": "idea", "text": "A podcast", "confidence": 0.7},
  {"kind": "action", "text": "Sort the van insurance", "owner": "unknown", "confidence": 0.55},
  {"kind": "action", "text": "Draft the investor update", "owner": "sol", "department": "raise", "confidence": 0.8},
  {"kind": "memory_fact", "text": "Our prices start at £4", "confidence": 0.7},
  {"kind": "action", "text": "Book the GP appointment", "owner": "founder", "due_date": "2026-10-28", "sensitive": true, "confidence": 0.9}
]$j$), 7, 'the agent saves what it found');
reset role;
select is((select status from public.captures where title = 'After the pitch'), 'review', 'the capture waits for review');
select is((select count(*)::integer from public.tasks where source_item_id is not null), 0, 'nothing is created before the founder accepts');

-- Review ----------------------------------------------------------------------------------------
create temp table it as select kind, text, id from public.extracted_items
  where capture_id = (select id from public.captures where title = 'After the pitch');
grant select on it to authenticated;
select pg_temp.login('founder');
select throws_like($$select public.decide_extracted_item((select id from it where text = 'Sort the van insurance'), 'accept')$$,
  'Say who is doing this first', 'an action with no owner can''t be accepted as it is');
select throws_like($$select public.decide_extracted_item((select id from it where text = 'Book the GP appointment'), 'accept')$$,
  '%won''t file it unless you choose to%', 'personal items aren''t filed by accident');
select is(public.accept_all_items((select id from public.captures where title = 'After the pitch')), 5,
  '"Accept all" takes the complete, confident, non-sensitive items');
reset role;
select is((select status from public.extracted_items where id = (select id from it where text = 'Sort the van insurance')), 'pending', 'and leaves the incomplete one');
select is((select status from public.extracted_items where id = (select id from it where text = 'Book the GP appointment')), 'pending', 'and the sensitive one');
select results_eq($$select actor::text, pillar::text, estimated_credits > 0 from public.tasks where title = 'Draft the investor update'$$,
  $$values ('sol', 'raise', true)$$, 'a Sol action becomes a Sol task');
select is((select count(*)::integer from public.agent_jobs j join public.tasks t on t.id = j.task_id where t.title = 'Draft the investor update'), 1,
  'and is queued with its cost');
select results_eq($$select to_name, due_date from public.commitments where what = 'Send Jo the deck'$$,
  $$values ('Jo'::text, '2026-10-30'::date)$$, 'a promise is tracked with its date');
select is((select count(*)::integer from public.agent_jobs where job_type = 'commitment_followup' and company_id = pg_temp.id('company_a')), 1, 'and Sol drafts the follow-up');
select results_eq($$select i.status, e.type::text, e.status::text from public.ideas i join public.evidence_items e on e.id = i.evidence_item_id where i.title = 'A podcast'$$,
  $$values ('hypothesis'::text, 'assumption'::text, 'untested'::text)$$, 'a Start up idea becomes a hypothesis to test, not a build task');
select is((select payload ->> 'fact' from public.approvals where action_type = 'update_memory' and company_id = pg_temp.id('company_a')), 'Our prices start at £4',
  'a fact to remember becomes an approval, never a silent change');
select ok(exists (select 1 from public.activity_events where company_id = pg_temp.id('company_a') and type = 'capture' and summary like '%decision accepted%'), 'every routing step is in the activity log');

select pg_temp.login('founder');
select lives_ok($$select public.decide_extracted_item((select id from it where text = 'Sort the van insurance'), 'accept',
  jsonb_build_object('owner', 'teammate', 'owner_id', pg_temp.id('teammate'), 'owner_name', 'Teammate', 'due_date', '2026-11-02', 'department', 'legal'))$$,
  'the founder fills in the owner and date');
select throws_like($$select public.decide_extracted_item((select id from it where text = 'Book the GP appointment'), 'accept', '{"owner_id": "00000000-0000-0000-0000-000000000000"}')$$,
  '%founder or teammate of this company%', 'owners must be in the team');
select lives_ok($$select public.decide_extracted_item((select id from it where text = 'Book the GP appointment'), 'dismiss')$$, 'and dismisses the personal one');
reset role;
select results_eq($$select actor::text, assignee_id, due from public.tasks where title = 'Sort the van insurance'$$,
  format($$values ('teammate'::text, %L::uuid, '2026-11-02'::date)$$, pg_temp.id('teammate')), 'it''s assigned to the teammate');
select is((select status from public.captures where title = 'After the pitch'), 'done', 'the capture is done once nothing is waiting');

-- Mentors see only what's shared ----------------------------------------------------------------
select pg_temp.login('cohort_mentor');
select is_empty('select 1 from public.extracted_items', 'mentors see no items by default');
select pg_temp.login('teammate');
select throws_like($$select public.share_extracted_item((select id from it where kind = 'decision'), true)$$, '%Only a founder%', 'only founders share');
select pg_temp.login('founder');
select throws_like($$select public.share_extracted_item((select id from it where kind = 'idea'), true)$$, '%actions and decisions%', 'ideas aren''t shared');
select lives_ok($$select public.share_extracted_item((select id from it where kind = 'decision'), true)$$, 'a founder shares a decision');
select pg_temp.login('cohort_mentor');
select results_eq('select text from public.extracted_items', array['Raise in spring'], 'the mentor sees just that decision');
select pg_temp.login('other_mentor');
select is_empty('select 1 from public.extracted_items', 'other cohorts'' mentors see nothing');

-- Auto-accept for the founder's own voice notes -------------------------------------------------
select pg_temp.login('founder');
select lives_ok(format($$select public.update_capture_settings(%L, 7, true)$$, pg_temp.id('company_a')), 'a founder turns on auto-accept and keeps audio for a week');
select lives_ok(format($$select public.create_capture(%L, 'voice_note', 'own_voice', 'Quick note', 'We decided to close on Mondays.')$$, pg_temp.id('company_a')),
  'and records a voice note');
select pg_temp.login('teammate');
select throws_like(format($$select public.update_capture_settings(%L, 0, false)$$, pg_temp.id('company_a')), '%Only a founder%', 'teammates can''t change capture settings');
select pg_temp.login_service();
select is(public.save_extraction((select id from public.captures where title = 'Quick note'), null,
  '[{"kind": "decision", "text": "Close on Mondays", "confidence": 0.9}, {"kind": "idea", "text": "Open Sundays?", "confidence": 0.4}]'), 2, 'Sol reads it');
reset role;
select results_eq($$select text, status from public.extracted_items where capture_id = (select id from public.captures where title = 'Quick note') order by text$$,
  $$values ('Close on Mondays'::text, 'accepted'::text), ('Open Sundays?', 'pending')$$, 'confident items are accepted; unsure ones still wait');

-- Audio is kept only as long as the setting says ------------------------------------------------
select pg_temp.login_service();
select lives_ok($$select public.save_transcript((select id from public.captures where title = 'Supplier call'), 'S1: Hello.', '[]', 'mock')$$, 'the recording is transcribed');
reset role;
select ok((select audio_delete_after between now() + interval '6 days' and now() + interval '8 days' from public.captures where title = 'Supplier call'),
  'its audio is scheduled for deletion after the keep period');
select pg_temp.login('founder');
select throws_ok($$select public.save_extraction((select id from public.captures limit 1), null, '[]')$$, '42501', null, 'only the service role saves extractions');

select * from finish();
rollback;
