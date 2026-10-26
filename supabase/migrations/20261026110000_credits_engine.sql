-- The credits engine (Phase 2, SPEC part D, CLAUDE.md rules 2, 3 and 5).
--
-- Model: the ledger stays insert-only and the balance is still the sum of its rows. Every grant
-- or top-up row is a *lot*. Every other row (hold, release, usage, refund, expiry) points at the
-- lot it draws from or gives back to, so each lot's remaining credits are
--   lot.amount + sum(rows with lot_id = lot.id)
-- which gives consumption order, expiry and exact refunds without updating anything.
--
-- Consumption order: plan credits (expire at the end of the billing month), then credits
-- already drawn from a cohort pool, then top-ups and the Launch Pack (12 months). When a
-- cohort company runs out, reserve_credits draws the shortfall from its cohort's pool, up to
-- the company's cap and the pool's size.
--
-- Every function here is for the service role only (agent service, Edge Functions). Each run:
-- reserve_credits → run with maxBudgetUsd from the reservation → settle_run (charges the actual
-- cost, capped at the hold, and releases the rest) → refund_run if the platform failed it.

create type public.credit_bucket as enum ('plan', 'cohort', 'topup');

alter table public.credit_ledger
  add column lot_id uuid references public.credit_ledger (id) on delete restrict,
  add column bucket public.credit_bucket,
  add column expires_at timestamptz,
  add column cohort_id uuid references public.cohorts (id) on delete restrict,
  -- Stripe event ids and similar: the same grant is never recorded twice.
  add column idempotency_key text unique;

create index credit_ledger_lot_id_idx on public.credit_ledger (lot_id);
create index credit_ledger_cohort_id_idx on public.credit_ledger (cohort_id) where cohort_id is not null;

-- Grants and top-ups default to their bucket, so older callers keep working.
create function private.default_ledger_bucket()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.entry_type in ('grant', 'topup') and new.bucket is null then
    new.bucket := case new.entry_type when 'topup' then 'topup' else 'plan' end::public.credit_bucket;
  end if;
  return new;
end;
$$;
revoke execute on function private.default_ledger_bucket() from public, anon, authenticated;
create trigger credit_ledger_default_bucket before insert on public.credit_ledger
  for each row execute function private.default_ledger_bucket();

alter table public.credit_ledger
  add constraint credit_ledger_lots check (
    case when entry_type in ('grant', 'topup')
      then lot_id is null and bucket is not null
      else lot_id is not null and bucket is null and expires_at is null
    end
  ),
  add constraint credit_ledger_cohort_bucket check ((bucket = 'cohort') = (cohort_id is not null));

-- A row must point at a lot of the same company.
create function private.check_ledger_lot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lot_id is not null and not exists (
    select 1 from public.credit_ledger l
    where l.id = new.lot_id and l.company_id = new.company_id and l.entry_type in ('grant', 'topup')
  ) then
    raise exception 'credit_ledger.lot_id must be a grant or top-up of the same company';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_ledger_lot() from public, anon, authenticated;
create trigger credit_ledger_lot before insert on public.credit_ledger
  for each row execute function private.check_ledger_lot();

-- Conversion constants (CLAUDE.md rule 5): credits = cost_usd × fx_gbp × markup ÷ credit_value.
create table public.credit_config (
  id boolean primary key default true check (id),
  fx_gbp numeric(8, 4) not null default 0.75 check (fx_gbp > 0),
  markup numeric(6, 3) not null default 3 check (markup > 0),
  credit_value_gbp numeric(8, 4) not null default 0.01 check (credit_value_gbp > 0),
  plan_expiry interval not null default interval '1 month',
  topup_expiry interval not null default interval '12 months',
  updated_at timestamptz not null default now()
);
insert into public.credit_config default values;
create trigger credit_config_updated_at before update on public.credit_config
  for each row execute function private.set_updated_at();
alter table public.credit_config enable row level security;
revoke all on public.credit_config from anon, authenticated, service_role;
grant select on public.credit_config to authenticated, service_role;
grant update (fx_gbp, markup, credit_value_gbp, plan_expiry, topup_expiry) on public.credit_config to service_role;
create policy "Everyone signed in can read the conversion" on public.credit_config
  for select to authenticated using (true);

-- Credits for a USD cost, rounded up to whole credits.
create function public.credits_for_usd(p_cost_usd numeric)
returns integer
language sql
stable
set search_path = ''
as $$
  select ceil(greatest(p_cost_usd, 0) * c.fx_gbp * c.markup / c.credit_value_gbp)::integer
  from public.credit_config c
$$;

-- The most USD a number of credits can pay for (for maxBudgetUsd).
create function public.usd_for_credits(p_credits integer)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(greatest(p_credits, 0) * c.credit_value_gbp / (c.fx_gbp * c.markup), 4)
  from public.credit_config c
$$;

-- Lots ----------------------------------------------------------------------------------------

-- Each lot of a company with its remaining credits, in consumption order.
create function private.company_lots(p_company uuid, p_at timestamptz default now())
returns table (lot_id uuid, bucket public.credit_bucket, remaining integer, expires_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select l.id, l.bucket, (l.amount + coalesce(sum(r.amount), 0))::integer, l.expires_at
  from public.credit_ledger l
  left join public.credit_ledger r on r.lot_id = l.id
  where l.company_id = p_company and l.entry_type in ('grant', 'topup')
    and (l.expires_at is null or l.expires_at > p_at)
  group by l.id
  order by case l.bucket when 'plan' then 1 when 'cohort' then 2 else 3 end,
    l.expires_at nulls last, l.created_at, l.id
$$;

-- Takes `p_amount` from a company's lots in consumption order as rows of `p_type` (hold,
-- usage or expiry). Raises if the lots can't cover it.
create function private.debit(
  p_company uuid,
  p_type public.ledger_entry_type,
  p_amount integer,
  p_run uuid,
  p_note text,
  p_at timestamptz default now()
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  lot record;
  left_to_take integer := p_amount;
  take integer;
begin
  if p_type not in ('hold', 'usage', 'expiry') then
    raise exception 'debit takes hold, usage or expiry, not %', p_type;
  end if;
  for lot in select * from private.company_lots(p_company, p_at) where remaining > 0 loop
    exit when left_to_take <= 0;
    take := least(lot.remaining, left_to_take);
    insert into public.credit_ledger (company_id, entry_type, amount, run_id, note, lot_id, created_at)
    values (p_company, p_type, -take, p_run, coalesce(p_note, ''), lot.lot_id, p_at);
    left_to_take := left_to_take - take;
  end loop;
  if left_to_take > 0 then
    raise exception 'Not enough credits' using errcode = 'P0001', hint = 'insufficient_credits';
  end if;
end;
$$;

-- Gives back what a run holds on each lot as release rows. Returns how much was released.
create function private.release_run_holds(p_run uuid, p_note text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  h record;
  total integer := 0;
begin
  for h in
    select company_id, lot_id, (-sum(amount))::integer as held
    from public.credit_ledger
    where run_id = p_run and entry_type in ('hold', 'release')
    group by company_id, lot_id
    having sum(amount) < 0
  loop
    insert into public.credit_ledger (company_id, entry_type, amount, run_id, note, lot_id)
    values (h.company_id, 'release', h.held, p_run, p_note, h.lot_id);
    total := total + h.held;
  end loop;
  return total;
end;
$$;

create function private.lock_company_credits(p_company uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('credits:' || p_company::text, 0))
$$;

-- Cohort pools ------------------------------------------------------------------------------

-- What a cohort company can still draw from its pool: the smaller of what's left under its
-- cap and what's left in the pool.
create function private.cohort_headroom(p_company uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(greatest(0, least(
    cc.credit_cap - coalesce((
      select sum(l.amount) from public.credit_ledger l
      where l.company_id = p_company and l.bucket = 'cohort'
    ), 0),
    h.credit_pool - coalesce((
      select sum(l.amount) from public.credit_ledger l where l.cohort_id = h.id
    ), 0)
  )), 0)::integer
  from public.cohort_companies cc
  join public.cohorts h on h.id = cc.cohort_id
  where cc.company_id = p_company
$$;

-- RPCs (service role) -------------------------------------------------------------------------

-- Adds credits as a new lot: a monthly plan grant (expires at the end of the billing month by
-- default), a top-up or Launch Pack (12 months), or a cohort allocation. With an idempotency
-- key (e.g. the Stripe event id), the same grant is recorded once and the first row returned.
create function public.grant_credits(
  p_company uuid,
  p_amount integer,
  p_bucket public.credit_bucket,
  p_note text,
  p_expires_at timestamptz default null,
  p_idempotency_key text default null,
  p_cohort uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
  cfg public.credit_config;
  v_id uuid;
begin
  if p_idempotency_key is not null then
    select id into existing from public.credit_ledger where idempotency_key = p_idempotency_key;
    if found then
      return existing;
    end if;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'A grant must be positive' using errcode = 'P0001', hint = 'invalid';
  end if;
  if (p_bucket = 'cohort') <> (p_cohort is not null) then
    raise exception 'Cohort grants need a cohort, and only they do' using errcode = 'P0001', hint = 'invalid';
  end if;
  select * into cfg from public.credit_config;
  perform private.lock_company_credits(p_company);
  insert into public.credit_ledger (
    company_id, entry_type, amount, note, bucket, expires_at, cohort_id, idempotency_key
  ) values (
    p_company, case p_bucket when 'topup' then 'topup' else 'grant' end::public.ledger_entry_type,
    p_amount, coalesce(p_note, ''), p_bucket,
    coalesce(p_expires_at, case p_bucket
      when 'plan' then now() + cfg.plan_expiry
      when 'topup' then now() + cfg.topup_expiry
    end),
    p_cohort, p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.credit_ledger where idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end;
$$;

-- Holds credits for a run before it starts. Draws a cohort company's shortfall from its pool.
-- Raises 'insufficient_credits' (or 'cohort_cap') if it can't be covered; nothing is held then.
create function public.reserve_credits(p_company uuid, p_run uuid, p_amount integer, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  own integer;
  shortfall integer;
  headroom integer;
  cohort record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Reserve a positive number of credits' using errcode = 'P0001', hint = 'invalid';
  end if;
  if not exists (select 1 from public.agent_runs where id = p_run and company_id = p_company) then
    raise exception 'Run not found for this company' using errcode = 'P0001', hint = 'not_found';
  end if;
  perform private.lock_company_credits(p_company);
  select coalesce(sum(remaining), 0) into own from private.company_lots(p_company) where remaining > 0;
  if own < p_amount then
    shortfall := p_amount - own;
    select h.id, h.name into cohort
    from public.cohort_companies cc join public.cohorts h on h.id = cc.cohort_id
    where cc.company_id = p_company;
    if cohort.id is null then
      raise exception 'Not enough credits: this needs % and % are available.', p_amount, own
        using errcode = 'P0001', hint = 'insufficient_credits';
    end if;
    -- One draw at a time per cohort, so two companies can't both take the last of the pool.
    perform pg_advisory_xact_lock(hashtextextended('cohort:' || cohort.id::text, 0));
    headroom := private.cohort_headroom(p_company);
    if headroom < shortfall then
      raise exception 'Not enough credits: this needs %, % are available and the cohort pool allows % more.',
        p_amount, own, headroom using errcode = 'P0001', hint = 'cohort_cap';
    end if;
    insert into public.credit_ledger (company_id, entry_type, amount, note, bucket, cohort_id)
    values (p_company, 'grant', shortfall, 'From the ' || cohort.name || ' pool', 'cohort', cohort.id);
  end if;
  perform private.debit(p_company, 'hold', p_amount, p_run, coalesce(p_note, 'Hold for a run'));
  return p_amount;
end;
$$;

-- Charges a finished run its actual cost, capped at what it held, and releases the rest.
-- Settling twice raises 'already_settled'. Returns the credits charged.
create function public.settle_run(p_run uuid, p_cost_usd numeric, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.agent_runs;
  held integer;
  charge integer;
  wanted integer;
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
  wanted := public.credits_for_usd(p_cost_usd);
  charge := least(wanted, held);
  perform private.release_run_holds(p_run, 'Run finished — hold released');
  if charge > 0 then
    perform private.debit(r.company_id, 'usage', charge, p_run,
      coalesce(p_note, r.task) || case when wanted > held then ' (capped at the reservation)' else '' end);
  end if;
  update public.agent_runs
  set cost_usd = greatest(p_cost_usd, 0), credits_charged = charge
  where id = p_run;
  return charge;
end;
$$;

-- Gives back a run's whole hold without charging (the run never started, or was cancelled).
-- Safe to call twice: the second call releases nothing. Returns the credits released.
create function public.release_hold(p_run uuid, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  company uuid := (select company_id from public.agent_runs where id = p_run);
begin
  if company is null then
    raise exception 'Run not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  perform private.lock_company_credits(company);
  return private.release_run_holds(p_run, coalesce(p_note, 'Hold released'));
end;
$$;

-- Refunds what a settled run was charged, to the lots it came from (CLAUDE.md rule 3: failed
-- runs caused by the platform are auto-refunded). Any hold still outstanding is released too.
-- Refunding twice raises 'already_refunded'. Returns the credits refunded.
create function public.refund_run(p_run uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.agent_runs;
  u record;
  total integer := 0;
begin
  select * into r from public.agent_runs where id = p_run for update;
  if not found then
    raise exception 'Run not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  perform private.lock_company_credits(r.company_id);
  if exists (select 1 from public.credit_ledger where run_id = p_run and entry_type = 'refund') then
    raise exception 'This run was already refunded' using errcode = 'P0001', hint = 'already_refunded';
  end if;
  total := private.release_run_holds(p_run, 'Run failed — hold released');
  for u in
    select company_id, lot_id, (-sum(amount))::integer as used
    from public.credit_ledger
    where run_id = p_run and entry_type = 'usage'
    group by company_id, lot_id
  loop
    insert into public.credit_ledger (company_id, entry_type, amount, run_id, note, lot_id)
    values (u.company_id, 'refund', u.used, p_run,
      'Auto-refund: ' || coalesce(nullif(p_reason, ''), 'run failed'), u.lot_id);
  end loop;
  select coalesce(sum(amount), 0) into total
  from public.credit_ledger where run_id = p_run and entry_type = 'refund';
  update public.agent_runs set credits_charged = 0 where id = p_run;
  if total > 0 then
    insert into public.activity_events (company_id, type, summary, run_id)
    values (r.company_id, 'refund', r.task || ' failed — ' || total || ' credits refunded', p_run);
  end if;
  return total;
end;
$$;

-- Expires what's left on lots past their expiry date (plan credits monthly, top-ups after 12
-- months). Run daily by the scheduler. Returns the credits expired.
create function public.expire_credits(p_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  lot record;
  total integer := 0;
begin
  for lot in
    select l.id, l.company_id, l.bucket, (l.amount + coalesce(sum(r.amount), 0))::integer as remaining
    from public.credit_ledger l
    left join public.credit_ledger r on r.lot_id = l.id
    where l.entry_type in ('grant', 'topup') and l.expires_at is not null and l.expires_at <= p_at
    group by l.id
    having l.amount + coalesce(sum(r.amount), 0) > 0
  loop
    perform private.lock_company_credits(lot.company_id);
    insert into public.credit_ledger (company_id, entry_type, amount, note, lot_id)
    values (lot.company_id, 'expiry', -lot.remaining,
      case lot.bucket when 'plan' then 'Unused plan credits expired' else 'Top-up credits expired after 12 months' end,
      lot.id);
    total := total + lot.remaining;
  end loop;
  return total;
end;
$$;

-- A company's credits for the Billing screen: balance by bucket, holds, the next expiry and
-- what the cohort pool still allows. Anyone who can read the company can call it.
create function public.credit_summary(p_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.role() is distinct from 'service_role' and not private.can_read_company(p_company) then
    raise exception 'You don''t have access to this company' using errcode = 'P0001', hint = 'forbidden';
  end if;
  select jsonb_build_object(
    'balance', coalesce((select sum(amount) from public.credit_ledger where company_id = p_company), 0),
    'held', coalesce((select -sum(amount) from public.credit_ledger where company_id = p_company and entry_type in ('hold', 'release')), 0),
    'plan', coalesce((select sum(remaining) from private.company_lots(p_company) where bucket = 'plan'), 0),
    'cohort', coalesce((select sum(remaining) from private.company_lots(p_company) where bucket = 'cohort'), 0),
    'topup', coalesce((select sum(remaining) from private.company_lots(p_company) where bucket = 'topup'), 0),
    'cohort_headroom', coalesce(private.cohort_headroom(p_company), 0),
    'next_expiry', (
      select jsonb_build_object('at', expires_at, 'credits', remaining)
      from private.company_lots(p_company)
      where remaining > 0 and expires_at is not null
      order by expires_at limit 1
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function
  private.company_lots(uuid, timestamptz),
  private.debit(uuid, public.ledger_entry_type, integer, uuid, text, timestamptz),
  private.release_run_holds(uuid, text),
  private.lock_company_credits(uuid),
  private.cohort_headroom(uuid)
from public, anon, authenticated;

revoke execute on function
  public.grant_credits(uuid, integer, public.credit_bucket, text, timestamptz, text, uuid),
  public.reserve_credits(uuid, uuid, integer, text),
  public.settle_run(uuid, numeric, text),
  public.release_hold(uuid, text),
  public.refund_run(uuid, text),
  public.expire_credits(timestamptz)
from public, anon, authenticated;
grant execute on function
  public.grant_credits(uuid, integer, public.credit_bucket, text, timestamptz, text, uuid),
  public.reserve_credits(uuid, uuid, integer, text),
  public.settle_run(uuid, numeric, text),
  public.release_hold(uuid, text),
  public.refund_run(uuid, text),
  public.expire_credits(timestamptz)
to service_role;

revoke execute on function public.credit_summary(uuid), public.credits_for_usd(numeric), public.usd_for_credits(integer) from public, anon;
grant execute on function public.credit_summary(uuid), public.credits_for_usd(numeric), public.usd_for_credits(integer)
  to authenticated, service_role;

-- The balance view gains a breakdown by bucket. Holds and releases sit on their lots, so the
-- bucket figures are what's spendable now in each.
drop view public.company_credit_balance;
create view public.company_credit_balance
with (security_invoker = true)
as
with lots as (
  select l.company_id, l.bucket, l.expires_at, l.amount + coalesce(sum(r.amount), 0) as remaining
  from public.credit_ledger l
  left join public.credit_ledger r on r.lot_id = l.id
  where l.entry_type in ('grant', 'topup')
  group by l.id
)
select
  b.company_id,
  b.balance,
  b.held,
  coalesce((select sum(remaining) from lots where lots.company_id = b.company_id and bucket = 'plan' and (expires_at is null or expires_at > now())), 0)::integer as plan_balance,
  coalesce((select sum(remaining) from lots where lots.company_id = b.company_id and bucket = 'cohort'), 0)::integer as cohort_balance,
  coalesce((select sum(remaining) from lots where lots.company_id = b.company_id and bucket = 'topup' and (expires_at is null or expires_at > now())), 0)::integer as topup_balance
from (
  select
    company_id,
    sum(amount)::integer as balance,
    coalesce(-sum(amount) filter (where entry_type in ('hold', 'release')), 0)::integer as held
  from public.credit_ledger
  group by company_id
) b;

revoke all on public.company_credit_balance from anon, authenticated;
grant select on public.company_credit_balance to authenticated, service_role;
