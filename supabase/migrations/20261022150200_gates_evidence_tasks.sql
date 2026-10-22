-- Stage gates, mentor comments, the evidence board and tasks.

create type public.gate_status as enum ('locked', 'in_progress', 'ready', 'approved');
create type public.evidence_type as enum ('assumption', 'interview', 'waitlist', 'preorder');
create type public.assumption_status as enum ('untested', 'testing', 'validated', 'invalidated');
create type public.task_status as enum ('todo', 'doing', 'done');

-- stage_gates: one row per company per stage. Approved only through an RPC (group 1e). ------

create table public.stage_gates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  stage public.stage not null,
  -- [{ "label": "Waitlist", "current": 64, "target": 50 }, ...]
  criteria jsonb not null default '[]' check (jsonb_typeof(criteria) = 'array'),
  status public.gate_status not null default 'locked',
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  unique (company_id, stage)
);
create index stage_gates_approved_by_idx on public.stage_gates (approved_by);

alter table public.stage_gates enable row level security;
revoke all on public.stage_gates from anon, authenticated;
grant select on public.stage_gates to authenticated;
create policy "Read gates for companies you can read" on public.stage_gates
  for select to authenticated using (private.can_read_company(company_id));

-- gate_comments: mentors' feedback, and founders' replies ------------------------------------

create table public.gate_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index gate_comments_company_id_idx on public.gate_comments (company_id);
create index gate_comments_author_id_idx on public.gate_comments (author_id);

alter table public.gate_comments enable row level security;
revoke all on public.gate_comments from anon, authenticated;
grant select, delete on public.gate_comments to authenticated;
grant insert (company_id, body) on public.gate_comments to authenticated;
create policy "Read comments for companies you can read" on public.gate_comments
  for select to authenticated using (private.can_read_company(company_id));
create policy "Comment on companies you can read" on public.gate_comments
  for insert to authenticated
  with check (author_id = auth.uid() and private.can_read_company(company_id));
create policy "Delete your own comments" on public.gate_comments
  for delete to authenticated using (author_id = auth.uid());

-- evidence_items ---------------------------------------------------------------------------

create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  type public.evidence_type not null,
  title text not null,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  -- Only assumptions have a status.
  status public.assumption_status check (status is null or type = 'assumption'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index evidence_items_company_id_idx on public.evidence_items (company_id);
create trigger evidence_items_updated_at before update on public.evidence_items
  for each row execute function private.set_updated_at();

alter table public.evidence_items enable row level security;
revoke all on public.evidence_items from anon, authenticated;
grant select, delete on public.evidence_items to authenticated;
grant insert (company_id, type, title, data, status) on public.evidence_items to authenticated;
grant update (type, title, data, status) on public.evidence_items to authenticated;
create policy "Read evidence for companies you can read" on public.evidence_items
  for select to authenticated using (private.can_read_company(company_id));
create policy "Founders and teammates add evidence" on public.evidence_items
  for insert to authenticated with check (private.can_edit_company(company_id));
create policy "Founders and teammates edit evidence" on public.evidence_items
  for update to authenticated
  using (private.can_edit_company(company_id)) with check (private.can_edit_company(company_id));
create policy "Founders and teammates delete evidence" on public.evidence_items
  for delete to authenticated using (private.can_edit_company(company_id));

-- tasks ------------------------------------------------------------------------------------
-- Founders and teammates can add and edit tasks. Status, estimates and proof are set by the
-- agent (service role) or, for completion, by an RPC that checks the proof (group 1e).

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  pillar public.pillar not null,
  title text not null check (length(trim(title)) > 0),
  status public.task_status not null default 'todo',
  estimated_credits integer not null default 0 check (estimated_credits >= 0),
  due date,
  -- { "passed": 6, "total": 6, "screenshot": "...", "preview": "...", "pr": "...", "source": "agent" }
  proof jsonb check (proof is null or jsonb_typeof(proof) = 'object'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_company_id_idx on public.tasks (company_id);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();

alter table public.tasks enable row level security;
revoke all on public.tasks from anon, authenticated;
grant select, delete on public.tasks to authenticated;
grant insert (company_id, pillar, title, due) on public.tasks to authenticated;
grant update (pillar, title, due) on public.tasks to authenticated;
create policy "Read tasks for companies you can read" on public.tasks
  for select to authenticated using (private.can_read_company(company_id));
create policy "Founders and teammates add tasks" on public.tasks
  for insert to authenticated with check (private.can_edit_company(company_id));
create policy "Founders and teammates edit tasks" on public.tasks
  for update to authenticated
  using (private.can_edit_company(company_id)) with check (private.can_edit_company(company_id));
create policy "Founders and teammates delete unfinished tasks" on public.tasks
  for delete to authenticated using (private.can_edit_company(company_id) and status <> 'done');
