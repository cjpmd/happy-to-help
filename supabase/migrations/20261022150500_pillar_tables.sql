-- Pillar data: Grow (posts), Stay legal (compliance), Raise (investors, grants), Run (contacts),
-- Build (site versions) and daily metrics.

create type public.social_channel as enum ('Instagram', 'TikTok', 'LinkedIn', 'X');
create type public.post_status as enum ('draft', 'awaiting_approval', 'scheduled', 'published');
create type public.compliance_status as enum ('done', 'in_progress', 'upcoming', 'overdue');
create type public.investor_stage as enum (
  'researching', 'contacted', 'meeting', 'diligence', 'committed', 'passed'
);
create type public.contact_kind as enum ('customer', 'lead');

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  approval_id uuid references public.approvals (id) on delete set null,
  channel public.social_channel not null,
  text text not null,
  angle text not null default '',
  status public.post_status not null default 'draft',
  scheduled_for timestamptz,
  -- { "clicks": 0, "signups": 0 }; Phase 7 fills this from Ayrshare.
  metrics jsonb not null default '{"clicks": 0, "signups": 0}' check (jsonb_typeof(metrics) = 'object'),
  created_at timestamptz not null default now()
);
create index social_posts_company_id_idx on public.social_posts (company_id);
create index social_posts_approval_id_idx on public.social_posts (approval_id);

create table public.compliance_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  category text not null,
  due_date date not null,
  status public.compliance_status not null default 'upcoming',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index compliance_items_company_id_idx on public.compliance_items (company_id, due_date);
create trigger compliance_items_updated_at before update on public.compliance_items
  for each row execute function private.set_updated_at();

create table public.investors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  firm text not null default '',
  stage public.investor_stage not null default 'researching',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index investors_company_id_idx on public.investors (company_id);
create trigger investors_updated_at before update on public.investors
  for each row execute function private.set_updated_at();

create table public.grants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  amount text not null default '',
  deadline date,
  status text not null default 'Researching',
  created_at timestamptz not null default now()
);
create index grants_company_id_idx on public.grants (company_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  email text not null default '',
  kind public.contact_kind not null default 'lead',
  value text not null default '',
  last_contact_at timestamptz,
  created_at timestamptz not null default now()
);
create index contacts_company_id_idx on public.contacts (company_id);

create table public.site_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  version text not null,
  summary text not null,
  preview_url text,
  published_at timestamptz not null default now(),
  unique (company_id, version)
);

-- Filled from PostHog in Phase 7.
create table public.metrics_daily (
  company_id uuid not null references public.companies (id) on delete cascade,
  date date not null,
  visitors integer not null default 0 check (visitors >= 0),
  signups integer not null default 0 check (signups >= 0),
  paying_customers integer not null default 0 check (paying_customers >= 0),
  mrr numeric(12, 2) not null default 0 check (mrr >= 0),
  primary key (company_id, date)
);

-- Access ----------------------------------------------------------------------------------
-- Written by the agent and integrations only: posts, site versions, metrics.
-- Founders and teammates also edit: compliance items, investors, grants, contacts.

do $$
declare
  t text;
begin
  foreach t in array array[
    'social_posts', 'site_versions', 'metrics_daily',
    'compliance_items', 'investors', 'grants', 'contacts'
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

  foreach t in array array['compliance_items', 'investors', 'grants', 'contacts']
  loop
    execute format('grant delete on public.%I to authenticated', t);
    execute format(
      'create policy "Founders and teammates add" on public.%I for insert to authenticated with check (private.can_edit_company(company_id))',
      t
    );
    execute format(
      'create policy "Founders and teammates edit" on public.%I for update to authenticated using (private.can_edit_company(company_id)) with check (private.can_edit_company(company_id))',
      t
    );
    execute format(
      'create policy "Founders and teammates delete" on public.%I for delete to authenticated using (private.can_edit_company(company_id))',
      t
    );
  end loop;
end;
$$;

-- Column grants: company_id can be set on insert but never changed.
grant insert (company_id, title, category, due_date, status) on public.compliance_items to authenticated;
grant update (title, category, due_date, status) on public.compliance_items to authenticated;
grant insert (company_id, name, firm, stage, notes) on public.investors to authenticated;
grant update (name, firm, stage, notes) on public.investors to authenticated;
grant insert (company_id, name, amount, deadline, status) on public.grants to authenticated;
grant update (name, amount, deadline, status) on public.grants to authenticated;
grant insert (company_id, name, email, kind, value, last_contact_at) on public.contacts to authenticated;
grant update (name, email, kind, value, last_contact_at) on public.contacts to authenticated;
