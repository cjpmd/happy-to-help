-- Link layer and lead capture (Phase 13).
begin;
\ir _setup.psql
select * from no_plan();

select is((select count(*)::integer from public.hub_pages where company_id = pg_temp.id('company_a') and not enabled), 1,
  'every company gets a hub page, unpublished');
select is((select count(*)::integer from public.forms where company_id = pg_temp.id('company_a')), 1, 'and a contact form');

create temp table form_a as select id from public.forms where company_id = pg_temp.id('company_a');
grant select on form_a to anon, authenticated;

-- Links -------------------------------------------------------------------------------------------
select pg_temp.login('teammate');
select throws_like(format($$select public.create_tracked_link(%L, 'example.com', 'Bio', 'Instagram')$$, pg_temp.id('company_a')),
  '%full web address%', 'destinations must be full addresses');
create temp table made as select * from public.create_tracked_link(pg_temp.id('company_a'), 'https://a.example/h/a-co', 'Flyer', 'Print', 'Spring fair', 'qr', null, 30);
reset role;
grant select on made to anon, authenticated;
select ok((select code ~ '^[A-Za-z0-9]{8}$' from made), 'a link gets an 8-character code');
select results_eq('select channel, medium, campaign from made', $$values ('print'::text, 'qr'::text, 'Spring fair'::text)$$, 'with its UTM tags');
select pg_temp.login('viewer');
select throws_like(format($$select public.create_tracked_link(%L, 'https://x.example', 'X', 'x')$$, pg_temp.id('company_a')),
  '%Only founders and teammates%', 'viewers cannot create links');

-- Following a link (anonymous) --------------------------------------------------------------------
set local role anon;
select is(public.follow_link((select code from made), 'https://www.facebook.com/some/page?x=1', 'mobile', 'gb'),
  'https://a.example/h/a-co?utm_source=print&utm_medium=qr&utm_campaign=Spring+fair&l=' || (select code from made),
  'anyone can follow a link to its tagged destination');
select is(public.follow_link('nothere1'), null, 'an unknown code goes nowhere');
select throws_ok('select * from public.link_clicks', '42501', null, 'anonymous visitors cannot read clicks');
reset role;
select results_eq($$select country, device, referrer_host from public.link_clicks where link_id = (select id from made)$$,
  $$values ('GB'::text, 'mobile'::text, 'www.facebook.com'::text)$$, 'the click keeps only country, device class and referring site');
update public.tracked_links set archived = true where id = (select id from made);
set local role anon;
select is(public.follow_link((select code from made)), null, 'archived links stop working');
reset role;
update public.tracked_links set archived = false where id = (select id from made);

-- Hub page ----------------------------------------------------------------------------------------
set local role anon;
select is(public.get_hub('a-co'), null, 'an unpublished hub page is not public');
reset role;
select pg_temp.login('teammate');
select throws_like(format($$select public.save_hub_page(%L, '{"enabled": true}')$$, pg_temp.id('company_a')), '%Only a founder%',
  'only a founder publishes the hub page');
select pg_temp.login('founder');
select throws_like(format($$select public.save_hub_page(%L, '{"links": [{"label": "Shop", "url": "shop"}]}')$$, pg_temp.id('company_a')),
  '%full web address%', 'hub links must be full addresses');
select throws_like(format($$select public.save_hub_page(%L, '{"slug": "b-co"}')$$, pg_temp.id('company_a')), 'That address is taken', 'hub addresses are unique');
select lives_ok(format($$select public.save_hub_page(%L, '{"enabled": true, "bio": "We help.", "links": [{"label": "Shop", "url": "https://a.example/shop"}]}')$$,
  pg_temp.id('company_a')), 'a founder publishes it');
set local role anon;
select is(public.get_hub('a-co') ->> 'bio', 'We help.', 'a published hub page is public');
select ok(public.get_hub('a-co') -> 'form' ->> 'marketing_wording' like 'Send me occasional news%', 'with its form and opt-in wording');

-- Submitting the form -----------------------------------------------------------------------------
select throws_like(format($$select public.submit_lead(%L, 'Jo', 'not-an-email')$$, (select id from form_a)),
  'Enter a valid email address', 'emails are checked');
select ok(public.submit_lead((select id from form_a), 'Jo Bloggs', 'Jo@Example.com',
  E'Do you cater?\nFor 30 people', false, null, (select code from made), '/h/a-co'), 'a visitor submits the form without ticking marketing');
select ok(public.submit_lead((select id from form_a), 'Bot', 'bot@example.com', 'Buy now', true, null, null, null, 'http://spam'),
  'a bot that fills the hidden field is quietly ignored');
reset role;
select results_eq($$select name, kind::text, source from public.contacts where email = 'jo@example.com'$$,
  $$values ('Jo Bloggs'::text, 'lead'::text, 'form'::text)$$, 'the submission creates a contact');
select is((select count(*)::integer from public.contacts where email = 'bot@example.com'), 0, 'and the bot creates nothing');
select results_eq($$select purpose, status, lawful_basis from public.current_consents where contact_id = (select id from public.contacts where email = 'jo@example.com') order by purpose$$,
  $$values ('marketing'::text, 'not_given'::text, null::text), ('service', 'granted', 'legitimate_interests')$$,
  'marketing stays off unless ticked; replying is legitimate interests');
select ok((select wording like 'Send me occasional news%' from public.consents where purpose = 'marketing' and contact_id = (select id from public.contacts where email = 'jo@example.com')),
  'the exact wording shown is stored');
select results_eq($$select channel, campaign, link_id = (select id from made) from public.leads where contact_id = (select id from public.contacts where email = 'jo@example.com')$$,
  $$values ('print'::text, 'Spring fair'::text, true)$$, 'the lead is attributed to the link it came through');
select is((select subject from public.email_threads where address = 'jo@example.com'), 'Do you cater?', 'the message lands in the inbox');

set local role anon;
select ok(public.submit_lead((select id from form_a), 'Jo Bloggs', 'jo@example.com', 'Again', true),
  'Jo comes back and opts in');
select ok(public.submit_lead((select id from form_a), 'Jo Bloggs', 'jo@example.com', 'Again'), 'and again');
select throws_like(format($$select public.submit_lead(%L, 'Jo Bloggs', 'jo@example.com', 'Again')$$, (select id from form_a)),
  '%got your message already%', 'the same person is limited to three an hour');
reset role;
select is((select count(*)::integer from public.contacts where lower(email) = 'jo@example.com'), 1, 'repeat submissions reuse the contact');
select results_eq($$select status, lawful_basis from public.current_consents where purpose = 'marketing' and contact_id = (select id from public.contacts where email = 'jo@example.com')$$,
  $$values ('granted'::text, 'consent'::text)$$, 'an opt-in stands: leaving the box unticked later isn''t a withdrawal');
select throws_ok($$update public.consents set status = 'granted'$$, '42501', null, 'consent history is never rewritten');

-- Consent recorded by the team --------------------------------------------------------------------
select pg_temp.login('teammate');
select throws_like($$select public.record_consent((select id from public.contacts where email = 'contact@example.com' and company_id = pg_temp.id('company_a')), 'marketing', 'granted', 'consent')$$,
  '%has to come from the person%', 'the team can''t opt someone in');
select lives_ok($$select public.record_consent((select id from public.contacts where email = 'jo@example.com'), 'marketing', 'withdrawn')$$,
  'but can record that they opted out');

-- Leads and attribution ---------------------------------------------------------------------------
select lives_ok($$select public.set_lead_status((select id from public.leads where link_id = (select id from made) order by created_at limit 1), 'won')$$, 'a teammate marks the lead won');
reset role;
select is((select kind::text from public.contacts where email = 'jo@example.com'), 'customer', 'the contact becomes a customer');
select pg_temp.login('founder');
select results_eq($$select clicks, leads, customers, spend_gbp, cost_per_lead_gbp from public.attribution(pg_temp.id('company_a')) where campaign = 'Spring fair'$$,
  $$values (1::bigint, 1::bigint, 1::bigint, 30.00::numeric, 30.00::numeric)$$, 'attribution counts clicks, leads, customers and cost per lead');
select is((select cost_per_lead_credits from public.attribution(pg_temp.id('company_a')) where campaign = 'Spring fair'), 3000, 'and cost per lead in credits');
select is((select leads from public.attribution(pg_temp.id('company_a')) where channel = 'direct'), 3::bigint, 'visits without a link count as direct');
select pg_temp.login('cohort_mentor');
select is((select clicks from public.link_stats where link_id = (select id from made)), 1::bigint, 'mentors see link clicks');
select is((select leads from public.link_stats where link_id = (select id from made)), 0::bigint, 'but not the leads (personal data)');
select pg_temp.login('founder_b');
select is_empty(format($$select * from public.attribution(%L)$$, pg_temp.id('company_a')), 'other companies see no attribution');

-- Deleting a contact (an erasure request) takes their consents and leads with it.
reset role;
delete from public.contacts where email = 'jo@example.com';
select is((select count(*)::integer from public.consents c where not exists (select 1 from public.contacts ct where ct.id = c.contact_id)), 0,
  'erasing a contact removes their consent history and leads');

select * from finish();
rollback;
