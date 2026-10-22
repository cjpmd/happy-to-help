-- Workspace data from SPEC part B: documents, routines, media, company email, ads,
-- per-user preferences and HQ layouts, and the public build-in-public page.

create type public.routine_cadence as enum ('daily', 'weekdays', 'weekly');
create type public.media_kind as enum ('image', 'video');
create type public.media_status as enum ('generating', 'ready', 'failed');
create type public.email_mode as enum ('support', 'outreach');
create type public.email_direction as enum ('received', 'sent', 'draft');

-- documents and their versions -------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  -- Product roadmap only: [{ "title": "Waitlist", "complete": true }, ...]
  outcomes jsonb check (outcomes is null or jsonb_typeof(outcomes) = 'array'),
  created_at timestamptz not null default now(),
  unique (company_id, title)
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  -- Copied from the document so access checks don't need a join.
  company_id uuid not null references public.companies (id) on delete cascade,
  version integer not null check (version > 0),
  content text not null,
  run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);
create index document_versions_company_id_idx on public.document_versions (company_id);
create index document_versions_run_id_idx on public.document_versions (run_id);

-- The version's company must be its document's company.
create function private.check_document_version_company()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id is distinct from (select d.company_id from public.documents d where d.id = new.document_id) then
    raise exception 'document_versions.company_id must match the document''s company';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_document_version_company() from public, anon, authenticated;
create trigger document_versions_company before insert or update on public.document_versions
  for each row execute function private.check_document_version_company();

-- routines ---------------------------------------------------------------------------------

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  cadence public.routine_cadence not null,
  -- Estimate per run. Nothing is scheduled until Phase 8.
  credits integer not null check (credits >= 0),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routines_company_id_idx on public.routines (company_id);
create trigger routines_updated_at before update on public.routines
  for each row execute function private.set_updated_at();

-- media ------------------------------------------------------------------------------------

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid references public.agent_jobs (id) on delete set null,
  kind public.media_kind not null,
  title text not null,
  status public.media_status not null default 'generating',
  url text,
  reason text,
  created_at timestamptz not null default now()
);
create index media_assets_company_id_idx on public.media_assets (company_id);
create index media_assets_job_id_idx on public.media_assets (job_id);

-- company email ----------------------------------------------------------------------------

create table public.email_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  subject text not null,
  contact_name text not null default '',
  address text not null default '',
  mode public.email_mode not null,
  created_at timestamptz not null default now()
);
create index email_threads_company_id_idx on public.email_threads (company_id);

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  -- Copied from the thread so access checks don't need a join.
  company_id uuid not null references public.companies (id) on delete cascade,
  direction public.email_direction not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index email_messages_thread_id_idx on public.email_messages (thread_id, created_at);
create index email_messages_company_id_idx on public.email_messages (company_id);

create function private.check_email_message_company()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id is distinct from (select t.company_id from public.email_threads t where t.id = new.thread_id) then
    raise exception 'email_messages.company_id must match the thread''s company';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_email_message_company() from public, anon, authenticated;
create trigger email_messages_company before insert or update on public.email_messages
  for each row execute function private.check_email_message_company();

-- ads --------------------------------------------------------------------------------------

create table public.ad_accounts (
  company_id uuid primary key references public.companies (id) on delete cascade,
  status text not null default 'not_connected' check (status in ('not_connected', 'demo', 'connected')),
  daily_budget numeric(10, 2) not null default 0 check (daily_budget >= 0),
  hard_cap numeric(10, 2) not null default 50 check (hard_cap >= 0),
  spend numeric(12, 2) not null default 0 check (spend >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  signups integer not null default 0 check (signups >= 0),
  check (daily_budget <= hard_cap)
);

-- Read-only for app users: documents, versions, media, email and ads are written by the agent,
-- and budget changes go through approvals.
do $$
declare
  t text;
begin
  foreach t in array array[
    'documents', 'document_versions', 'media_assets', 'email_threads', 'email_messages',
    'ad_accounts', 'routines'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy "Read for companies you can read" on public.%I for select to authenticated using (private.can_read_company(company_id))',
      t
    );
  end loop;
end;
$$;

-- Founders and teammates manage routines.
grant delete on public.routines to authenticated;
grant insert (company_id, title, cadence, credits, enabled) on public.routines to authenticated;
grant update (title, cadence, credits, enabled) on public.routines to authenticated;
create policy "Founders and teammates add routines" on public.routines
  for insert to authenticated with check (private.can_edit_company(company_id));
create policy "Founders and teammates edit routines" on public.routines
  for update to authenticated
  using (private.can_edit_company(company_id)) with check (private.can_edit_company(company_id));
create policy "Founders and teammates delete routines" on public.routines
  for delete to authenticated using (private.can_edit_company(company_id));

-- Per-user settings ------------------------------------------------------------------------

create table public.user_preferences (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  explanation text not null default 'brief' check (explanation in ('brief', 'more')),
  ad_threshold integer not null default 20 check (ad_threshold >= 0),
  outreach_threshold integer not null default 25 check (outreach_threshold >= 0),
  publishing boolean not null default true,
  signup_drop integer not null default 30 check (signup_drop between 0 and 100),
  whatsapp boolean not null default false,
  slack boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger user_preferences_updated_at before update on public.user_preferences
  for each row execute function private.set_updated_at();

create table public.hq_layouts (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  -- [{ "id": "Sol", "visible": true }, ...]
  layout jsonb not null check (jsonb_typeof(layout) = 'array'),
  updated_at timestamptz not null default now()
);
create trigger hq_layouts_updated_at before update on public.hq_layouts
  for each row execute function private.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['user_preferences', 'hq_layouts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "Your own settings" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end;
$$;

-- Build in public --------------------------------------------------------------------------

create table public.company_sharing (
  company_id uuid primary key references public.companies (id) on delete cascade,
  enabled boolean not null default false,
  stage boolean not null default true,
  milestones boolean not null default true,
  visitors boolean not null default false,
  signups boolean not null default false,
  mrr boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger company_sharing_updated_at before update on public.company_sharing
  for each row execute function private.set_updated_at();

alter table public.company_sharing enable row level security;
revoke all on public.company_sharing from anon, authenticated;
grant select on public.company_sharing to authenticated;
grant insert (company_id, enabled, stage, milestones, visitors, signups, mrr) on public.company_sharing to authenticated;
grant update (enabled, stage, milestones, visitors, signups, mrr) on public.company_sharing to authenticated;
create policy "Read sharing settings for companies you can read" on public.company_sharing
  for select to authenticated using (private.can_read_company(company_id));
create policy "Founders turn on sharing" on public.company_sharing
  for insert to authenticated with check (private.is_company_founder(company_id));
create policy "Founders change sharing" on public.company_sharing
  for update to authenticated
  using (private.is_company_founder(company_id)) with check (private.is_company_founder(company_id));

-- The public progress page. Anyone can call this; it returns only what the founder chose to
-- share, and nothing at all unless sharing is on.
create function public.get_public_progress(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'name', c.name,
    'description', c.description,
    'stage', case when s.stage then c.stage end,
    'milestones', case when s.milestones then (
      select coalesce(jsonb_agg(g.stage order by g.stage), '[]'::jsonb)
      from public.stage_gates g
      where g.company_id = c.id and g.status = 'approved'
    ) end,
    'metrics', case when s.visitors or s.signups or s.mrr then (
      select jsonb_strip_nulls(jsonb_build_object(
        'date', m.date,
        'visitors', case when s.visitors then m.visitors end,
        'signups', case when s.signups then m.signups end,
        'mrr', case when s.mrr then m.mrr end
      ))
      from public.metrics_daily m
      where m.company_id = c.id
      order by m.date desc
      limit 1
    ) end
  ))
  from public.companies c
  join public.company_sharing s on s.company_id = c.id and s.enabled
  where c.slug = p_slug
$$;
revoke execute on function public.get_public_progress(text) from public;
grant execute on function public.get_public_progress(text) to anon, authenticated, service_role;
