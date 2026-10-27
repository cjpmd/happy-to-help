-- Paid ads management (Phase 19, flagged and off).
begin;
\ir _setup.psql
select * from no_plan();

-- An exported ad from a campaign, and a post that isn't an ad.
insert into public.campaign_assets (campaign_id, company_id, kind, channel, body, status)
select id, company_id, 'ad', 'meta', 'Fresh bread, every morning.', 'exported' from public.campaigns where company_id = pg_temp.id('company_a');
create temp table assets as
  select id, kind from public.campaign_assets where company_id = pg_temp.id('company_a');
grant select on assets to authenticated;

select pg_temp.login('teammate');
select throws_like($$select public.propose_ad_launch((select id from assets where kind = 'ad'), 'meta', 10)$$, '%Only a founder%',
  'only a founder launches an ad');
select pg_temp.login('founder');
select throws_like($$select public.propose_ad_launch((select id from assets where kind = 'social_post'), 'meta', 10)$$, '%Only ad copy%',
  'only ad copy');
select throws_like($$select public.propose_ad_launch((select id from assets where kind = 'ad'), 'meta', 500)$$, '%hard cap of £50%',
  'within the daily hard cap');
select throws_like($$select public.propose_ad_launch((select id from assets where kind = 'ad'), 'tiktok', 10)$$, '%Meta or Google%',
  'Meta or Google');
select lives_ok($$select public.propose_ad_launch((select id from assets where kind = 'ad'), 'meta', 10)$$, 'a founder proposes a launch');
select throws_like($$select public.propose_ad_launch((select id from assets where kind = 'ad'), 'google', 10)$$, '%already launched or waiting%',
  'once at a time');
reset role;
create temp table ad as select id, approval_id from public.ad_campaigns where campaign_asset_id = (select id from assets where kind = 'ad');
grant select on ad to authenticated;
select results_eq($$select c.status, a.action_type::text, a.status::text, (a.payload ->> 'daily_budget')::numeric, (a.payload ->> 'monthly_cap')::numeric
  from public.ad_campaigns c join public.approvals a on a.id = c.approval_id where c.id = (select id from ad)$$,
  $$values ('pending'::text, 'launch_ad'::text, 'pending'::text, 10::numeric, 300::numeric)$$, 'it waits for a GO, with its caps shown');

-- A NO-GO declines it; pausing before launch withdraws the approval.
update public.approvals set status = 'declined', decided_at = now() where id = (select approval_id from ad);
select is((select status from public.ad_campaigns where id = (select id from ad)), 'declined', 'a NO-GO declines the ad');
select pg_temp.login('founder');
select lives_ok($$select public.propose_ad_launch((select id from assets where kind = 'ad'), 'google', 20)$$, 'proposed again');
reset role;
create temp table ad2 as select id, approval_id from public.ad_campaigns where campaign_asset_id = (select id from assets where kind = 'ad') and status = 'pending';
grant select on ad2 to authenticated, service_role;
select pg_temp.login('founder');
select lives_ok($$select public.pause_ad((select id from ad2))$$, 'a founder pauses it');
reset role;
select results_eq($$select c.status, a.status::text from public.ad_campaigns c join public.approvals a on a.id = c.approval_id where c.id = (select id from ad2)$$,
  $$values ('paused'::text, 'declined'::text)$$, 'and the launch is withdrawn');

-- Spend comes in through the service role only; the monthly cap pauses everything.
select pg_temp.login('founder');
select throws_ok($$select public.record_ad_spend((select id from ad2), current_date, 1)$$, '42501', null, 'nobody in the app records spend');
select throws_like(format($$select public.update_ads_monthly_cap(%L, 100)$$, pg_temp.id('company_b')), '%Only a founder%', 'another company''s cap');
reset role;
update public.ad_campaigns set status = 'active' where id = (select id from ad2);
select pg_temp.login_service();
select ok(not public.record_ad_spend((select id from ad2), date_trunc('month', current_date)::date, 120, 40, 1000), 'spend under the cap');
reset role;
select results_eq($$select spend, clicks from public.ad_campaigns where id = (select id from ad2)$$, $$values (120::numeric, 40)$$, 'totals updated');
select pg_temp.login_service();
select ok(public.record_ad_spend((select id from ad2), (date_trunc('month', current_date) + interval '1 day')::date, 200), 'and then over it');
reset role;
select results_eq($$select status, paused_reason from public.ad_campaigns where id = (select id from ad2)$$,
  $$values ('paused'::text, 'Monthly ad cap reached'::text)$$, 'every ad is paused at the monthly cap');
select ok(exists (select 1 from public.chat_messages where company_id = pg_temp.id('company_a') and content like 'This month''s ad spend reached your cap of £300%'),
  'and the founder is told');

select * from finish();
rollback;
