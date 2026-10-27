-- Brand voice and response policy (Phase 11, SPEC part G). Voice says how Sol speaks; policy
-- says what Sol may do without asking. Auto-send is off for every category until a founder
-- turns it on, and some categories always escalate, whatever the settings.

-- Voice profiles: one approved version per company at a time, every version kept.
create table public.voice_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  version integer not null check (version > 0),
  status public.voice_status not null default 'proposed',
  -- default (starting point), questionnaire, analysis (website and past emails), edits (learned
  -- from the founder's edits), manual (the founder changed it).
  source text not null check (source in ('default', 'questionnaire', 'analysis', 'edits', 'manual')),
  summary text not null default '',
  traits text[] not null default '{}' check (cardinality(traits) <= 8),
  use_phrases text[] not null default '{}',
  avoid_phrases text[] not null default '{}',
  reading_level text not null default 'plain' check (reading_level in ('plain', 'standard', 'complex')),
  spelling text not null default 'UK' check (spelling in ('UK', 'US')),
  sign_off text,
  emoji text not null default 'none' check (emoji in ('none', 'sparing', 'often')),
  -- { "email": "...", "social_post": "...", "social_reply": "...", "review_reply": "...", "chat": "..." }
  channel_variants jsonb not null default '{}' check (jsonb_typeof(channel_variants) = 'object'),
  -- { "complaint": "...", "praise": "...", "b2b_enquiry": "...", "distressed": "..." }
  tone_rules jsonb not null default '{}' check (jsonb_typeof(tone_rules) = 'object'),
  -- What changed from the previous version, for a proposal.
  changes text,
  run_id uuid references public.agent_runs (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, version)
);
create unique index voice_profiles_one_approved on public.voice_profiles (company_id) where status = 'approved';
create index voice_profiles_run_id_idx on public.voice_profiles (run_id);
create index voice_profiles_created_by_idx on public.voice_profiles (created_by);
create index voice_profiles_approved_by_idx on public.voice_profiles (approved_by);

-- Approved example replies, tagged by situation (few-shot examples for drafting).
create table public.voice_examples (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  situation text not null check (situation in (
    'general_enquiry', 'pricing_question', 'complaint', 'refund_request', 'booking',
    'review_positive', 'review_negative', 'praise', 'b2b_enquiry', 'other')),
  channel text not null default 'email' check (channel in ('email', 'social_post', 'social_reply', 'review_reply', 'chat')),
  body text not null check (length(trim(body)) between 1 and 5000),
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index voice_examples_company_id_idx on public.voice_examples (company_id);
create index voice_examples_added_by_idx on public.voice_examples (added_by);

-- A founder's edit to one of Sol's drafts before it went out: the original and the final.
-- The weekly voice-update run learns from these.
create table public.voice_edit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  approval_id uuid references public.approvals (id) on delete set null,
  channel text not null,
  original text not null,
  final text not null,
  edited_by uuid references public.profiles (id) on delete set null,
  -- Set when a voice-update run has taken this edit into account.
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index voice_edit_events_company_id_idx on public.voice_edit_events (company_id, created_at desc);
create index voice_edit_events_approval_id_idx on public.voice_edit_events (approval_id);
create index voice_edit_events_edited_by_idx on public.voice_edit_events (edited_by);

-- The response policy: one mode per message category.
create table public.response_policies (
  company_id uuid not null references public.companies (id) on delete cascade,
  category text not null check (category in (
    'general_enquiry', 'pricing_question', 'complaint', 'refund_request', 'booking',
    'review_positive', 'review_negative', 'legal_threat', 'press', 'spam')),
  mode public.response_mode not null default 'draft',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, category),
  -- Money and legal threats always escalate (SPEC G hard rules).
  check (category not in ('refund_request', 'legal_threat') or mode = 'escalate')
);
create index response_policies_updated_by_idx on public.response_policies (updated_by);

-- Per-company reply settings: the AI disclosure, and when the founder last reviewed the policy.
create table public.response_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  disclosure_text text not null default 'Drafted with our AI assistant'
    check (length(trim(disclosure_text)) between 3 and 200),
  -- Whether drafts the founder approves also carry the disclosure. Auto-sent replies always do.
  disclosure_on_approved boolean not null default true,
  policy_reviewed_at timestamptz,
  policy_reviewed_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index response_settings_reviewed_by_idx on public.response_settings (policy_reviewed_by);

-- Categories that always escalate, plus the triage flags that force escalation (SPEC G).
create function private.always_escalate(p_category text, p_triage jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_category in ('refund_request', 'legal_threat')
    or coalesce((p_triage ->> 'money')::boolean, false)
    or coalesce((p_triage ->> 'legal')::boolean, false)
    or coalesce((p_triage ->> 'safety')::boolean, false)
    or coalesce((p_triage ->> 'vulnerable')::boolean, false)
    or coalesce((p_triage ->> 'data_request')::boolean, false)
    or coalesce((p_triage ->> 'unverified_claim')::boolean, false)
$$;

-- Every company starts with the default voice, the default policy (no auto-send) and settings.
create function private.seed_voice_and_policy(p_company uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.voice_profiles (company_id, version, status, source, summary, traits, avoid_phrases,
    channel_variants, tone_rules, approved_at)
  values (p_company, 1, 'approved', 'default',
    'Clear, encouraging and honest. UK spelling. No guarantees or unsupported claims.',
    '{"Clear", "Encouraging", "Honest"}',
    '{"guaranteed", "best", "world-leading"}',
    '{"email": "Short paragraphs, a friendly greeting and a sign-off.", "social_post": "One idea per post, one call to action.", "social_reply": "Brief and warm; move private matters to email.", "review_reply": "Thank them by name; never argue in public.", "chat": "Short and direct."}',
    '{"complaint": "Calm and accountable. No humour, no blame. Say what happens next.", "praise": "Warm and brief.", "b2b_enquiry": "Crisp and professional.", "distressed": "Gentle. Don''t try to solve it alone: escalate to the founder."}',
    now())
  on conflict do nothing;
  insert into public.response_policies (company_id, category, mode)
  select p_company, c, case when c in ('refund_request', 'legal_threat') then 'escalate' else 'draft' end::public.response_mode
  from unnest(array['general_enquiry', 'pricing_question', 'complaint', 'refund_request', 'booking',
    'review_positive', 'review_negative', 'legal_threat', 'press', 'spam']) c
  on conflict do nothing;
  insert into public.response_settings (company_id) values (p_company) on conflict do nothing;
$$;
revoke execute on function private.seed_voice_and_policy(uuid), private.always_escalate(text, jsonb) from public, anon, authenticated;

create function private.on_company_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_voice_and_policy(new.id);
  return new;
end;
$$;
revoke execute on function private.on_company_created() from public, anon, authenticated;
create trigger companies_seed_voice_and_policy after insert on public.companies
  for each row execute function private.on_company_created();

select private.seed_voice_and_policy(id) from public.companies;

-- Access -------------------------------------------------------------------------------------

alter table public.voice_profiles enable row level security;
revoke all on public.voice_profiles from anon, authenticated;
grant select on public.voice_profiles to authenticated;
create policy "Read voice for companies you can read" on public.voice_profiles
  for select to authenticated using (private.can_read_company(company_id));

alter table public.voice_examples enable row level security;
revoke all on public.voice_examples from anon, authenticated;
grant select, delete on public.voice_examples to authenticated;
grant insert (company_id, situation, channel, body) on public.voice_examples to authenticated;
create policy "Read examples for companies you can read" on public.voice_examples
  for select to authenticated using (private.can_read_company(company_id));
create policy "Founders and teammates add examples" on public.voice_examples
  for insert to authenticated with check (private.can_edit_company(company_id));
create policy "Founders and teammates delete examples" on public.voice_examples
  for delete to authenticated using (private.can_edit_company(company_id));

-- Edits contain customer correspondence: founders and teammates only.
alter table public.voice_edit_events enable row level security;
revoke all on public.voice_edit_events from anon, authenticated;
grant select on public.voice_edit_events to authenticated;
create policy "Founders and teammates read edits" on public.voice_edit_events
  for select to authenticated using (private.can_edit_company(company_id));

alter table public.response_policies enable row level security;
revoke all on public.response_policies from anon, authenticated;
grant select on public.response_policies to authenticated;
create policy "Read policy for companies you can read" on public.response_policies
  for select to authenticated using (private.can_read_company(company_id));

alter table public.response_settings enable row level security;
revoke all on public.response_settings from anon, authenticated;
grant select on public.response_settings to authenticated;
create policy "Read reply settings for companies you can read" on public.response_settings
  for select to authenticated using (private.can_read_company(company_id));

-- RPCs ---------------------------------------------------------------------------------------

-- Founders set a category's mode. Money and legal threats can't leave escalate.
create function public.set_response_policy(p_company uuid, p_category text, p_mode public.response_mode)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
begin
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can change the response policy' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_category in ('refund_request', 'legal_threat') and p_mode <> 'escalate' then
    raise exception 'Refunds and legal threats always go to you' using errcode = 'P0001', hint = 'always_escalate';
  end if;
  update public.response_policies
  set mode = p_mode, updated_by = me, updated_at = now()
  where company_id = p_company and category = p_category;
  if not found then
    raise exception 'Unknown category' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (p_company, 'policy', 'Response policy: ' || replace(p_category, '_', ' ') || ' → ' || replace(p_mode::text, '_', ' '), me);
end;
$$;

-- Founders change the disclosure wording and mark the policy as reviewed.
create function public.update_response_settings(
  p_company uuid,
  p_disclosure_text text default null,
  p_disclosure_on_approved boolean default null,
  p_mark_reviewed boolean default false
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
  update public.response_settings
  set disclosure_text = coalesce(nullif(trim(p_disclosure_text), ''), disclosure_text),
      disclosure_on_approved = coalesce(p_disclosure_on_approved, disclosure_on_approved),
      policy_reviewed_at = case when p_mark_reviewed then now() else policy_reviewed_at end,
      policy_reviewed_by = case when p_mark_reviewed then me else policy_reviewed_by end,
      updated_at = now()
  where company_id = p_company;
end;
$$;

-- A founder edits the voice directly: a new approved version. Not silent: it's their change.
create function public.save_voice_profile(p_company uuid, p_profile jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  cur public.voice_profiles;
  v_id uuid;
begin
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can change the brand voice' using errcode = 'P0001', hint = 'forbidden';
  end if;
  select * into cur from public.voice_profiles where company_id = p_company and status = 'approved';
  update public.voice_profiles set status = 'superseded' where company_id = p_company and status = 'approved';
  insert into public.voice_profiles (
    company_id, version, status, source, summary, traits, use_phrases, avoid_phrases, reading_level,
    spelling, sign_off, emoji, channel_variants, tone_rules, changes, created_by, approved_by, approved_at
  ) values (
    p_company,
    coalesce((select max(version) from public.voice_profiles where company_id = p_company), 0) + 1,
    'approved', 'manual',
    coalesce(p_profile ->> 'summary', cur.summary, ''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_profile -> 'traits') x), cur.traits, '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_profile -> 'use_phrases') x), case when p_profile ? 'use_phrases' then '{}'::text[] end, cur.use_phrases, '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_profile -> 'avoid_phrases') x), case when p_profile ? 'avoid_phrases' then '{}'::text[] end, cur.avoid_phrases, '{}'),
    coalesce(p_profile ->> 'reading_level', cur.reading_level, 'plain'),
    coalesce(p_profile ->> 'spelling', cur.spelling, 'UK'),
    case when p_profile ? 'sign_off' then nullif(trim(p_profile ->> 'sign_off'), '') else cur.sign_off end,
    coalesce(p_profile ->> 'emoji', cur.emoji, 'none'),
    coalesce(p_profile -> 'channel_variants', cur.channel_variants, '{}'),
    coalesce(p_profile -> 'tone_rules', cur.tone_rules, '{}'),
    'Edited by the founder', me, me, now()
  ) returning id into v_id;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (p_company, 'voice', 'Brand voice updated by the founder', me);
  return v_id;
end;
$$;

-- Service role: the agent proposes a voice profile and an approval to adopt it.
create function public.propose_voice_profile(p_company uuid, p_run uuid, p_source text, p_profile jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur public.voice_profiles;
  v_id uuid;
  version integer;
begin
  if p_source not in ('questionnaire', 'analysis', 'edits') then
    raise exception 'Unknown source' using errcode = 'P0001', hint = 'invalid';
  end if;
  select * into cur from public.voice_profiles where company_id = p_company and status = 'approved';
  -- One open proposal at a time: a new one replaces the last.
  update public.voice_profiles set status = 'declined' where company_id = p_company and status = 'proposed';
  update public.approvals set status = 'declined', decided_at = now(), decision_note = 'Replaced by a newer proposal'
  where company_id = p_company and action_type = 'update_voice' and status = 'pending';
  version := coalesce((select max(v.version) from public.voice_profiles v where v.company_id = p_company), 0) + 1;
  insert into public.voice_profiles (
    company_id, version, status, source, summary, traits, use_phrases, avoid_phrases, reading_level,
    spelling, sign_off, emoji, channel_variants, tone_rules, changes, run_id
  ) values (
    p_company, version, 'proposed', p_source,
    coalesce(p_profile ->> 'summary', ''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_profile -> 'traits') x), cur.traits, '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_profile -> 'use_phrases') x), cur.use_phrases, '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_profile -> 'avoid_phrases') x), cur.avoid_phrases, '{}'),
    coalesce(p_profile ->> 'reading_level', cur.reading_level, 'plain'),
    coalesce(p_profile ->> 'spelling', cur.spelling, 'UK'),
    coalesce(nullif(trim(p_profile ->> 'sign_off'), ''), cur.sign_off),
    coalesce(p_profile ->> 'emoji', cur.emoji, 'none'),
    coalesce(cur.channel_variants, '{}') || coalesce(p_profile -> 'channel_variants', '{}'),
    coalesce(cur.tone_rules, '{}') || coalesce(p_profile -> 'tone_rules', '{}'),
    nullif(trim(coalesce(p_profile ->> 'changes', '')), ''),
    p_run
  ) returning id into v_id;
  insert into public.approvals (company_id, run_id, action_type, payload, estimated_credits)
  values (p_company, p_run, 'update_voice', jsonb_build_object(
    'profile_id', v_id,
    'version', version,
    'summary', coalesce(p_profile ->> 'summary', ''),
    'changes', coalesce(p_profile ->> 'changes', ''),
    'reason', case p_source
      when 'analysis' then 'Learned from your website and past emails, so replies sound like you.'
      when 'edits' then 'Learned from the edits you made to my drafts this week.'
      else 'From your answers about how you want to sound.'
    end), 0);
  -- The edits it learned from are used.
  if p_source = 'edits' then
    update public.voice_edit_events set used_at = now() where company_id = p_company and used_at is null;
  end if;
  return v_id;
end;
$$;

-- Executor: adopt an approved voice proposal.
create function public.adopt_voice_profile(p_profile uuid, p_approved_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.voice_profiles;
begin
  select * into v from public.voice_profiles where id = p_profile for update;
  if not found or v.status <> 'proposed' then
    raise exception 'That voice proposal isn''t open' using errcode = 'P0001', hint = 'not_open';
  end if;
  update public.voice_profiles set status = 'superseded' where company_id = v.company_id and status = 'approved';
  update public.voice_profiles set status = 'approved', approved_by = p_approved_by, approved_at = now() where id = v.id;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (v.company_id, 'voice', 'Brand voice v' || v.version || ' adopted', p_approved_by);
end;
$$;

-- A declined voice proposal is marked declined too.
create function private.on_voice_approval_declined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action_type = 'update_voice' and new.status = 'declined' and old.status = 'pending' then
    update public.voice_profiles set status = 'declined'
    where id = (new.payload ->> 'profile_id')::uuid and status = 'proposed';
  end if;
  return new;
end;
$$;
revoke execute on function private.on_voice_approval_declined() from public, anon, authenticated;
create trigger approvals_voice_declined after update of status on public.approvals
  for each row execute function private.on_voice_approval_declined();

revoke execute on function
  public.set_response_policy(uuid, text, public.response_mode),
  public.update_response_settings(uuid, text, boolean, boolean),
  public.save_voice_profile(uuid, jsonb)
from public, anon;
grant execute on function
  public.set_response_policy(uuid, text, public.response_mode),
  public.update_response_settings(uuid, text, boolean, boolean),
  public.save_voice_profile(uuid, jsonb)
to authenticated, service_role;
revoke execute on function public.propose_voice_profile(uuid, uuid, text, jsonb), public.adopt_voice_profile(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.propose_voice_profile(uuid, uuid, text, jsonb), public.adopt_voice_profile(uuid, uuid)
  to service_role;

-- Edits to Sol's drafts are kept for voice learning (SPEC G "learning from edits").
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
    values (a.company_id, a.id, case a.action_type when 'publish_post' then 'social_post' else 'email' end,
      private.approval_text(a.action_type, a.payload), private.approval_text(a.action_type, merged), me);
  end if;
  insert into public.activity_events (company_id, type, summary, actor_id, run_id)
  values (a.company_id, 'approval', 'Draft edited before review', me, a.run_id);
  return merged;
end;
$$;

-- Voice and policy changes reach the app live.
alter publication supabase_realtime add table public.voice_profiles, public.response_policies;

-- New job types: proposing a voice from the company's writing, and the weekly update from edits.
-- SPEC M: voice analysis and weekly reviews use the strongest model.
insert into public.job_types (job_type, label, pillar, tier, estimate_credits, cap_credits) values
  ('voice_analysis', 'Learn the brand voice', 'grow', 'strategy', 150, 400),
  ('voice_update', 'Weekly voice review', 'grow', 'strategy', 80, 250);
