-- More skills and hardening (Phase 9): job types for the new skills, error monitoring, the
-- Anthropic cost reconciliation, and rate limits enforced in the database so every way in
-- (RPC, Edge Function, direct insert) is covered.

insert into public.job_types (job_type, label, pillar, tier, estimate_credits, cap_credits) values
  ('compliance_review', 'Check the compliance calendar', 'legal', 'routine', 20, 60),
  ('evidence_plan', 'Plan the evidence for an idea', 'grow', 'planning', 40, 120)
on conflict (job_type) do nothing;

-- Deadlines Sol added (compliance-calendar skill) are marked as such.
alter table public.compliance_items add column source text not null default 'manual' check (source in ('manual', 'sol', 'seed'));

-- Error monitoring ----------------------------------------------------------------------------

create table public.error_events (
  id bigint generated always as identity primary key,
  source text not null check (source in ('worker', 'executor', 'scheduler', 'edge', 'app')),
  level text not null default 'error' check (level in ('error', 'warning')),
  message text not null check (length(message) <= 2000),
  context jsonb not null default '{}' check (jsonb_typeof(context) = 'object'),
  company_id uuid references public.companies (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index error_events_created_at_idx on public.error_events (created_at desc);
create index error_events_company_id_idx on public.error_events (company_id);
create index error_events_user_id_idx on public.error_events (user_id);

alter table public.error_events enable row level security;
revoke all on public.error_events from anon, authenticated;
grant select on public.error_events to authenticated;
create policy "Platform admins read errors" on public.error_events
  for select to authenticated using (private.is_admin());

-- Cost reconciliation -------------------------------------------------------------------------

-- Daily usage and cost from Anthropic's Admin API, imported by the agent service.
create table public.anthropic_usage (
  day date not null,
  model text not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(12, 4) not null default 0,
  imported_at timestamptz not null default now(),
  primary key (day, model)
);
alter table public.anthropic_usage enable row level security;
revoke all on public.anthropic_usage from anon, authenticated;
grant select on public.anthropic_usage to authenticated;
create policy "Platform admins read Anthropic usage" on public.anthropic_usage
  for select to authenticated using (private.is_admin());

-- What our runs estimated (from token usage and model_prices) against what Anthropic charged,
-- per day and model. Mock runs are left out: they cost nothing.
create function public.cost_reconciliation(p_from date, p_to date)
returns table (day date, model text, runs bigint, estimated_usd numeric, actual_usd numeric, difference_usd numeric, difference_pct numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with est as (
    select (r.started_at at time zone 'UTC')::date as day, r.model, count(*) as runs, sum(r.cost_usd) as usd
    from public.agent_runs r
    where r.started_at >= p_from and r.started_at < p_to + 1 and r.model not like '%(mock)%'
    group by 1, 2
  ), act as (
    select u.day, u.model, sum(u.cost_usd) as usd from public.anthropic_usage u
    where u.day between p_from and p_to group by 1, 2
  )
  select coalesce(e.day, a.day), coalesce(e.model, a.model), coalesce(e.runs, 0),
    round(coalesce(e.usd, 0), 4), round(coalesce(a.usd, 0), 4),
    round(coalesce(a.usd, 0) - coalesce(e.usd, 0), 4),
    case when coalesce(a.usd, 0) > 0 then round((coalesce(a.usd, 0) - coalesce(e.usd, 0)) / a.usd * 100, 1) end
  from est e full join act a on a.day = e.day and a.model = e.model
  where private.is_admin() or auth.role() = 'service_role'
  order by 1, 2
$$;
revoke execute on function public.cost_reconciliation(date, date) from public, anon;
grant execute on function public.cost_reconciliation(date, date) to authenticated, service_role;

-- Rate limits ---------------------------------------------------------------------------------

-- Fixed windows per key ("jobs:<user>"). Old windows are cleared by the scheduler.
create table public.rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

-- Counts one hit against a key and refuses once the window's limit is passed.
create function private.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limit_hits (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = rate_limit_hits.hits + 1
  returning hits into n;
  if n > p_max then
    raise exception 'That''s a lot at once. Please wait a moment and try again.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
end;
$$;

-- A trigger that rate-limits inserts per person: TG_ARGV = [name, max, window seconds, column].
-- Inserts by the service role (the agent, the executor, webhooks) aren't limited.
create function private.limit_inserts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid;
begin
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;
  who := auth.uid();
  perform private.hit_rate_limit(tg_argv[0] || ':' || who::text, tg_argv[1]::integer, tg_argv[2]::integer);
  return new;
end;
$$;
revoke execute on function private.hit_rate_limit(text, integer, integer), private.limit_inserts() from public, anon, authenticated;

-- Agent work (each job spends credits), chat turns, recordings, links and imports.
create trigger agent_jobs_rate_limit before insert on public.agent_jobs
  for each row execute function private.limit_inserts('jobs', '120', '3600');
create trigger chat_messages_rate_limit before insert on public.chat_messages
  for each row when (new.sender = 'founder') execute function private.limit_inserts('chat', '30', '60');
create trigger captures_rate_limit before insert on public.captures
  for each row execute function private.limit_inserts('captures', '30', '3600');
create trigger tracked_links_rate_limit before insert on public.tracked_links
  for each row execute function private.limit_inserts('links', '100', '3600');
create trigger voice_examples_rate_limit before insert on public.voice_examples
  for each row execute function private.limit_inserts('examples', '60', '3600');

-- The app reports its own errors (signed in only, rate-limited).
create function public.report_client_error(p_message text, p_context jsonb default '{}', p_company uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
begin
  perform private.hit_rate_limit('errors:' || me::text, 20, 3600);
  insert into public.error_events (source, message, context, company_id, user_id)
  values ('app', left(coalesce(p_message, ''), 2000),
    case when jsonb_typeof(p_context) = 'object' then p_context else '{}'::jsonb end,
    case when p_company is not null and private.can_read_company(p_company) then p_company end, me);
end;
$$;
revoke execute on function public.report_client_error(text, jsonb, uuid) from public, anon;
grant execute on function public.report_client_error(text, jsonb, uuid) to authenticated;
