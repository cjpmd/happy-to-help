-- Campaigns (Phase 15, SPEC part J): Sol proposes a plan (goal, audience, channels, budget,
-- dates) → the founder approves → Sol drafts the assets with a tracked link per channel →
-- claims and CAP Code checks → each asset is approved like any post or email → scheduled through
-- the providers → results from the link layer against the goal. Paid ads are drafted and
-- exported for the founder to launch themselves (direct ad control is Phase 19, off).

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  goal text not null check (length(trim(goal)) between 1 and 300),
  -- The success metric and its target, measured through the campaign's tracked links.
  metric text not null default 'leads' check (metric in ('clicks', 'leads', 'customers')),
  target integer not null check (target > 0),
  audience text not null default '',
  channels text[] not null default '{}' check (cardinality(channels) between 1 and 8),
  budget_credits integer not null default 0 check (budget_credits >= 0),
  -- Paid media the founder will spend themselves, if any.
  budget_gbp numeric(10, 2) check (budget_gbp is null or budget_gbp >= 0),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'drafting', 'ready', 'declined', 'cancelled')),
  -- Sol's reasoning and outline: { "rationale": "...", "posts": 4, "emails": 1, "ads": 1 }.
  plan jsonb not null default '{}' check (jsonb_typeof(plan) = 'object'),
  approval_id uuid references public.approvals (id) on delete set null,
  run_id uuid references public.agent_runs (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index campaigns_company_id_idx on public.campaigns (company_id, starts_on desc);
create index campaigns_approval_id_idx on public.campaigns (approval_id);
create index campaigns_run_id_idx on public.campaigns (run_id);
create index campaigns_created_by_idx on public.campaigns (created_by);

create table public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('social_post', 'email', 'ad')),
  channel text not null,
  title text not null default '',
  body text not null check (length(trim(body)) between 1 and 10000),
  scheduled_for timestamptz,
  status text not null default 'draft' check (status in ('draft', 'awaiting_approval', 'scheduled', 'published', 'sent', 'exported', 'declined')),
  approval_id uuid references public.approvals (id) on delete set null,
  link_id uuid references public.tracked_links (id) on delete set null,
  created_at timestamptz not null default now()
);
create index campaign_assets_campaign_id_idx on public.campaign_assets (campaign_id);
create index campaign_assets_company_id_idx on public.campaign_assets (company_id);
create index campaign_assets_approval_id_idx on public.campaign_assets (approval_id);
create index campaign_assets_link_id_idx on public.campaign_assets (link_id);

alter table public.tracked_links
  add constraint tracked_links_campaign_id_fkey foreign key (campaign_id) references public.campaigns (id) on delete set null;
create index tracked_links_campaign_id_idx on public.tracked_links (campaign_id);

insert into public.job_types (job_type, label, pillar, tier, estimate_credits, cap_credits) values
  ('campaign_plan', 'Plan a campaign', 'grow', 'strategy', 80, 250),
  ('campaign_assets', 'Draft campaign assets', 'grow', 'planning', 120, 400)
on conflict (job_type) do nothing;

alter table public.campaigns enable row level security;
revoke all on public.campaigns from anon, authenticated;
grant select on public.campaigns to authenticated;
create policy "Read campaigns for companies you can read" on public.campaigns
  for select to authenticated using (private.can_read_company(company_id));

alter table public.campaign_assets enable row level security;
revoke all on public.campaign_assets from anon, authenticated;
grant select on public.campaign_assets to authenticated;
create policy "Read campaign assets for companies you can read" on public.campaign_assets
  for select to authenticated using (private.can_read_company(company_id));

-- Decisions on campaign approvals: a NO-GO on the plan declines the campaign; on an asset, the
-- asset. (A GO on the plan is carried out by the executor, which queues the drafting.)
create function private.on_campaign_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'declined' and old.status = 'pending' then
    if new.action_type = 'approve_campaign' then
      update public.campaigns set status = 'declined' where id = private.try_uuid(new.payload ->> 'campaign_id');
    elsif new.payload ? 'campaign_asset_id' then
      update public.campaign_assets set status = 'declined' where id = private.try_uuid(new.payload ->> 'campaign_asset_id');
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.on_campaign_decided() from public, anon, authenticated;
create trigger approvals_campaign_decided after update of status on public.approvals
  for each row execute function private.on_campaign_decided();

-- Cancel a campaign: pending asset approvals are declined; nothing else is sent.
create function public.cancel_campaign(p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  c public.campaigns;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found or not private.is_company_founder(c.company_id) then
    raise exception 'Only a founder can cancel a campaign' using errcode = 'P0001', hint = 'forbidden';
  end if;
  update public.campaigns set status = 'cancelled' where id = p_campaign;
  update public.approvals set status = 'declined', decided_by = me, decided_at = now(), decision_note = 'Campaign cancelled'
  where company_id = c.company_id and status = 'pending'
    and (payload ->> 'campaign_id' = p_campaign::text
      or payload ->> 'campaign_asset_id' in (select id::text from public.campaign_assets where campaign_id = p_campaign));
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (c.company_id, 'grow', format('Campaign cancelled: %s', c.name), me);
end;
$$;
revoke execute on function public.cancel_campaign(uuid) from public, anon;
grant execute on function public.cancel_campaign(uuid) to authenticated;

-- Results: clicks, leads and customers through the campaign's links, against its target.
create view public.campaign_results with (security_invoker = true) as
select c.id as campaign_id, c.company_id, c.metric, c.target,
  coalesce((select count(*) from public.link_clicks k join public.tracked_links l on l.id = k.link_id where l.campaign_id = c.id), 0) as clicks,
  coalesce((select count(*) from public.leads ld join public.tracked_links l on l.id = ld.link_id where l.campaign_id = c.id), 0) as leads,
  coalesce((select count(*) from public.leads ld join public.tracked_links l on l.id = ld.link_id
    join public.contacts ct on ct.id = ld.contact_id where l.campaign_id = c.id and (ld.status = 'won' or ct.kind = 'customer')), 0) as customers
from public.campaigns c;
revoke all on public.campaign_results from anon, authenticated;
grant select on public.campaign_results to authenticated;

alter publication supabase_realtime add table public.campaigns, public.campaign_assets;
