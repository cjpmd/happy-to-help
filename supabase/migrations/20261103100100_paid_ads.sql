-- Paid ads management (Phase 19, flagged and off): launch a campaign's ad on Meta or Google with a
-- founder's GO, within the account's daily hard cap and a monthly cap that pauses everything when
-- reached; spend flows back into the ad's tracked link, so cost per lead shows in attribution.
-- The executor launches only when the platform switches ads on (ADS_ENABLED); the providers are
-- mocks until Meta and Google approve our access (docs/HANDOFF.md 12).

alter table public.ad_accounts
  add column monthly_cap numeric(10, 2) not null default 300 check (monthly_cap >= 0),
  add column paused_reason text;

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  platform text not null check (platform in ('meta', 'google')),
  name text not null check (length(trim(name)) between 1 and 120),
  creative text not null check (length(trim(creative)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'ended', 'declined')),
  daily_budget numeric(10, 2) not null check (daily_budget > 0),
  campaign_asset_id uuid references public.campaign_assets (id) on delete set null,
  link_id uuid references public.tracked_links (id) on delete set null,
  external_id text,
  approval_id uuid references public.approvals (id) on delete set null,
  spend numeric(12, 2) not null default 0 check (spend >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  paused_reason text,
  synced_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ad_campaigns_company_id_idx on public.ad_campaigns (company_id, created_at desc);
create index ad_campaigns_campaign_asset_id_idx on public.ad_campaigns (campaign_asset_id);
create index ad_campaigns_link_id_idx on public.ad_campaigns (link_id);
create index ad_campaigns_approval_id_idx on public.ad_campaigns (approval_id);
create index ad_campaigns_created_by_idx on public.ad_campaigns (created_by);

create table public.ad_spend_daily (
  ad_campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  day date not null,
  spend_gbp numeric(10, 2) not null default 0 check (spend_gbp >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  primary key (ad_campaign_id, day)
);
create index ad_spend_daily_company_idx on public.ad_spend_daily (company_id, day);

alter table public.ad_campaigns enable row level security;
alter table public.ad_spend_daily enable row level security;
revoke all on public.ad_campaigns, public.ad_spend_daily from anon, authenticated;
grant select on public.ad_campaigns, public.ad_spend_daily to authenticated;
create policy "Read ad campaigns for companies you can read" on public.ad_campaigns
  for select to authenticated using (private.can_read_company(company_id));
create policy "Read ad spend for companies you can read" on public.ad_spend_daily
  for select to authenticated using (private.can_read_company(company_id));

-- A founder proposes launching a campaign's ad. It waits for a GO; nothing is spent before.
create function public.propose_ad_launch(p_asset uuid, p_platform text, p_daily_budget numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  a public.campaign_assets;
  acct public.ad_accounts;
  v_campaign text;
  v_ad uuid;
  v_approval uuid;
begin
  select * into a from public.campaign_assets where id = p_asset;
  if not found or not private.is_company_founder(a.company_id) then
    raise exception 'Only a founder can launch an ad' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if a.kind <> 'ad' then
    raise exception 'Only ad copy can be launched as an ad' using errcode = 'P0001', hint = 'invalid';
  end if;
  if p_platform not in ('meta', 'google') then
    raise exception 'Choose Meta or Google' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.ad_accounts (company_id) values (a.company_id) on conflict (company_id) do nothing;
  select * into acct from public.ad_accounts where company_id = a.company_id;
  if p_daily_budget is null or p_daily_budget <= 0 or p_daily_budget > acct.hard_cap then
    raise exception 'The daily budget must be more than £0 and no more than your hard cap of £%', acct.hard_cap
      using errcode = 'P0001', hint = 'invalid';
  end if;
  if exists (select 1 from public.ad_campaigns where campaign_asset_id = p_asset and status in ('pending', 'active', 'paused')) then
    raise exception 'This ad is already launched or waiting for a GO' using errcode = 'P0001', hint = 'conflict';
  end if;
  select name into v_campaign from public.campaigns where id = a.campaign_id;
  insert into public.ad_campaigns (company_id, platform, name, creative, daily_budget, campaign_asset_id, link_id, created_by)
  values (a.company_id, p_platform, left(coalesce(v_campaign, a.title, 'Ad'), 120), a.body, round(p_daily_budget, 2), a.id, a.link_id, me)
  returning id into v_ad;
  insert into public.approvals (company_id, action_type, payload, estimated_credits, requested_by)
  values (a.company_id, 'launch_ad', jsonb_build_object(
    'ad_campaign_id', v_ad, 'platform', p_platform, 'name', left(coalesce(v_campaign, a.title, 'Ad'), 120),
    'daily_budget', round(p_daily_budget, 2), 'hard_cap', acct.hard_cap, 'monthly_cap', acct.monthly_cap,
    'creative', a.body, 'reason', 'Spends real money every day until you pause it. Capped as shown.'), 10, me)
  returning id into v_approval;
  update public.ad_campaigns set approval_id = v_approval where id = v_ad;
  return v_ad;
end;
$$;

-- Pausing only ever reduces spend, so a founder can do it at once; the agent service tells the
-- platform on its next sync.
create function public.pause_ad(p_ad uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  c public.ad_campaigns;
begin
  select * into c from public.ad_campaigns where id = p_ad;
  if not found or not private.is_company_founder(c.company_id) then
    raise exception 'Only a founder can pause an ad' using errcode = 'P0001', hint = 'forbidden';
  end if;
  update public.ad_campaigns set status = 'paused', paused_reason = 'Paused by a founder'
  where id = p_ad and status in ('active', 'pending');
  update public.approvals set status = 'declined', decided_by = me, decided_at = now(), decision_note = 'Paused before launch'
  where id = c.approval_id and status = 'pending';
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (c.company_id, 'grow', format('Ad paused: %s', c.name), me);
end;
$$;

create function public.update_ads_monthly_cap(p_company uuid, p_cap numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_signed_in();
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can change the monthly ad cap' using errcode = 'P0001', hint = 'forbidden';
  end if;
  insert into public.ad_accounts (company_id, monthly_cap) values (p_company, greatest(p_cap, 0))
  on conflict (company_id) do update set monthly_cap = greatest(p_cap, 0);
end;
$$;

revoke execute on function public.propose_ad_launch(uuid, text, numeric), public.pause_ad(uuid), public.update_ads_monthly_cap(uuid, numeric)
  from public, anon;
grant execute on function public.propose_ad_launch(uuid, text, numeric), public.pause_ad(uuid), public.update_ads_monthly_cap(uuid, numeric)
  to authenticated;

-- A NO-GO on a launch declines the ad.
create function private.on_ad_launch_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action_type = 'launch_ad' and new.status = 'declined' and old.status = 'pending' then
    update public.ad_campaigns set status = 'declined' where id = private.try_uuid(new.payload ->> 'ad_campaign_id') and status = 'pending';
  end if;
  return new;
end;
$$;
revoke execute on function private.on_ad_launch_decided() from public, anon, authenticated;
create trigger approvals_ad_launch_decided after update of status on public.approvals
  for each row execute function private.on_ad_launch_decided();

-- Service role: a day's spend from the platform. Updates the ad's totals and its tracked link's
-- spend (for cost per lead), and pauses every ad of the company once the month's spend reaches
-- its monthly cap. Returns true when it paused.
create function public.record_ad_spend(p_ad uuid, p_day date, p_spend numeric, p_clicks integer default 0, p_impressions integer default 0)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.ad_campaigns;
  v_month numeric;
  v_cap numeric;
  v_paused integer;
begin
  select * into c from public.ad_campaigns where id = p_ad;
  if not found then
    raise exception 'Ad not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  insert into public.ad_spend_daily (ad_campaign_id, company_id, day, spend_gbp, clicks, impressions)
  values (p_ad, c.company_id, p_day, greatest(p_spend, 0), greatest(p_clicks, 0), greatest(p_impressions, 0))
  on conflict (ad_campaign_id, day) do update set spend_gbp = excluded.spend_gbp, clicks = excluded.clicks, impressions = excluded.impressions;
  update public.ad_campaigns a set
    spend = s.spend, clicks = s.clicks, impressions = s.impressions, synced_at = now()
  from (select coalesce(sum(spend_gbp), 0) as spend, coalesce(sum(clicks), 0)::integer as clicks, coalesce(sum(impressions), 0)::integer as impressions
        from public.ad_spend_daily where ad_campaign_id = p_ad) s
  where a.id = p_ad;
  if c.link_id is not null then
    update public.tracked_links set spend_gbp = (select coalesce(sum(spend_gbp), 0) from public.ad_spend_daily d
      join public.ad_campaigns a on a.id = d.ad_campaign_id where a.link_id = c.link_id)
    where id = c.link_id;
  end if;
  select coalesce(sum(spend_gbp), 0) into v_month from public.ad_spend_daily
  where company_id = c.company_id and date_trunc('month', day) = date_trunc('month', p_day);
  select monthly_cap into v_cap from public.ad_accounts where company_id = c.company_id;
  if v_month >= coalesce(v_cap, 0) then
    update public.ad_campaigns set status = 'paused', paused_reason = 'Monthly ad cap reached'
    where company_id = c.company_id and status = 'active';
    get diagnostics v_paused = row_count;
    if v_paused > 0 then
      update public.ad_accounts set paused_reason = 'Monthly ad cap reached' where company_id = c.company_id;
      insert into public.chat_messages (company_id, sender, content)
      values (c.company_id, 'sol', format('This month''s ad spend reached your cap of £%s, so I''ve paused your ads. Raise the cap in Grow → Ads to start them again.', v_cap));
      return true;
    end if;
  end if;
  return false;
end;
$$;
revoke execute on function public.record_ad_spend(uuid, date, numeric, integer, integer) from public, anon, authenticated;
grant execute on function public.record_ad_spend(uuid, date, numeric, integer, integer) to service_role;

alter publication supabase_realtime add table public.ad_campaigns;
