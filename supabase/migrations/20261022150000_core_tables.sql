-- Core tables: people, companies, memberships and cohorts.
-- Access rules for these tables live in the next migration, once the helper functions exist.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.stage as enum ('idea', 'evidence', 'build', 'launch', 'grow');
create type public.company_plan as enum ('starter', 'founder', 'growth');
create type public.pillar as enum ('build', 'grow', 'run', 'legal', 'raise');
create type public.customer_type as enum ('B2B', 'B2C');
create type public.sector_pack as enum ('general', 'legal', 'finance', 'health', 'education');
-- Roles are per company. Mentors can also come from a cohort (cohort_mentors).
create type public.member_role as enum ('founder', 'teammate', 'mentor', 'viewer');

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- profiles ---------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null,
  -- Platform admins can read everything. Set by hand in SQL; nothing in the app grants it.
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Every new auth user gets a profile.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1))
  );
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- companies --------------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  customer_type public.customer_type not null,
  -- Changes only through a stage gate approval.
  stage public.stage not null default 'idea',
  -- Changes only through billing.
  plan public.company_plan not null default 'starter',
  sector public.sector_pack not null default 'general',
  channels text[] not null default '{}',
  target_customer text,
  goal_90d text,
  -- Onboarding answers kept as the founder gave them.
  starting_stage text,
  existing_website_url text,
  website_live_url text not null default '',
  website_preview_url text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger companies_updated_at before update on public.companies
  for each row execute function private.set_updated_at();

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_id_idx on public.company_members (user_id);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%_@_%'),
  role public.member_role not null,
  status text not null default 'invited' check (status in ('invited', 'accepted', 'revoked')),
  invited_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, email)
);
create index team_invites_invited_by_idx on public.team_invites (invited_by);

-- cohorts ----------------------------------------------------------------------------------

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution text not null,
  credit_pool integer not null default 0 check (credit_pool >= 0),
  -- Founders type this during onboarding to join. Not readable by app users directly.
  join_code text unique,
  created_at timestamptz not null default now()
);

create table public.cohort_companies (
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  -- A company belongs to at most one cohort.
  company_id uuid not null unique references public.companies (id) on delete cascade,
  credit_cap integer not null default 0 check (credit_cap >= 0),
  created_at timestamptz not null default now(),
  primary key (cohort_id, company_id)
);

create table public.cohort_mentors (
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);
create index cohort_mentors_user_id_idx on public.cohort_mentors (user_id);
