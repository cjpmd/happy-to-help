-- Phase 10: two entry paths (SPEC part A, v2 product definition). Start up companies begin at
-- Idea and prove demand through gates; Keep going companies are already trading, start at
-- Grow with earlier gates imported, and bring their website, socials, Google Business profile,
-- contacts and past emails with them.

alter table public.companies
  add column entry_path public.entry_path not null default 'start_up',
  -- { "instagram": "@handle", "tiktok": "...", "linkedin": "https://...", "x": "...", "facebook": "..." }
  add column social_handles jsonb not null default '{}' check (jsonb_typeof(social_handles) = 'object'),
  add column google_business_url text;
grant update (social_handles, google_business_url) on public.companies to authenticated;

-- Where a contact came from (manual, import, form, inbox...). Phase 13 adds consent records.
alter table public.contacts add column source text not null default 'manual';
grant insert (source) on public.contacts to authenticated;

-- Material for the voice analysis: the website's copy and past emails or posts the founder
-- shares at onboarding. Phase 11's voice-analysis skill reads these.
create table public.voice_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('website', 'email', 'post', 'other')),
  content text not null check (length(content) between 1 and 50000),
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index voice_sources_company_id_idx on public.voice_sources (company_id);
create index voice_sources_added_by_idx on public.voice_sources (added_by);

alter table public.voice_sources enable row level security;
revoke all on public.voice_sources from anon, authenticated;
grant select, delete on public.voice_sources to authenticated;
grant insert (company_id, kind, content) on public.voice_sources to authenticated;
-- Founders and teammates only: mentors don't see a company's raw correspondence.
create policy "Founders and teammates read voice sources" on public.voice_sources
  for select to authenticated using (private.can_edit_company(company_id));
create policy "Founders and teammates add voice sources" on public.voice_sources
  for insert to authenticated with check (private.can_edit_company(company_id));
create policy "Founders and teammates delete voice sources" on public.voice_sources
  for delete to authenticated using (private.can_edit_company(company_id));

-- create_company gains the entry path and the Keep going imports.
drop function public.create_company(text, text, public.customer_type, public.sector_pack, text, text, text, text, text);
create function public.create_company(
  p_name text,
  p_description text,
  p_customer_type public.customer_type,
  p_sector public.sector_pack default 'general',
  p_target_customer text default null,
  p_goal_90d text default null,
  p_starting_stage text default null,
  p_existing_website_url text default null,
  p_cohort_code text default null,
  p_entry_path public.entry_path default 'start_up',
  p_social_handles jsonb default '{}',
  p_google_business_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  cid uuid;
  cohort_id uuid;
  cohort_cap integer;
  started timestamptz := now();
  keep_going boolean := coalesce(p_entry_path, 'start_up') = 'keep_going';
  doc_id uuid;
  d record;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Give your company a name' using errcode = 'P0001', hint = 'invalid';
  end if;
  if jsonb_typeof(coalesce(p_social_handles, '{}')) <> 'object' then
    raise exception 'Social handles must be an object' using errcode = 'P0001', hint = 'invalid';
  end if;
  if nullif(trim(coalesce(p_cohort_code, '')), '') is not null then
    select c.id, c.default_credit_cap into cohort_id, cohort_cap
    from public.cohorts c where upper(c.join_code) = upper(trim(p_cohort_code));
    if not found then
      raise exception 'That cohort code isn''t recognised. Check it with your programme lead.'
        using errcode = 'P0001', hint = 'bad_cohort_code';
    end if;
  end if;

  insert into public.companies (
    slug, name, description, customer_type, sector, channels, target_customer, goal_90d,
    starting_stage, existing_website_url, created_by, started_at, entry_path, stage,
    social_handles, google_business_url
  ) values (
    private.unique_slug(p_name), trim(p_name), coalesce(trim(p_description), ''), p_customer_type,
    coalesce(p_sector, 'general'),
    case p_customer_type when 'B2B' then '{LinkedIn,"Email outreach","Trust page"}'::text[]
      else '{Instagram,TikTok,Waitlist}'::text[] end,
    nullif(trim(coalesce(p_target_customer, '')), ''), nullif(trim(coalesce(p_goal_90d, '')), ''),
    nullif(trim(coalesce(p_starting_stage, '')), ''), nullif(trim(coalesce(p_existing_website_url, '')), ''),
    me, started, coalesce(p_entry_path, 'start_up'),
    case when keep_going then 'grow' else 'idea' end::public.stage,
    coalesce(p_social_handles, '{}'), nullif(trim(coalesce(p_google_business_url, '')), '')
  ) returning id into cid;

  update public.companies
  set website_live_url = coalesce(existing_website_url, '/site/' || slug),
      website_preview_url = '/site/' || slug || '?preview=1'
  where id = cid;

  insert into public.company_members (company_id, user_id, role) values (cid, me, 'founder');

  if keep_going then
    -- Already trading: the gates before Grow are imported, not proven here.
    insert into public.stage_gates (company_id, stage, criteria, status, target_date)
    select cid, s, '[]', 'imported', started::date
    from unnest(array['idea', 'evidence', 'build', 'launch']::public.stage[]) s;
  else
    insert into public.stage_gates (company_id, stage, criteria, status, target_date)
    values
      (cid, 'idea', '[]', 'in_progress', (started + interval '8 days')::date),
      (cid, 'evidence', '[{"label": "Waitlist", "current": 0, "target": 50}, {"label": "Interviews", "current": 0, "target": 8}]', 'locked', (started + interval '18 days')::date),
      (cid, 'build', '[{"label": "Beta users", "current": 0, "target": 40}]', 'locked', (started + interval '42 days')::date),
      (cid, 'launch', '[]', 'locked', (started + interval '80 days')::date);
  end if;

  insert into public.routines (company_id, title, cadence, credits) values
    (cid, 'Morning brief', 'daily', 25),
    (cid, case p_customer_type when 'B2B' then 'Post to LinkedIn' else 'Draft Instagram post' end, 'weekdays', 40),
    (cid, case when keep_going then 'Weekly performance summary' else 'Weekly investor update' end, 'weekly', 60);

  for d in
    select * from (values
      (1, 'Company profile', trim(p_name) || E'\n\n' || coalesce(trim(p_description), '') || E'\n\nTarget customer: '
        || coalesce(nullif(trim(coalesce(p_target_customer, '')), ''), p_customer_type::text) || E'.\n90-day goal: '
        || coalesce(nullif(trim(coalesce(p_goal_90d, '')), ''),
             case when keep_going then 'Grow revenue from existing customers and new leads' else 'Validate demand with customer interviews' end) || '.'),
      (2, 'Product roadmap', 'Outcomes for the next release. Prioritised using customer interviews.'),
      (3, 'Brand & voice guide', 'Voice: clear, encouraging and honest. Avoid guarantees and unsupported claims.'),
      (4, 'Privacy policy', E'DRAFT — requires legal review.\n\nWe collect contact details with consent for beta access. We do not sell personal data. Retention periods, lawful bases, rights and contact details must be confirmed before publication.'),
      (5, 'Pitch one-pager', trim(p_name) || E'\n\n' || coalesce(trim(p_description), '') || E'\n\nProblem, solution and early evidence: see the company evidence board. Funding ask has not been set.')
    ) as v (ord, title, content)
    order by ord
  loop
    insert into public.documents (company_id, title, outcomes)
    values (cid, d.title, case when d.title = 'Product roadmap' then '[]'::jsonb end)
    returning id into doc_id;
    insert into public.document_versions (document_id, company_id, version, content)
    values (doc_id, cid, 1, d.content);
  end loop;

  insert into public.ad_accounts (company_id) values (cid);
  insert into public.company_sharing (company_id) values (cid);

  if cohort_id is not null then
    insert into public.cohort_companies (cohort_id, company_id, credit_cap)
    values (cohort_id, cid, cohort_cap);
  end if;

  insert into public.chat_messages (company_id, sender, content) values (cid, 'sol',
    case when keep_going then
      'Welcome aboard. I''ve imported what you shared about ' || trim(p_name)
      || '. Next I''ll learn your voice from your website and emails and propose how I should reply to customers. Nothing goes out without your approval.'
    else
      'Welcome aboard. I''ve read your idea for ' || trim(p_name)
      || '. Tonight I''ll draft your first assumptions to test and a simple landing page.'
    end);
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (cid, 'mission', case when keep_going then 'Mission imported: joining at Grow' else 'Mission started' end, me);

  return cid;
end;
$$;
revoke execute on function public.create_company(text, text, public.customer_type, public.sector_pack, text, text, text, text, text, public.entry_path, jsonb, text) from public, anon;
grant execute on function public.create_company(text, text, public.customer_type, public.sector_pack, text, text, text, text, text, public.entry_path, jsonb, text) to authenticated, service_role;

-- Contacts from a CSV the founder uploads at onboarding or later. Rows are
-- [{ "name": "...", "email": "...", "kind": "customer" | "lead", "value": "..." }]. Existing
-- emails are skipped. Phase 14 adds the consent check on import.
create function public.import_contacts(p_company uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform private.require_signed_in();
  if not private.can_edit_company(p_company) then
    raise exception 'Only founders and teammates can import contacts' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import up to 5,000 contacts at a time' using errcode = 'P0001', hint = 'invalid';
  end if;
  with rows as (
    select distinct on (lower(trim(r ->> 'email')))
      left(coalesce(nullif(trim(r ->> 'name'), ''), split_part(trim(r ->> 'email'), '@', 1)), 200) as name,
      lower(trim(r ->> 'email')) as email,
      case when r ->> 'kind' = 'customer' then 'customer' else 'lead' end::public.contact_kind as kind,
      left(coalesce(r ->> 'value', ''), 200) as value
    from jsonb_array_elements(p_rows) r
    where trim(coalesce(r ->> 'email', '')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ), inserted as (
    insert into public.contacts (company_id, name, email, kind, value, source)
    select p_company, rows.name, rows.email, rows.kind, rows.value, 'import'
    from rows
    where not exists (
      select 1 from public.contacts c where c.company_id = p_company and lower(c.email) = rows.email
    )
    returning 1
  )
  select count(*) into n from inserted;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (p_company, 'run', 'Imported ' || n || ' contacts', auth.uid());
  return n;
end;
$$;
revoke execute on function public.import_contacts(uuid, jsonb) from public, anon;
grant execute on function public.import_contacts(uuid, jsonb) to authenticated, service_role;
