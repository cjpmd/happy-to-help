-- Capture v2 (Phase 18, SPEC P): a meeting notetaker that joins the calls the founder chooses
-- from their calendar, and a company phone number whose calls are recorded after a spoken notice.
-- Both feed the Phase 12 pipeline (transcribe → extract → review card). Behind feature flags,
-- off by default, on mock providers until the platform sets up Recall.ai, Twilio, Google and
-- Microsoft (docs/HANDOFF.md 10 and 11). Mentors never see raw transcripts (Phase 12 rules).

-- New kinds of capture and how their participants knew they were recorded.
alter table public.captures
  drop constraint captures_source_check,
  add constraint captures_source_check check (source in ('voice_note', 'debrief', 'transcript', 'recording', 'notetaker', 'call')),
  drop constraint captures_consent_check,
  -- bot_announced: the notetaker joined by name and said it was recording; call_notice: the caller
  -- heard the recording notice before the call was connected.
  add constraint captures_consent_check check (consent in ('own_voice', 'participants_informed', 'platform_transcript', 'bot_announced', 'call_notice')),
  -- A provider's recording (a call), fetched by the agent service when it transcribes.
  add column external_audio_url text;

-- Contacts can have a phone number, so calls find the right person.
alter table public.contacts add column phone text check (phone is null or phone ~ '^\+[0-9]{8,15}$');
create index contacts_phone_idx on public.contacts (company_id, phone) where phone is not null;

-- Provider minutes are priced in USD like everything else, then converted to credits (rule 5).
alter table public.credit_config
  add column notetaker_usd_per_minute numeric(8, 4) not null default 0.0083,
  add column call_usd_per_minute numeric(8, 4) not null default 0.012;
-- A daily cap on recorded minutes (notetaker and calls together).
alter table public.capture_settings
  add column daily_minutes_cap integer not null default 120 check (daily_minutes_cap between 0 and 1440);

create function public.minutes_estimate(p_source text, p_duration_seconds integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select ceil(greatest(coalesce(p_duration_seconds, 0), 0) / 60.0)::integer * public.credits_for_usd(
    case p_source when 'notetaker' then c.notetaker_usd_per_minute when 'call' then c.call_usd_per_minute else 0 end)
  from public.credit_config c
$$;

revoke execute on function public.minutes_estimate(text, integer) from public, anon;
grant execute on function public.minutes_estimate(text, integer) to authenticated, service_role;

-- Minutes recorded today (UK time) by the notetaker and calls.
create function private.minutes_today(p_company uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(ceil(sum(duration_seconds) / 60.0), 0)::integer from public.captures
  where company_id = p_company and source in ('notetaker', 'call')
    and (created_at at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date
$$;
revoke execute on function private.minutes_today(uuid) from public, anon, authenticated;

-- Calendars and the meetings Sol may join -------------------------------------------------------
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft', 'mock')),
  account_email text not null default '',
  status text not null default 'connected' check (status in ('connected', 'revoked')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, user_id, provider)
);
create index calendar_connections_user_id_idx on public.calendar_connections (user_id);

-- OAuth refresh tokens: the service role only.
create table public.calendar_tokens (
  connection_id uuid primary key references public.calendar_connections (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  connection_id uuid not null references public.calendar_connections (id) on delete cascade,
  external_id text not null,
  -- The recurring series it belongs to, if any.
  series_id text,
  title text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  meeting_url text,
  attendees text[] not null default '{}',
  -- Off for every meeting until the founder opts in (SPEC P).
  record boolean not null default false,
  bot_status text not null default 'none' check (bot_status in ('none', 'scheduled', 'recording', 'done', 'failed', 'cancelled', 'skipped')),
  bot_id text,
  bot_note text,
  capture_id uuid references public.captures (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (connection_id, external_id),
  check (ends_at > starts_at)
);
create index calendar_events_company_idx on public.calendar_events (company_id, starts_at);
create index calendar_events_capture_id_idx on public.calendar_events (capture_id);

-- Recurring series the founder said Sol should always join.
create table public.notetaker_series (
  connection_id uuid not null references public.calendar_connections (id) on delete cascade,
  series_id text not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (connection_id, series_id)
);
create index notetaker_series_company_id_idx on public.notetaker_series (company_id);
create index notetaker_series_created_by_idx on public.notetaker_series (created_by);

-- Phone numbers and calls --------------------------------------------------------------------
create table public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  number text not null unique check (number ~ '^\+[0-9]{8,15}$'),
  provider text not null check (provider in ('twilio', 'mock')),
  -- Where calls ring (the founder's own phone). Without it, callers leave a message.
  forward_to text check (forward_to is null or forward_to ~ '^\+[0-9]{8,15}$'),
  recording_notice text not null default 'Hello, you''ve reached {company}. This call is recorded so we can follow up properly.'
    check (length(recording_notice) between 20 and 300),
  status text not null default 'active' check (status in ('active', 'released')),
  created_at timestamptz not null default now()
);

create table public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  phone_number_id uuid references public.phone_numbers (id) on delete set null,
  external_id text not null unique,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  from_number text not null,
  to_number text not null,
  contact_id uuid references public.contacts (id) on delete set null,
  status text not null default 'ringing' check (status in ('ringing', 'in_progress', 'completed', 'missed', 'failed')),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  -- Recorded only when the caller heard the notice and the daily cap allowed it.
  recorded boolean not null default false,
  capture_id uuid references public.captures (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index call_sessions_company_idx on public.call_sessions (company_id, started_at desc);
create index call_sessions_phone_number_id_idx on public.call_sessions (phone_number_id);
create index call_sessions_contact_id_idx on public.call_sessions (contact_id);
create index call_sessions_capture_id_idx on public.call_sessions (capture_id);

-- Access: who was in which meeting and who called are the people who run the company's business.
alter table public.calendar_connections enable row level security;
alter table public.calendar_tokens enable row level security;
alter table public.calendar_events enable row level security;
alter table public.notetaker_series enable row level security;
alter table public.phone_numbers enable row level security;
alter table public.call_sessions enable row level security;
revoke all on public.calendar_connections, public.calendar_tokens, public.calendar_events, public.notetaker_series,
  public.phone_numbers, public.call_sessions from anon, authenticated;
grant select on public.calendar_connections, public.calendar_events, public.notetaker_series, public.phone_numbers,
  public.call_sessions to authenticated;
create policy "Founders and teammates read calendar connections" on public.calendar_connections
  for select to authenticated using (private.can_edit_company(company_id));
create policy "Founders and teammates read meetings" on public.calendar_events
  for select to authenticated using (private.can_edit_company(company_id));
create policy "Founders and teammates read notetaker series" on public.notetaker_series
  for select to authenticated using (private.can_edit_company(company_id));
create policy "Read the company's phone number" on public.phone_numbers
  for select to authenticated using (private.can_read_company(company_id));
create policy "Founders and teammates read calls" on public.call_sessions
  for select to authenticated using (private.can_edit_company(company_id));

-- Opting meetings in and out -----------------------------------------------------------------
create function public.set_meeting_recording(p_event uuid, p_record boolean, p_series boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  e public.calendar_events;
  c public.calendar_connections;
begin
  select * into e from public.calendar_events where id = p_event;
  select * into c from public.calendar_connections where id = e.connection_id;
  if not found or not (c.user_id = me or private.is_company_founder(e.company_id)) then
    raise exception 'Only the calendar''s owner or a founder can choose this' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_record and e.meeting_url is null then
    raise exception 'This meeting has no video call link for Sol to join' using errcode = 'P0001', hint = 'invalid';
  end if;
  if p_series and e.series_id is not null then
    if p_record then
      insert into public.notetaker_series (connection_id, series_id, company_id, created_by)
      values (e.connection_id, e.series_id, e.company_id, me) on conflict do nothing;
    else
      delete from public.notetaker_series where connection_id = e.connection_id and series_id = e.series_id;
    end if;
    update public.calendar_events set record = p_record
    where connection_id = e.connection_id and series_id = e.series_id and starts_at >= now()
      and (not p_record or meeting_url is not null);
  else
    update public.calendar_events set record = p_record where id = p_event;
  end if;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (e.company_id, 'run', format('Notetaker %s for %s%s', case when p_record then 'on' else 'off' end,
    left(e.title, 120), case when p_series and e.series_id is not null then ' (every time)' else '' end), me);
end;
$$;

-- A demo calendar for trying the notetaker before a real one is connected.
create function public.connect_mock_calendar(p_company uuid)
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
    raise exception 'Only founders and teammates can connect a calendar' using errcode = 'P0001', hint = 'forbidden';
  end if;
  insert into public.calendar_connections (company_id, user_id, provider, account_email)
  values (p_company, me, 'mock', 'demo calendar')
  on conflict (company_id, user_id, provider) do update set status = 'connected'
  returning id into v_id;
  return v_id;
end;
$$;

create function public.disconnect_calendar(p_connection uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  c public.calendar_connections;
begin
  select * into c from public.calendar_connections where id = p_connection;
  if not found or not (c.user_id = me or private.is_company_founder(c.company_id)) then
    raise exception 'Only the calendar''s owner or a founder can disconnect it' using errcode = 'P0001', hint = 'forbidden';
  end if;
  update public.calendar_connections set status = 'revoked' where id = p_connection;
  -- Sol joins nothing more from it; scheduled bots are cancelled by the agent service.
  update public.calendar_events set record = false where connection_id = p_connection and starts_at >= now();
  delete from public.calendar_tokens where connection_id = p_connection;
  delete from public.notetaker_series where connection_id = p_connection;
end;
$$;

-- A number in Ofcom's range for drama (07700 900000–900999), so it can never ring a real person.
create function public.add_mock_phone_number(p_company uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text := '+447700900' || lpad((floor(random() * 1000))::integer::text, 3, '0');
begin
  perform private.require_signed_in();
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can add a phone number' using errcode = 'P0001', hint = 'forbidden';
  end if;
  insert into public.phone_numbers (company_id, number, provider) values (p_company, v_number, 'mock')
  on conflict (company_id) do nothing;
  return (select number from public.phone_numbers where company_id = p_company);
end;
$$;

create function public.update_phone_settings(p_company uuid, p_forward_to text default null, p_recording_notice text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  v_notice text := nullif(trim(coalesce(p_recording_notice, '')), '');
begin
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can change the phone settings' using errcode = 'P0001', hint = 'forbidden';
  end if;
  -- No silent recording: the notice must say the call is recorded.
  if v_notice is not null and v_notice !~* 'record' then
    raise exception 'The notice must tell callers the call is recorded' using errcode = 'P0001', hint = 'invalid';
  end if;
  update public.phone_numbers set
    forward_to = case when p_forward_to is null then forward_to else nullif(regexp_replace(p_forward_to, '[\s()-]', '', 'g'), '') end,
    recording_notice = coalesce(v_notice, recording_notice)
  where company_id = p_company;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (p_company, 'settings', 'Phone settings changed', me);
end;
$$;

create function public.update_minutes_cap(p_company uuid, p_cap integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_signed_in();
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can change the daily minutes' using errcode = 'P0001', hint = 'forbidden';
  end if;
  insert into public.capture_settings (company_id, daily_minutes_cap) values (p_company, p_cap)
  on conflict (company_id) do update set daily_minutes_cap = excluded.daily_minutes_cap, updated_at = now();
end;
$$;

revoke execute on function public.set_meeting_recording(uuid, boolean, boolean), public.connect_mock_calendar(uuid),
  public.disconnect_calendar(uuid), public.add_mock_phone_number(uuid), public.update_phone_settings(uuid, text, text),
  public.update_minutes_cap(uuid, integer) from public, anon;
grant execute on function public.set_meeting_recording(uuid, boolean, boolean), public.connect_mock_calendar(uuid),
  public.disconnect_calendar(uuid), public.add_mock_phone_number(uuid), public.update_phone_settings(uuid, text, text),
  public.update_minutes_cap(uuid, integer) to authenticated;

-- Service role: what providers report ----------------------------------------------------------

-- Is there room today for this many more recorded minutes?
create function public.minutes_left_today(p_company uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(coalesce((select daily_minutes_cap from public.capture_settings where company_id = p_company), 120)
    - private.minutes_today(p_company), 0)
$$;

-- A finished notetaker recording: the capture, its transcript and the processing job.
create function public.create_notetaker_capture(p_event uuid, p_duration_seconds integer, p_text text, p_segments jsonb default '[]')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.calendar_events;
  v_id uuid;
  v_job uuid;
  v_estimate integer;
begin
  select * into e from public.calendar_events where id = p_event for update;
  if not found then
    raise exception 'Meeting not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if e.capture_id is not null then
    return e.capture_id;
  end if;
  insert into public.captures (company_id, source, title, participants, consent, status, duration_seconds, created_by)
  values (e.company_id, 'notetaker', left(e.title, 200), e.attendees[1:50], 'bot_announced', 'extracting',
    greatest(least(p_duration_seconds, 14400), 1),
    (select user_id from public.calendar_connections where id = e.connection_id))
  returning id into v_id;
  insert into public.transcripts (capture_id, company_id, text, segments, provider)
  values (v_id, e.company_id, left(coalesce(nullif(trim(p_text), ''), '(Nothing was said)'), 200000), coalesce(p_segments, '[]'), 'notetaker');
  v_estimate := public.capture_estimate(null) + public.minutes_estimate('notetaker', p_duration_seconds);
  insert into public.agent_jobs (company_id, job_type, payload, estimated_credits)
  values (e.company_id, 'capture_process', jsonb_build_object('capture_id', v_id, 'title', 'Read your meeting'), v_estimate)
  returning id into v_job;
  update public.captures set job_id = v_job where id = v_id;
  update public.calendar_events set capture_id = v_id, bot_status = 'done' where id = p_event;
  insert into public.activity_events (company_id, type, summary)
  values (e.company_id, 'run', format('Notetaker recorded %s', left(e.title, 120)));
  return v_id;
end;
$$;

-- Calls, as the telephony webhook reports them. Idempotent on the provider's call id. Finds or
-- adds the caller as a contact; a finished recording becomes a capture.
create function public.record_call(
  p_external_id text,
  p_to text,
  p_from text,
  p_status text,
  p_duration_seconds integer default null,
  p_recording_url text default null,
  p_recorded boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.phone_numbers;
  s public.call_sessions;
  v_contact uuid;
  v_capture uuid;
  v_job uuid;
  v_from text := regexp_replace(coalesce(p_from, ''), '[^0-9+]', '', 'g');
begin
  select * into n from public.phone_numbers where number = regexp_replace(coalesce(p_to, ''), '[^0-9+]', '', 'g') and status = 'active';
  if not found then
    raise exception 'Unknown number' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_status not in ('ringing', 'in_progress', 'completed', 'missed', 'failed') then
    raise exception 'Unknown call status' using errcode = 'P0001', hint = 'invalid';
  end if;
  select * into s from public.call_sessions where external_id = p_external_id for update;
  if not found then
    select id into v_contact from public.contacts where company_id = n.company_id and phone = v_from limit 1;
    if v_contact is null and v_from ~ '^\+[0-9]{8,15}$' then
      insert into public.contacts (company_id, name, kind, phone, value, last_contact_at)
      values (n.company_id, 'Caller ' || v_from, 'lead', v_from, 'Phone call', now())
      returning id into v_contact;
    end if;
    insert into public.call_sessions (company_id, phone_number_id, external_id, from_number, to_number, contact_id, status, recorded)
    values (n.company_id, n.id, p_external_id, v_from, n.number, v_contact, p_status, coalesce(p_recorded, false))
    returning * into s;
    insert into public.activity_events (company_id, type, summary)
    values (n.company_id, 'inbox', format('Call from %s', coalesce((select name from public.contacts where id = v_contact), v_from)));
  else
    update public.call_sessions set
      status = case when status = 'completed' then status else p_status end,
      duration_seconds = coalesce(p_duration_seconds, duration_seconds),
      recorded = coalesce(p_recorded, recorded),
      ended_at = case when p_status in ('completed', 'missed', 'failed') then coalesce(ended_at, now()) else ended_at end
    where id = s.id
    returning * into s;
  end if;
  if s.contact_id is not null then
    update public.contacts set last_contact_at = now() where id = s.contact_id;
  end if;
  -- A recording of a call where the caller heard the notice: transcribe and extract it.
  if p_recording_url is not null and s.recorded and s.capture_id is null and coalesce(p_duration_seconds, s.duration_seconds, 0) > 0 then
    insert into public.captures (company_id, source, title, participants, consent, status, duration_seconds, external_audio_url)
    values (s.company_id, 'call', format('Call with %s', coalesce((select name from public.contacts where id = s.contact_id), s.from_number)),
      array[coalesce((select name from public.contacts where id = s.contact_id), s.from_number)], 'call_notice', 'transcribing',
      least(coalesce(p_duration_seconds, s.duration_seconds), 14400), p_recording_url)
    returning id into v_capture;
    insert into public.agent_jobs (company_id, job_type, payload, estimated_credits)
    values (s.company_id, 'capture_process', jsonb_build_object('capture_id', v_capture, 'title', 'Read your call'),
      public.capture_estimate(coalesce(p_duration_seconds, s.duration_seconds)) + public.minutes_estimate('call', coalesce(p_duration_seconds, s.duration_seconds)))
    returning id into v_job;
    update public.captures set job_id = v_job where id = v_capture;
    update public.call_sessions set capture_id = v_capture where id = s.id;
  end if;
  return s.id;
end;
$$;

-- What the webhook needs to answer a call: the notice to play, where to ring, and whether
-- there's room in today's recorded minutes.
create function public.call_routing(p_to text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('company_id', n.company_id, 'company', co.name,
    'notice', replace(n.recording_notice, '{company}', co.name), 'forward_to', n.forward_to,
    'minutes_left', public.minutes_left_today(n.company_id))
  from public.phone_numbers n join public.companies co on co.id = n.company_id
  where n.number = regexp_replace(coalesce(p_to, ''), '[^0-9+]', '', 'g') and n.status = 'active'
$$;

revoke execute on function public.minutes_left_today(uuid), public.create_notetaker_capture(uuid, integer, text, jsonb),
  public.record_call(text, text, text, text, integer, text, boolean), public.call_routing(text)
  from public, anon, authenticated;
grant execute on function public.minutes_left_today(uuid), public.create_notetaker_capture(uuid, integer, text, jsonb),
  public.record_call(text, text, text, text, integer, text, boolean), public.call_routing(text)
  to service_role;

alter publication supabase_realtime add table public.calendar_events, public.call_sessions;
