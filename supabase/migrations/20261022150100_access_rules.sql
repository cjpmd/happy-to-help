-- Access helpers and row-level security for the core tables.
--
-- Who can do what, per company:
--   founder         read; edit content; decide approvals; approve gates; manage the team
--   teammate        read; edit content
--   viewer          read
--   mentor          read; comment; decide approvals; approve gates. A mentor is either a member
--                   with the mentor role, or a mentor of the cohort the company belongs to.
--   platform admin  read everything (profiles.is_admin); no direct writes
-- Agent output (runs, approvals, ledger, activity) is written by the service role only.
--
-- Helpers are SECURITY DEFINER so policies can look up memberships without recursing through
-- those tables' own policies. They take no input that could widen access: every check is
-- against auth.uid().

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

create function private.member_role(p_company uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.company_members m
  where m.company_id = p_company and m.user_id = auth.uid()
$$;

create function private.is_cohort_mentor(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cohort_companies cc
    join public.cohort_mentors cm on cm.cohort_id = cc.cohort_id
    where cc.company_id = p_company and cm.user_id = auth.uid()
  )
$$;

create function private.can_read_company(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.member_role(p_company) is not null
    or private.is_cohort_mentor(p_company)
    or private.is_admin()
$$;

create function private.can_edit_company(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.member_role(p_company) in ('founder', 'teammate'), false)
$$;

create function private.is_company_founder(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.member_role(p_company) = 'founder', false)
$$;

-- Founders and mentors oversee a company: they decide approvals and approve stage gates.
create function private.can_oversee_company(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.member_role(p_company) in ('founder', 'mentor'), false)
    or private.is_cohort_mentor(p_company)
$$;

create function private.can_read_cohort(p_cohort uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    or exists (
      select 1 from public.cohort_mentors cm
      where cm.cohort_id = p_cohort and cm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.cohort_companies cc
      join public.company_members m on m.company_id = cc.company_id
      where cc.cohort_id = p_cohort and m.user_id = auth.uid()
    )
$$;

-- You can see the profiles of people you work with: co-members, your cohort's mentors, and
-- (as a mentor) the members of your cohort's companies.
create function private.can_see_profile(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile = auth.uid()
    or private.is_admin()
    or exists (
      select 1
      from public.company_members mine
      join public.company_members theirs on theirs.company_id = mine.company_id
      where mine.user_id = auth.uid() and theirs.user_id = p_profile
    )
    or exists (
      select 1
      from public.company_members mine
      join public.cohort_companies cc on cc.company_id = mine.company_id
      join public.cohort_mentors cm on cm.cohort_id = cc.cohort_id
      where mine.user_id = auth.uid() and cm.user_id = p_profile
    )
    or exists (
      select 1
      from public.cohort_mentors cm
      join public.cohort_companies cc on cc.cohort_id = cm.cohort_id
      join public.company_members theirs on theirs.company_id = cc.company_id
      where cm.user_id = auth.uid() and theirs.user_id = p_profile
    )
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.is_admin(),
  private.member_role(uuid),
  private.is_cohort_mentor(uuid),
  private.can_read_company(uuid),
  private.can_edit_company(uuid),
  private.is_company_founder(uuid),
  private.can_oversee_company(uuid),
  private.can_read_cohort(uuid),
  private.can_see_profile(uuid)
to authenticated, service_role;

-- profiles ---------------------------------------------------------------------------------

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, update (full_name) on public.profiles to authenticated;

create policy "See people you work with" on public.profiles
  for select to authenticated using (private.can_see_profile(id));
create policy "Edit your own name" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- companies --------------------------------------------------------------------------------
-- Companies are created through an RPC (data layer, group 1c). Stage and plan can't be
-- edited directly: gates and billing change them.

alter table public.companies enable row level security;
revoke all on public.companies from anon, authenticated;
grant select on public.companies to authenticated;
grant update (
  name, description, customer_type, sector, channels, target_customer, goal_90d,
  existing_website_url
) on public.companies to authenticated;

create policy "Read companies you belong to or oversee" on public.companies
  for select to authenticated using (private.can_read_company(id));
create policy "Founders edit their company profile" on public.companies
  for update to authenticated
  using (private.is_company_founder(id)) with check (private.is_company_founder(id));

-- company_members: read only; joining happens through RPCs -----------------------------------

alter table public.company_members enable row level security;
revoke all on public.company_members from anon, authenticated;
grant select on public.company_members to authenticated;

create policy "Read the members of companies you can read" on public.company_members
  for select to authenticated using (private.can_read_company(company_id));

-- team_invites -----------------------------------------------------------------------------

alter table public.team_invites enable row level security;
revoke all on public.team_invites from anon, authenticated;
grant select, delete on public.team_invites to authenticated;
grant insert (company_id, email, role) on public.team_invites to authenticated;

create policy "Read invites for companies you can read" on public.team_invites
  for select to authenticated using (private.can_read_company(company_id));
create policy "Founders invite people" on public.team_invites
  for insert to authenticated
  with check (private.is_company_founder(company_id) and invited_by = auth.uid());
create policy "Founders withdraw invites" on public.team_invites
  for delete to authenticated using (private.is_company_founder(company_id));

-- cohorts ----------------------------------------------------------------------------------
-- Admins manage cohorts with the service role. The join code is not readable by app users.

alter table public.cohorts enable row level security;
revoke all on public.cohorts from anon, authenticated;
grant select (id, name, institution, credit_pool, created_at) on public.cohorts to authenticated;

create policy "Read your cohorts" on public.cohorts
  for select to authenticated using (private.can_read_cohort(id));

alter table public.cohort_companies enable row level security;
revoke all on public.cohort_companies from anon, authenticated;
grant select on public.cohort_companies to authenticated;

-- A founder sees their own company's cap; a cohort mentor sees every company's.
create policy "Read cohort places for companies you can read" on public.cohort_companies
  for select to authenticated using (private.can_read_company(company_id));

alter table public.cohort_mentors enable row level security;
revoke all on public.cohort_mentors from anon, authenticated;
grant select on public.cohort_mentors to authenticated;

create policy "Read the mentors of your cohorts" on public.cohort_mentors
  for select to authenticated using (private.can_read_cohort(cohort_id));
