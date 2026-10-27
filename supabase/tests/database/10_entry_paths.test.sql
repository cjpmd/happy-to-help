-- Two entry paths, contact import and voice sources (Phase 10).
begin;
\ir _setup.psql
select * from no_plan();

select pg_temp.login('outsider');
select lives_ok($$select public.create_company('Old Mill Coffee', 'A coffee roaster', 'B2C', 'general', null, null, null,
  'https://oldmill.example', null, 'keep_going', '{"instagram": "@oldmill"}', 'https://business.google.com/oldmill')$$,
  'a trading business joins on the Keep going path');
reset role;
select results_eq($$select entry_path::text, stage::text, website_live_url, social_handles ->> 'instagram', google_business_url
  from public.companies where slug = 'old-mill-coffee'$$,
  $$values ('keep_going', 'grow', 'https://oldmill.example', '@oldmill', 'https://business.google.com/oldmill')$$,
  'it starts at Grow with its website, socials and Google Business profile');
select results_eq($$select g.status::text from public.stage_gates g join public.companies c on c.id = g.company_id
  where c.slug = 'old-mill-coffee' order by g.stage$$,
  array['imported', 'imported', 'imported', 'imported'], 'its gates before Grow are imported');
select pg_temp.login('outsider');
select lives_ok($$select public.create_company('Fresh Idea', '', 'B2B')$$, 'Start up stays the default');
reset role;
select is((select entry_path::text || ':' || stage::text from public.companies where slug = 'fresh-idea'), 'start_up:idea', 'a Start up company starts at Idea');
select pg_temp.login('outsider');
select throws_like($$select public.create_company('Bad', '', 'B2B', 'general', null, null, null, null, null, 'start_up', '[]')$$,
  '%must be an object%', 'social handles must be an object');

-- Contact import.
select pg_temp.login('teammate');
select is(public.import_contacts(pg_temp.id('company_a'), $$[
  {"name": "Sarah", "email": "Sarah@Example.com", "kind": "customer", "value": "Weekly"},
  {"email": "sarah@example.com"},
  {"name": "No email"},
  {"email": "tom@example.com"},
  {"email": "contact@example.com"}
]$$), 2, 'imports new, valid emails once (one duplicate in the file, one already a contact, one with no email)');
reset role;
select results_eq($$select email, kind::text, source from public.contacts where company_id = pg_temp.id('company_a') and source = 'import' order by email$$,
  $$values ('sarah@example.com', 'customer', 'import'), ('tom@example.com', 'lead', 'import')$$, 'imported contacts are lowercased and marked as imported');
select pg_temp.login('viewer');
select throws_like(format($$select public.import_contacts(%L, '[]')$$, pg_temp.id('company_a')), '%founders and teammates%', 'viewers cannot import');
select pg_temp.login('cohort_mentor');
select throws_like(format($$select public.import_contacts(%L, '[]')$$, pg_temp.id('company_a')), '%founders and teammates%', 'mentors cannot import');

-- Voice sources: founders and teammates add them; nobody else sees them.
select pg_temp.login('founder');
select lives_ok(format($$insert into public.voice_sources (company_id, kind, content) values (%L, 'website', 'We bake every morning.')$$, pg_temp.id('company_a')),
  'a founder adds website copy for the voice analysis');
select pg_temp.login('viewer');
select throws_ok(format($$insert into public.voice_sources (company_id, kind, content) values (%L, 'email', 'x')$$, pg_temp.id('company_a')),
  '42501', null, 'a viewer cannot add voice sources');
select is_empty($$select 1 from public.voice_sources$$, 'and cannot read them');

select * from finish();
rollback;
