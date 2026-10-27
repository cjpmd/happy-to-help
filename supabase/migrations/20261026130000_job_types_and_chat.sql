-- Phase 4: one place for job estimates and model prices, and the server side of streaming chat.

-- Job types: the credit estimate shown before a run and the most a run may reserve. The agent
-- service reads its estimates and caps from here; the app shows the estimate ("≈ N credits").
create table public.job_types (
  job_type text primary key check (job_type ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null,
  pillar public.pillar not null,
  -- routine (smallest model), planning (mid-tier) or strategy (strongest).
  tier text not null check (tier in ('routine', 'planning', 'strategy')),
  estimate_credits integer not null check (estimate_credits > 0),
  cap_credits integer not null,
  updated_at timestamptz not null default now(),
  check (cap_credits >= estimate_credits)
);
create trigger job_types_updated_at before update on public.job_types
  for each row execute function private.set_updated_at();

insert into public.job_types (job_type, label, pillar, tier, estimate_credits, cap_credits) values
  ('chat', 'Chat with Sol', 'run', 'routine', 10, 30),
  ('social_post', 'Write social post', 'grow', 'routine', 40, 120),
  ('email_reply', 'Draft email reply', 'run', 'routine', 30, 90),
  ('document_update', 'Update document', 'run', 'planning', 120, 300),
  ('task', 'Run task', 'build', 'planning', 150, 600),
  ('media_image', 'Generate image', 'grow', 'routine', 120, 200),
  ('media_video', 'Generate video', 'grow', 'routine', 400, 600),
  ('auto_mode', 'Auto Mode', 'run', 'planning', 150, 1200);

alter table public.job_types enable row level security;
revoke all on public.job_types from anon, authenticated, service_role;
grant select on public.job_types to authenticated, service_role;
grant insert, update on public.job_types to service_role;
create policy "Everyone signed in can read job estimates" on public.job_types
  for select to authenticated using (true);

-- Model prices in USD per million tokens, for costing runs that don't come through the Agent
-- SDK (which reports its own total_cost_usd), such as streaming chat.
create table public.model_prices (
  model text primary key,
  input_per_mtok numeric(10, 4) not null check (input_per_mtok >= 0),
  output_per_mtok numeric(10, 4) not null check (output_per_mtok >= 0),
  updated_at timestamptz not null default now()
);
insert into public.model_prices (model, input_per_mtok, output_per_mtok) values
  ('claude-haiku-5-5', 0.10, 0.50),
  ('claude-sonnet-5-5', 2.00, 10.00),
  ('claude-opus-5-5', 4.00, 20.00);
alter table public.model_prices enable row level security;
revoke all on public.model_prices from anon, authenticated, service_role;
grant select, insert, update on public.model_prices to service_role;

-- The job's estimate now comes from job_types, not from the caller. Hourly jobs (Auto Mode)
-- may pass a larger estimate for longer windows; it can never be less than the catalogue's.
create or replace function public.enqueue_job(
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
  jt public.job_types;
  estimate integer;
  v_id uuid;
begin
  if not private.can_edit_company(p_company) then
    raise exception 'Only founders and teammates can ask Sol to work' using errcode = 'P0001', hint = 'forbidden';
  end if;
  select * into jt from public.job_types where job_type = p_job_type;
  if not found or p_job_type = 'chat' then
    raise exception 'Unknown job type' using errcode = 'P0001', hint = 'invalid';
  end if;
  if p_task is not null and not exists (select 1 from public.tasks where id = p_task and company_id = p_company) then
    raise exception 'Task not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  estimate := greatest(jt.estimate_credits, coalesce(p_estimated_credits, 0));
  if private.company_balance(p_company) + coalesce(private.cohort_headroom(p_company), 0) < estimate then
    raise exception 'Not enough credits: this needs about % credits.', estimate
      using errcode = 'P0001', hint = 'insufficient_credits';
  end if;
  insert into public.agent_jobs (company_id, task_id, job_type, payload, estimated_credits, created_by)
  values (p_company, p_task, p_job_type, coalesce(p_payload, '{}'), estimate, me)
  returning agent_jobs.id into v_id;
  return v_id;
end;
$$;

-- Starts a streamed chat turn: checks the caller may chat for the company and records their
-- message. The chat Edge Function then reserves credits, streams Sol's reply and settles.
create function public.begin_chat_turn(p_company uuid, p_content text)
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
  if length(trim(coalesce(p_content, ''))) = 0 or length(p_content) > 4000 then
    raise exception 'Write a message of up to 4,000 characters' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.chat_messages (company_id, sender, author_id, content)
  values (p_company, 'founder', me, trim(p_content)) returning id into msg;
  return msg;
end;
$$;
revoke execute on function public.begin_chat_turn(uuid, text) from public, anon;
grant execute on function public.begin_chat_turn(uuid, text) to authenticated, service_role;

alter publication supabase_realtime add table public.job_types;
