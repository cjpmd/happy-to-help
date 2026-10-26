-- Scheduler, routines and Auto Mode (Phase 8). The agent worker runs the clock: each minute it
-- works out what's due in UK time (agent-service/src/scheduler.ts) and claims it here, once per
-- company and period, before queueing the job. Anything that spends credits on its own is off
-- until a founder or teammate turns it on, and has a credit cap.

-- New job types: a routine, the morning brief, the nightly loop and the investor update.
insert into public.job_types (job_type, label, pillar, tier, estimate_credits, cap_credits) values
  ('routine', 'Routine', 'run', 'routine', 30, 120),
  ('morning_brief', 'Morning brief', 'run', 'routine', 25, 60),
  ('nightly', 'Nightly work', 'run', 'planning', 150, 600),
  ('investor_update', 'Investor update', 'raise', 'planning', 60, 200)
on conflict (job_type) do nothing;

-- Routines say which job they run, and when (UK time).
alter table public.routines
  add column job_type text not null default 'routine' references public.job_types (job_type),
  add column run_at time not null default '07:00',
  add column last_run_at timestamptz;
create index routines_job_type_idx on public.routines (job_type);
update public.routines set job_type = case
  when title = 'Morning brief' then 'morning_brief'
  when title in ('Post to LinkedIn', 'Draft Instagram post') then 'social_post'
  when title = 'Weekly investor update' then 'investor_update'
  else 'routine' end;
grant insert (job_type, run_at) on public.routines to authenticated;
grant update (job_type, run_at) on public.routines to authenticated;

-- The nightly loop and weekly voice review, per company. Both off by default.
create table public.company_automation (
  company_id uuid primary key references public.companies (id) on delete cascade,
  nightly_enabled boolean not null default false,
  nightly_cap_credits integer not null default 300 check (nightly_cap_credits between 0 and 5000),
  voice_review_enabled boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index company_automation_updated_by_idx on public.company_automation (updated_by);

-- One row per scheduled thing that fired: what, for whom, for which period ("2026-10-27",
-- "2026-W44"). The unique index is what stops two workers firing the same thing twice.
create table public.schedule_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  company_id uuid references public.companies (id) on delete cascade,
  ref_id uuid,
  period_key text not null,
  job_id uuid references public.agent_jobs (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index schedule_runs_once on public.schedule_runs
  (kind, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(ref_id, '00000000-0000-0000-0000-000000000000'::uuid), period_key);
create index schedule_runs_company_id_idx on public.schedule_runs (company_id);
create index schedule_runs_job_id_idx on public.schedule_runs (job_id);

-- The morning brief, one per company per day.
create table public.briefs (
  company_id uuid not null references public.companies (id) on delete cascade,
  brief_date date not null,
  content text not null,
  facts jsonb not null default '{}' check (jsonb_typeof(facts) = 'object'),
  run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, brief_date)
);
create index briefs_run_id_idx on public.briefs (run_id);

-- Auto Mode: Sol works for a set time with a credit cap, one step after another.
create table public.auto_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  cap_credits integer not null check (cap_credits > 0),
  spent_credits integer not null default 0 check (spent_credits >= 0),
  steps integer not null default 0,
  status text not null default 'running' check (status in ('running', 'stopped', 'finished', 'cap_reached')),
  stopped_by uuid references public.profiles (id) on delete set null,
  finished_at timestamptz,
  check (ends_at > started_at)
);
create unique index auto_sessions_one_running on public.auto_sessions (company_id) where status = 'running';
create index auto_sessions_started_by_idx on public.auto_sessions (started_by);
create index auto_sessions_stopped_by_idx on public.auto_sessions (stopped_by);

-- Access -------------------------------------------------------------------------------------

alter table public.company_automation enable row level security;
revoke all on public.company_automation from anon, authenticated;
grant select on public.company_automation to authenticated;
create policy "Read automation for companies you can read" on public.company_automation
  for select to authenticated using (private.can_read_company(company_id));

alter table public.schedule_runs enable row level security;
revoke all on public.schedule_runs from anon, authenticated;

alter table public.briefs enable row level security;
revoke all on public.briefs from anon, authenticated;
grant select on public.briefs to authenticated;
create policy "Founders and teammates read briefs" on public.briefs
  for select to authenticated using (private.can_edit_company(company_id));

alter table public.auto_sessions enable row level security;
revoke all on public.auto_sessions from anon, authenticated;
grant select on public.auto_sessions to authenticated;
create policy "Read Auto Mode for companies you can read" on public.auto_sessions
  for select to authenticated using (private.can_read_company(company_id));

-- RPCs ---------------------------------------------------------------------------------------

create function public.update_automation(
  p_company uuid,
  p_nightly_enabled boolean default null,
  p_nightly_cap integer default null,
  p_voice_review boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
begin
  if not private.can_edit_company(p_company) then
    raise exception 'Only founders and teammates can change what Sol does on its own' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_nightly_cap is not null and p_nightly_cap not between 0 and 5000 then
    raise exception 'The nightly cap must be between 0 and 5,000 credits' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.company_automation (company_id, nightly_enabled, nightly_cap_credits, voice_review_enabled, updated_by)
  values (p_company, coalesce(p_nightly_enabled, false), coalesce(p_nightly_cap, 300), coalesce(p_voice_review, false), me)
  on conflict (company_id) do update set
    nightly_enabled = coalesce(p_nightly_enabled, company_automation.nightly_enabled),
    nightly_cap_credits = coalesce(p_nightly_cap, company_automation.nightly_cap_credits),
    voice_review_enabled = coalesce(p_voice_review, company_automation.voice_review_enabled),
    updated_by = me,
    updated_at = now();
end;
$$;

-- Starts Auto Mode: up to 8 hours, with a cap the balance (and any cohort pool) can cover.
create function public.start_auto_mode(p_company uuid, p_hours integer, p_cap_credits integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  v_id uuid;
begin
  if not private.can_edit_company(p_company) then
    raise exception 'Only founders and teammates can start Auto Mode' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_hours not between 1 and 8 then
    raise exception 'Auto Mode runs for 1 to 8 hours' using errcode = 'P0001', hint = 'invalid';
  end if;
  if p_cap_credits is null or p_cap_credits <= 0 then
    raise exception 'Set a credit cap' using errcode = 'P0001', hint = 'invalid';
  end if;
  if private.company_balance(p_company) + coalesce(private.cohort_headroom(p_company), 0) < p_cap_credits then
    raise exception 'Not enough credits: the cap is % credits.', p_cap_credits using errcode = 'P0001', hint = 'insufficient_credits';
  end if;
  if exists (select 1 from public.auto_sessions where company_id = p_company and status = 'running') then
    raise exception 'Auto Mode is already running' using errcode = 'P0001', hint = 'conflict';
  end if;
  insert into public.auto_sessions (company_id, started_by, ends_at, cap_credits)
  values (p_company, me, now() + make_interval(hours => p_hours), p_cap_credits)
  returning id into v_id;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (p_company, 'run', format('Auto Mode started: %s %s, up to %s credits', p_hours, case when p_hours = 1 then 'hour' else 'hours' end, p_cap_credits), me);
  return v_id;
end;
$$;

-- Stops Auto Mode: no new steps start; the one in progress finishes.
create function public.stop_auto_mode(p_company uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
begin
  if not private.can_edit_company(p_company) then
    raise exception 'Only founders and teammates can stop Auto Mode' using errcode = 'P0001', hint = 'forbidden';
  end if;
  update public.auto_sessions set status = 'stopped', stopped_by = me, finished_at = now()
  where company_id = p_company and status = 'running';
  if found then
    insert into public.activity_events (company_id, type, summary, actor_id)
    values (p_company, 'idle', 'Auto Mode stopped', me);
  end if;
end;
$$;

-- Service role: claims one scheduled firing. True the first time for that kind, company, item
-- and period; false if it already fired (another worker, or a restart).
create function public.claim_schedule(p_kind text, p_company uuid, p_ref uuid, p_period text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.schedule_runs (kind, company_id, ref_id, period_key) values (p_kind, p_company, p_ref, p_period);
  return true;
exception when unique_violation then
  return false;
end;
$$;

revoke execute on function public.update_automation(uuid, boolean, integer, boolean), public.start_auto_mode(uuid, integer, integer),
  public.stop_auto_mode(uuid) from public, anon;
grant execute on function public.update_automation(uuid, boolean, integer, boolean), public.start_auto_mode(uuid, integer, integer),
  public.stop_auto_mode(uuid) to authenticated;
revoke execute on function public.claim_schedule(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_schedule(text, uuid, uuid, text) to service_role;

alter publication supabase_realtime add table public.auto_sessions, public.briefs, public.routines;
