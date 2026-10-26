-- Capture from conversation, v1 (Phase 12, SPEC part P): voice notes, debriefs, pasted
-- transcripts and uploaded recordings. A capture is transcribed (if it's audio), Sol extracts
-- items, and nothing is created until the founder accepts it on the review card.
-- Raw captures and transcripts are for founders and teammates only: mentors see just the
-- accepted actions and decisions a founder chooses to share.

-- Settings ------------------------------------------------------------------------------------

-- Transcription is priced per minute in USD, converted to credits like everything else.
alter table public.credit_config
  add column transcription_usd_per_minute numeric(8, 4) not null default 0.01
    check (transcription_usd_per_minute >= 0);
grant update (transcription_usd_per_minute) on public.credit_config to service_role;

create table public.capture_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  -- 0 deletes audio as soon as it's transcribed (the default).
  keep_audio_days integer not null default 0 check (keep_audio_days between 0 and 90),
  -- Accept complete, confident items from the founder's own voice notes without a review.
  auto_accept_own_notes boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Captures and transcripts ----------------------------------------------------------------------

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  source text not null check (source in ('voice_note', 'debrief', 'transcript', 'recording')),
  title text not null default '' check (length(title) <= 200),
  participants text[] not null default '{}' check (cardinality(participants) <= 50),
  -- own_voice: the founder talking to Sol; participants_informed: the founder confirmed everyone
  -- knew it was recorded; platform_transcript: Zoom, Meet or Teams made it with their notice.
  consent text not null check (consent in ('own_voice', 'participants_informed', 'platform_transcript')),
  status text not null default 'extracting'
    check (status in ('transcribing', 'extracting', 'review', 'done', 'failed')),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 14400),
  -- Audio in the private "captures" storage bucket, deleted after transcription by default.
  audio_path text,
  audio_delete_after timestamptz,
  audio_deleted_at timestamptz,
  error text,
  job_id uuid references public.agent_jobs (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index captures_company_id_idx on public.captures (company_id, created_at desc);
create index captures_job_id_idx on public.captures (job_id);
create index captures_created_by_idx on public.captures (created_by);

create table public.transcripts (
  capture_id uuid primary key references public.captures (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  text text not null check (length(text) between 1 and 200000),
  -- [{ "speaker": "S1", "start": 0.0, "end": 4.2, "text": "..." }]
  segments jsonb not null default '[]' check (jsonb_typeof(segments) = 'array'),
  -- typed, pasted, mock, or the transcription provider's name.
  provider text not null,
  created_at timestamptz not null default now()
);
create index transcripts_company_id_idx on public.transcripts (company_id);

-- What Sol extracted, waiting for the founder's review.
create table public.extracted_items (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in (
    'decision', 'action', 'idea', 'question', 'commitment', 'feedback', 'memory_fact', 'claim')),
  text text not null check (length(trim(text)) between 1 and 1000),
  owner text check (owner in ('sol', 'founder', 'teammate', 'unknown')),
  owner_id uuid references public.profiles (id) on delete set null,
  owner_name text,
  due_date date,
  department public.pillar,
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  contact_name text,
  contact_id uuid references public.contacts (id) on delete set null,
  -- An existing task this updates instead of creating a duplicate.
  match_task_id uuid references public.tasks (id) on delete set null,
  sensitive boolean not null default false,
  -- The words it came from, and where in the recording (for the audit trail).
  quote text,
  at_seconds integer check (at_seconds is null or at_seconds >= 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  -- Founders choose which accepted actions and decisions their cohort mentors see.
  shared boolean not null default false check (not shared or (status = 'accepted' and kind in ('action', 'decision'))),
  -- Where an accepted item went: { "task_id": ..., "job_id": ..., "idea_id": ... }.
  routed jsonb not null default '{}' check (jsonb_typeof(routed) = 'object'),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index extracted_items_capture_id_idx on public.extracted_items (capture_id);
create index extracted_items_company_id_idx on public.extracted_items (company_id, status);
create index extracted_items_owner_id_idx on public.extracted_items (owner_id);
create index extracted_items_contact_id_idx on public.extracted_items (contact_id);
create index extracted_items_match_task_id_idx on public.extracted_items (match_task_id);
create index extracted_items_decided_by_idx on public.extracted_items (decided_by);
create index extracted_items_run_id_idx on public.extracted_items (run_id);

-- Where accepted items go ---------------------------------------------------------------------

alter table public.tasks
  add column assignee_id uuid references public.profiles (id) on delete set null,
  add column source_item_id uuid references public.extracted_items (id) on delete set null;
create index tasks_assignee_id_idx on public.tasks (assignee_id);
create index tasks_source_item_id_idx on public.tasks (source_item_id);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 1000),
  -- Start up companies test ideas before building them: an idea becomes a hypothesis.
  status text not null default 'inbox' check (status in ('inbox', 'hypothesis', 'parked', 'done')),
  evidence_plan text,
  evidence_item_id uuid references public.evidence_items (id) on delete set null,
  source_item_id uuid references public.extracted_items (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ideas_company_id_idx on public.ideas (company_id);
create index ideas_evidence_item_id_idx on public.ideas (evidence_item_id);
create index ideas_source_item_id_idx on public.ideas (source_item_id);
create index ideas_created_by_idx on public.ideas (created_by);
create trigger ideas_updated_at before update on public.ideas
  for each row execute function private.set_updated_at();

-- Promises to people outside the company ("I'll send the deck Friday").
create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  to_name text not null check (length(trim(to_name)) between 1 and 200),
  contact_id uuid references public.contacts (id) on delete set null,
  what text not null check (length(trim(what)) between 1 and 1000),
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  -- Sol's follow-up in the company voice: an email approval when the contact has an address,
  -- otherwise the text for the founder to send.
  followup_draft text,
  followup_approval_id uuid references public.approvals (id) on delete set null,
  source_item_id uuid references public.extracted_items (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index commitments_company_id_idx on public.commitments (company_id, status, due_date);
create index commitments_contact_id_idx on public.commitments (contact_id);
create index commitments_followup_approval_id_idx on public.commitments (followup_approval_id);
create index commitments_source_item_id_idx on public.commitments (source_item_id);
create index commitments_created_by_idx on public.commitments (created_by);

-- Customer feedback (Phase 16 adds reviews, social and feedback requests).
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  source text not null check (source in ('capture', 'email', 'review', 'social', 'form')),
  body text not null check (length(trim(body)) between 1 and 5000),
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  theme text,
  capture_id uuid references public.captures (id) on delete set null,
  created_at timestamptz not null default now()
);
create index feedback_company_id_idx on public.feedback (company_id, created_at desc);
create index feedback_contact_id_idx on public.feedback (contact_id);
create index feedback_capture_id_idx on public.feedback (capture_id);

-- Facts the founder approved for Sol to remember; part of the company memory.
create table public.memory_facts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  fact text not null check (length(trim(fact)) between 1 and 500),
  source_item_id uuid references public.extracted_items (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index memory_facts_company_id_idx on public.memory_facts (company_id);
create index memory_facts_source_item_id_idx on public.memory_facts (source_item_id);
create index memory_facts_approved_by_idx on public.memory_facts (approved_by);

-- New jobs: processing a capture (transcribe if needed, then extract) and drafting a promised
-- follow-up. SPEC M: extraction uses the mid-tier model.
insert into public.job_types (job_type, label, pillar, tier, estimate_credits, cap_credits) values
  ('capture_process', 'Read a meeting or note', 'run', 'planning', 40, 200),
  ('commitment_followup', 'Draft a promised follow-up', 'run', 'routine', 20, 60);

-- Access -------------------------------------------------------------------------------------

alter table public.capture_settings enable row level security;
revoke all on public.capture_settings from anon, authenticated;
grant select on public.capture_settings to authenticated;
create policy "Read capture settings for companies you can read" on public.capture_settings
  for select to authenticated using (private.can_read_company(company_id));

alter table public.captures enable row level security;
revoke all on public.captures from anon, authenticated;
grant select on public.captures to authenticated;
create policy "Founders and teammates read captures" on public.captures
  for select to authenticated using (private.can_edit_company(company_id));

alter table public.transcripts enable row level security;
revoke all on public.transcripts from anon, authenticated;
grant select on public.transcripts to authenticated;
create policy "Founders and teammates read transcripts" on public.transcripts
  for select to authenticated using (private.can_edit_company(company_id));

alter table public.extracted_items enable row level security;
revoke all on public.extracted_items from anon, authenticated;
grant select on public.extracted_items to authenticated;
create policy "Founders and teammates read items; mentors read what's shared" on public.extracted_items
  for select to authenticated using (
    private.can_edit_company(company_id)
    or (shared and status = 'accepted' and kind in ('action', 'decision') and private.can_read_company(company_id))
  );

alter table public.ideas enable row level security;
revoke all on public.ideas from anon, authenticated;
grant select on public.ideas to authenticated;
create policy "Founders and teammates read ideas" on public.ideas
  for select to authenticated using (private.can_edit_company(company_id));

alter table public.commitments enable row level security;
revoke all on public.commitments from anon, authenticated;
grant select on public.commitments to authenticated;
create policy "Founders and teammates read commitments" on public.commitments
  for select to authenticated using (private.can_edit_company(company_id));

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
create policy "Founders and teammates read feedback" on public.feedback
  for select to authenticated using (private.can_edit_company(company_id));

alter table public.memory_facts enable row level security;
revoke all on public.memory_facts from anon, authenticated;
grant select on public.memory_facts to authenticated;
create policy "Read memory for companies you can read" on public.memory_facts
  for select to authenticated using (private.can_read_company(company_id));

-- Audio storage: founders and teammates upload into their company's folder; only the service
-- role reads or deletes (the worker transcribes, then deletes). Skipped where there's no
-- storage schema (plain Postgres in scripts/db/test-local.sh).
create function private.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('captures', 'captures', false, 104857600, array[
      'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav',
      'audio/webm', 'audio/ogg', 'video/mp4', 'video/webm'])
    on conflict (id) do nothing;
    execute $p$
      create policy "Founders and teammates upload capture audio" on storage.objects
        for insert to authenticated
        with check (bucket_id = 'captures'
          and private.can_edit_company(private.try_uuid((storage.foldername(name))[1])))
    $p$;
  end if;
end;
$$;

-- RPCs ---------------------------------------------------------------------------------------

-- Starts a capture: text (typed note, debrief or pasted transcript) or uploaded audio. Checks
-- credits for transcription plus extraction and queues the processing job.
create function public.create_capture(
  p_company uuid,
  p_source text,
  p_consent text,
  p_title text default '',
  p_text text default null,
  p_audio_path text default null,
  p_duration_seconds integer default null,
  p_participants text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  per_minute integer;
  estimate integer;
  v_id uuid;
  v_job uuid;
  has_text boolean := length(trim(coalesce(p_text, ''))) > 0;
begin
  if not private.can_edit_company(p_company) then
    raise exception 'Only founders and teammates can add notes and meetings' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_source not in ('voice_note', 'debrief', 'transcript', 'recording') then
    raise exception 'Unknown kind of capture' using errcode = 'P0001', hint = 'invalid';
  end if;
  if has_text = (p_audio_path is not null) then
    raise exception 'Add either the text or a recording' using errcode = 'P0001', hint = 'invalid';
  end if;
  if has_text and length(p_text) > 200000 then
    raise exception 'That transcript is too long (200,000 characters at most)' using errcode = 'P0001', hint = 'invalid';
  end if;
  if p_audio_path is not null and (p_audio_path not like p_company::text || '/%' or p_duration_seconds is null) then
    raise exception 'The recording must be uploaded to your company''s folder, with its length' using errcode = 'P0001', hint = 'invalid';
  end if;
  -- No silent recording: other people's words need their knowledge.
  if p_source in ('voice_note', 'debrief') and p_consent <> 'own_voice' then
    raise exception 'Notes and debriefs are your own voice' using errcode = 'P0001', hint = 'invalid';
  end if;
  if p_source in ('transcript', 'recording') and p_consent not in ('participants_informed', 'platform_transcript') then
    raise exception 'Confirm everyone knew the meeting was recorded' using errcode = 'P0001', hint = 'consent_required';
  end if;

  select public.credits_for_usd(c.transcription_usd_per_minute) into per_minute from public.credit_config c;
  estimate := (select estimate_credits from public.job_types where job_type = 'capture_process')
    + case when p_audio_path is not null then ceil(p_duration_seconds / 60.0)::integer * per_minute else 0 end;
  if private.company_balance(p_company) + coalesce(private.cohort_headroom(p_company), 0) < estimate then
    raise exception 'Not enough credits: this needs about % credits.', estimate
      using errcode = 'P0001', hint = 'insufficient_credits';
  end if;

  insert into public.captures (company_id, source, title, participants, consent, status, duration_seconds, audio_path, created_by)
  values (p_company, p_source, left(trim(coalesce(p_title, '')), 200), coalesce(p_participants, '{}'), p_consent,
    case when has_text then 'extracting' else 'transcribing' end, p_duration_seconds, p_audio_path, me)
  returning id into v_id;
  if has_text then
    insert into public.transcripts (capture_id, company_id, text, provider)
    values (v_id, p_company, trim(p_text), case when p_source = 'transcript' then 'pasted' else 'typed' end);
  end if;
  insert into public.agent_jobs (company_id, job_type, payload, estimated_credits, created_by)
  values (p_company, 'capture_process', jsonb_build_object('capture_id', v_id, 'title',
    case p_source when 'debrief' then 'Read your debrief' when 'voice_note' then 'Read your note' else 'Read your meeting' end),
    estimate, me)
  returning id into v_job;
  update public.captures set job_id = v_job where id = v_id;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (p_company, 'run', case p_source
    when 'debrief' then 'Debrief recorded' when 'voice_note' then 'Voice note recorded'
    when 'recording' then 'Meeting recording uploaded' else 'Meeting transcript added' end, me);
  return v_id;
end;
$$;

-- Service role: the transcript of an uploaded recording. Schedules the audio's deletion.
create function public.save_transcript(p_capture uuid, p_text text, p_segments jsonb, p_provider text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap public.captures;
  keep integer;
begin
  select * into cap from public.captures where id = p_capture for update;
  if not found then
    raise exception 'Capture not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  select coalesce((select keep_audio_days from public.capture_settings where company_id = cap.company_id), 0) into keep;
  insert into public.transcripts (capture_id, company_id, text, segments, provider)
  values (p_capture, cap.company_id, p_text, coalesce(p_segments, '[]'), p_provider)
  on conflict (capture_id) do update set text = excluded.text, segments = excluded.segments, provider = excluded.provider;
  update public.captures
  set status = 'extracting',
      audio_delete_after = case when audio_path is not null then now() + make_interval(days => keep) end
  where id = p_capture;
end;
$$;

-- Routes one accepted item to where it belongs (SPEC P step 6) and records where it went.
create function private.route_item(p_item uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.extracted_items;
  co public.companies;
  v_routed jsonb := '{}';
  v_task uuid;
  v_job uuid;
  v_id uuid;
  v_ev uuid;
  est integer;
  plan text;
begin
  select * into it from public.extracted_items where id = p_item;
  select * into co from public.companies where id = it.company_id;
  case it.kind
  when 'action' then
    if it.match_task_id is not null then
      update public.tasks set due = coalesce(it.due_date, due) where id = it.match_task_id;
      v_routed := jsonb_build_object('task_id', it.match_task_id, 'updated', true);
    elsif it.owner = 'sol' then
      est := (select estimate_credits from public.job_types where job_type = 'task');
      insert into public.tasks (company_id, pillar, title, actor, estimated_credits, due, source_item_id)
      values (it.company_id, coalesce(it.department, 'run'), it.text, 'sol', est, it.due_date, it.id)
      returning id into v_task;
      v_routed := jsonb_build_object('task_id', v_task);
      if private.company_balance(it.company_id) + coalesce(private.cohort_headroom(it.company_id), 0) >= est then
        insert into public.agent_jobs (company_id, task_id, job_type, payload, estimated_credits, created_by)
        values (it.company_id, v_task, 'task', jsonb_build_object('title', it.text), est, p_actor)
        returning id into v_job;
        v_routed := v_routed || jsonb_build_object('job_id', v_job);
      else
        v_routed := v_routed || jsonb_build_object('waiting_for_credits', true);
      end if;
    else
      insert into public.tasks (company_id, pillar, title, actor, due, assignee_id, source_item_id)
      values (it.company_id, coalesce(it.department, 'run'), it.text,
        case when it.owner = 'teammate' then 'teammate' else 'founder' end::public.task_actor,
        it.due_date, coalesce(it.owner_id, case when it.owner = 'founder' then p_actor end), it.id)
      returning id into v_task;
      v_routed := jsonb_build_object('task_id', v_task);
      if it.owner = 'teammate' then
        insert into public.activity_events (company_id, type, summary, actor_id)
        values (it.company_id, 'run', format('Assigned to %s: %s', coalesce(it.owner_name, 'a teammate'), left(it.text, 200)), p_actor);
      end if;
    end if;
  when 'commitment' then
    insert into public.commitments (company_id, to_name, contact_id, what, due_date, source_item_id, created_by)
    values (it.company_id, coalesce(nullif(trim(it.contact_name), ''), 'Someone'), it.contact_id, it.text, it.due_date, it.id, p_actor)
    returning id into v_id;
    v_routed := jsonb_build_object('commitment_id', v_id);
    est := (select estimate_credits from public.job_types where job_type = 'commitment_followup');
    if private.company_balance(it.company_id) + coalesce(private.cohort_headroom(it.company_id), 0) >= est then
      insert into public.agent_jobs (company_id, job_type, payload, estimated_credits, created_by)
      values (it.company_id, 'commitment_followup',
        jsonb_build_object('commitment_id', v_id, 'title', 'Draft the follow-up you promised'), est, p_actor)
      returning id into v_job;
      v_routed := v_routed || jsonb_build_object('job_id', v_job);
    end if;
  when 'idea' then
    -- Start up companies test an idea before building it (SPEC P).
    if co.entry_path = 'start_up' then
      plan := format('Before building "%s": talk to five target customers about it, and count it as supported if at least three would sign up, pre-order or switch.',
        case when length(it.text) > 60 then left(it.text, 57) || '…' else it.text end);
      insert into public.evidence_items (company_id, type, title, data, status)
      values (it.company_id, 'assumption', it.text, jsonb_build_object('evidence_plan', plan, 'source', 'capture'), 'untested')
      returning id into v_ev;
    end if;
    insert into public.ideas (company_id, title, status, evidence_plan, evidence_item_id, source_item_id, created_by)
    values (it.company_id, it.text, case when v_ev is null then 'inbox' else 'hypothesis' end, plan, v_ev, it.id, p_actor)
    returning id into v_id;
    v_routed := jsonb_build_object('idea_id', v_id) || case when v_ev is null then '{}'::jsonb else jsonb_build_object('evidence_item_id', v_ev) end;
  when 'feedback' then
    insert into public.feedback (company_id, contact_id, source, body, capture_id)
    values (it.company_id, it.contact_id, 'capture', it.text, it.capture_id)
    returning id into v_id;
    v_routed := jsonb_build_object('feedback_id', v_id);
  when 'memory_fact' then
    insert into public.approvals (company_id, action_type, payload, estimated_credits, requested_by)
    values (it.company_id, 'update_memory', jsonb_build_object(
      'fact', it.text, 'item_id', it.id, 'capture_id', it.capture_id,
      'reason', 'You mentioned this in a conversation. I''ll remember it once you say GO.'), 0, p_actor)
    returning id into v_id;
    v_routed := jsonb_build_object('approval_id', v_id);
  when 'claim' then
    v_routed := jsonb_build_object('claims', private.claims_flags(it.text, co.sector, private.unbuilt_features(it.company_id)));
  else
    -- Decisions and open questions are kept with the meeting.
    v_routed := jsonb_build_object('noted', true);
  end case;

  update public.extracted_items
  set status = 'accepted', routed = v_routed, decided_by = p_actor, decided_at = now()
  where id = p_item;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (it.company_id, 'capture',
    format('From a %s: %s accepted: %s%s',
      (select case source when 'debrief' then 'debrief' when 'voice_note' then 'note' else 'meeting' end from public.captures where id = it.capture_id),
      it.kind, left(it.text, 160),
      case when it.at_seconds is not null then format(' (at %s:%s)', it.at_seconds / 60, lpad((it.at_seconds % 60)::text, 2, '0')) else '' end),
    p_actor);
  return v_routed;
end;
$$;

-- Whether an item can be accepted as it stands: owners and dates aren't guessed.
create function private.item_missing(p_kind text, p_owner text, p_due date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind = 'action' and (p_owner is null or p_owner = 'unknown') then 'Say who is doing this first'
    when p_kind = 'action' and p_owner <> 'sol' and p_due is null then 'Add a due date first'
    when p_kind = 'commitment' and p_due is null then 'Add when you promised it by first'
  end
$$;

-- Marks a capture done once nothing is waiting for review.
create function private.close_capture_if_reviewed(p_capture uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.captures set status = 'done'
  where id = p_capture and status = 'review'
    and not exists (select 1 from public.extracted_items where capture_id = p_capture and status = 'pending');
$$;

-- Service role: Sol's extraction for a capture. Auto-accepts complete, confident items from the
-- founder's own voice notes when they've turned that on.
create function public.save_extraction(p_capture uuid, p_run uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap public.captures;
  x jsonb;
  n integer := 0;
  v_id uuid;
  auto boolean;
begin
  select * into cap from public.captures where id = p_capture for update;
  if not found then
    raise exception 'Capture not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Items must be a list' using errcode = 'P0001', hint = 'invalid';
  end if;
  auto := cap.source = 'voice_note' and coalesce(
    (select auto_accept_own_notes from public.capture_settings where company_id = cap.company_id), false);
  for x in select * from jsonb_array_elements(p_items) loop
    insert into public.extracted_items (
      capture_id, company_id, kind, text, owner, owner_id, owner_name, due_date, department,
      confidence, contact_name, contact_id, match_task_id, sensitive, quote, at_seconds, run_id
    ) values (
      p_capture, cap.company_id, x ->> 'kind', left(trim(x ->> 'text'), 1000), x ->> 'owner',
      (select m.user_id from public.company_members m where m.company_id = cap.company_id and m.user_id = private.try_uuid(x ->> 'owner_id')),
      x ->> 'owner_name', (x ->> 'due_date')::date, (x ->> 'department')::public.pillar,
      least(1, greatest(0, coalesce((x ->> 'confidence')::numeric, 0.5))), x ->> 'contact_name',
      (select c.id from public.contacts c where c.company_id = cap.company_id and c.id = private.try_uuid(x ->> 'contact_id')),
      (select t.id from public.tasks t where t.company_id = cap.company_id and t.id = private.try_uuid(x ->> 'match_task_id')),
      coalesce((x ->> 'sensitive')::boolean, false), left(x ->> 'quote', 1000), (x ->> 'at_seconds')::integer, p_run
    ) returning id into v_id;
    n := n + 1;
    if auto and coalesce((x ->> 'sensitive')::boolean, false) = false
      and coalesce((x ->> 'confidence')::numeric, 0) >= 0.6
      and private.item_missing(x ->> 'kind', x ->> 'owner', (x ->> 'due_date')::date) is null
      and cap.created_by is not null then
      perform private.route_item(v_id, cap.created_by);
    end if;
  end loop;
  update public.captures set status = 'review', error = null where id = p_capture;
  perform private.close_capture_if_reviewed(p_capture);
  return n;
end;
$$;

-- The founder accepts (optionally after editing) or dismisses an item.
create function public.decide_extracted_item(
  p_item uuid,
  p_decision text,
  p_changes jsonb default '{}',
  p_file_sensitive boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  it public.extracted_items;
  k text;
  missing text;
  result jsonb;
begin
  select * into it from public.extracted_items where id = p_item for update;
  if not found or not private.can_edit_company(it.company_id) then
    raise exception 'Item not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if it.status <> 'pending' then
    raise exception 'This was already decided' using errcode = 'P0001', hint = 'conflict';
  end if;
  if p_decision = 'dismiss' then
    update public.extracted_items set status = 'dismissed', decided_by = me, decided_at = now() where id = p_item;
    perform private.close_capture_if_reviewed(it.capture_id);
    return '{}'::jsonb;
  elsif p_decision <> 'accept' then
    raise exception 'Accept or dismiss' using errcode = 'P0001', hint = 'invalid';
  end if;
  if jsonb_typeof(coalesce(p_changes, '{}')) <> 'object' then
    raise exception 'Changes must be an object' using errcode = 'P0001', hint = 'invalid';
  end if;
  for k in select jsonb_object_keys(coalesce(p_changes, '{}')) loop
    if k not in ('text', 'owner', 'owner_id', 'owner_name', 'due_date', 'department', 'kind') then
      raise exception 'You can change the wording, owner, date, department or kind' using errcode = 'P0001', hint = 'invalid';
    end if;
  end loop;
  if p_changes ? 'owner_id' and not exists (
    select 1 from public.company_members m where m.company_id = it.company_id and m.user_id = private.try_uuid(p_changes ->> 'owner_id')
      and m.role in ('founder', 'teammate')) then
    raise exception 'The owner must be a founder or teammate of this company' using errcode = 'P0001', hint = 'invalid';
  end if;
  update public.extracted_items set
    text = coalesce(nullif(trim(p_changes ->> 'text'), ''), text),
    owner = coalesce(p_changes ->> 'owner', owner),
    owner_id = case when p_changes ? 'owner_id' then private.try_uuid(p_changes ->> 'owner_id') else owner_id end,
    owner_name = coalesce(p_changes ->> 'owner_name', owner_name),
    due_date = coalesce((p_changes ->> 'due_date')::date, due_date),
    department = coalesce((p_changes ->> 'department')::public.pillar, department),
    kind = coalesce(p_changes ->> 'kind', kind),
    -- The founder edited it, so it's no longer Sol's guess.
    confidence = case when p_changes = '{}'::jsonb then confidence else 1 end
  where id = p_item
  returning * into it;
  if it.sensitive and not p_file_sensitive then
    raise exception 'This sounds personal, so Sol won''t file it unless you choose to' using errcode = 'P0001', hint = 'sensitive';
  end if;
  missing := private.item_missing(it.kind, it.owner, it.due_date);
  if missing is not null then
    raise exception '%', missing using errcode = 'P0001', hint = 'needs_details';
  end if;
  result := private.route_item(p_item, me);
  perform private.close_capture_if_reviewed(it.capture_id);
  return result;
end;
$$;

-- "Accept all": every complete, confident, non-sensitive item still pending.
create function public.accept_all_items(p_capture uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  cap public.captures;
  it public.extracted_items;
  n integer := 0;
begin
  select * into cap from public.captures where id = p_capture;
  if not found or not private.can_edit_company(cap.company_id) then
    raise exception 'Capture not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  for it in
    select * from public.extracted_items
    where capture_id = p_capture and status = 'pending' and not sensitive and confidence >= 0.6
    order by created_at
    for update
  loop
    if private.item_missing(it.kind, it.owner, it.due_date) is null then
      perform private.route_item(it.id, me);
      n := n + 1;
    end if;
  end loop;
  perform private.close_capture_if_reviewed(p_capture);
  return n;
end;
$$;

-- Founders choose which accepted actions and decisions their mentors see.
create function public.share_extracted_item(p_item uuid, p_shared boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.extracted_items;
begin
  perform private.require_signed_in();
  select * into it from public.extracted_items where id = p_item;
  if not found or not private.is_company_founder(it.company_id) then
    raise exception 'Only a founder can share items with mentors' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_shared and not (it.status = 'accepted' and it.kind in ('action', 'decision')) then
    raise exception 'Only accepted actions and decisions can be shared' using errcode = 'P0001', hint = 'invalid';
  end if;
  update public.extracted_items set shared = p_shared where id = p_item;
end;
$$;

create function public.update_capture_settings(p_company uuid, p_keep_audio_days integer default null, p_auto_accept boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_signed_in();
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can change capture settings' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_keep_audio_days is not null and p_keep_audio_days not between 0 and 90 then
    raise exception 'Keep audio for 0 to 90 days' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.capture_settings (company_id, keep_audio_days, auto_accept_own_notes)
  values (p_company, coalesce(p_keep_audio_days, 0), coalesce(p_auto_accept, false))
  on conflict (company_id) do update set
    keep_audio_days = coalesce(p_keep_audio_days, capture_settings.keep_audio_days),
    auto_accept_own_notes = coalesce(p_auto_accept, capture_settings.auto_accept_own_notes),
    updated_at = now();
end;
$$;

create function public.set_idea_status(p_idea uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  co uuid;
begin
  perform private.require_signed_in();
  select company_id into co from public.ideas where id = p_idea;
  if co is null or not private.can_edit_company(co) then
    raise exception 'Idea not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_status not in ('inbox', 'hypothesis', 'parked', 'done') then
    raise exception 'Unknown status' using errcode = 'P0001', hint = 'invalid';
  end if;
  update public.ideas set status = p_status where id = p_idea;
end;
$$;

create function public.complete_commitment(p_commitment uuid, p_status text default 'done')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  co uuid;
begin
  perform private.require_signed_in();
  select company_id into co from public.commitments where id = p_commitment;
  if co is null or not private.can_edit_company(co) then
    raise exception 'Promise not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_status not in ('done', 'cancelled') then
    raise exception 'Mark it done or cancelled' using errcode = 'P0001', hint = 'invalid';
  end if;
  update public.commitments set status = p_status, completed_at = now() where id = p_commitment and status = 'open';
end;
$$;

revoke execute on function private.route_item(uuid, uuid), private.close_capture_if_reviewed(uuid),
  private.item_missing(text, text, date), private.try_uuid(text) from public, anon, authenticated;
-- The storage policy calls these as the uploading user.
grant execute on function private.try_uuid(text) to authenticated;
revoke execute on function public.save_transcript(uuid, text, jsonb, text), public.save_extraction(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_transcript(uuid, text, jsonb, text), public.save_extraction(uuid, uuid, jsonb) to service_role;
revoke execute on function public.create_capture(uuid, text, text, text, text, text, integer, text[]),
  public.decide_extracted_item(uuid, text, jsonb, boolean), public.accept_all_items(uuid),
  public.share_extracted_item(uuid, boolean), public.update_capture_settings(uuid, integer, boolean),
  public.set_idea_status(uuid, text), public.complete_commitment(uuid, text) from public, anon;
grant execute on function public.create_capture(uuid, text, text, text, text, text, integer, text[]),
  public.decide_extracted_item(uuid, text, jsonb, boolean), public.accept_all_items(uuid),
  public.share_extracted_item(uuid, boolean), public.update_capture_settings(uuid, integer, boolean),
  public.set_idea_status(uuid, text), public.complete_commitment(uuid, text) to authenticated;

-- Captures and their items reach the app live.
alter publication supabase_realtime add table public.captures, public.extracted_items, public.commitments;
