-- Agent work: jobs, runs, approvals, activity and chat.
-- App users can only read these tables. Writes come from the service role (the agent
-- service and Edge Functions) or from RPCs with explicit checks (groups 1d and 1e).

create type public.job_status as enum ('queued', 'running', 'done', 'failed');
create type public.run_status as enum ('queued', 'running', 'succeeded', 'failed', 'needs_approval');
create type public.approval_action as enum (
  'publish_post', 'send_email', 'ad_spend', 'file_document', 'publish_site'
);
create type public.approval_status as enum ('pending', 'approved', 'declined');
create type public.chat_sender as enum ('founder', 'sol');

-- agent_jobs: the queue the agent service claims from (SPEC part C) --------------------------

create table public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  job_type text not null,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  status public.job_status not null default 'queued',
  scheduled_for timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  -- SPEC C: at most 2 attempts, then escalate to the founder.
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  estimated_credits integer not null default 0 check (estimated_credits >= 0),
  last_error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index agent_jobs_company_id_idx on public.agent_jobs (company_id);
create index agent_jobs_task_id_idx on public.agent_jobs (task_id);
create index agent_jobs_created_by_idx on public.agent_jobs (created_by);
-- For claiming: the oldest due job first.
create index agent_jobs_queue_idx on public.agent_jobs (scheduled_for) where status = 'queued';

-- agent_runs -------------------------------------------------------------------------------

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid references public.agent_jobs (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  task text not null,
  pillar public.pillar not null,
  model text not null,
  status public.run_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  cost_usd numeric(10, 4) not null default 0 check (cost_usd >= 0),
  credits_charged integer not null default 0 check (credits_charged >= 0),
  -- { "input_tokens": 0, "output_tokens": 0 }
  usage jsonb not null default '{"input_tokens": 0, "output_tokens": 0}' check (jsonb_typeof(usage) = 'object'),
  -- [{ "tool": "web_search", "summary": "...", "credits": 10 }, ...]
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  created_at timestamptz not null default now()
);
create index agent_runs_company_id_idx on public.agent_runs (company_id, started_at desc);
create index agent_runs_job_id_idx on public.agent_runs (job_id);
create index agent_runs_task_id_idx on public.agent_runs (task_id);

-- approvals --------------------------------------------------------------------------------

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  run_id uuid references public.agent_runs (id) on delete set null,
  action_type public.approval_action not null,
  -- Shape depends on action_type; see ApprovalPayloads in src/lib/types.ts.
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  estimated_credits integer not null default 0 check (estimated_credits >= 0),
  status public.approval_status not null default 'pending',
  -- Set when a founder asks for the approval themselves (e.g. an ad budget change).
  requested_by uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null))
);
create index approvals_company_id_idx on public.approvals (company_id, created_at desc);
create index approvals_run_id_idx on public.approvals (run_id);
create index approvals_requested_by_idx on public.approvals (requested_by);
create index approvals_decided_by_idx on public.approvals (decided_by);
create trigger approvals_updated_at before update on public.approvals
  for each row execute function private.set_updated_at();

-- activity_events --------------------------------------------------------------------------

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null,
  summary text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index activity_events_company_id_idx on public.activity_events (company_id, created_at desc);
create index activity_events_actor_id_idx on public.activity_events (actor_id);
create index activity_events_run_id_idx on public.activity_events (run_id);

-- chat_messages ----------------------------------------------------------------------------

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sender public.chat_sender not null,
  -- The person who wrote a founder-side message.
  author_id uuid references public.profiles (id) on delete set null,
  content text not null check (length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  check (sender = 'sol' or author_id is not null)
);
create index chat_messages_company_id_idx on public.chat_messages (company_id, created_at);
create index chat_messages_author_id_idx on public.chat_messages (author_id);

-- Read-only access for app users ------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['agent_jobs', 'agent_runs', 'approvals', 'activity_events', 'chat_messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy "Read for companies you can read" on public.%I for select to authenticated using (private.can_read_company(company_id))',
      t
    );
  end loop;
end;
$$;
