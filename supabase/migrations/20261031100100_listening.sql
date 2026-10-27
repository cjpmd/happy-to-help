-- Listening (Phase 16, SPEC K): comments on the company's own posts and its Google Business
-- reviews come into the inbox pipeline (Phase 14) as conversations with a channel; public replies
-- always wait for a GO. Feedback requests after a purchase or booking, opt-in on both sides: the
-- founder switches them on, and they go only to customers with recorded marketing permission.
-- No broad keyword listening.

-- Conversations from social and reviews sit beside email threads.
alter table public.email_threads
  add column channel text not null default 'email' check (channel in ('email', 'form', 'hub', 'social', 'review')),
  add column platform text,
  add column external_id text,
  add column external_url text,
  add column rating smallint check (rating between 1 and 5);
create unique index email_threads_external_idx on public.email_threads (company_id, platform, external_id)
  where external_id is not null;
alter table public.email_messages add column external_id text;
create unique index email_messages_external_idx on public.email_messages (company_id, external_id)
  where external_id is not null;

-- The inbox item's channel comes from the conversation.
create or replace function private.on_message_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.email_threads;
begin
  if new.direction <> 'received' then
    return new;
  end if;
  select * into t from public.email_threads where id = new.thread_id;
  insert into public.inbox_items (company_id, thread_id, message_id, channel, contact_id)
  values (new.company_id, new.thread_id, new.id,
    case when t.channel in ('social', 'review') then t.channel
      when new.provider_message_id is null then 'form' else 'email' end,
    (select c.id from public.contacts c where c.company_id = new.company_id and t.address <> ''
      and lower(c.email) = lower(t.address) limit 1))
  on conflict (message_id) do nothing;
  return new;
end;
$$;

-- What each company listens to. Everything is off until the founder switches it on.
create table public.listening_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  social_comments boolean not null default false,
  reviews boolean not null default false,
  feedback_requests boolean not null default false,
  feedback_delay_days integer not null default 2 check (feedback_delay_days between 0 and 30),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.listening_settings enable row level security;
revoke all on public.listening_settings from anon, authenticated;
grant select on public.listening_settings to authenticated;
create policy "Read listening settings for companies you can read" on public.listening_settings
  for select to authenticated using (private.can_read_company(company_id));

create function public.update_listening_settings(
  p_company uuid,
  p_social_comments boolean default null,
  p_reviews boolean default null,
  p_feedback_requests boolean default null,
  p_feedback_delay_days integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
begin
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can change what Sol listens to' using errcode = 'P0001', hint = 'forbidden';
  end if;
  insert into public.listening_settings (company_id) values (p_company) on conflict (company_id) do nothing;
  update public.listening_settings set
    social_comments = coalesce(p_social_comments, social_comments),
    reviews = coalesce(p_reviews, reviews),
    feedback_requests = coalesce(p_feedback_requests, feedback_requests),
    feedback_delay_days = coalesce(p_feedback_delay_days, feedback_delay_days),
    updated_at = now()
  where company_id = p_company;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (p_company, 'settings', 'Listening settings changed', me);
end;
$$;
revoke execute on function public.update_listening_settings(uuid, boolean, boolean, boolean, integer) from public, anon;
grant execute on function public.update_listening_settings(uuid, boolean, boolean, boolean, integer) to authenticated;

-- A comment or review from a provider (the agent service syncs them). Idempotent on the
-- provider's id; returns the new message, or null when it was already here.
create function public.receive_listening_item(
  p_company uuid,
  p_platform text,
  p_kind text,
  p_external_id text,
  p_author text,
  p_text text,
  p_rating integer default null,
  p_url text default null,
  p_parent text default null,
  p_created_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_platform text := lower(trim(p_platform));
  v_thread uuid;
  v_message uuid;
  v_author text := left(coalesce(nullif(trim(p_author), ''), 'Someone'), 120);
begin
  if p_kind not in ('comment', 'review') or coalesce(trim(p_external_id), '') = '' then
    raise exception 'Unknown listening item' using errcode = 'P0001', hint = 'invalid';
  end if;
  if exists (select 1 from public.email_messages where company_id = p_company and external_id = v_platform || ':' || p_external_id) then
    return null;
  end if;
  insert into public.email_threads (company_id, subject, contact_name, address, mode, channel, platform, external_id, external_url, rating, created_at)
  values (p_company,
    case p_kind when 'review' then format('%s-star review on %s', coalesce(p_rating::text, '?'), initcap(v_platform))
      else format('Comment on %s', initcap(v_platform)) end,
    v_author, '', 'support', case p_kind when 'review' then 'review' else 'social' end,
    v_platform, p_external_id, nullif(trim(coalesce(p_url, '')), ''),
    case when p_rating between 1 and 5 then p_rating end, coalesce(p_created_at, now()))
  on conflict (company_id, platform, external_id) where external_id is not null do update set contact_name = excluded.contact_name
  returning id into v_thread;
  insert into public.email_messages (thread_id, company_id, direction, body, external_id, created_at)
  values (v_thread, p_company, 'received', left(coalesce(nullif(trim(p_text), ''), '(No text)'), 10000),
    v_platform || ':' || p_external_id, coalesce(p_created_at, now()))
  returning id into v_message;
  insert into public.activity_events (company_id, type, summary)
  values (p_company, 'inbox', case p_kind when 'review' then format('New %s-star review from %s', coalesce(p_rating::text, '?'), v_author)
    else format('New comment from %s on %s', v_author, initcap(v_platform)) end);
  return v_message;
end;
$$;
revoke execute on function public.receive_listening_item(uuid, text, text, text, text, text, integer, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.receive_listening_item(uuid, text, text, text, text, text, integer, text, text, timestamptz)
  to service_role;

-- A public reply's text is what the claims check reads.
create or replace function private.approval_text(p_action public.approval_action, p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_action
    when 'publish_post' then p_payload ->> 'text'
    when 'send_email' then concat_ws(E'\n', p_payload ->> 'subject', p_payload ->> 'body')
    when 'reply_public' then p_payload ->> 'text'
    else ''
  end
$$;

create or replace function public.edit_approval(p_approval uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  a public.approvals;
  allowed text[];
  k text;
  merged jsonb;
begin
  select * into a from public.approvals where id = p_approval for update;
  if not found or not private.can_read_company(a.company_id) then
    raise exception 'Approval not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if not (private.can_edit_company(a.company_id) or private.can_oversee_company(a.company_id)) then
    raise exception 'You can''t edit this draft' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if a.status <> 'pending' then
    raise exception 'Only pending drafts can be edited' using errcode = 'P0001', hint = 'already_decided';
  end if;
  allowed := case a.action_type
    when 'publish_post' then array['text']
    when 'send_email' then array['subject', 'body']
    when 'reply_public' then array['text']
    else array[]::text[]
  end;
  if jsonb_typeof(p_changes) is distinct from 'object' then
    raise exception 'Nothing to change' using errcode = 'P0001', hint = 'invalid';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if not k = any(allowed) or jsonb_typeof(p_changes -> k) <> 'string' or length(trim(p_changes ->> k)) = 0 then
      raise exception 'You can only change the wording of this draft' using errcode = 'P0001', hint = 'invalid';
    end if;
  end loop;
  merged := a.payload || p_changes;
  update public.approvals
  set payload = merged, original_payload = coalesce(original_payload, a.payload)
  where id = a.id;
  -- Only drafts Sol wrote teach the voice (not ones the founder asked for and wrote).
  if a.run_id is not null and private.approval_text(a.action_type, a.payload) <> private.approval_text(a.action_type, merged) then
    insert into public.voice_edit_events (company_id, approval_id, channel, original, final, edited_by)
    values (a.company_id, a.id, case a.action_type when 'publish_post' then 'social_post'
      when 'reply_public' then case a.payload ->> 'kind' when 'review' then 'review_reply' else 'social_reply' end
      else 'email' end,
      private.approval_text(a.action_type, a.payload), private.approval_text(a.action_type, merged), me);
  end if;
  insert into public.activity_events (company_id, type, summary, actor_id, run_id)
  values (a.company_id, 'approval', 'Draft edited before review', me, a.run_id);
  return merged;
end;
$$;

-- Feedback requests.
create table public.feedback_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  -- Unguessable; the public feedback page is opened with it.
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  trigger text not null check (trigger in ('purchase', 'booking', 'manual')),
  status text not null default 'awaiting_approval' check (status in ('awaiting_approval', 'sent', 'responded', 'declined')),
  approval_id uuid references public.approvals (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index feedback_requests_company_id_idx on public.feedback_requests (company_id, created_at desc);
create index feedback_requests_contact_id_idx on public.feedback_requests (contact_id, created_at desc);
create index feedback_requests_approval_id_idx on public.feedback_requests (approval_id);
create index feedback_requests_created_by_idx on public.feedback_requests (created_by);

-- Feedback from a request joins what captures already record (Phase 12): a rating, and a
-- comment that may be empty.
alter table public.feedback
  add column rating smallint check (rating between 1 and 5),
  add column request_id uuid unique references public.feedback_requests (id) on delete set null,
  drop constraint feedback_source_check,
  add constraint feedback_source_check check (source in ('capture', 'email', 'review', 'social', 'form', 'request')),
  drop constraint feedback_body_check,
  add constraint feedback_body_check check (length(body) <= 5000 and (rating is not null or length(trim(body)) > 0));

alter table public.feedback_requests enable row level security;
revoke all on public.feedback_requests from anon, authenticated;
-- The token is a secret: founders and teammates see the requests, the token stays server-side.
grant select (id, company_id, contact_id, trigger, status, approval_id, created_at, responded_at)
  on public.feedback_requests to authenticated;
create policy "Founders and teammates read feedback requests" on public.feedback_requests
  for select to authenticated using (private.can_edit_company(company_id));


-- Makes the request and its email, which waits for a GO like any marketing email (the executor
-- adds the unsubscribe link and skips anyone who has opted out).
create function private.create_feedback_request(
  p_company uuid,
  p_contact uuid,
  p_trigger text,
  p_origin text,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ct public.contacts;
  co public.companies;
  v_request public.feedback_requests;
  v_approval uuid;
  v_link text;
begin
  select * into ct from public.contacts where id = p_contact and company_id = p_company;
  if not found then
    raise exception 'Contact not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_origin !~ '^https?://[^/\s]+$' then
    raise exception 'Feedback links need the app''s address' using errcode = 'P0001', hint = 'invalid';
  end if;
  -- PECR: only people who said yes to hearing from us.
  if not exists (select 1 from public.current_consents where contact_id = p_contact and purpose = 'marketing' and status = 'granted') then
    raise exception '% hasn''t opted in to emails from you, so Sol can''t ask for feedback', ct.name
      using errcode = 'P0001', hint = 'no_consent';
  end if;
  -- One request at a time, and no more than one every 90 days.
  if exists (select 1 from public.feedback_requests where contact_id = p_contact
    and (status = 'awaiting_approval' or created_at > now() - interval '90 days') and status <> 'declined') then
    raise exception 'You asked % for feedback recently', ct.name using errcode = 'P0001', hint = 'conflict';
  end if;
  select * into co from public.companies where id = p_company;
  insert into public.feedback_requests (company_id, contact_id, trigger, created_by)
  values (p_company, p_contact, p_trigger, p_actor)
  returning * into v_request;
  v_link := p_origin || '/fb/' || v_request.token;
  insert into public.approvals (company_id, action_type, payload, estimated_credits, requested_by)
  values (p_company, 'send_email', jsonb_build_object(
    'outreach', true, 'to', ct.email, 'subject', format('How did we do, %s?', split_part(ct.name, ' ', 1)),
    'body', format(E'Hello %s,\n\nThank you for choosing %s. Could you tell us how we did? It takes a minute:\n\n%s\n\nThank you.',
      split_part(ct.name, ' ', 1), co.name, v_link),
    'feedback_request_id', v_request.id,
    'reason', case p_trigger when 'manual' then 'You asked for feedback from this customer.'
      else format('A feedback request after a %s. They opted in to emails from you.', p_trigger) end),
    5, p_actor)
  returning id into v_approval;
  update public.feedback_requests set approval_id = v_approval where id = v_request.id;
  return v_request.id;
end;
$$;
revoke execute on function private.create_feedback_request(uuid, uuid, text, text, uuid) from public, anon, authenticated;

create function public.request_feedback(p_contact uuid, p_origin text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  v_company uuid := (select company_id from public.contacts where id = p_contact);
begin
  if v_company is null or not private.can_edit_company(v_company) then
    raise exception 'Contact not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  return private.create_feedback_request(v_company, p_contact, 'manual', p_origin, me);
end;
$$;
revoke execute on function public.request_feedback(uuid, text) from public, anon;
grant execute on function public.request_feedback(uuid, text) to authenticated;

-- The scheduler's daily pass: customers won, and bookings answered, a few days ago, for
-- companies that switched feedback requests on. Skips anyone without permission. Returns how many.
create function public.queue_due_feedback(p_origin text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select distinct on (d.contact_id) d.company_id, d.contact_id, d.trigger
    from (
      select l.company_id, l.contact_id, 'purchase' as trigger, l.updated_at as at, s.feedback_delay_days
      from public.leads l join public.listening_settings s on s.company_id = l.company_id
      where s.feedback_requests and l.status = 'won'
      union all
      select i.company_id, i.contact_id, 'booking', i.processed_at, s.feedback_delay_days
      from public.inbox_items i join public.listening_settings s on s.company_id = i.company_id
      where s.feedback_requests and i.category = 'booking' and i.status = 'sent' and i.contact_id is not null
    ) d
    where d.at <= now() - make_interval(days => d.feedback_delay_days)
      and d.at > now() - make_interval(days => d.feedback_delay_days + 14)
      and exists (select 1 from public.current_consents c where c.contact_id = d.contact_id and c.purpose = 'marketing' and c.status = 'granted')
      and not exists (select 1 from public.feedback_requests f where f.contact_id = d.contact_id
        and f.created_at > now() - interval '90 days')
    order by d.contact_id, d.at desc
  loop
    perform private.create_feedback_request(r.company_id, r.contact_id, r.trigger, p_origin, null);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.queue_due_feedback(text) from public, anon, authenticated;
grant execute on function public.queue_due_feedback(text) to service_role;

-- The request's email: sent marks it sent; a NO-GO declines it.
create function private.on_feedback_email_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payload ? 'feedback_request_id' then
    if new.status = 'declined' and old.status = 'pending' then
      update public.feedback_requests set status = 'declined' where id = private.try_uuid(new.payload ->> 'feedback_request_id');
    elsif new.execution_status = 'done' and old.execution_status is distinct from 'done' then
      update public.feedback_requests set status = 'sent'
      where id = private.try_uuid(new.payload ->> 'feedback_request_id') and status = 'awaiting_approval';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.on_feedback_email_decided() from public, anon, authenticated;
create trigger approvals_feedback_decided after update of status, execution_status on public.approvals
  for each row execute function private.on_feedback_email_decided();

-- The public feedback page (anyone with the link).
create function public.get_feedback_request(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('company', co.name, 'name', split_part(ct.name, ' ', 1), 'done', f.status = 'responded')
  from public.feedback_requests f
  join public.companies co on co.id = f.company_id
  join public.contacts ct on ct.id = f.contact_id
  where f.token = p_token and f.status in ('sent', 'responded', 'awaiting_approval')
$$;
revoke execute on function public.get_feedback_request(text) from public;
grant execute on function public.get_feedback_request(text) to anon, authenticated;

create function public.submit_feedback(p_token text, p_rating integer, p_comment text default '')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.feedback_requests;
  v_sentiment text := case when p_rating >= 4 then 'positive' when p_rating = 3 then 'neutral' else 'negative' end;
  v_name text;
begin
  select * into f from public.feedback_requests where token = p_token for update;
  if not found or f.status not in ('sent', 'awaiting_approval') then
    return false;
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose from 1 to 5 stars' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.feedback (company_id, contact_id, source, request_id, rating, body, sentiment)
  values (f.company_id, f.contact_id, 'request', f.id, p_rating, left(trim(coalesce(p_comment, '')), 2000), v_sentiment);
  update public.feedback_requests set status = 'responded', responded_at = now() where id = f.id;
  select name into v_name from public.contacts where id = f.contact_id;
  insert into public.activity_events (company_id, type, summary)
  values (f.company_id, 'feedback', format('%s gave %s stars', coalesce(v_name, 'A customer'), p_rating));
  -- Unhappy customers go straight to the founder.
  if v_sentiment = 'negative' then
    insert into public.chat_messages (company_id, sender, content)
    values (f.company_id, 'sol', format('%s gave %s stars%s. You may want to get in touch yourself.',
      coalesce(v_name, 'A customer'), p_rating,
      case when length(trim(coalesce(p_comment, ''))) > 0 then format(': "%s"', left(trim(p_comment), 300)) else '' end));
  end if;
  return true;
end;
$$;
revoke execute on function public.submit_feedback(text, integer, text) from public;
grant execute on function public.submit_feedback(text, integer, text) to anon, authenticated;

-- (feedback_requests has a column grant, so the app reloads it rather than streaming it.)
alter publication supabase_realtime add table public.feedback, public.listening_settings;
