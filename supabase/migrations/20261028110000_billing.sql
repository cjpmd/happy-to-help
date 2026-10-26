-- Billing with Stripe (Phase 6, SPEC part D). Test mode only, behind a flag: the Edge Functions
-- refuse live keys, and the app shows "coming soon" until VITE_BILLING_ENABLED is set.
-- Stripe events are applied once each (idempotent on the event id), and every credit grant also
-- carries an idempotency key, so a replayed webhook never grants twice.

-- What can be bought. Stripe price ids are set once the products exist in Stripe (HANDOFF 5).
create table public.billing_products (
  product text primary key check (product ~ '^[a-z0-9_]+$'),
  kind text not null check (kind in ('plan', 'topup', 'launch_pack')),
  plan public.company_plan,
  label text not null,
  price_gbp numeric(8, 2) not null check (price_gbp > 0),
  credits integer not null check (credits > 0),
  stripe_price_id text unique,
  active boolean not null default true,
  check ((kind = 'plan') = (plan is not null))
);
insert into public.billing_products (product, kind, plan, label, price_gbp, credits) values
  ('plan_starter', 'plan', 'starter', 'Starter plan', 29, 1500),
  ('plan_founder', 'plan', 'founder', 'Founder plan', 79, 5000),
  ('plan_growth', 'plan', 'growth', 'Growth plan', 149, 12000),
  ('topup_t10', 'topup', null, '500 credits', 10, 500),
  ('topup_t25', 'topup', null, '1,300 credits', 25, 1300),
  ('topup_t50', 'topup', null, '2,800 credits', 50, 2800),
  ('launch_pack', 'launch_pack', null, 'Launch Pack', 49, 10000);

create table public.stripe_customers (
  company_id uuid primary key references public.companies (id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  company_id uuid primary key references public.companies (id) on delete cascade,
  subscription_id text not null unique,
  customer_id text not null,
  status text not null,
  plan public.company_plan,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Every Stripe event received, for idempotency and the audit trail.
create table public.stripe_events (
  id text primary key,
  type text not null,
  company_id uuid references public.companies (id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text,
  error text
);
create index stripe_events_company_id_idx on public.stripe_events (company_id);

alter table public.billing_products enable row level security;
revoke all on public.billing_products from anon, authenticated;
grant select on public.billing_products to authenticated;
create policy "Signed-in people can read the price list" on public.billing_products
  for select to authenticated using (true);

alter table public.stripe_customers enable row level security;
revoke all on public.stripe_customers from anon, authenticated;

alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
create policy "Founders and teammates read the subscription" on public.subscriptions
  for select to authenticated using (private.can_edit_company(company_id));

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- Service role: apply one Stripe event's actions, once. The Edge Function turns the event into
-- actions (supabase/functions/_shared/billing.ts); this records it and carries them out in one
-- transaction. Returns 'applied', 'duplicate' or 'ignored'.
--   { "kind": "grant", "company_id", "product", "key", "expires_at"?, "note"? }
--   { "kind": "subscription", "company_id", "subscription_id", "customer_id", "status", "product"?, "current_period_end"?, "cancel_at_period_end"? }
--   { "kind": "customer", "company_id", "customer_id" }
create function public.apply_billing_event(p_event_id text, p_type text, p_actions jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb;
  prod public.billing_products;
  v_company uuid;
  done timestamptz;
begin
  if jsonb_typeof(p_actions) is distinct from 'array' then
    raise exception 'Actions must be a list' using errcode = 'P0001', hint = 'invalid';
  end if;
  select id into v_company from public.companies where id = private.try_uuid(p_actions -> 0 ->> 'company_id');
  insert into public.stripe_events (id, type, company_id) values (p_event_id, p_type, v_company)
  on conflict (id) do nothing;
  select processed_at into done from public.stripe_events where id = p_event_id for update;
  if done is not null then
    return 'duplicate';
  end if;
  if jsonb_array_length(p_actions) = 0 then
    update public.stripe_events set processed_at = now(), outcome = 'ignored' where id = p_event_id;
    return 'ignored';
  end if;

  for a in select * from jsonb_array_elements(p_actions) loop
    v_company := private.try_uuid(a ->> 'company_id');
    if v_company is null or not exists (select 1 from public.companies where id = v_company) then
      raise exception 'Unknown company in Stripe event %', p_event_id using errcode = 'P0001', hint = 'not_found';
    end if;
    case a ->> 'kind'
    when 'grant' then
      select * into prod from public.billing_products where product = a ->> 'product';
      if not found then
        raise exception 'Unknown product %', a ->> 'product' using errcode = 'P0001', hint = 'not_found';
      end if;
      perform public.grant_credits(
        v_company, prod.credits,
        case prod.kind when 'plan' then 'plan' else 'topup' end::public.credit_bucket,
        coalesce(a ->> 'note', prod.label || case prod.kind when 'plan' then ' monthly credits' else '' end),
        (a ->> 'expires_at')::timestamptz,
        coalesce(a ->> 'key', 'stripe:' || p_event_id));
      if prod.kind = 'plan' then
        update public.companies set plan = prod.plan where id = v_company;
      end if;
      insert into public.activity_events (company_id, type, summary)
      values (v_company, 'billing', format('%s: +%s credits', prod.label, prod.credits));
    when 'subscription' then
      select * into prod from public.billing_products where product = a ->> 'product';
      insert into public.subscriptions (company_id, subscription_id, customer_id, status, plan, current_period_end, cancel_at_period_end)
      values (v_company, a ->> 'subscription_id', a ->> 'customer_id', a ->> 'status', prod.plan,
        (a ->> 'current_period_end')::timestamptz, coalesce((a ->> 'cancel_at_period_end')::boolean, false))
      on conflict (company_id) do update set
        subscription_id = excluded.subscription_id,
        customer_id = excluded.customer_id,
        status = excluded.status,
        plan = coalesce(excluded.plan, subscriptions.plan),
        current_period_end = coalesce(excluded.current_period_end, subscriptions.current_period_end),
        cancel_at_period_end = excluded.cancel_at_period_end,
        updated_at = now();
    when 'customer' then
      insert into public.stripe_customers (company_id, customer_id) values (v_company, a ->> 'customer_id')
      on conflict (company_id) do update set customer_id = excluded.customer_id;
    else
      raise exception 'Unknown billing action %', a ->> 'kind' using errcode = 'P0001', hint = 'invalid';
    end case;
  end loop;
  update public.stripe_events set processed_at = now(), outcome = 'applied', error = null where id = p_event_id;
  return 'applied';
end;
$$;

-- Service role: record why an event couldn't be applied (Stripe retries it).
create function public.fail_billing_event(p_event_id text, p_type text, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.stripe_events (id, type, error) values (p_event_id, p_type, left(p_error, 1000))
  on conflict (id) do update set error = left(p_error, 1000) where stripe_events.processed_at is null;
$$;

revoke execute on function public.apply_billing_event(text, text, jsonb), public.fail_billing_event(text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_billing_event(text, text, jsonb), public.fail_billing_event(text, text, text) to service_role;

alter publication supabase_realtime add table public.subscriptions;
