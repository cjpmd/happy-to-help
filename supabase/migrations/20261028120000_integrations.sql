-- Real integrations, flagged per company (Phase 7, SPEC part E): Resend for email (sending and
-- inbound support mail), Ayrshare for social publishing and post analytics, PostHog for site
-- metrics. Each company's switch is off by default, and a provider is only real when the
-- platform has its key too; otherwise the mock is used and nothing leaves the building.

-- A company's switch and settings per provider. Secrets never go here.
create table public.integration_settings (
  company_id uuid not null references public.companies (id) on delete cascade,
  provider text not null check (provider in ('resend', 'ayrshare', 'posthog')),
  enabled boolean not null default false,
  -- resend: { "from_name": "Harbour Bakes", "reply_to": "rory@..." }; others: {}.
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, provider)
);
create index integration_settings_updated_by_idx on public.integration_settings (updated_by);

-- Per-company provider secrets (e.g. the company's Ayrshare profile key): service role only.
create table public.integration_secrets (
  company_id uuid not null references public.companies (id) on delete cascade,
  provider text not null check (provider in ('resend', 'ayrshare', 'posthog')),
  secret text not null,
  updated_at timestamptz not null default now(),
  primary key (company_id, provider)
);

-- Which providers the platform has keys for, reported by the agent worker when it starts, so
-- the app can say whether switching one on does anything yet.
create table public.platform_integrations (
  provider text primary key check (provider in ('resend', 'ayrshare', 'posthog', 'transcription', 'stripe')),
  configured boolean not null default false,
  mode text not null default 'mock',
  checked_at timestamptz not null default now()
);

alter table public.social_posts
  add column provider text,
  add column external_id text,
  add column metrics_synced_at timestamptz;
create index social_posts_external_idx on public.social_posts (provider, external_id) where external_id is not null;

alter table public.email_messages
  add column provider_message_id text unique;

-- Access -------------------------------------------------------------------------------------

alter table public.integration_settings enable row level security;
revoke all on public.integration_settings from anon, authenticated;
grant select on public.integration_settings to authenticated;
create policy "Founders and teammates read integration settings" on public.integration_settings
  for select to authenticated using (private.can_edit_company(company_id));

alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;

alter table public.platform_integrations enable row level security;
revoke all on public.platform_integrations from anon, authenticated;
grant select on public.platform_integrations to authenticated;
create policy "Signed-in people see which integrations are set up" on public.platform_integrations
  for select to authenticated using (true);

-- RPCs ---------------------------------------------------------------------------------------

-- A founder turns a provider on or off for their company. Turning on email or social means
-- approved actions really go out, so only founders decide.
create function public.set_integration(p_company uuid, p_provider text, p_enabled boolean, p_config jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  k text;
begin
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can change integrations' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_provider not in ('resend', 'ayrshare', 'posthog') then
    raise exception 'Unknown integration' using errcode = 'P0001', hint = 'invalid';
  end if;
  if p_config is not null then
    for k in select jsonb_object_keys(p_config) loop
      if not (p_provider = 'resend' and k in ('from_name', 'reply_to')) then
        raise exception 'Unknown setting % for %', k, p_provider using errcode = 'P0001', hint = 'invalid';
      end if;
    end loop;
    if p_config ? 'reply_to' and coalesce(p_config ->> 'reply_to', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'The reply-to address isn''t valid' using errcode = 'P0001', hint = 'invalid';
    end if;
  end if;
  insert into public.integration_settings (company_id, provider, enabled, config, updated_by)
  values (p_company, p_provider, p_enabled, coalesce(p_config, '{}'), me)
  on conflict (company_id, provider) do update set
    enabled = excluded.enabled,
    config = coalesce(p_config, integration_settings.config),
    updated_by = me,
    updated_at = now();
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (p_company, 'run', format('%s %s', initcap(p_provider), case when p_enabled then 'switched on' else 'switched off' end), me);
end;
$$;

-- Service role: an email arrived at the company's inbound address. Threads by sender and
-- subject, records the contact, and is idempotent on the provider's message id.
create function public.receive_inbound_email(
  p_company uuid,
  p_from_address text,
  p_from_name text,
  p_subject text,
  p_body text,
  p_message_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_from_address));
  v_subject text := left(coalesce(nullif(trim(p_subject), ''), '(No subject)'), 200);
  v_base text;
  v_thread uuid;
begin
  if exists (select 1 from public.email_messages where provider_message_id = p_message_id) then
    select thread_id into v_thread from public.email_messages where provider_message_id = p_message_id;
    return v_thread;
  end if;
  -- "Re: Re: Wedding cake" belongs with "Wedding cake".
  v_base := lower(regexp_replace(v_subject, '^((re|fwd?|aw)\s*:\s*)+', '', 'i'));
  select id into v_thread from public.email_threads
  where company_id = p_company and lower(address) = v_email
    and lower(regexp_replace(subject, '^((re|fwd?|aw)\s*:\s*)+', '', 'i')) = v_base
  order by created_at desc limit 1;
  if v_thread is null then
    insert into public.email_threads (company_id, subject, contact_name, address, mode)
    values (p_company, v_subject, left(coalesce(nullif(trim(p_from_name), ''), v_email), 120), v_email, 'support')
    returning id into v_thread;
  end if;
  insert into public.email_messages (thread_id, company_id, direction, body, provider_message_id)
  values (v_thread, p_company, 'received', left(coalesce(nullif(trim(p_body), ''), '(No message)'), 50000), p_message_id);
  if not exists (select 1 from public.contacts where company_id = p_company and lower(email) = v_email) then
    insert into public.contacts (company_id, name, email, kind, value, source, last_contact_at)
    values (p_company, left(coalesce(nullif(trim(p_from_name), ''), split_part(v_email, '@', 1)), 120), v_email, 'lead', left(v_subject, 120), 'email', now());
  else
    update public.contacts set last_contact_at = now() where company_id = p_company and lower(email) = v_email;
  end if;
  insert into public.activity_events (company_id, type, summary)
  values (p_company, 'inbox', format('Email from %s: %s', coalesce(nullif(trim(p_from_name), ''), v_email), left(v_subject, 120)));
  return v_thread;
end;
$$;

-- Service role: someone used the unsubscribe link in a marketing email (PECR: honoured at once).
create function public.unsubscribe_contact(p_contact uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  co uuid;
begin
  select company_id into co from public.contacts where id = p_contact;
  if co is null then
    return false;
  end if;
  insert into public.consents (company_id, contact_id, purpose, status, wording, source)
  values (co, p_contact, 'marketing', 'withdrawn', 'Unsubscribed with the link in an email', 'unsubscribe');
  insert into public.activity_events (company_id, type, summary)
  values (co, 'inbox', 'Someone unsubscribed from marketing emails');
  return true;
end;
$$;

revoke execute on function public.set_integration(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.set_integration(uuid, text, boolean, jsonb) to authenticated;
revoke execute on function public.receive_inbound_email(uuid, text, text, text, text, text), public.unsubscribe_contact(uuid)
  from public, anon, authenticated;
grant execute on function public.receive_inbound_email(uuid, text, text, text, text, text), public.unsubscribe_contact(uuid)
  to service_role;

alter publication supabase_realtime add table public.integration_settings;
