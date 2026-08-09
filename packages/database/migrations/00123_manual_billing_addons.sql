-- Manual billing: addon catalog, per-account pricing, invoices, payment verification.
-- Supports admin package activation with amounts, Extra screen / Extra space addons,
-- customer payment verification, and in-app invoices (offline / special-customer path).

-- ---------------------------------------------------------------------------
-- Addon catalog
-- ---------------------------------------------------------------------------

create table if not exists public.addon_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  kind text not null check (kind in ('extra_screen', 'extra_storage')),
  device_delta integer not null default 0,
  storage_delta_bytes bigint not null default 0,
  monthly_price_cents integer not null default 0,
  monthly_price_gbp_cents integer not null default 0,
  monthly_price_eur_cents integer not null default 0,
  monthly_price_bdt_paisa integer not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addon_templates_device_delta_check check (device_delta >= 0),
  constraint addon_templates_storage_delta_check check (storage_delta_bytes >= 0),
  constraint addon_templates_delta_present_check check (device_delta > 0 or storage_delta_bytes > 0),
  constraint addon_templates_price_check check (
    monthly_price_cents >= 0
    and monthly_price_gbp_cents >= 0
    and monthly_price_eur_cents >= 0
    and monthly_price_bdt_paisa >= 0
  )
);

comment on table public.addon_templates is
  'Catalog of billable addons (extra screens, extra storage) managed by platform staff.';

create index if not exists addon_templates_active_sort_idx
  on public.addon_templates (is_active, sort_order, name);

alter table public.addon_templates enable row level security;

drop policy if exists addon_templates_read_active on public.addon_templates;
create policy addon_templates_read_active
  on public.addon_templates
  for select
  using (is_active or public.is_platform_staff());

-- ---------------------------------------------------------------------------
-- Per-account billing settings (custom price + payment verification)
-- ---------------------------------------------------------------------------

create table if not exists public.account_billing (
  account_id uuid primary key references public.profiles (id) on delete cascade,
  currency text not null default 'USD'
    check (currency in ('USD', 'GBP', 'EUR', 'BDT')),
  -- Override for special customers; null = use catalog / custom amount at invoice time.
  custom_monthly_amount_cents integer
    check (custom_monthly_amount_cents is null or custom_monthly_amount_cents >= 0),
  base_device_limit integer
    check (base_device_limit is null or base_device_limit >= 1),
  base_storage_limit_bytes bigint
    check (base_storage_limit_bytes is null or base_storage_limit_bytes >= 1048576),
  payment_verified_at timestamptz,
  payment_method text
    check (
      payment_method is null
      or payment_method in ('bkash', 'nagad', 'bank', 'stripe', 'cash', 'other')
    ),
  payment_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.account_billing is
  'Manual/offline billing settings: custom price, base quotas, and one-time payment verification.';

alter table public.account_billing enable row level security;

drop policy if exists account_billing_select_member on public.account_billing;
create policy account_billing_select_member
  on public.account_billing
  for select
  using (
    account_id in (select public.current_account_ids())
    or public.is_platform_staff()
  );

-- ---------------------------------------------------------------------------
-- Active account addons
-- ---------------------------------------------------------------------------

create table if not exists public.account_addons (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete cascade,
  addon_template_id uuid not null references public.addon_templates (id),
  quantity integer not null default 1 check (quantity >= 1),
  unit_amount_cents integer not null check (unit_amount_cents >= 0),
  currency text not null default 'USD'
    check (currency in ('USD', 'GBP', 'EUR', 'BDT')),
  status text not null default 'active'
    check (status in ('active', 'canceled')),
  started_at timestamptz not null default now(),
  canceled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.account_addons is
  'Active or canceled addon subscriptions on a billing account.';

create index if not exists account_addons_account_status_idx
  on public.account_addons (account_id, status);

alter table public.account_addons enable row level security;

drop policy if exists account_addons_select_member on public.account_addons;
create policy account_addons_select_member
  on public.account_addons
  for select
  using (
    account_id in (select public.current_account_ids())
    or public.is_platform_staff()
  );

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete cascade,
  invoice_number text not null unique,
  status text not null default 'open'
    check (status in ('draft', 'open', 'payment_submitted', 'paid', 'void', 'canceled')),
  currency text not null default 'USD'
    check (currency in ('USD', 'GBP', 'EUR', 'BDT')),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  period_start timestamptz,
  period_end timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  source text not null default 'manual_activation'
    check (source in ('manual_activation', 'addon_change', 'renewal', 'custom')),
  notes text,
  payment_method text
    check (
      payment_method is null
      or payment_method in ('bkash', 'nagad', 'bank', 'stripe', 'cash', 'other')
    ),
  payment_reference text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.billing_invoices is
  'In-app invoices for manual/offline activation and addon billing.';

create index if not exists billing_invoices_account_created_idx
  on public.billing_invoices (account_id, created_at desc);

create index if not exists billing_invoices_status_idx
  on public.billing_invoices (status, created_at desc);

alter table public.billing_invoices enable row level security;

drop policy if exists billing_invoices_select_member on public.billing_invoices;
create policy billing_invoices_select_member
  on public.billing_invoices
  for select
  using (
    account_id in (select public.current_account_ids())
    or public.is_platform_staff()
  );

create table if not exists public.billing_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices (id) on delete cascade,
  kind text not null check (kind in ('plan', 'addon', 'custom', 'credit')),
  description text not null,
  quantity integer not null default 1 check (quantity >= 1),
  unit_amount_cents integer not null,
  amount_cents integer not null,
  addon_template_id uuid references public.addon_templates (id) on delete set null,
  account_addon_id uuid references public.account_addons (id) on delete set null,
  plan_template_id uuid references public.plan_templates (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.billing_invoice_lines is
  'Line items for billing_invoices (plan, addon, custom, credit).';

create index if not exists billing_invoice_lines_invoice_idx
  on public.billing_invoice_lines (invoice_id, sort_order);

alter table public.billing_invoice_lines enable row level security;

drop policy if exists billing_invoice_lines_select_member on public.billing_invoice_lines;
create policy billing_invoice_lines_select_member
  on public.billing_invoice_lines
  for select
  using (
    exists (
      select 1
      from public.billing_invoices bi
      where bi.id = invoice_id
        and (
          bi.account_id in (select public.current_account_ids())
          or public.is_platform_staff()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day text := to_char(timezone('utc', now()), 'YYYYMMDD');
  v_seq integer;
begin
  select count(*)::integer + 1
  into v_seq
  from public.billing_invoices
  where invoice_number like 'INV-' || v_day || '-%';

  return 'INV-' || v_day || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

revoke all on function public.next_invoice_number() from public;
grant execute on function public.next_invoice_number() to authenticated, service_role;

create or replace function public.addon_unit_amount_for_currency(
  p_addon public.addon_templates,
  p_currency text
)
returns integer
language sql
stable
as $$
  select case p_currency
    when 'GBP' then p_addon.monthly_price_gbp_cents
    when 'EUR' then p_addon.monthly_price_eur_cents
    when 'BDT' then p_addon.monthly_price_bdt_paisa
    else p_addon.monthly_price_cents
  end;
$$;

create or replace function public.recompute_account_limits_from_billing(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billing public.account_billing;
  v_device integer;
  v_storage bigint;
  v_addon_device integer := 0;
  v_addon_storage bigint := 0;
begin
  select * into v_billing
  from public.account_billing
  where account_id = p_account_id;

  if v_billing.account_id is null then
    return;
  end if;

  if v_billing.base_device_limit is null or v_billing.base_storage_limit_bytes is null then
    return;
  end if;

  select
    coalesce(sum(aa.quantity * at.device_delta), 0)::integer,
    coalesce(sum(aa.quantity * at.storage_delta_bytes), 0)::bigint
  into v_addon_device, v_addon_storage
  from public.account_addons aa
  join public.addon_templates at on at.id = aa.addon_template_id
  where aa.account_id = p_account_id
    and aa.status = 'active';

  v_device := greatest(1, v_billing.base_device_limit + v_addon_device);
  v_storage := greatest(1048576::bigint, v_billing.base_storage_limit_bytes + v_addon_storage);

  -- Bypass staff-only profile limit triggers for authorized billing RPCs
  -- (same session GUC used by Stripe apply/revoke).
  perform set_config('onesign.stripe_apply', 'true', true);

  update public.profiles
  set
    device_limit = v_device,
    storage_limit_bytes = v_storage
  where id = p_account_id;

  perform public.apply_device_quota(p_account_id, v_device, null, false);
  perform public.sync_user_app_metadata(p_account_id);
end;
$$;

revoke all on function public.recompute_account_limits_from_billing(uuid) from public;
grant execute on function public.recompute_account_limits_from_billing(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Addon catalog RPCs
-- ---------------------------------------------------------------------------

create or replace function public.list_active_addons()
returns setof public.addon_templates
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.addon_templates
  where is_active
  order by sort_order, name;
$$;

revoke all on function public.list_active_addons() from public;
grant execute on function public.list_active_addons() to anon, authenticated;

create or replace function public.admin_list_addons()
returns setof public.addon_templates
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_staff() then
    raise exception 'Forbidden';
  end if;

  return query
  select *
  from public.addon_templates
  order by sort_order, name;
end;
$$;

revoke all on function public.admin_list_addons() from public;
grant execute on function public.admin_list_addons() to authenticated;

create or replace function public.admin_upsert_addon(
  p_id uuid,
  p_name text,
  p_description text,
  p_kind text,
  p_device_delta integer,
  p_storage_delta_bytes bigint,
  p_monthly_price_cents integer,
  p_monthly_price_gbp_cents integer,
  p_monthly_price_eur_cents integer,
  p_monthly_price_bdt_paisa integer,
  p_is_active boolean,
  p_sort_order integer
)
returns public.addon_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.addon_templates;
begin
  if not public.is_platform_staff_writer() then
    raise exception 'Forbidden';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_kind not in ('extra_screen', 'extra_storage') then
    raise exception 'invalid_kind';
  end if;

  if coalesce(p_device_delta, 0) < 0 or coalesce(p_storage_delta_bytes, 0) < 0 then
    raise exception 'invalid_delta';
  end if;

  if coalesce(p_device_delta, 0) = 0 and coalesce(p_storage_delta_bytes, 0) = 0 then
    raise exception 'invalid_delta';
  end if;

  if p_id is null then
    insert into public.addon_templates (
      name,
      description,
      kind,
      device_delta,
      storage_delta_bytes,
      monthly_price_cents,
      monthly_price_gbp_cents,
      monthly_price_eur_cents,
      monthly_price_bdt_paisa,
      is_active,
      sort_order
    )
    values (
      trim(p_name),
      coalesce(p_description, ''),
      p_kind,
      coalesce(p_device_delta, 0),
      coalesce(p_storage_delta_bytes, 0),
      coalesce(p_monthly_price_cents, 0),
      coalesce(p_monthly_price_gbp_cents, 0),
      coalesce(p_monthly_price_eur_cents, 0),
      coalesce(p_monthly_price_bdt_paisa, 0),
      coalesce(p_is_active, true),
      coalesce(p_sort_order, 0)
    )
    returning * into v_row;
  else
    update public.addon_templates
    set
      name = trim(p_name),
      description = coalesce(p_description, ''),
      kind = p_kind,
      device_delta = coalesce(p_device_delta, 0),
      storage_delta_bytes = coalesce(p_storage_delta_bytes, 0),
      monthly_price_cents = coalesce(p_monthly_price_cents, 0),
      monthly_price_gbp_cents = coalesce(p_monthly_price_gbp_cents, 0),
      monthly_price_eur_cents = coalesce(p_monthly_price_eur_cents, 0),
      monthly_price_bdt_paisa = coalesce(p_monthly_price_bdt_paisa, 0),
      is_active = coalesce(p_is_active, true),
      sort_order = coalesce(p_sort_order, 0),
      updated_at = now()
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'addon_not_found';
    end if;
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_upsert_addon(
  uuid, text, text, text, integer, bigint, integer, integer, integer, integer, boolean, integer
) from public;
grant execute on function public.admin_upsert_addon(
  uuid, text, text, text, integer, bigint, integer, integer, integer, integer, boolean, integer
) to authenticated;

create or replace function public.admin_delete_addon(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_staff_writer() then
    raise exception 'Forbidden';
  end if;

  if exists (
    select 1 from public.account_addons aa
    where aa.addon_template_id = p_id and aa.status = 'active'
  ) then
    -- Soft-retire instead of hard delete when in use.
    update public.addon_templates
    set is_active = false, updated_at = now()
    where id = p_id;
  else
    delete from public.addon_templates where id = p_id;
  end if;
end;
$$;

revoke all on function public.admin_delete_addon(uuid) from public;
grant execute on function public.admin_delete_addon(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Upsert account billing + create invoice (used by app after provision)
-- ---------------------------------------------------------------------------

create or replace function public.admin_upsert_account_billing(
  p_account_id uuid,
  p_currency text,
  p_custom_monthly_amount_cents integer,
  p_base_device_limit integer,
  p_base_storage_limit_bytes bigint,
  p_notes text default null
)
returns public.account_billing
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.account_billing;
begin
  if not public.is_platform_staff_writer() and auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if p_currency is null or p_currency not in ('USD', 'GBP', 'EUR', 'BDT') then
    raise exception 'invalid_currency';
  end if;

  insert into public.account_billing (
    account_id,
    currency,
    custom_monthly_amount_cents,
    base_device_limit,
    base_storage_limit_bytes,
    notes,
    updated_at
  )
  values (
    p_account_id,
    p_currency,
    p_custom_monthly_amount_cents,
    p_base_device_limit,
    p_base_storage_limit_bytes,
    p_notes,
    now()
  )
  on conflict (account_id) do update
  set
    currency = excluded.currency,
    custom_monthly_amount_cents = excluded.custom_monthly_amount_cents,
    base_device_limit = coalesce(excluded.base_device_limit, public.account_billing.base_device_limit),
    base_storage_limit_bytes = coalesce(
      excluded.base_storage_limit_bytes,
      public.account_billing.base_storage_limit_bytes
    ),
    notes = coalesce(excluded.notes, public.account_billing.notes),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.admin_upsert_account_billing(
  uuid, text, integer, integer, bigint, text
) from public;
grant execute on function public.admin_upsert_account_billing(
  uuid, text, integer, integer, bigint, text
) to authenticated, service_role;

create or replace function public.create_billing_invoice(
  p_account_id uuid,
  p_currency text,
  p_source text,
  p_notes text,
  p_due_days integer,
  p_lines jsonb
)
returns public.billing_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.billing_invoices;
  v_line jsonb;
  v_subtotal integer := 0;
  v_amount integer;
  v_sort integer := 0;
  v_actor uuid := auth.uid();
begin
  if not (
    public.is_platform_staff_writer()
    or auth.role() = 'service_role'
    or p_account_id in (select public.current_account_ids())
  ) then
    raise exception 'Forbidden';
  end if;

  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if p_currency is null or p_currency not in ('USD', 'GBP', 'EUR', 'BDT') then
    raise exception 'invalid_currency';
  end if;

  if p_source is null or p_source not in ('manual_activation', 'addon_change', 'renewal', 'custom') then
    raise exception 'invalid_source';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice_lines_required';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_amount := coalesce((v_line->>'amount_cents')::integer, 0);
    v_subtotal := v_subtotal + v_amount;
  end loop;

  if v_subtotal < 0 then
    raise exception 'invalid_total';
  end if;

  insert into public.billing_invoices (
    account_id,
    invoice_number,
    status,
    currency,
    subtotal_cents,
    total_cents,
    period_start,
    period_end,
    due_at,
    source,
    notes,
    created_by
  )
  values (
    p_account_id,
    public.next_invoice_number(),
    'open',
    p_currency,
    v_subtotal,
    v_subtotal,
    date_trunc('month', timezone('utc', now())),
    date_trunc('month', timezone('utc', now())) + interval '1 month',
    timezone('utc', now()) + make_interval(days => greatest(coalesce(p_due_days, 7), 1)),
    p_source,
    p_notes,
    v_actor
  )
  returning * into v_invoice;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.billing_invoice_lines (
      invoice_id,
      kind,
      description,
      quantity,
      unit_amount_cents,
      amount_cents,
      addon_template_id,
      account_addon_id,
      plan_template_id,
      sort_order
    )
    values (
      v_invoice.id,
      coalesce(v_line->>'kind', 'custom'),
      coalesce(v_line->>'description', 'Line item'),
      greatest(coalesce((v_line->>'quantity')::integer, 1), 1),
      coalesce((v_line->>'unit_amount_cents')::integer, 0),
      coalesce((v_line->>'amount_cents')::integer, 0),
      nullif(v_line->>'addon_template_id', '')::uuid,
      nullif(v_line->>'account_addon_id', '')::uuid,
      nullif(v_line->>'plan_template_id', '')::uuid,
      v_sort
    );
    v_sort := v_sort + 1;
  end loop;

  return v_invoice;
end;
$$;

revoke all on function public.create_billing_invoice(uuid, text, text, text, integer, jsonb) from public;
grant execute on function public.create_billing_invoice(uuid, text, text, text, integer, jsonb)
  to authenticated, service_role;

create or replace function public.add_account_addon(
  p_account_id uuid,
  p_addon_template_id uuid,
  p_quantity integer,
  p_unit_amount_cents integer,
  p_currency text
)
returns public.account_addons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_addon public.addon_templates;
  v_row public.account_addons;
  v_qty integer := greatest(coalesce(p_quantity, 1), 1);
  v_unit integer;
begin
  if not (
    public.is_platform_staff_writer()
    or auth.role() = 'service_role'
    or p_account_id in (select public.current_account_ids())
  ) then
    raise exception 'Forbidden';
  end if;

  select * into v_addon
  from public.addon_templates
  where id = p_addon_template_id
    and is_active;

  if v_addon.id is null then
    raise exception 'addon_not_found';
  end if;

  v_unit := coalesce(
    p_unit_amount_cents,
    public.addon_unit_amount_for_currency(v_addon, coalesce(p_currency, 'USD'))
  );

  insert into public.account_addons (
    account_id,
    addon_template_id,
    quantity,
    unit_amount_cents,
    currency,
    status,
    created_by
  )
  values (
    p_account_id,
    p_addon_template_id,
    v_qty,
    v_unit,
    coalesce(p_currency, 'USD'),
    'active',
    auth.uid()
  )
  returning * into v_row;

  -- Ensure billing base exists; if missing, seed from current profile limits minus this addon.
  insert into public.account_billing (account_id, currency, base_device_limit, base_storage_limit_bytes)
  select
    p.id,
    coalesce(p_currency, 'USD'),
    greatest(1, p.device_limit - (v_qty * v_addon.device_delta)),
    greatest(1048576::bigint, p.storage_limit_bytes - (v_qty * v_addon.storage_delta_bytes))
  from public.profiles p
  where p.id = p_account_id
  on conflict (account_id) do update
  set
    currency = coalesce(excluded.currency, public.account_billing.currency),
    updated_at = now();

  perform public.recompute_account_limits_from_billing(p_account_id);

  return v_row;
end;
$$;

revoke all on function public.add_account_addon(uuid, uuid, integer, integer, text) from public;
grant execute on function public.add_account_addon(uuid, uuid, integer, integer, text)
  to authenticated, service_role;

create or replace function public.cancel_account_addon(p_account_addon_id uuid)
returns public.account_addons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.account_addons;
begin
  select * into v_row
  from public.account_addons
  where id = p_account_addon_id
  for update;

  if v_row.id is null then
    raise exception 'addon_not_found';
  end if;

  if not (
    public.is_platform_staff_writer()
    or auth.role() = 'service_role'
    or v_row.account_id in (select public.current_account_ids())
  ) then
    raise exception 'Forbidden';
  end if;

  if v_row.status = 'canceled' then
    return v_row;
  end if;

  update public.account_addons
  set
    status = 'canceled',
    canceled_at = now(),
    updated_at = now()
  where id = p_account_addon_id
  returning * into v_row;

  perform public.recompute_account_limits_from_billing(v_row.account_id);

  return v_row;
end;
$$;

revoke all on function public.cancel_account_addon(uuid) from public;
grant execute on function public.cancel_account_addon(uuid) to authenticated, service_role;

create or replace function public.submit_invoice_payment(
  p_invoice_id uuid,
  p_payment_method text,
  p_payment_reference text
)
returns public.billing_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.billing_invoices;
begin
  select * into v_invoice
  from public.billing_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'invoice_not_found';
  end if;

  if not (
    public.is_platform_staff_writer()
    or v_invoice.account_id in (select public.current_account_ids())
  ) then
    raise exception 'Forbidden';
  end if;

  if v_invoice.status not in ('open', 'payment_submitted') then
    raise exception 'invoice_not_payable';
  end if;

  if p_payment_method is null
     or p_payment_method not in ('bkash', 'nagad', 'bank', 'stripe', 'cash', 'other') then
    raise exception 'invalid_payment_method';
  end if;

  if p_payment_reference is null or length(trim(p_payment_reference)) < 3 then
    raise exception 'invalid_payment_reference';
  end if;

  update public.billing_invoices
  set
    status = 'payment_submitted',
    payment_method = p_payment_method,
    payment_reference = trim(p_payment_reference),
    updated_at = now()
  where id = p_invoice_id
  returning * into v_invoice;

  insert into public.account_billing (account_id, currency, payment_method, payment_reference)
  values (v_invoice.account_id, v_invoice.currency, p_payment_method, trim(p_payment_reference))
  on conflict (account_id) do update
  set
    payment_method = excluded.payment_method,
    payment_reference = excluded.payment_reference,
    updated_at = now();

  return v_invoice;
end;
$$;

revoke all on function public.submit_invoice_payment(uuid, text, text) from public;
grant execute on function public.submit_invoice_payment(uuid, text, text) to authenticated;

create or replace function public.admin_mark_invoice_paid(p_invoice_id uuid)
returns public.billing_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.billing_invoices;
begin
  if not public.is_platform_staff_writer() then
    raise exception 'Forbidden';
  end if;

  select * into v_invoice
  from public.billing_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'invoice_not_found';
  end if;

  if v_invoice.status = 'paid' then
    return v_invoice;
  end if;

  if v_invoice.status in ('void', 'canceled') then
    raise exception 'invoice_not_payable';
  end if;

  update public.billing_invoices
  set
    status = 'paid',
    paid_at = now(),
    updated_at = now()
  where id = p_invoice_id
  returning * into v_invoice;

  insert into public.account_billing (account_id, currency, payment_verified_at)
  values (v_invoice.account_id, v_invoice.currency, now())
  on conflict (account_id) do update
  set
    payment_verified_at = coalesce(public.account_billing.payment_verified_at, now()),
    payment_method = coalesce(public.account_billing.payment_method, v_invoice.payment_method),
    payment_reference = coalesce(public.account_billing.payment_reference, v_invoice.payment_reference),
    updated_at = now();

  perform public.log_admin_action(
    'invoice_paid',
    v_invoice.account_id,
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'total_cents', v_invoice.total_cents,
      'currency', v_invoice.currency
    )
  );

  return v_invoice;
end;
$$;

revoke all on function public.admin_mark_invoice_paid(uuid) from public;
grant execute on function public.admin_mark_invoice_paid(uuid) to authenticated;

create or replace function public.admin_set_payment_verified(
  p_account_id uuid,
  p_verified boolean,
  p_payment_method text default null,
  p_payment_reference text default null
)
returns public.account_billing
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.account_billing;
begin
  if not public.is_platform_staff_writer() then
    raise exception 'Forbidden';
  end if;

  insert into public.account_billing (account_id, currency)
  values (p_account_id, 'USD')
  on conflict (account_id) do nothing;

  update public.account_billing
  set
    payment_verified_at = case when p_verified then coalesce(payment_verified_at, now()) else null end,
    payment_method = coalesce(p_payment_method, payment_method),
    payment_reference = coalesce(nullif(trim(p_payment_reference), ''), payment_reference),
    updated_at = now()
  where account_id = p_account_id
  returning * into v_row;

  perform public.log_admin_action(
    'payment_verification',
    p_account_id,
    jsonb_build_object(
      'verified', p_verified,
      'payment_method', v_row.payment_method,
      'payment_reference', v_row.payment_reference
    )
  );

  return v_row;
end;
$$;

revoke all on function public.admin_set_payment_verified(uuid, boolean, text, text) from public;
grant execute on function public.admin_set_payment_verified(uuid, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed default addons (Extra screen, Extra space)
-- ---------------------------------------------------------------------------

insert into public.addon_templates (
  name,
  description,
  kind,
  device_delta,
  storage_delta_bytes,
  monthly_price_cents,
  monthly_price_gbp_cents,
  monthly_price_eur_cents,
  monthly_price_bdt_paisa,
  is_active,
  sort_order
)
select *
from (
  values
    (
      'Extra screen',
      'Add one more screen to your account.',
      'extra_screen',
      1,
      0::bigint,
      500,
      400,
      450,
      50000,
      true,
      10
    ),
    (
      'Extra space',
      'Add 1 GB of cloud storage.',
      'extra_storage',
      0,
      1073741824::bigint,
      300,
      250,
      280,
      30000,
      true,
      20
    )
) as seed (
  name,
  description,
  kind,
  device_delta,
  storage_delta_bytes,
  monthly_price_cents,
  monthly_price_gbp_cents,
  monthly_price_eur_cents,
  monthly_price_bdt_paisa,
  is_active,
  sort_order
)
where not exists (
  select 1 from public.addon_templates existing where existing.name = seed.name
);
