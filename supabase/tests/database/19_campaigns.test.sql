-- Campaigns (Phase 15).
begin;
\ir _setup.psql
select * from no_plan();

select is((select count(*)::integer from public.job_types where job_type in ('campaign_plan', 'campaign_assets')), 2, 'the campaign job types exist');
select throws_ok(format($$insert into public.campaigns (company_id, name, goal, target, channels, starts_on, ends_on) values (%L, 'X', 'Y', 10, '{x}', '2026-11-10', '2026-11-01')$$,
  pg_temp.id('company_a')), '23514', null, 'a campaign ends after it starts');

-- A NO-GO on the plan declines the campaign.
insert into public.campaigns (id, company_id, name, goal, target, channels, starts_on, ends_on)
values ('c1000000-0000-4000-8000-000000000001', pg_temp.id('company_a'), 'Winter', 'More leads', 10, '{instagram}', '2026-12-01', '2026-12-14');
insert into public.approvals (company_id, action_type, payload, estimated_credits)
values (pg_temp.id('company_a'), 'approve_campaign', '{"campaign_id": "c1000000-0000-4000-8000-000000000001", "name": "Winter"}', 0);
select pg_temp.login('founder');
select lives_ok($$select public.decide_approval((select id from public.approvals where action_type = 'approve_campaign'), 'declined', 'Not now')$$,
  'a founder says NO-GO to the plan');
reset role;
select is((select status from public.campaigns where id = 'c1000000-0000-4000-8000-000000000001'), 'declined', 'and the campaign is declined');

-- Cancelling declines what's still waiting.
insert into public.campaigns (id, company_id, name, goal, target, channels, starts_on, ends_on, status)
values ('c1000000-0000-4000-8000-000000000002', pg_temp.id('company_a'), 'Spring', 'More leads', 10, '{instagram}', '2027-03-01', '2027-03-14', 'drafting');
insert into public.campaign_assets (id, campaign_id, company_id, kind, channel, body, status)
values ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', pg_temp.id('company_a'), 'social_post', 'instagram', 'Spring is here', 'awaiting_approval');
insert into public.approvals (company_id, action_type, payload, estimated_credits)
values (pg_temp.id('company_a'), 'publish_post', '{"channel": "Instagram", "text": "Spring is here", "campaign_asset_id": "c2000000-0000-4000-8000-000000000001"}', 5);
select pg_temp.login('teammate');
select throws_like($$select public.cancel_campaign('c1000000-0000-4000-8000-000000000002')$$, '%Only a founder%', 'only a founder cancels a campaign');
select pg_temp.login('founder');
select lives_ok($$select public.cancel_campaign('c1000000-0000-4000-8000-000000000002')$$, 'a founder cancels it');
reset role;
select is((select status from public.campaigns where id = 'c1000000-0000-4000-8000-000000000002'), 'cancelled', 'it''s cancelled');
select is((select status::text from public.approvals where payload ->> 'campaign_asset_id' = 'c2000000-0000-4000-8000-000000000001'), 'declined',
  'its waiting posts are declined');
select is((select status from public.campaign_assets where id = 'c2000000-0000-4000-8000-000000000001'), 'declined', 'and so are the assets');

-- Results through the campaign's links.
insert into public.tracked_links (id, company_id, code, destination, label, channel, campaign_id)
values ('c3000000-0000-4000-8000-000000000001', pg_temp.id('company_a'), 'CAMPAIGN', 'https://a.example/h/a-co', 'Spring: instagram', 'instagram', 'c1000000-0000-4000-8000-000000000002');
insert into public.link_clicks (link_id, company_id) values ('c3000000-0000-4000-8000-000000000001', pg_temp.id('company_a')), ('c3000000-0000-4000-8000-000000000001', pg_temp.id('company_a'));
insert into public.leads (company_id, contact_id, link_id, status)
select pg_temp.id('company_a'), id, 'c3000000-0000-4000-8000-000000000001', 'won' from public.contacts where company_id = pg_temp.id('company_a') limit 1;
select pg_temp.login('founder');
select results_eq($$select clicks, leads, customers from public.campaign_results where campaign_id = 'c1000000-0000-4000-8000-000000000002'$$,
  $$values (2::bigint, 1::bigint, 1::bigint)$$, 'founders see clicks, leads and customers per campaign');
select pg_temp.login('cohort_mentor');
select results_eq($$select clicks, leads from public.campaign_results where campaign_id = 'c1000000-0000-4000-8000-000000000002'$$,
  $$values (2::bigint, 0::bigint)$$, 'mentors see the clicks but not the leads');

select * from finish();
rollback;
