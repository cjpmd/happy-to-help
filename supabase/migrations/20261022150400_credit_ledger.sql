-- The credit ledger (CLAUDE.md rule 2): insert-only, written by the service role only.
-- A company's balance is the sum of its rows. Phase 2 adds the RPCs that reserve, settle,
-- release, refund and grant credits; this migration sets up the table and its guarantees.

create type public.ledger_entry_type as enum (
  'grant', 'topup', 'hold', 'release', 'usage', 'refund', 'expiry'
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  -- restrict: a company with ledger history can't be deleted.
  company_id uuid not null references public.companies (id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  -- Whole credits. Positive adds to the balance, negative takes from it.
  amount integer not null check (amount <> 0),
  run_id uuid references public.agent_runs (id) on delete restrict,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (
    (entry_type in ('grant', 'topup', 'release', 'refund') and amount > 0)
    or (entry_type in ('hold', 'usage', 'expiry') and amount < 0)
  )
);
create index credit_ledger_company_id_idx on public.credit_ledger (company_id, created_at desc);
create index credit_ledger_run_id_idx on public.credit_ledger (run_id);

-- No one may change or remove a ledger row, the service role included.
create function private.reject_ledger_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'credit_ledger is insert-only: % is not allowed', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;
revoke execute on function private.reject_ledger_change() from public, anon, authenticated;

create trigger credit_ledger_no_update before update or delete on public.credit_ledger
  for each row execute function private.reject_ledger_change();
create trigger credit_ledger_no_truncate before truncate on public.credit_ledger
  for each statement execute function private.reject_ledger_change();

alter table public.credit_ledger enable row level security;
revoke all on public.credit_ledger from anon, authenticated, service_role;
grant select on public.credit_ledger to authenticated;
grant select, insert on public.credit_ledger to service_role;

create policy "Read the ledger for companies you can read" on public.credit_ledger
  for select to authenticated using (private.can_read_company(company_id));

-- Balance per company. security_invoker, so the ledger's row-level security applies.
-- balance: what can be spent now (holds already deducted).
-- held:    credits reserved by holds not yet released. Assumes Phase 2 settles a run by
--          releasing its whole hold and recording usage separately.
create view public.company_credit_balance
with (security_invoker = true)
as
select
  company_id,
  sum(amount)::integer as balance,
  coalesce(-sum(amount) filter (where entry_type in ('hold', 'release')), 0)::integer as held
from public.credit_ledger
group by company_id;

revoke all on public.company_credit_balance from anon, authenticated;
grant select on public.company_credit_balance to authenticated, service_role;
