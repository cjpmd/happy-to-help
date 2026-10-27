-- The approvals executor (Phase 5, CLAUDE.md rule 4): approved actions are carried out by a
-- deterministic executor in the agent service, never by the agent and never by the browser.
-- An approved action is queued for execution; the executor claims it, re-checks the rules,
-- calls the provider, charges its credits and records what happened here.

create type public.execution_status as enum (
  'not_started',  -- pending or declined: nothing to do
  'queued',       -- approved, waiting for the executor
  'executing',    -- claimed by an executor
  'done',         -- carried out; execution_result has the provider's reference
  'blocked',      -- a rule stopped it (no charge); execution_error says which
  'failed'        -- the provider failed after retries (refunded); execution_error says why
);

alter table public.approvals
  add column execution_status public.execution_status not null default 'not_started',
  add column execution_result jsonb check (execution_result is null or jsonb_typeof(execution_result) = 'object'),
  add column execution_error text,
  add column execution_attempts integer not null default 0 check (execution_attempts >= 0),
  add column executed_at timestamptz,
  add column execution_run_id uuid references public.agent_runs (id) on delete set null,
  -- Why a founder or mentor said NO-GO; the agent reads it on its next run.
  add column decision_note text check (decision_note is null or length(decision_note) <= 1000),
  add constraint approvals_execution_only_when_approved
    check (execution_status = 'not_started' or status = 'approved');
create index approvals_execution_queue_idx on public.approvals (decided_at)
  where execution_status = 'queued';
create index approvals_execution_run_id_idx on public.approvals (execution_run_id);

-- Approvals approved before the executor existed count as carried out.
update public.approvals set execution_status = 'done', executed_at = decided_at
where status = 'approved';

-- decide_approval gains an optional note and queues approved actions for the executor.
drop function public.decide_approval(uuid, public.approval_status);
create function public.decide_approval(
  p_approval uuid,
  p_decision public.approval_status,
  p_note text default null
)
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
    if private.company_balance(a.company_id) + coalesce(private.cohort_headroom(a.company_id), 0) < a.estimated_credits then
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
  set status = p_decision, decided_by = me, decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), ''),
      execution_status = case when p_decision = 'approved' then 'queued' else 'not_started' end::public.execution_status
  where id = a.id;

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
revoke execute on function public.decide_approval(uuid, public.approval_status, text) from public, anon;
grant execute on function public.decide_approval(uuid, public.approval_status, text) to authenticated, service_role;

-- The executor claims the oldest approved action. SKIP LOCKED lets several executors run.
create function public.claim_approval_execution(p_worker text)
returns setof public.approvals
language sql
security definer
set search_path = ''
as $$
  update public.approvals a
  set execution_status = 'executing', execution_attempts = a.execution_attempts + 1
  where a.id = (
    select q.id from public.approvals q
    where q.execution_status = 'queued'
    order by q.decided_at
    for update skip locked
    limit 1
  )
  returning a.*
$$;

-- Settles a run in credits rather than USD (the executor charges an action's fixed price).
create function public.settle_run_credits(p_run uuid, p_credits integer, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.agent_runs;
  held integer;
  charge integer;
begin
  select * into r from public.agent_runs where id = p_run for update;
  if not found then
    raise exception 'Run not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  perform private.lock_company_credits(r.company_id);
  select coalesce(-sum(amount), 0) into held
  from public.credit_ledger where run_id = p_run and entry_type in ('hold', 'release');
  if held <= 0 then
    raise exception 'This run has nothing reserved (it may already be settled)'
      using errcode = 'P0001', hint = 'already_settled';
  end if;
  charge := least(greatest(coalesce(p_credits, 0), 0), held);
  perform private.release_run_holds(p_run, 'Action finished — hold released');
  if charge > 0 then
    perform private.debit(r.company_id, 'usage', charge, p_run, coalesce(p_note, r.task));
  end if;
  update public.agent_runs set credits_charged = charge where id = p_run;
  return charge;
end;
$$;

revoke execute on function public.claim_approval_execution(text), public.settle_run_credits(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.claim_approval_execution(text), public.settle_run_credits(uuid, integer, text)
  to service_role;
