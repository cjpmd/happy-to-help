-- What the agent service (agent-service/) needs from the database (Phase 3, SPEC part C):
-- claiming jobs safely when several workers run, appending run steps atomically, and
-- recovering runs a crashed worker left behind. Service role only.

alter table public.agent_jobs
  add column locked_by text,
  add column heartbeat_at timestamptz,
  -- The run the latest attempt created.
  add column run_id uuid references public.agent_runs (id) on delete set null;
create index agent_jobs_run_id_idx on public.agent_jobs (run_id);

-- Claims the oldest due job. SKIP LOCKED lets any number of workers poll at once without
-- taking the same job. The attempt counter goes up on claim, so a worker that dies mid-run
-- still uses up an attempt (SPEC C: at most 2, then escalate).
create function public.claim_agent_job(p_worker text, p_job_types text[] default null)
returns setof public.agent_jobs
language sql
security definer
set search_path = ''
as $$
  update public.agent_jobs j
  set status = 'running', attempts = j.attempts + 1, started_at = now(), finished_at = null,
      locked_by = p_worker, heartbeat_at = now()
  where j.id = (
    select q.id from public.agent_jobs q
    where q.status = 'queued' and q.scheduled_for <= now()
      and (p_job_types is null or q.job_type = any (p_job_types))
    order by q.scheduled_for, q.created_at
    for update skip locked
    limit 1
  )
  returning j.*
$$;

-- Keeps a long run's claim fresh so the reaper leaves it alone.
create function public.heartbeat_agent_job(p_job uuid, p_worker text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.agent_jobs set heartbeat_at = now()
  where id = p_job and status = 'running' and locked_by = p_worker
  returning true
$$;

-- Appends one step to a run (the audit hook calls this for every tool use).
create function public.append_run_step(p_run uuid, p_step jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.agent_runs
  set steps = steps || jsonb_build_array(p_step)
  where id = p_run
$$;

-- Recovers work a crashed or stopped worker left behind (bug B8: a run showed as running
-- forever). A running job whose heartbeat is older than p_stale goes back on the queue if it
-- has attempts left, otherwise it fails. Its run is marked failed and refunded, because the
-- platform failed it, not the founder. Runs marked running with no live job are failed too.
-- Returns how many runs were recovered.
create function public.reap_stale_runs(p_stale interval default interval '15 minutes')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  j record;
  r record;
  n integer := 0;
begin
  for j in
    select * from public.agent_jobs
    where status = 'running' and coalesce(heartbeat_at, started_at, created_at) < now() - p_stale
    for update skip locked
  loop
    update public.agent_jobs
    set status = case when attempts < max_attempts then 'queued' else 'failed' end::public.job_status,
        locked_by = null,
        scheduled_for = now(),
        finished_at = case when attempts < max_attempts then null else now() end,
        last_error = 'The worker stopped responding'
    where id = j.id;
  end loop;

  for r in
    select ar.* from public.agent_runs ar
    where ar.status = 'running'
      and coalesce(ar.started_at, ar.created_at) < now() - p_stale
      and not exists (
        select 1 from public.agent_jobs aj
        where aj.run_id = ar.id and aj.status = 'running'
      )
    for update skip locked
  loop
    update public.agent_runs set status = 'failed', finished_at = now() where id = r.id;
    if not exists (select 1 from public.credit_ledger where run_id = r.id and entry_type = 'refund') then
      perform public.refund_run(r.id, 'the run was interrupted');
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function
  public.claim_agent_job(text, text[]),
  public.heartbeat_agent_job(uuid, text),
  public.append_run_step(uuid, jsonb),
  public.reap_stale_runs(interval)
from public, anon, authenticated;
grant execute on function
  public.claim_agent_job(text, text[]),
  public.heartbeat_agent_job(uuid, text),
  public.append_run_step(uuid, jsonb),
  public.reap_stale_runs(interval)
to service_role;
