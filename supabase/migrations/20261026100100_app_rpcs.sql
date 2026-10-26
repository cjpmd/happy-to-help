-- Server-side writes for the app (Phase 1 groups 1d and 1e). The app reads tables directly
-- (row-level security applies) but every write that needs a rule checked goes through one
-- of these functions. They are SECURITY DEFINER, check the caller with the private helpers,
-- and raise a plain-English error the app can show as it is.
--
-- Errors use SQLSTATE P0001 with a short machine-readable HINT (e.g. 'claims_flagged') so the
-- app can tell failures apart without parsing messages.

alter table public.cohorts
  add column default_credit_cap integer not null default 5000 check (default_credit_cap >= 0);

-- The draft as Sol first wrote it, kept when a founder edits it (voice learning in Phase 11).
alter table public.approvals add column original_payload jsonb
  check (original_payload is null or jsonb_typeof(original_payload) = 'object');

-- Claims check ------------------------------------------------------------------------------
-- Mirrors checkClaims() in src/lib/workspace.ts: the same rules, the same reasons. A test in
-- src/test/integration/claims-parity.test.ts runs both over the same fixtures.

create function private.claims_flags(p_text text, p_sector public.sector_pack, p_unbuilt text[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  rules jsonb := jsonb_build_array(
    jsonb_build_object('pattern', '\y(best|number one|world.leading|most effective)\y', 'reason', 'Unverifiable superlative'),
    jsonb_build_object('pattern', '\y(guarantee\w*|will improve|double your|100% success|cuts bills)\y', 'reason', 'Promises results')
  );
  r jsonb;
  m text[];
  feature text;
  flags jsonb := '[]';
begin
  if p_text is null or p_text = '' then
    return flags;
  end if;
  if p_sector is distinct from 'general' then
    rules := rules || jsonb_build_array(jsonb_build_object(
      'pattern', '\y(actually works|proven|clinically|risk.free|approved|certified)\y',
      'reason', 'Regulated claim needs supporting evidence'));
  end if;
  for r in select * from jsonb_array_elements(rules) loop
    for m in select regexp_matches(p_text, r ->> 'pattern', 'gi') loop
      flags := flags || jsonb_build_array(jsonb_build_object('phrase', m[1], 'reason', r ->> 'reason'));
    end loop;
  end loop;
  foreach feature in array coalesce(p_unbuilt, '{}') loop
    if length(trim(feature)) > 0 then
      for m in select regexp_matches(p_text, '\y(' || regexp_replace(trim(feature), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || ')\y', 'gi') loop
        flags := flags || jsonb_build_array(jsonb_build_object('phrase', m[1], 'reason', 'Feature not built yet'));
      end loop;
    end if;
  end loop;
  return flags;
end;
$$;

-- Roadmap outcomes that aren't complete yet: public text mustn't promise them.
create function private.unbuilt_features(p_company uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(o ->> 'title'), '{}')
  from public.documents d
  cross join lateral jsonb_array_elements(coalesce(d.outcomes, '[]')) o
  where d.company_id = p_company and d.title = 'Product roadmap'
    and not coalesce((o ->> 'complete')::boolean, false)
$$;

-- The public-facing text in an approval's payload.
create function private.approval_text(p_action public.approval_action, p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_action
    when 'publish_post' then p_payload ->> 'text'
    when 'send_email' then concat_ws(E'\n', p_payload ->> 'subject', p_payload ->> 'body')
    else ''
  end
$$;

create function public.check_claims(p_company uuid, p_text text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' and not private.can_read_company(p_company) then
    raise exception 'You don''t have access to this company' using errcode = 'P0001', hint = 'forbidden';
  end if;
  return private.claims_flags(
    p_text,
    (select c.sector from public.companies c where c.id = p_company),
    private.unbuilt_features(p_company));
end;
$$;

-- Balance helper (the ledger's RLS doesn't apply inside SECURITY DEFINER functions).
create function private.company_balance(p_company uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::integer from public.credit_ledger where company_id = p_company
$$;

create function private.require_signed_in()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'P0001', hint = 'not_signed_in';
  end if;
  return auth.uid();
end;
$$;

-- Companies ---------------------------------------------------------------------------------

create function private.unique_slug(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  base text := trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'));
  candidate text;
  n integer := 1;
begin
  if base = '' then
    base := 'mission';
  end if;
  base := left(base, 48);
  candidate := base;
  while exists (select 1 from public.companies where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- Onboarding: creates the company with everything a new mission starts with, and joins a
-- cohort when a valid code is given. Credits come from billing or the cohort, not from here.
create function public.create_company(
  p_name text,
  p_description text,
  p_customer_type public.customer_type,
  p_sector public.sector_pack default 'general',
  p_target_customer text default null,
  p_goal_90d text default null,
  p_starting_stage text default null,
  p_existing_website_url text default null,
  p_cohort_code text default null
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
  doc_id uuid;
  d record;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Give your company a name' using errcode = 'P0001', hint = 'invalid';
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
    starting_stage, existing_website_url, created_by, started_at
  ) values (
    private.unique_slug(p_name), trim(p_name), coalesce(trim(p_description), ''), p_customer_type,
    coalesce(p_sector, 'general'),
    case p_customer_type when 'B2B' then '{LinkedIn,"Email outreach","Trust page"}'::text[]
      else '{Instagram,TikTok,Waitlist}'::text[] end,
    nullif(trim(coalesce(p_target_customer, '')), ''), nullif(trim(coalesce(p_goal_90d, '')), ''),
    nullif(trim(coalesce(p_starting_stage, '')), ''), nullif(trim(coalesce(p_existing_website_url, '')), ''),
    me, started
  ) returning id into cid;

  update public.companies
  set website_live_url = '/site/' || slug, website_preview_url = '/site/' || slug || '?preview=1'
  where id = cid;

  insert into public.company_members (company_id, user_id, role) values (cid, me, 'founder');

  insert into public.stage_gates (company_id, stage, criteria, status, target_date)
  values
    (cid, 'idea', '[]', 'in_progress', (started + interval '8 days')::date),
    (cid, 'evidence', '[{"label": "Waitlist", "current": 0, "target": 50}, {"label": "Interviews", "current": 0, "target": 8}]', 'locked', (started + interval '18 days')::date),
    (cid, 'build', '[{"label": "Beta users", "current": 0, "target": 40}]', 'locked', (started + interval '42 days')::date),
    (cid, 'launch', '[]', 'locked', (started + interval '80 days')::date);

  insert into public.routines (company_id, title, cadence, credits) values
    (cid, 'Morning brief', 'daily', 25),
    (cid, case p_customer_type when 'B2B' then 'Post to LinkedIn' else 'Draft Instagram post' end, 'weekdays', 40),
    (cid, 'Weekly investor update', 'weekly', 60);

  for d in
    select * from (values
      (1, 'Company profile', trim(p_name) || E'\n\n' || coalesce(trim(p_description), '') || E'\n\nTarget customer: '
        || coalesce(nullif(trim(coalesce(p_target_customer, '')), ''), p_customer_type::text) || E'.\n90-day goal: '
        || coalesce(nullif(trim(coalesce(p_goal_90d, '')), ''), 'Validate demand with customer interviews') || '.'),
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
    'Welcome aboard. I''ve read your idea for ' || trim(p_name)
    || '. Tonight I''ll draft your first assumptions to test and a simple landing page.');
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (cid, 'mission', 'Mission started', me);

  return cid;
end;
$$;

-- Joins a cohort after onboarding. Founders only; a company is in at most one cohort.
create function public.join_cohort(p_company uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cohort record;
begin
  perform private.require_signed_in();
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can join a cohort' using errcode = 'P0001', hint = 'forbidden';
  end if;
  select * into cohort from public.cohorts where upper(join_code) = upper(trim(coalesce(p_code, '')));
  if not found then
    raise exception 'That cohort code isn''t recognised. Check it with your programme lead.'
      using errcode = 'P0001', hint = 'bad_cohort_code';
  end if;
  if exists (select 1 from public.cohort_companies where company_id = p_company) then
    raise exception 'This company is already in a cohort' using errcode = 'P0001', hint = 'already_in_cohort';
  end if;
  insert into public.cohort_companies (cohort_id, company_id, credit_cap)
  values (cohort.id, p_company, cohort.default_credit_cap);
  return cohort.id;
end;
$$;

-- Team invites become memberships when the invited person signs in with that email.
create function public.accept_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  my_email text := (select lower(email) from public.profiles where id = me);
  n integer;
begin
  with accepted as (
    update public.team_invites
    set status = 'accepted'
    where email = my_email and status = 'invited'
    returning company_id, role
  )
  insert into public.company_members (company_id, user_id, role)
  select company_id, me, role from accepted
  on conflict (company_id, user_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Approvals ---------------------------------------------------------------------------------

-- Founders and mentors decide. Approving checks the claims, the credits and the ad cap here,
-- so the app can't report a decision that didn't happen (bug B1). The executor (Phase 5)
-- carries out approved actions; this only records the decision.
create function public.decide_approval(p_approval uuid, p_decision public.approval_status)
returns public.approval_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  a public.approvals;
  flags jsonb;
  ad public.ad_accounts;
  label text;
begin
  if p_decision not in ('approved', 'declined') then
    raise exception 'Decide approved or declined' using errcode = 'P0001', hint = 'invalid';
  end if;
  select * into a from public.approvals where id = p_approval for update;
  if not found or not private.can_read_company(a.company_id) then
    raise exception 'Approval not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if not private.can_oversee_company(a.company_id) then
    raise exception 'Only a founder or mentor can decide approvals' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if a.status <> 'pending' then
    raise exception 'This was already %', a.status using errcode = 'P0001', hint = 'already_decided';
  end if;

  if p_decision = 'approved' then
    flags := public.check_claims(a.company_id, private.approval_text(a.action_type, a.payload));
    if jsonb_array_length(flags) > 0 then
      raise exception 'The claims check flagged "%". Edit the draft before approving.', flags -> 0 ->> 'phrase'
        using errcode = 'P0001', hint = 'claims_flagged';
    end if;
    if private.company_balance(a.company_id) < a.estimated_credits then
      raise exception 'Not enough credits: this needs % and the balance is %.', a.estimated_credits,
        private.company_balance(a.company_id) using errcode = 'P0001', hint = 'insufficient_credits';
    end if;
    if a.action_type = 'ad_spend' and a.payload ? 'daily_budget' then
      select * into ad from public.ad_accounts where company_id = a.company_id;
      if not found or (a.payload ->> 'daily_budget')::numeric > coalesce((a.payload ->> 'hard_cap')::numeric, ad.hard_cap) then
        raise exception 'The daily budget is over the hard cap' using errcode = 'P0001', hint = 'over_cap';
      end if;
    end if;
  end if;

  update public.approvals
  set status = p_decision, decided_by = me, decided_at = now()
  where id = a.id;

  -- The run that proposed it is finished once its proposal is decided.
  update public.agent_runs
  set status = 'succeeded', finished_at = coalesce(finished_at, now())
  where id = a.run_id and status = 'needs_approval';

  label := case a.action_type
    when 'publish_post' then (a.payload ->> 'channel') || ' post'
    when 'send_email' then 'email "' || (a.payload ->> 'subject') || '"'
    when 'ad_spend' then '£' || (a.payload ->> 'amount_gbp') || ' ' || (a.payload ->> 'platform') || ' ad spend'
    when 'file_document' then 'filing: ' || (a.payload ->> 'document')
    when 'publish_site' then 'site change: ' || (a.payload ->> 'change')
  end;
  insert into public.activity_events (company_id, type, summary, actor_id, run_id)
  values (a.company_id, 'approval',
    (select coalesce(nullif(full_name, ''), 'Someone') from public.profiles where id = me)
      || case p_decision when 'approved' then ' gave GO: ' else ' said NO-GO: ' end
      || coalesce(label, replace(a.action_type::text, '_', ' ')),
    me, a.run_id);

  return p_decision;
end;
$$;

-- Edits the public text of a pending draft (bug B2: flagged drafts were a dead end).
-- Only the wording can change; the first version is kept in original_payload.
create function public.edit_approval(p_approval uuid, p_changes jsonb)
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
  insert into public.activity_events (company_id, type, summary, actor_id, run_id)
  values (a.company_id, 'approval', 'Draft edited before review', me, a.run_id);
  return merged;
end;
$$;

-- "Why?" on an approval: the founder's question and Sol's stored reason go into the chat.
create function public.ask_why(p_approval uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  a public.approvals;
begin
  select * into a from public.approvals where id = p_approval;
  if not found or not private.can_read_company(a.company_id) then
    raise exception 'Approval not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  insert into public.chat_messages (company_id, sender, author_id, content) values
    (a.company_id, 'founder', me, 'Why should I approve this?'),
    (a.company_id, 'sol', null, coalesce(nullif(a.payload ->> 'reason', ''), 'This moves your current stage goal forward.'));
end;
$$;

-- Founder-initiated approvals: an ad budget change and an outreach batch.
create function public.request_ad_budget(p_company uuid, p_daily_budget numeric, p_hard_cap numeric)
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
    raise exception 'Only founders and teammates can propose a budget' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_daily_budget is null or p_hard_cap is null or p_daily_budget < 0 or p_hard_cap < 0 or p_daily_budget > p_hard_cap then
    raise exception 'The daily budget must be between £0 and the hard cap' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.approvals (company_id, action_type, payload, estimated_credits, requested_by)
  values (p_company, 'ad_spend', jsonb_build_object(
    'platform', 'Meta Ads', 'amount_gbp', p_daily_budget, 'daily_budget', p_daily_budget,
    'hard_cap', p_hard_cap, 'duration', 'per day', 'audience', 'Current audience',
    'creative', 'Current creative',
    'reason', 'A capped test limits downside while measuring acquisition.'), 90, me)
  returning approvals.id into v_id;
  return v_id;
end;
$$;

create function public.draft_outreach(p_company uuid, p_to text, p_subject text, p_body text)
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
    raise exception 'Only founders and teammates can draft outreach' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if length(trim(coalesce(p_to, ''))) = 0 or length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Add recipients and a message' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.approvals (company_id, action_type, payload, estimated_credits, requested_by)
  values (p_company, 'send_email', jsonb_build_object(
    'outreach', true, 'to', trim(p_to), 'subject', coalesce(nullif(trim(p_subject), ''), 'Pilot invitation'),
    'body', p_body,
    'reason', 'A small reviewed batch tests relevance without bulk sending. Consent or an applicable PECR exemption must be recorded for every recipient.'),
    30, me)
  returning approvals.id into v_id;
  return v_id;
end;
$$;

-- Gates -------------------------------------------------------------------------------------

-- Approving a gate moves the company to the next stage and opens the next gate (bug B5).
create function public.approve_gate(p_gate uuid)
returns public.stage
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  g public.stage_gates;
  stages public.stage[] := enum_range(null::public.stage);
  next_stage public.stage;
begin
  select * into g from public.stage_gates where id = p_gate for update;
  if not found or not private.can_read_company(g.company_id) then
    raise exception 'Gate not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if not private.can_oversee_company(g.company_id) then
    raise exception 'Only a founder or mentor can approve a gate' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if g.status not in ('in_progress', 'ready') then
    raise exception 'This gate isn''t open for approval' using errcode = 'P0001', hint = 'gate_not_open';
  end if;
  next_stage := stages[array_position(stages, g.stage) + 1];

  update public.stage_gates set status = 'approved', approved_by = me, approved_at = now() where id = g.id;
  update public.companies set stage = next_stage where id = g.company_id;
  update public.stage_gates set status = 'in_progress'
  where company_id = g.company_id and stage = next_stage and status = 'locked';
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (g.company_id, 'gate', 'Gate approved: ' || initcap(next_stage::text) || ' phase begins', me);
  return next_stage;
end;
$$;

-- Tasks -------------------------------------------------------------------------------------

-- Proof of done (SPEC B9): Sol's tasks need every check passed plus a screenshot, a preview and
-- a PR or build link. Founder and mentor tasks can be marked done without it and show as
-- unverified until proof is added.
create function public.complete_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found or not private.can_read_company(t.company_id) then
    raise exception 'Task not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if not private.can_edit_company(t.company_id) then
    raise exception 'Only founders and teammates can complete tasks' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if t.status = 'done' then
    return;
  end if;
  if t.actor = 'sol' and not (
    coalesce((t.proof ->> 'total')::integer, 0) > 0
    and (t.proof ->> 'passed')::integer = (t.proof ->> 'total')::integer
    and coalesce(t.proof ->> 'screenshot', '') <> ''
    and coalesce(t.proof ->> 'preview', '') <> ''
    and coalesce(t.proof ->> 'pr', '') <> ''
  ) then
    raise exception 'Sol''s work needs proof before it''s done: every check passed, a screenshot, a preview and a build link.'
      using errcode = 'P0001', hint = 'needs_proof';
  end if;
  update public.tasks set status = 'done', completed_at = now() where id = t.id;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (t.company_id, t.pillar::text, 'Done: ' || t.title, me);
end;
$$;

-- Agent requests ----------------------------------------------------------------------------
-- Phase 4 moves these behind an Edge Function that quotes and reserves credits first.

create function public.enqueue_job(
  p_company uuid,
  p_job_type text,
  p_payload jsonb default '{}',
  p_task uuid default null,
  p_estimated_credits integer default 0
)
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
    raise exception 'Only founders and teammates can ask Sol to work' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if p_job_type !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'Unknown job type' using errcode = 'P0001', hint = 'invalid';
  end if;
  if p_task is not null and not exists (select 1 from public.tasks where id = p_task and company_id = p_company) then
    raise exception 'Task not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if coalesce(p_estimated_credits, 0) < 0 or private.company_balance(p_company) < coalesce(p_estimated_credits, 0) then
    raise exception 'Not enough credits for this' using errcode = 'P0001', hint = 'insufficient_credits';
  end if;
  insert into public.agent_jobs (company_id, task_id, job_type, payload, estimated_credits, created_by)
  values (p_company, p_task, p_job_type, coalesce(p_payload, '{}'), coalesce(p_estimated_credits, 0), me)
  returning agent_jobs.id into v_id;
  return v_id;
end;
$$;

create function public.post_chat_message(p_company uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  msg uuid;
begin
  if not private.can_edit_company(p_company) then
    raise exception 'Only founders and teammates can chat with Sol' using errcode = 'P0001', hint = 'forbidden';
  end if;
  if length(trim(coalesce(p_content, ''))) = 0 then
    raise exception 'Write a message first' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.chat_messages (company_id, sender, author_id, content)
  values (p_company, 'founder', me, trim(p_content)) returning id into msg;
  insert into public.agent_jobs (company_id, job_type, payload, created_by)
  values (p_company, 'chat', jsonb_build_object('message_id', msg), me);
  return msg;
end;
$$;

-- Grants ------------------------------------------------------------------------------------

revoke execute on function
  private.claims_flags(text, public.sector_pack, text[]),
  private.unbuilt_features(uuid),
  private.approval_text(public.approval_action, jsonb),
  private.company_balance(uuid),
  private.require_signed_in(),
  private.unique_slug(text)
from public, anon, authenticated;

revoke execute on function
  public.check_claims(uuid, text),
  public.create_company(text, text, public.customer_type, public.sector_pack, text, text, text, text, text),
  public.join_cohort(uuid, text),
  public.accept_invites(),
  public.decide_approval(uuid, public.approval_status),
  public.edit_approval(uuid, jsonb),
  public.ask_why(uuid),
  public.request_ad_budget(uuid, numeric, numeric),
  public.draft_outreach(uuid, text, text, text),
  public.approve_gate(uuid),
  public.complete_task(uuid),
  public.enqueue_job(uuid, text, jsonb, uuid, integer),
  public.post_chat_message(uuid, text)
from public, anon;

grant execute on function
  public.check_claims(uuid, text),
  public.create_company(text, text, public.customer_type, public.sector_pack, text, text, text, text, text),
  public.join_cohort(uuid, text),
  public.accept_invites(),
  public.decide_approval(uuid, public.approval_status),
  public.edit_approval(uuid, jsonb),
  public.ask_why(uuid),
  public.request_ad_budget(uuid, numeric, numeric),
  public.draft_outreach(uuid, text, text, text),
  public.approve_gate(uuid),
  public.complete_task(uuid),
  public.enqueue_job(uuid, text, jsonb, uuid, integer),
  public.post_chat_message(uuid, text)
to authenticated, service_role;

-- More tables the app follows live.
alter publication supabase_realtime add table
  public.stage_gates,
  public.companies,
  public.social_posts,
  public.media_assets,
  public.document_versions,
  public.email_messages;
