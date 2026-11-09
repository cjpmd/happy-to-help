-- Phase 20 (crew), last step: every run has an agent (D109).
--
-- The agent service, the chat function and the executor now record agent_runs.agent_id
-- themselves, and 20261110100100 backfilled every older run. So the column becomes NOT NULL.
-- A trigger fills it, by the same rule as the backfill, for any writer that still leaves it out
-- (older deploys of the worker during a rollout, seed data, tests), and refuses an agent from
-- another company.

create function private.fill_run_agent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jt text;
  payload jsonb;
begin
  if new.agent_id is null then
    if new.job_id is not null then
      select j.job_type, j.payload into jt, payload from public.agent_jobs j where j.id = new.job_id;
    end if;
    -- The backfill's rules (20261110100100, private.attribute_runs): by job type; chat is Sol's;
    -- otherwise the pillar's Starter crew member; else Sol.
    new.agent_id := coalesce(
      case when jt is not null then public.agent_for_job(new.company_id, jt, payload) end,
      case when new.task = 'Chat with Sol' then private.crew_agent(new.company_id, 'sol') end,
      private.crew_agent(new.company_id, case new.pillar
        when 'grow' then 'nova' when 'legal' then 'clara' when 'run' then 'tilly' else 'sol' end),
      private.crew_agent(new.company_id, 'sol')
    );
  elsif not exists (
    select 1 from public.agents a where a.id = new.agent_id and a.company_id = new.company_id
  ) then
    raise exception 'agent % does not belong to company %', new.agent_id, new.company_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.fill_run_agent() from public;

create trigger agent_runs_fill_agent before insert or update of agent_id on public.agent_runs
  for each row execute function private.fill_run_agent();

-- Anything attributed since the backfill (there should be nothing left).
select private.attribute_runs();

-- Agents are paused or locked, never deleted, so a run's agent can't go away on its own. The
-- check is NO ACTION (end of statement) so deleting a whole company, which removes its runs and
-- its agents together, still works.
alter table public.agent_runs drop constraint agent_runs_agent_id_fkey;
alter table public.agent_runs
  add constraint agent_runs_agent_id_fkey foreign key (agent_id) references public.agents (id),
  alter column agent_id set not null;
