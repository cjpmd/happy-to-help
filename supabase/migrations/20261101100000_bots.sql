-- Process bots (Phase 17, SPEC L): trigger → conditions → steps → approval level → weekly credit
-- cap, on the Phase 8 scheduler. Bots are made from templates and run by the agent service
-- (agent-service/src/bots.ts) with the service role. Agents propose, the executor acts: every
-- email is an approval, sent after a GO, or after the founder approved the bot's wording.

-- The templates (SPEC L). A step is one of:
--   { "kind": "email", "after_days": 2, "subject": "...", "body": "...", "marketing": false }
--   { "kind": "task", "after_days": 0, "title": "..." }
--   { "kind": "feedback_request", "after_days": 3 }
--   { "kind": "summary", "after_days": 0 }
-- {first_name} and {company} are filled in when the step runs.
create table public.bot_templates (
  key text primary key,
  name text not null,
  description text not null,
  trigger jsonb not null check (jsonb_typeof(trigger) = 'object'),
  conditions jsonb not null default '{}' check (jsonb_typeof(conditions) = 'object'),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 6),
  -- A connection the template needs before it can be switched on (e.g. 'stripe').
  needs text,
  sort integer not null default 0
);
alter table public.bot_templates enable row level security;
revoke all on public.bot_templates from anon, authenticated;
grant select on public.bot_templates to authenticated;
create policy "Anyone signed in reads the bot templates" on public.bot_templates
  for select to authenticated using (true);

insert into public.bot_templates (key, name, description, trigger, conditions, steps, needs, sort) values
('lead_follow_up', 'Lead follow-up',
  'When a new lead comes in, reply the next day if nobody has, then one gentle follow-up a few days later for leads who opted in. Stops when they reply or you win them.',
  '{"event": "lead_created"}', '{"stop_if_replied": true, "stop_if_won": true}',
  '[{"kind": "email", "after_days": 1, "marketing": false, "subject": "Thanks for getting in touch", "body": "Hello {first_name},\n\nThanks for your enquiry. I wanted to check you have everything you need from us. Just reply to this email with any questions.\n\n{company}"},
    {"kind": "email", "after_days": 5, "marketing": true, "subject": "Any questions?", "body": "Hello {first_name},\n\nI''m following up on your enquiry in case it got lost. If now isn''t the right time, no problem at all.\n\n{company}"}]',
  null, 1),
('review_request', 'Review request',
  'A few days after a purchase or a booking, ask customers who opted in how it went, with a one-minute feedback page.',
  '{"event": "lead_won"}', '{}', '[{"kind": "feedback_request", "after_days": 3}]', null, 2),
('payment_reminder', 'Invoice and payment reminders',
  'Polite reminders when an invoice is overdue, through your own Stripe account.',
  '{"event": "invoice_overdue"}', '{}',
  '[{"kind": "email", "after_days": 1, "marketing": false, "subject": "A friendly reminder about your invoice", "body": "Hello {first_name},\n\nA quick reminder that your invoice from {company} is now due. If you''ve already paid, thank you, and please ignore this.\n\n{company}"}]',
  'stripe', 3),
('onboarding', 'New-customer onboarding',
  'Welcome new customers, then a useful tip a week later for those who opted in. You get a task to check in personally.',
  '{"event": "customer_added"}', '{}',
  '[{"kind": "email", "after_days": 0, "marketing": false, "subject": "Welcome to {company}", "body": "Hello {first_name},\n\nWelcome, and thank you for choosing us. If you need anything, just reply to this email.\n\n{company}"},
    {"kind": "task", "after_days": 3, "title": "Check in with {first_name}"},
    {"kind": "email", "after_days": 7, "marketing": true, "subject": "Getting the most from {company}", "body": "Hello {first_name},\n\nA week in, here''s a tip: tell us what you''d like more of, and we''ll let you know when it''s ready.\n\n{company}"}]',
  null, 4),
('win_back', 'Lapsed-customer win-back',
  'When a customer who opted in hasn''t been in touch for three months, a friendly note to say hello.',
  '{"event": "lapsed", "days": 90}', '{"stop_if_replied": true}',
  '[{"kind": "email", "after_days": 0, "marketing": true, "subject": "We''ve missed you at {company}", "body": "Hello {first_name},\n\nIt''s been a while, so we wanted to say hello. We''d love to see you again whenever suits.\n\n{company}"}]',
  null, 5),
('weekly_summary', 'Weekly performance summary',
  'Every Monday morning, a short summary of last week in your chat with Sol: leads, customers, posts, replies and credits.',
  '{"schedule": "weekly"}', '{}', '[{"kind": "summary", "after_days": 0}]', null, 6);

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  template text not null references public.bot_templates (key),
  name text not null check (length(trim(name)) between 1 and 80),
  enabled boolean not null default false,
  trigger jsonb not null,
  conditions jsonb not null default '{}',
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  -- 'each': every email waits for a GO. 'approved_wording': emails go out with wording a founder
  -- approved (claims-checked); any change to the wording needs approving again.
  approval_level text not null default 'each' check (approval_level in ('each', 'approved_wording')),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  cap_credits_week integer not null default 50 check (cap_credits_week between 0 and 2000),
  -- Events before this aren't picked up, so switching a bot on doesn't email the past.
  enabled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, template),
  check (approval_level = 'each' or approved_by is not null)
);
create index bots_approved_by_idx on public.bots (approved_by);
create index bots_created_by_idx on public.bots (created_by);
create index bots_template_idx on public.bots (template);
create trigger bots_updated_at before update on public.bots
  for each row execute function private.set_updated_at();

create table public.bot_runs (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  step integer not null check (step >= 0),
  -- Distinguishes repeat enrolments: the week for scheduled bots, the year for win-backs.
  period text not null default '',
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'failed')),
  due_at timestamptz not null,
  approval_id uuid references public.approvals (id) on delete set null,
  credits integer not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique nulls not distinct (bot_id, contact_id, step, period)
);
create index bot_runs_due_idx on public.bot_runs (due_at) where status = 'pending';
create index bot_runs_company_id_idx on public.bot_runs (company_id, created_at desc);
create index bot_runs_contact_id_idx on public.bot_runs (contact_id);
create index bot_runs_approval_id_idx on public.bot_runs (approval_id);

alter table public.bots enable row level security;
revoke all on public.bots from anon, authenticated;
grant select on public.bots to authenticated;
create policy "Read bots for companies you can read" on public.bots
  for select to authenticated using (private.can_read_company(company_id));

-- Runs name the contacts they reached: the people who run the company only.
alter table public.bot_runs enable row level security;
revoke all on public.bot_runs from anon, authenticated;
grant select on public.bot_runs to authenticated;
create policy "Founders and teammates read bot runs" on public.bot_runs
  for select to authenticated using (private.can_edit_company(company_id));

create function public.create_bot(p_company uuid, p_template text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  t public.bot_templates;
  v_id uuid;
begin
  if not private.is_company_founder(p_company) then
    raise exception 'Only a founder can add a bot' using errcode = 'P0001', hint = 'forbidden';
  end if;
  select * into t from public.bot_templates where key = p_template;
  if not found then
    raise exception 'Unknown bot' using errcode = 'P0001', hint = 'invalid';
  end if;
  insert into public.bots (company_id, template, name, trigger, conditions, steps, created_by)
  values (p_company, t.key, t.name, t.trigger, t.conditions, t.steps, me)
  on conflict (company_id, template) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'You already have this bot' using errcode = 'P0001', hint = 'conflict';
  end if;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (p_company, 'run', format('Bot added: %s (switched off)', t.name), me);
  return v_id;
end;
$$;

-- Changes a bot. Only the wording and timing of its steps can change, not what they do.
create function public.update_bot(
  p_bot uuid,
  p_enabled boolean default null,
  p_approval_level text default null,
  p_cap_credits_week integer default null,
  p_steps jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  b public.bots;
  v_needs text;
  v_steps jsonb;
  v_level text;
  i integer;
  s jsonb;
  n jsonb;
  v_text text;
  v_flags jsonb;
begin
  select * into b from public.bots where id = p_bot for update;
  if not found or not private.is_company_founder(b.company_id) then
    raise exception 'Only a founder can change a bot' using errcode = 'P0001', hint = 'forbidden';
  end if;
  v_steps := b.steps;
  if p_steps is not null then
    if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) <> jsonb_array_length(b.steps) then
      raise exception 'A bot keeps its steps; you can change their wording and timing' using errcode = 'P0001', hint = 'invalid';
    end if;
    for i in 0 .. jsonb_array_length(b.steps) - 1 loop
      s := b.steps -> i;
      n := p_steps -> i;
      if (n ->> 'after_days') !~ '^\d{1,2}$' or (n ->> 'after_days')::integer > 90 then
        raise exception 'Days must be between 0 and 90' using errcode = 'P0001', hint = 'invalid';
      end if;
      s := jsonb_set(s, '{after_days}', to_jsonb((n ->> 'after_days')::integer));
      if s ->> 'kind' = 'email' then
        if length(trim(coalesce(n ->> 'subject', ''))) not between 1 and 150
          or length(trim(coalesce(n ->> 'body', ''))) not between 1 and 3000 then
          raise exception 'Each email needs a subject and a message' using errcode = 'P0001', hint = 'invalid';
        end if;
        s := s || jsonb_build_object('subject', trim(n ->> 'subject'), 'body', trim(n ->> 'body'));
      elsif s ->> 'kind' = 'task' then
        if length(trim(coalesce(n ->> 'title', ''))) not between 1 and 200 then
          raise exception 'Each task needs a title' using errcode = 'P0001', hint = 'invalid';
        end if;
        s := s || jsonb_build_object('title', trim(n ->> 'title'));
      end if;
      v_steps := jsonb_set(v_steps, array[i::text], s);
    end loop;
  end if;
  -- New wording needs approving again.
  v_level := coalesce(p_approval_level, case when v_steps is distinct from b.steps then 'each' else b.approval_level end);
  if v_level not in ('each', 'approved_wording') then
    raise exception 'Unknown approval level' using errcode = 'P0001', hint = 'invalid';
  end if;
  if v_level = 'approved_wording' and (p_approval_level is not null or v_steps is distinct from b.steps) then
    -- The founder is approving this wording now: it must pass the claims check.
    for s in select value from jsonb_array_elements(v_steps) where value ->> 'kind' = 'email' loop
      v_text := concat_ws(E'\n', s ->> 'subject', s ->> 'body');
      v_flags := public.check_claims(b.company_id, v_text);
      if jsonb_array_length(coalesce(v_flags, '[]')) > 0 then
        raise exception 'The claims check flagged "%". Change the wording first.', v_flags -> 0 ->> 'phrase'
          using errcode = 'P0001', hint = 'claims';
      end if;
    end loop;
  end if;
  if coalesce(p_enabled, b.enabled) and not b.enabled then
    select needs into v_needs from public.bot_templates where key = b.template;
    if v_needs = 'stripe' then
      raise exception 'This bot needs your Stripe account connected, which isn''t available yet' using errcode = 'P0001', hint = 'unavailable';
    end if;
  end if;
  update public.bots set
    enabled = coalesce(p_enabled, enabled),
    enabled_at = case when coalesce(p_enabled, enabled) and not enabled then now() else enabled_at end,
    steps = v_steps,
    approval_level = v_level,
    approved_by = case when v_level = 'approved_wording' then
      case when p_approval_level is not null or v_steps is distinct from b.steps then me else approved_by end end,
    approved_at = case when v_level = 'approved_wording' then
      case when p_approval_level is not null or v_steps is distinct from b.steps then now() else approved_at end end,
    cap_credits_week = coalesce(p_cap_credits_week, cap_credits_week)
  where id = p_bot;
  -- Switching a bot off stops what it had planned.
  if p_enabled = false and b.enabled then
    update public.bot_runs set status = 'skipped', reason = 'Bot switched off', finished_at = now()
    where bot_id = p_bot and status = 'pending';
  end if;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (b.company_id, 'run', format('Bot changed: %s%s', b.name,
    case when p_enabled is true and not b.enabled then ' (switched on)' when p_enabled is false and b.enabled then ' (switched off)' else '' end), me);
end;
$$;

create function public.delete_bot(p_bot uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_signed_in();
  b public.bots;
begin
  select * into b from public.bots where id = p_bot;
  if not found or not private.is_company_founder(b.company_id) then
    raise exception 'Only a founder can remove a bot' using errcode = 'P0001', hint = 'forbidden';
  end if;
  delete from public.bots where id = p_bot;
  insert into public.activity_events (company_id, type, summary, actor_id)
  values (b.company_id, 'run', format('Bot removed: %s', b.name), me);
end;
$$;

revoke execute on function public.create_bot(uuid, text), public.update_bot(uuid, boolean, text, integer, jsonb), public.delete_bot(uuid)
  from public, anon;
grant execute on function public.create_bot(uuid, text), public.update_bot(uuid, boolean, text, integer, jsonb), public.delete_bot(uuid)
  to authenticated;

-- A bot's feedback-request step: the same rules as a founder's request (consent, 90 days).
create function public.bot_feedback_request(p_company uuid, p_contact uuid, p_origin text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.create_feedback_request(p_company, p_contact, 'purchase', p_origin, null)
$$;
revoke execute on function public.bot_feedback_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.bot_feedback_request(uuid, uuid, text) to service_role;

alter publication supabase_realtime add table public.bots;
