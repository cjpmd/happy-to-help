-- Customers: the inbox pipeline and contacts (Phase 14, SPEC part I). Every message that comes in
-- (email, lead forms, the hub page) becomes an inbox item. If the company has set a daily inbox
-- budget, Sol triages it with the small model, looks up the response policy, drafts a reply with
-- the mid-tier model in the company's voice, runs the claims check, and then sends (where the
-- policy and its hard rules allow), queues it for approval, or escalates. Contact imports now
-- check consent: no lawful basis means "service only" and a Stay legal task.

-- Inbox processing spends credits on its own, so it's off (budget 0) until a founder sets one.
alter table public.response_settings
  add column inbox_daily_cap integer not null default 0 check (inbox_daily_cap between 0 and 5000);

drop function public.update_response_settings(uuid, text, boolean, boolean);
create function public.update_response_settings(
  p_company uuid,
  p_disclosure_text text default null,
  p_disclosure_on_approved boolean default null,
  p_mark_reviewed boolean default false,
  p_inbox_daily_cap integer default null
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
    raise exception 'Only a founder can change reply settings' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_disclosure_text is not null and length(trim(p_disclosure_text)) < 3 then
    raise exception 'The disclosure can be reworded but not removed' using errcode = 'P0001', hint = 'invalid';
  end if;
  if p_inbox_daily_cap is not null and p_inbox_daily_cap not between 0 and 5000 then
    raise exception 'The daily inbox budget must be between 0 and 5,000 credits' using errcode = 'P0001', hint = 'invalid';
  end if;
  update public.response_settings
  set disclosure_text = coalesce(nullif(trim(p_disclosure_text), ''), disclosure_text),
      disclosure_on_approved = coalesce(p_disclosure_on_approved, disclosure_on_approved),
      policy_reviewed_at = case when p_mark_reviewed then now() else policy_reviewed_at end,
      policy_reviewed_by = case when p_mark_reviewed then me else policy_reviewed_by end,
      inbox_daily_cap = coalesce(p_inbox_daily_cap, inbox_daily_cap),
      updated_at = now()
  where company_id = p_company;
end;
$$;
revoke execute on function public.update_response_settings(uuid, text, boolean, boolean, integer) from public, anon;
grant execute on function public.update_response_settings(uuid, text, boolean, boolean, integer) to authenticated;

insert into public.job_types (job_type, label, pillar, tier, estimate_credits, cap_credits) values
  ('inbox_triage', 'Triage a message', 'run', 'routine', 5, 15),
  ('inbox_draft', 'Draft a reply', 'run', 'planning', 15, 45)
on conflict (job_type) do nothing;

-- One item per message received, and what happened to it.
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  message_id uuid not null unique references public.email_messages (id) on delete cascade,
  channel text not null default 'email' check (channel in ('email', 'form', 'hub', 'social', 'review')),
  contact_id uuid references public.contacts (id) on delete set null,
  status text not null default 'new' check (status in (
    'new', 'waiting_for_budget', 'triaging', 'drafting', 'awaiting_approval', 'sent', 'escalated', 'spam', 'closed')),
  -- From triage (SPEC I): category, sentiment, urgency, language and the flags that force escalation.
  category text,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  urgency text check (urgency in ('low', 'normal', 'high')),
  language text,
  flags jsonb not null default '{}' check (jsonb_typeof(flags) = 'object'),
  -- What the policy (and its hard rules) said to do.
  mode public.response_mode,
  reason text,
  approval_id uuid references public.approvals (id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index inbox_items_company_status_idx on public.inbox_items (company_id, status, created_at);
create index inbox_items_thread_id_idx on public.inbox_items (thread_id);
create index inbox_items_contact_id_idx on public.inbox_items (contact_id);
create index inbox_items_approval_id_idx on public.inbox_items (approval_id);

-- Every received message (inbound email, a lead form, the hub page) becomes an inbox item.
create function private.on_message_received()
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
    case when new.provider_message_id is null then 'form' else 'email' end,
    (select c.id from public.contacts c where c.company_id = new.company_id and lower(c.email) = lower(t.address) limit 1))
  on conflict (message_id) do nothing;
  return new;
end;
$$;
revoke execute on function private.on_message_received() from public, anon, authenticated;
create trigger email_messages_inbox after insert on public.email_messages
  for each row execute function private.on_message_received();

alter table public.inbox_items enable row level security;
revoke all on public.inbox_items from anon, authenticated;
grant select on public.inbox_items to authenticated;
create policy "Founders and teammates read the inbox" on public.inbox_items
  for select to authenticated using (private.can_edit_company(company_id));

-- A NO-GO on Sol's reply closes the item (the founder will answer it themselves, or not).
create function private.on_inbox_reply_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'declined' and old.status = 'pending' and new.payload ? 'inbox_item_id' then
    update public.inbox_items set status = 'closed', processed_at = now()
    where id = private.try_uuid(new.payload ->> 'inbox_item_id');
  end if;
  return new;
end;
$$;
revoke execute on function private.on_inbox_reply_decided() from public, anon, authenticated;
create trigger approvals_inbox_reply_decided after update of status on public.approvals
  for each row execute function private.on_inbox_reply_decided();

-- Inbound email records the sender before the message, so its inbox item links to the contact.
create or replace function public.receive_inbound_email(
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
  -- The contact first, so the inbox item made with the message is linked to them (Phase 14).
  if not exists (select 1 from public.contacts where company_id = p_company and lower(email) = v_email) then
    insert into public.contacts (company_id, name, email, kind, value, source, last_contact_at)
    values (p_company, left(coalesce(nullif(trim(p_from_name), ''), split_part(v_email, '@', 1)), 120), v_email, 'lead', left(v_subject, 120), 'email', now());
  else
    update public.contacts set last_contact_at = now() where company_id = p_company and lower(email) = v_email;
  end if;
  insert into public.email_messages (thread_id, company_id, direction, body, provider_message_id)
  values (v_thread, p_company, 'received', left(coalesce(nullif(trim(p_body), ''), '(No message)'), 50000), p_message_id);
  insert into public.activity_events (company_id, type, summary)
  values (p_company, 'inbox', format('Email from %s: %s', coalesce(nullif(trim(p_from_name), ''), v_email), left(v_subject, 120)));
  return v_thread;
end;
$$;

-- Process one item now, whatever the daily budget (a person's choice to spend).
create function public.process_inbox_item(p_item uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  it public.inbox_items;
  est integer := (select estimate_credits from public.job_types where job_type = 'inbox_triage');
  v_job uuid;
begin
  select * into it from public.inbox_items where id = p_item for update;
  if not found or not private.can_edit_company(it.company_id) then
    raise exception 'Message not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if it.status not in ('new', 'waiting_for_budget') then
    raise exception 'Sol has already looked at this one' using errcode = 'P0001', hint = 'conflict';
  end if;
  if private.company_balance(it.company_id) + coalesce(private.cohort_headroom(it.company_id), 0) < est then
    raise exception 'Not enough credits: this needs about % credits.', est using errcode = 'P0001', hint = 'insufficient_credits';
  end if;
  insert into public.agent_jobs (company_id, job_type, payload, estimated_credits, created_by)
  values (it.company_id, 'inbox_triage', jsonb_build_object('item_id', it.id, 'title', 'Triage a message', 'manual', true), est, me)
  returning id into v_job;
  update public.inbox_items set status = 'triaging' where id = p_item;
  return v_job;
end;
$$;

create function public.close_inbox_item(p_item uuid, p_status text default 'closed')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  co uuid;
begin
  perform private.require_signed_in();
  select company_id into co from public.inbox_items where id = p_item;
  if co is null or not private.can_edit_company(co) then
    raise exception 'Message not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_status not in ('closed', 'spam') then
    raise exception 'Close it or mark it as spam' using errcode = 'P0001', hint = 'invalid';
  end if;
  update public.inbox_items set status = p_status, processed_at = now() where id = p_item;
end;
$$;

-- Consent-checked contact import ---------------------------------------------------------------

-- Like import_contacts, plus each row's marketing permission: "consent" with evidence (when or
-- where they opted in) records it; "soft_opt_in" only if the founder confirmed the conditions
-- (existing customers, similar products, a chance to opt out each time); anything else is
-- service only. Service-only contacts raise a Stay legal task saying why.
create function public.import_contacts_checked(p_company uuid, p_rows jsonb, p_soft_opt_in_confirmed boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  r jsonb;
  v_email text;
  v_id uuid;
  added integer := 0;
  consented integer := 0;
  soft integer := 0;
  service_only integer := 0;
  basis text;
begin
  if not private.can_edit_company(p_company) then
    raise exception 'Only founders and teammates can import contacts' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import up to 5,000 contacts at a time' using errcode = 'P0001', hint = 'invalid';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_email := lower(trim(coalesce(r ->> 'email', '')));
    continue when v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    continue when exists (select 1 from public.contacts c where c.company_id = p_company and lower(c.email) = v_email);
    insert into public.contacts (company_id, name, email, kind, value, source)
    values (p_company, left(coalesce(nullif(trim(r ->> 'name'), ''), split_part(v_email, '@', 1)), 120), v_email,
      case when r ->> 'kind' = 'customer' then 'customer' else 'lead' end::public.contact_kind,
      left(coalesce(r ->> 'value', ''), 200), 'import')
    returning id into v_id;
    added := added + 1;
    basis := case
      when r ->> 'consent' = 'consent' and coalesce(nullif(trim(r ->> 'consent_evidence'), ''), '') <> '' then 'consent'
      when r ->> 'consent' = 'soft_opt_in' and p_soft_opt_in_confirmed and r ->> 'kind' = 'customer' then 'soft_opt_in'
    end;
    if basis is not null then
      insert into public.consents (company_id, contact_id, purpose, status, lawful_basis, wording, source, evidence, recorded_by)
      values (p_company, v_id, 'marketing', 'granted', basis,
        case basis when 'consent' then 'Opted in before import' else 'Soft opt-in: existing customer, similar products, opt-out offered' end,
        'import', jsonb_build_object('evidence', left(coalesce(r ->> 'consent_evidence', ''), 300)), me);
      if basis = 'consent' then consented := consented + 1; else soft := soft + 1; end if;
    else
      insert into public.consents (company_id, contact_id, purpose, status, wording, source, recorded_by)
      values (p_company, v_id, 'marketing', 'not_given', 'No marketing permission on import', 'import', me);
      service_only := service_only + 1;
    end if;
  end loop;
  if service_only > 0 then
    insert into public.compliance_items (company_id, title, category, due_date, status, source)
    values (p_company,
      format('%s imported %s can''t be sent marketing', service_only, case when service_only = 1 then 'contact' else 'contacts' end),
      'Data protection', current_date + 14, 'upcoming', 'sol');
    insert into public.activity_events (company_id, type, summary, actor_id)
    values (p_company, 'legal', format('%s imported contacts have no marketing permission: service messages only. Ask them to opt in, or confirm a soft opt-in applies.', service_only), me);
  end if;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (p_company, 'run', format('Imported %s contacts', added), me);
  return jsonb_build_object('added', added, 'consent', consented, 'soft_opt_in', soft, 'service_only', service_only);
end;
$$;

revoke execute on function public.process_inbox_item(uuid), public.close_inbox_item(uuid, text),
  public.import_contacts_checked(uuid, jsonb, boolean) from public, anon;
grant execute on function public.process_inbox_item(uuid), public.close_inbox_item(uuid, text),
  public.import_contacts_checked(uuid, jsonb, boolean) to authenticated;

-- Existing received messages become inbox items too (already answered ones are closed).
insert into public.inbox_items (company_id, thread_id, message_id, channel, contact_id, status)
select m.company_id, m.thread_id, m.id, 'email',
  (select c.id from public.contacts c where c.company_id = m.company_id and lower(c.email) = lower(t.address) limit 1),
  case when exists (select 1 from public.email_messages s where s.thread_id = m.thread_id and s.direction = 'sent' and s.created_at > m.created_at)
    then 'closed' else 'new' end
from public.email_messages m join public.email_threads t on t.id = m.thread_id
where m.direction = 'received'
on conflict (message_id) do nothing;

alter publication supabase_realtime add table public.inbox_items;
