-- Phase 21 (crew): what each crew member has achieved, and founder settings for the crew.
-- docs/CREW-PHASES.md Phase 21; DECISIONS D111 (outcomes are counted from the records they
-- describe), D112 (what mentors see).

-- How many outcomes an agent has achieved since a time, by its outcome key. A fixed list, so no
-- metric definition ever runs dynamic SQL. Agents standing by or locked have no figures (D103).
create function private.agent_outcomes(p_agent uuid, p_since timestamptz)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ag public.agents;
  k text;
  n integer;
begin
  select * into ag from public.agents where id = p_agent;
  if ag.id is null or ag.status in ('standing_by', 'locked') then
    return null;
  end if;
  k := ag.outcome_metric ->> 'key';

  n := case k
    -- Echo: approved posts the executor published.
    when 'posts_published' then (
      select count(*) from public.approvals a
      where a.company_id = ag.company_id and a.action_type = 'publish_post'
        and a.execution_status = 'done' and a.executed_at >= p_since)
    -- Nova: posts and emails she drafted for approval.
    when 'pieces_drafted' then (
      select count(*) from public.approvals a join public.agent_runs r on r.id = a.run_id
      where r.agent_id = ag.id and a.action_type in ('publish_post', 'send_email')
        and a.created_at >= p_since)
    -- Iris: voice versions the founder approved (not the default every company starts with).
    when 'brand_guide_approved' then (
      select count(*) from public.voice_profiles v
      where v.company_id = ag.company_id and v.source <> 'default'
        and v.approved_at is not null and v.approved_at >= p_since)
    -- Eve: assumptions that reached a verdict.
    when 'assumptions_tested' then (
      select count(*) from public.evidence_items e
      where e.company_id = ag.company_id and e.type = 'assumption'
        and e.status in ('validated', 'invalidated') and e.updated_at >= p_since)
    -- Penny: leads from forms, the hub page and QR codes.
    when 'leads_captured' then (
      select count(*) from public.leads l
      where l.company_id = ag.company_id and l.created_at >= p_since)
    -- Tilly: messages triaged.
    when 'messages_handled' then (
      select count(*) from public.inbox_items i
      where i.company_id = ag.company_id and i.processed_at >= p_since)
    -- Clara: filings and renewals on the calendar.
    when 'deadlines_tracked' then (
      select count(*) from public.compliance_items c
      where c.company_id = ag.company_id and c.created_at >= p_since)
    -- Shield: new versions of the privacy policy, terms and cookie notice.
    when 'policies_current' then (
      select count(*) from public.document_versions dv join public.documents d on d.id = dv.document_id
      where dv.company_id = ag.company_id and d.title ~* '(privacy|terms|cookie)'
        and dv.version > 1 and dv.created_at >= p_since)
    -- Dex: failed runs and recorded errors, caught before the founder noticed.
    when 'issues_caught' then (
      (select count(*) from public.agent_runs r
       where r.company_id = ag.company_id and r.status = 'failed' and r.created_at >= p_since)
      + (select count(*) from public.error_events e
         where e.company_id = ag.company_id and e.created_at >= p_since))
    -- Mo: facts the founder approved into company memory.
    when 'facts_added' then (
      select count(*) from public.memory_facts f
      where f.company_id = ag.company_id and f.created_at >= p_since)
    -- Mira: actions and items accepted from meetings and notes.
    when 'actions_routed' then (
      select count(*) from public.extracted_items x
      where x.company_id = ag.company_id and x.status = 'accepted' and x.decided_at >= p_since)
    -- Lumen: campaigns approved to run.
    when 'campaigns_live' then (
      select count(*) from public.campaigns c
      where c.company_id = ag.company_id and c.status in ('approved', 'drafting', 'ready')
        and c.created_at >= p_since)
    -- Sol, Rhea and anyone else: their finished runs.
    else (
      select count(*) from public.agent_runs r
      where r.agent_id = ag.id and r.status in ('succeeded', 'needs_approval')
        and r.created_at >= p_since)
  end;
  return n;
end;
$$;
revoke all on function private.agent_outcomes(uuid, timestamptz) from public;

-- The crew roster's figures for one company: outcomes (all time and this month), what each
-- agent is doing now, its last run and its credits this month against its cap. Members and
-- cohort mentors can read it (D112).
create function public.crew_stats(p_company uuid)
returns table (
  agent_id uuid,
  outcome_total integer,
  outcome_month integer,
  activity text,
  waiting integer,
  last_run_at timestamptz,
  credits_month integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_start timestamptz := date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London';
begin
  if not private.can_read_company(p_company) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
  select
    a.id,
    private.agent_outcomes(a.id, '-infinity'),
    private.agent_outcomes(a.id, month_start),
    case
      when a.status <> 'active' then a.status::text
      when exists (select 1 from public.agent_runs r where r.agent_id = a.id and r.status = 'running') then 'working'
      when w.n > 0 then 'waiting'
      else 'idle'
    end,
    w.n,
    (select max(coalesce(r.started_at, r.created_at)) from public.agent_runs r where r.agent_id = a.id),
    coalesce((select sum(r.credits_charged)::int from public.agent_runs r
              where r.agent_id = a.id and r.created_at >= month_start), 0)
  from public.agents a
  cross join lateral (
    select count(*)::int as n from public.approvals ap join public.agent_runs r on r.id = ap.run_id
    where r.agent_id = a.id and ap.status = 'pending'
  ) w
  where a.company_id = p_company;
end;
$$;
revoke all on function public.crew_stats(uuid) from public, anon;
grant execute on function public.crew_stats(uuid) to authenticated, service_role;

-- Founders adjust a crew member: its caps (never above the catalogue's per-run cap) and pause or
-- resume it. Logged in the activity feed.
create function public.update_agent_settings(p_agent uuid, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ag public.agents;
  cat public.agent_catalogue;
  per_run integer;
  per_month integer;
  next_status public.agent_status;
  said text[] := '{}';
begin
  select * into ag from public.agents where id = p_agent;
  if ag.id is null or not private.is_company_founder(ag.company_id) then
    raise exception 'only a founder can change the crew' using errcode = 'insufficient_privilege';
  end if;
  select * into cat from public.agent_catalogue where key = ag.catalogue_key;

  per_run := ag.budget_per_run_credits;
  if p_changes ? 'budget_per_run_credits' then
    per_run := (p_changes ->> 'budget_per_run_credits')::integer;
    if per_run is null or per_run < 1 or per_run > coalesce(cat.budget_per_run_credits, ag.budget_per_run_credits) then
      raise exception 'per-run limit must be between 1 and %', coalesce(cat.budget_per_run_credits, ag.budget_per_run_credits)
        using errcode = 'check_violation';
    end if;
    said := said || format('limit %s credits a run', per_run);
  end if;

  per_month := ag.budget_per_month_credits;
  if p_changes ? 'budget_per_month_credits' then
    per_month := (p_changes ->> 'budget_per_month_credits')::integer;
    if per_month is not null and per_month < 1 then
      raise exception 'monthly cap must be at least 1, or empty for none' using errcode = 'check_violation';
    end if;
    said := said || case when per_month is null then 'no monthly cap' else format('cap %s credits a month', per_month) end;
  end if;

  next_status := ag.status;
  if p_changes ? 'paused' then
    if ag.status = 'locked' then
      raise exception '% isn''t part of your plan', ag.name using errcode = 'check_violation';
    end if;
    next_status := case
      when (p_changes ->> 'paused')::boolean then 'paused'
      when coalesce(cat.engine, true) then 'active'
      else 'standing_by'
    end::public.agent_status;
    said := said || case when next_status = 'paused' then 'paused' else 'resumed' end;
  end if;

  update public.agents
  set budget_per_run_credits = per_run, budget_per_month_credits = per_month, status = next_status
  where id = ag.id;

  if array_length(said, 1) > 0 then
    insert into public.activity_events (company_id, type, summary, actor_id)
    values (ag.company_id, 'crew', format('%s: %s', ag.name, array_to_string(said, ', ')), auth.uid());
  end if;
end;
$$;
revoke all on function public.update_agent_settings(uuid, jsonb) from public, anon;
grant execute on function public.update_agent_settings(uuid, jsonb) to authenticated;
