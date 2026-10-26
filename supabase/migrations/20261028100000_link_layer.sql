-- Link layer and lead capture (Phase 13, SPEC part H). Gumption measures what works from its
-- own data: a hub page per company, tracked short links with UTM tags, click logging without
-- fingerprinting, embeddable lead forms with a separate, unticked marketing opt-in, and
-- attribution from link to lead to customer.
--
-- Short links are served by the public `link` Edge Function (supabase/functions/link) on the
-- project's domain for now; a branded short domain is a later purchase (HANDOFF 4). Hub pages
-- are /h/{slug} and forms /f/{id} on the app.

-- Hub pages ---------------------------------------------------------------------------------

create table public.hub_pages (
  company_id uuid primary key references public.companies (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  -- Off until a founder publishes it.
  enabled boolean not null default false,
  headline text not null default '' check (length(headline) <= 120),
  bio text not null default '' check (length(bio) <= 500),
  -- [{ "label": "Order online", "url": "https://..." }]
  links jsonb not null default '[]' check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 12),
  show_form boolean not null default true,
  show_socials boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger hub_pages_updated_at before update on public.hub_pages
  for each row execute function private.set_updated_at();

-- Lead forms ----------------------------------------------------------------------------------

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null default 'Get in touch' check (length(trim(name)) between 1 and 80),
  intro text not null default '' check (length(intro) <= 300),
  ask_phone boolean not null default false,
  -- The marketing opt-in's exact words, stored with every consent given (UK GDPR, PECR).
  marketing_wording text not null
    default 'Send me occasional news and offers by email. I can unsubscribe at any time.'
    check (length(trim(marketing_wording)) between 10 and 300),
  privacy_url text check (privacy_url is null or privacy_url ~ '^https?://'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index forms_company_id_idx on public.forms (company_id);
create trigger forms_updated_at before update on public.forms
  for each row execute function private.set_updated_at();

-- Tracked links -------------------------------------------------------------------------------

create table public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Za-z0-9]{6,12}$'),
  destination text not null check (destination ~ '^https?://[^\s]+$' and length(destination) <= 2000),
  label text not null check (length(trim(label)) between 1 and 120),
  -- utm_source, utm_medium, utm_campaign, utm_content.
  channel text not null check (length(trim(channel)) between 1 and 40),
  medium text not null default 'social' check (length(trim(medium)) between 1 and 40),
  campaign text not null default '' check (length(campaign) <= 80),
  content text check (content is null or length(content) <= 80),
  -- Phase 15 links campaigns; until then the campaign is its name.
  campaign_id uuid,
  -- What the founder spent on it (printing, a boosted post), for cost per lead.
  spend_gbp numeric(10, 2) check (spend_gbp is null or spend_gbp >= 0),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_by_sol boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index tracked_links_company_id_idx on public.tracked_links (company_id);
create index tracked_links_created_by_idx on public.tracked_links (created_by);

-- One row per click: when, coarse country, device class and the referring site. No IP address,
-- no cookie, no fingerprint.
create table public.link_clicks (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.tracked_links (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  clicked_at timestamptz not null default now(),
  country text check (country ~ '^[A-Z]{2}$'),
  device text not null default 'unknown' check (device in ('mobile', 'tablet', 'desktop', 'bot', 'unknown')),
  referrer_host text check (length(referrer_host) <= 255)
);
create index link_clicks_link_id_idx on public.link_clicks (link_id, clicked_at);
create index link_clicks_company_id_idx on public.link_clicks (company_id, clicked_at);

-- Consents and leads --------------------------------------------------------------------------

-- Consent history per contact, channel and purpose: insert-only, the latest row is current.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  channel text not null default 'email' check (channel in ('email', 'sms', 'post')),
  purpose text not null check (purpose in ('marketing', 'service')),
  status text not null check (status in ('granted', 'withdrawn', 'not_given')),
  lawful_basis text check (lawful_basis in ('consent', 'soft_opt_in', 'legitimate_interests', 'contract')),
  -- The words the person agreed to, exactly as shown.
  wording text,
  source text not null check (source in ('form', 'import', 'manual', 'unsubscribe')),
  form_id uuid references public.forms (id) on delete set null,
  -- Where and how: { "page": "/h/harbour-bakes", "form_version": "..." }.
  evidence jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object'),
  recorded_by uuid references public.profiles (id) on delete set null,
  -- clock_timestamp, so changes made in one transaction still have an order.
  created_at timestamptz not null default clock_timestamp(),
  check (status <> 'granted' or lawful_basis is not null)
);
create index consents_contact_idx on public.consents (contact_id, channel, purpose, created_at desc);
create index consents_company_id_idx on public.consents (company_id);
create index consents_form_id_idx on public.consents (form_id);
create index consents_recorded_by_idx on public.consents (recorded_by);
-- History is never rewritten; a row goes only when its contact is erased (UK GDPR).
create function private.reject_consent_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'consents are a history: record a new row instead of changing one'
    using errcode = 'insufficient_privilege';
end;
$$;
revoke execute on function private.reject_consent_update() from public, anon, authenticated;
create trigger consents_no_update before update on public.consents
  for each row execute function private.reject_consent_update();

-- The current consent for each contact, channel and purpose.
create view public.current_consents with (security_invoker = true) as
select distinct on (contact_id, channel, purpose)
  id, company_id, contact_id, channel, purpose, status, lawful_basis, wording, source, created_at
from public.consents
order by contact_id, channel, purpose, created_at desc;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  form_id uuid references public.forms (id) on delete set null,
  -- Attribution: the tracked link they came through, and its channel and campaign.
  link_id uuid references public.tracked_links (id) on delete set null,
  channel text not null default 'direct',
  campaign text not null default '',
  message text not null default '' check (length(message) <= 5000),
  status text not null default 'new' check (status in ('new', 'contacted', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_company_id_idx on public.leads (company_id, created_at desc);
create index leads_contact_id_idx on public.leads (contact_id);
create index leads_form_id_idx on public.leads (form_id);
create index leads_link_id_idx on public.leads (link_id);
create trigger leads_updated_at before update on public.leads
  for each row execute function private.set_updated_at();

-- Clicks and leads per link, for the links list (row-level security applies to each table).
create view public.link_stats with (security_invoker = true) as
select l.id as link_id, l.company_id,
  (select count(*) from public.link_clicks k where k.link_id = l.id) as clicks,
  (select count(*) from public.link_clicks k where k.link_id = l.id and k.clicked_at > now() - interval '7 days') as clicks_7d,
  (select count(*) from public.leads ld where ld.link_id = l.id) as leads
from public.tracked_links l;

-- Every company gets a hub page (off) and a contact form.
create function private.seed_link_layer(p_company uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  select slug into v_slug from public.companies where id = p_company;
  -- Company slugs are unique already; trim to the hub's length rule.
  v_slug := left(regexp_replace(lower(v_slug), '[^a-z0-9-]', '-', 'g'), 50);
  if length(v_slug) < 3 then v_slug := v_slug || '-hub'; end if;
  insert into public.hub_pages (company_id, slug, headline, bio)
  select p_company, v_slug, c.name, left(c.description, 500) from public.companies c where c.id = p_company
  on conflict do nothing;
  if not exists (select 1 from public.forms where company_id = p_company) then
    insert into public.forms (company_id) values (p_company);
  end if;
end;
$$;
create function private.on_company_created_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_link_layer(new.id);
  return new;
end;
$$;
create trigger companies_seed_link_layer after insert on public.companies
  for each row execute function private.on_company_created_links();
select private.seed_link_layer(id) from public.companies;

-- Access -------------------------------------------------------------------------------------

alter table public.hub_pages enable row level security;
revoke all on public.hub_pages from anon, authenticated;
grant select on public.hub_pages to authenticated;
create policy "Read hub pages for companies you can read" on public.hub_pages
  for select to authenticated using (private.can_read_company(company_id));

alter table public.forms enable row level security;
revoke all on public.forms from anon, authenticated;
grant select on public.forms to authenticated;
create policy "Read forms for companies you can read" on public.forms
  for select to authenticated using (private.can_read_company(company_id));

alter table public.tracked_links enable row level security;
revoke all on public.tracked_links from anon, authenticated;
grant select on public.tracked_links to authenticated;
create policy "Read links for companies you can read" on public.tracked_links
  for select to authenticated using (private.can_read_company(company_id));

alter table public.link_clicks enable row level security;
revoke all on public.link_clicks from anon, authenticated;
grant select on public.link_clicks to authenticated;
create policy "Read clicks for companies you can read" on public.link_clicks
  for select to authenticated using (private.can_read_company(company_id));

-- Consents and leads are personal data: founders and teammates only.
alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;
create policy "Founders and teammates read consents" on public.consents
  for select to authenticated using (private.can_edit_company(company_id));
revoke all on public.link_stats from anon, authenticated;
grant select on public.link_stats to authenticated;
revoke all on public.current_consents from anon, authenticated;
grant select on public.current_consents to authenticated;

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;
grant select on public.leads to authenticated;
create policy "Founders and teammates read leads" on public.leads
  for select to authenticated using (private.can_edit_company(company_id));

-- Helpers ------------------------------------------------------------------------------------

-- An unused 8-character code.
create function private.new_link_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  v_code text;
  bytes bytea;
begin
  loop
    -- gen_random_uuid() is cryptographically random and needs no extension.
    bytes := uuid_send(gen_random_uuid());
    v_code := '';
    -- Skip the bytes holding the UUID's fixed version and variant bits.
    for i in 1..8 loop
      v_code := v_code || substr(alphabet, (get_byte(bytes, (array[0, 1, 2, 3, 4, 5, 10, 11])[i]) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.tracked_links t where t.code = v_code);
  end loop;
  return v_code;
end;
$$;

-- The destination with its UTM tags (and the link code for our own hub pages and forms, so a
-- lead is attributed without cookies).
create function private.tagged_destination(l public.tracked_links)
returns text
language sql
immutable
set search_path = ''
as $$
  select l.destination
    || case when position('?' in l.destination) > 0 then '&' else '?' end
    || 'utm_source=' || replace(l.channel, ' ', '+')
    || '&utm_medium=' || replace(l.medium, ' ', '+')
    || case when l.campaign <> '' then '&utm_campaign=' || replace(l.campaign, ' ', '+') else '' end
    || case when l.content is not null then '&utm_content=' || replace(l.content, ' ', '+') else '' end
    || case when l.destination ~ '/(h|f)/[A-Za-z0-9-]+' then '&l=' || l.code else '' end
$$;

-- Public RPCs (anyone, including anonymous visitors) ------------------------------------------

-- A short link was followed: log the click and return where to send them (null if unknown).
create function public.follow_link(
  p_code text,
  p_referrer text default null,
  p_device text default null,
  p_country text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.tracked_links;
  host text;
begin
  select * into l from public.tracked_links where code = p_code and not archived;
  if not found then
    return null;
  end if;
  host := nullif(left(substring(coalesce(p_referrer, '') from '^[a-z]+://([^/:?#]+)'), 255), '');
  insert into public.link_clicks (link_id, company_id, country, device, referrer_host)
  values (l.id, l.company_id,
    case when upper(p_country) ~ '^[A-Z]{2}$' then upper(p_country) end,
    case when p_device in ('mobile', 'tablet', 'desktop', 'bot') then p_device else 'unknown' end,
    host);
  return private.tagged_destination(l);
end;
$$;

-- A published hub page, with its form. Nothing private: only what the founder chose to show.
create function public.get_hub(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', h.slug,
    'name', c.name,
    'headline', h.headline,
    'bio', h.bio,
    'links', h.links,
    'website', c.website_live_url,
    'socials', case when h.show_socials then c.social_handles else '{}'::jsonb end,
    'form', case when h.show_form then (
      select jsonb_build_object('id', f.id, 'name', f.name, 'intro', f.intro, 'ask_phone', f.ask_phone,
        'marketing_wording', f.marketing_wording, 'privacy_url', f.privacy_url)
      from public.forms f where f.company_id = c.id and f.enabled order by f.created_at limit 1)
    end)
  from public.hub_pages h join public.companies c on c.id = h.company_id
  where h.slug = p_slug and h.enabled
$$;

-- An embeddable form (on the hub page or the company's own website).
create function public.get_form(p_form uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', f.id, 'name', f.name, 'intro', f.intro, 'ask_phone', f.ask_phone,
    'marketing_wording', f.marketing_wording, 'privacy_url', f.privacy_url, 'company', c.name)
  from public.forms f join public.companies c on c.id = f.company_id
  where f.id = p_form and f.enabled
$$;

-- A form submission: a contact (or the existing one), their consents with the exact wording, a
-- lead attributed to the link they came through, and the message in the Customers inbox.
create function public.submit_lead(
  p_form uuid,
  p_name text,
  p_email text,
  p_message text default '',
  p_marketing boolean default false,
  p_phone text default null,
  p_link_code text default null,
  p_page text default null,
  -- A hidden field people never fill in; bots do.
  p_trap text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.forms;
  l public.tracked_links;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := left(trim(coalesce(p_name, '')), 120);
  v_contact uuid;
  v_thread uuid;
  evidence jsonb;
begin
  select * into f from public.forms where id = p_form and enabled;
  if not found then
    raise exception 'This form isn''t taking enquiries' using errcode = 'P0001', hint = 'not_found';
  end if;
  if coalesce(p_trap, '') <> '' then
    return true;  -- Quietly ignore bots.
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Enter a valid email address' using errcode = 'P0001', hint = 'invalid';
  end if;
  if length(v_name) = 0 then
    raise exception 'Enter your name' using errcode = 'P0001', hint = 'invalid';
  end if;
  if length(coalesce(p_message, '')) > 5000 then
    raise exception 'Keep the message under 5,000 characters' using errcode = 'P0001', hint = 'invalid';
  end if;
  -- Light rate limits: the same person three times an hour, a form 200 times an hour.
  if (select count(*) from public.leads ld join public.contacts ct on ct.id = ld.contact_id
      where ld.form_id = p_form and lower(ct.email) = v_email and ld.created_at > now() - interval '1 hour') >= 3
    or (select count(*) from public.leads where form_id = p_form and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Thanks, we''ve got your message already' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if p_link_code is not null then
    select * into l from public.tracked_links where code = p_link_code and company_id = f.company_id;
  end if;

  select id into v_contact from public.contacts where company_id = f.company_id and lower(email) = v_email
    order by created_at limit 1;
  if v_contact is null then
    insert into public.contacts (company_id, name, email, kind, value, source, last_contact_at)
    values (f.company_id, v_name, v_email, 'lead', left(coalesce(nullif(trim(p_message), ''), f.name), 120), 'form', now())
    returning id into v_contact;
  else
    update public.contacts set last_contact_at = now() where id = v_contact;
  end if;

  evidence := jsonb_build_object('page', left(coalesce(p_page, ''), 300), 'form', f.name, 'form_updated_at', f.updated_at);
  -- Replying to the enquiry is legitimate interests; marketing needs the separate opt-in.
  insert into public.consents (company_id, contact_id, purpose, status, lawful_basis, wording, source, form_id, evidence)
  values (f.company_id, v_contact, 'service', 'granted', 'legitimate_interests', 'Replies to your enquiry', 'form', f.id, evidence);
  -- Leaving the box unticked isn't a withdrawal: it only records "not given" when there's no
  -- current opt-in.
  if p_marketing or not exists (
    select 1 from public.current_consents cc
    where cc.contact_id = v_contact and cc.channel = 'email' and cc.purpose = 'marketing' and cc.status = 'granted') then
    insert into public.consents (company_id, contact_id, purpose, status, lawful_basis, wording, source, form_id, evidence)
    values (f.company_id, v_contact, 'marketing', case when p_marketing then 'granted' else 'not_given' end,
      case when p_marketing then 'consent' end, f.marketing_wording, 'form', f.id, evidence);
  end if;

  insert into public.leads (company_id, contact_id, form_id, link_id, channel, campaign, message)
  values (f.company_id, v_contact, f.id, l.id, coalesce(l.channel, 'direct'), coalesce(l.campaign, ''),
    left(coalesce(p_message, ''), 5000));

  -- The message lands in the Customers inbox.
  insert into public.email_threads (company_id, subject, contact_name, address, mode)
  values (f.company_id, left(coalesce(nullif(split_part(trim(p_message), E'\n', 1), ''), 'New enquiry from ' || f.name), 120),
    v_name, v_email, 'support')
  returning id into v_thread;
  insert into public.email_messages (thread_id, company_id, direction, body)
  values (v_thread, f.company_id, 'received',
    coalesce(nullif(trim(p_message), ''), '(No message)') || case when nullif(trim(coalesce(p_phone, '')), '') is not null then E'\n\nPhone: ' || left(trim(p_phone), 40) else '' end);

  insert into public.activity_events (company_id, type, summary)
  values (f.company_id, 'lead', format('New lead from %s%s', f.name,
    case when l.id is not null then ' via ' || l.label else '' end));
  return true;
end;
$$;

-- Signed-in RPCs -------------------------------------------------------------------------------

create function public.create_tracked_link(
  p_company uuid,
  p_destination text,
  p_label text,
  p_channel text,
  p_campaign text default '',
  p_medium text default 'social',
  p_content text default null,
  p_spend_gbp numeric default null
)
returns public.tracked_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  r public.tracked_links;
begin
  if not private.can_edit_company(p_company) then
    raise exception 'Only founders and teammates can create links' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if coalesce(p_destination, '') !~ '^https?://[^\s]+$' then
    raise exception 'The destination must be a full web address starting with https://' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.tracked_links (company_id, code, destination, label, channel, medium, campaign, content, spend_gbp, created_by)
  values (p_company, private.new_link_code(), trim(p_destination), trim(p_label), lower(trim(p_channel)),
    lower(trim(coalesce(nullif(p_medium, ''), 'social'))), trim(coalesce(p_campaign, '')), nullif(trim(p_content), ''), p_spend_gbp, me)
  returning * into r;
  return r;
end;
$$;

create function public.update_tracked_link(p_link uuid, p_label text default null, p_spend_gbp numeric default null, p_archived boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  co uuid;
begin
  perform private.require_signed_in();
  select company_id into co from public.tracked_links where id = p_link;
  if co is null or not private.can_edit_company(co) then
    raise exception 'Link not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  update public.tracked_links set
    label = coalesce(nullif(trim(p_label), ''), label),
    spend_gbp = coalesce(p_spend_gbp, spend_gbp),
    archived = coalesce(p_archived, archived)
  where id = p_link;
end;
$$;

-- Publishing the hub page is public, so founders decide it.
create function public.save_hub_page(p_company uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  link jsonb;
begin
  perform private.require_signed_in();
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can change the hub page' using errcode = 'P0001', hint = 'forbidden';
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('slug', 'enabled', 'headline', 'bio', 'links', 'show_form', 'show_socials') then
      raise exception 'Unknown hub page setting %', k using errcode = 'P0001', hint = 'invalid';
    end if;
  end loop;
  if p_patch ? 'links' then
    for link in select * from jsonb_array_elements(p_patch -> 'links') loop
      if length(trim(coalesce(link ->> 'label', ''))) = 0 or coalesce(link ->> 'url', '') !~ '^https?://[^\s]+$' then
        raise exception 'Each link needs a label and a full web address' using errcode = 'P0001', hint = 'invalid';
      end if;
    end loop;
  end if;
  if p_patch ? 'slug' and exists (select 1 from public.hub_pages where slug = p_patch ->> 'slug' and company_id <> p_company) then
    raise exception 'That address is taken' using errcode = 'P0001', hint = 'conflict';
  end if;
  update public.hub_pages set
    slug = coalesce(p_patch ->> 'slug', slug),
    enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled),
    headline = coalesce(p_patch ->> 'headline', headline),
    bio = coalesce(p_patch ->> 'bio', bio),
    links = coalesce(p_patch -> 'links', links),
    show_form = coalesce((p_patch ->> 'show_form')::boolean, show_form),
    show_socials = coalesce((p_patch ->> 'show_socials')::boolean, show_socials)
  where company_id = p_company;
  if (p_patch ->> 'enabled')::boolean is true then
    insert into public.activity_events (company_id, type, summary, actor_id)
    values (p_company, 'grow', 'Hub page published', auth.uid());
  end if;
end;
$$;

create function public.save_form(p_form uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  co uuid;
  k text;
begin
  perform private.require_signed_in();
  select company_id into co from public.forms where id = p_form;
  if co is null or not private.is_company_founder(co) then
    raise exception 'Only a founder can change the form' using errcode = 'P0001', hint = 'forbidden';
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('name', 'intro', 'ask_phone', 'marketing_wording', 'privacy_url', 'enabled') then
      raise exception 'Unknown form setting %', k using errcode = 'P0001', hint = 'invalid';
    end if;
  end loop;
  update public.forms set
    name = coalesce(p_patch ->> 'name', name),
    intro = coalesce(p_patch ->> 'intro', intro),
    ask_phone = coalesce((p_patch ->> 'ask_phone')::boolean, ask_phone),
    marketing_wording = coalesce(p_patch ->> 'marketing_wording', marketing_wording),
    privacy_url = case when p_patch ? 'privacy_url' then nullif(trim(p_patch ->> 'privacy_url'), '') else privacy_url end,
    enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled)
  where id = p_form;
end;
$$;

-- Moving a lead on; a won lead's contact becomes a customer.
create function public.set_lead_status(p_lead uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ld public.leads;
begin
  perform private.require_signed_in();
  select * into ld from public.leads where id = p_lead;
  if not found or not private.can_edit_company(ld.company_id) then
    raise exception 'Lead not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_status not in ('new', 'contacted', 'won', 'lost') then
    raise exception 'Unknown status' using errcode = 'P0001', hint = 'invalid';
  end if;
  update public.leads set status = p_status where id = p_lead;
  if p_status = 'won' then
    update public.contacts set kind = 'customer' where id = ld.contact_id;
  end if;
end;
$$;

-- A consent change recorded by the team (e.g. someone asked to stop marketing by phone).
create function public.record_consent(p_contact uuid, p_purpose text, p_status text, p_basis text default null, p_wording text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  co uuid;
begin
  select company_id into co from public.contacts where id = p_contact;
  if co is null or not private.can_edit_company(co) then
    raise exception 'Contact not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  -- PECR: the team can withdraw marketing consent, but can't give it on someone's behalf except
  -- as a soft opt-in the founder has confirmed (Phase 14 adds that check to imports).
  if p_purpose = 'marketing' and p_status = 'granted' and coalesce(p_basis, '') <> 'soft_opt_in' then
    raise exception 'Marketing consent has to come from the person (a form) or a confirmed soft opt-in' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.consents (company_id, contact_id, purpose, status, lawful_basis, wording, source, recorded_by)
  values (co, p_contact, p_purpose, p_status, case when p_status = 'granted' then p_basis end, p_wording, 'manual', me);
end;
$$;

-- Attribution: clicks → leads → customers per campaign and channel, with cost per lead where the
-- spend is known (in pounds and credits).
create function public.attribution(p_company uuid, p_since timestamptz default now() - interval '90 days')
returns table (
  campaign text,
  channel text,
  clicks bigint,
  leads bigint,
  customers bigint,
  spend_gbp numeric,
  cost_per_lead_gbp numeric,
  cost_per_lead_credits integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with link_totals as (
    select l.campaign, l.channel,
      (select count(*) from public.link_clicks k where k.link_id = l.id and k.clicked_at >= p_since) as clicks,
      l.spend_gbp
    from public.tracked_links l
    where l.company_id = p_company
  ), lead_totals as (
    select ld.campaign, ld.channel, count(*) as leads,
      count(*) filter (where ld.status = 'won' or ct.kind = 'customer') as customers
    from public.leads ld join public.contacts ct on ct.id = ld.contact_id
    where ld.company_id = p_company and ld.created_at >= p_since
    group by 1, 2
  ), keys as (
    select campaign, channel from link_totals union select campaign, channel from lead_totals
  )
  select k.campaign, k.channel,
    coalesce((select sum(t.clicks) from link_totals t where t.campaign = k.campaign and t.channel = k.channel), 0)::bigint,
    coalesce(lt.leads, 0)::bigint,
    coalesce(lt.customers, 0)::bigint,
    (select sum(t.spend_gbp) from link_totals t where t.campaign = k.campaign and t.channel = k.channel),
    round((select sum(t.spend_gbp) from link_totals t where t.campaign = k.campaign and t.channel = k.channel) / nullif(lt.leads, 0), 2),
    ceil((select sum(t.spend_gbp) from link_totals t where t.campaign = k.campaign and t.channel = k.channel)
      / nullif(lt.leads, 0) / (select credit_value_gbp from public.credit_config))::integer
  from keys k left join lead_totals lt on lt.campaign = k.campaign and lt.channel = k.channel
  where private.can_read_company(p_company) or auth.role() = 'service_role'
  order by 4 desc, 3 desc
$$;

revoke execute on function private.seed_link_layer(uuid), private.on_company_created_links(),
  private.new_link_code(), private.tagged_destination(public.tracked_links) from public, anon, authenticated;
revoke execute on function public.follow_link(text, text, text, text), public.get_hub(text), public.get_form(uuid),
  public.submit_lead(uuid, text, text, text, boolean, text, text, text, text) from public;
grant execute on function public.follow_link(text, text, text, text), public.get_hub(text), public.get_form(uuid),
  public.submit_lead(uuid, text, text, text, boolean, text, text, text, text) to anon, authenticated, service_role;
revoke execute on function public.create_tracked_link(uuid, text, text, text, text, text, text, numeric),
  public.update_tracked_link(uuid, text, numeric, boolean), public.save_hub_page(uuid, jsonb), public.save_form(uuid, jsonb),
  public.set_lead_status(uuid, text), public.record_consent(uuid, text, text, text, text),
  public.attribution(uuid, timestamptz) from public, anon;
grant execute on function public.create_tracked_link(uuid, text, text, text, text, text, text, numeric),
  public.update_tracked_link(uuid, text, numeric, boolean), public.save_hub_page(uuid, jsonb), public.save_form(uuid, jsonb),
  public.set_lead_status(uuid, text), public.record_consent(uuid, text, text, text, text),
  public.attribution(uuid, timestamptz) to authenticated;

alter publication supabase_realtime add table public.leads, public.tracked_links;
