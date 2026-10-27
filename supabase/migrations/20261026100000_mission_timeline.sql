-- Phase 1 group 1b additions from the Mission HQ design (docs/STATUS.md, "For 1b"):
-- the flight plan's timeline, task actors, statutory deadlines, the theme setting and a
-- place for each company's definition of "activated".

-- companies: day 0 of the flight plan, and what counts as an activated user.
alter table public.companies
  add column started_at timestamptz not null default now(),
  add column activation_definition text;

-- stage_gates: one gate per stage transition, so there is no gate on the last stage.
delete from public.stage_gates where stage = 'grow';
alter table public.stage_gates
  add column target_date date,
  add constraint stage_gates_not_last_stage check (stage <> 'grow');

-- tasks: who does the work, and which tasks are flight plan milestones.
create type public.task_actor as enum ('sol', 'founder', 'mentor');
alter table public.tasks
  add column actor public.task_actor not null default 'sol',
  add column key boolean not null default false,
  add column stage public.stage,
  add constraint tasks_key_has_stage check (not key or stage is not null);
create index tasks_key_idx on public.tasks (company_id) where key;
grant insert (actor, key, stage) on public.tasks to authenticated;
grant update (actor, key, stage) on public.tasks to authenticated;

-- compliance_items: legal filings and fees with penalties if missed.
alter table public.compliance_items add column statutory boolean not null default false;
grant insert (statutory) on public.compliance_items to authenticated;
grant update (statutory) on public.compliance_items to authenticated;

-- user_preferences: light (default), dark or match the system.
alter table public.user_preferences
  add column theme text not null default 'light' check (theme in ('light', 'dark', 'system'));

-- metrics_daily: users who did the thing the company counts as activation.
alter table public.metrics_daily
  add column activated integer not null default 0 check (activated >= 0);
