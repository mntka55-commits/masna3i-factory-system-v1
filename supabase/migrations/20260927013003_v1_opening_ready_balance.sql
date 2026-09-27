-- مصنعي V1: دعم الرصيد الافتتاحي للجاهز للبيع.
-- يبني فوق البنية الحية الحالية ولا يعيد تشغيل أي تعديل تاريخي.

alter table public.opening_balances
  add column if not exists model_id uuid;

alter table public.opening_balances
  drop constraint if exists opening_balances_model_id_fkey;

alter table public.opening_balances
  add constraint opening_balances_model_id_fkey
  foreign key (model_id) references public.models(id);

alter table public.ready_lots
  add column if not exists source_opening_balance_id uuid;

alter table public.ready_lots
  drop constraint if exists ready_lots_source_opening_balance_id_fkey;

alter table public.ready_lots
  add constraint ready_lots_source_opening_balance_id_fkey
  foreign key (source_opening_balance_id) references public.opening_balances(id);

create unique index if not exists opening_balances_ready_model_uq
  on public.opening_balances(model_id)
  where kind = 'ready' and model_id is not null;

create unique index if not exists ready_lots_source_opening_balance_uq
  on public.ready_lots(source_opening_balance_id)
  where source_opening_balance_id is not null;

drop function if exists public.post_opening_balance(
  public.opening_balance_kind,
  date,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  numeric,
  text
);

create function public.post_opening_balance(
  p_kind public.opening_balance_kind,
  p_effective_date date,
  p_account_id uuid default null,
  p_customer_id uuid default null,
  p_supplier_id uuid default null,
  p_material_id uuid default null,
  p_quantity numeric default null,
  p_unit_cost numeric default null,
  p_amount numeric default null,
  p_notes text default null,
  p_model_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_movement_id uuid;
begin
  if p_kind is null then
    raise exception 'opening balance kind is required';
  end if;

  if p_effective_date is null then
    raise exception 'effective date is required';
  end if;

  if p_kind in ('cash','bank') then
    if not exists (
      select 1
      from public.money_accounts
      where id = p_account_id
        and active
    ) then
      raise exception 'active money account is required';
    end if;

    if p_amount is null or p_amount <= 0 then
      raise exception 'opening cash/bank amount must be greater than zero';
    end if;

    if exists (
      select 1
      from public.opening_balances
      where kind = p_kind
        and account_id = p_account_id
    ) then
      raise exception 'opening balance already exists for this account';
    end if;

  elsif p_kind = 'inventory' then
    if not exists (select 1 from public.materials where id = p_material_id) then
      raise exception 'material not found';
    end if;

    if p_quantity is null or p_quantity <= 0 then
      raise exception 'opening inventory quantity must be greater than zero';
    end if;

    if p_unit_cost is null or p_unit_cost < 0 then
      raise exception 'opening inventory unit cost must be zero or greater';
    end if;

    if exists (
      select 1
      from public.opening_balances
      where kind = 'inventory'
        and material_id = p_material_id
    ) then
      raise exception 'opening balance already exists for this material';
    end if;

  elsif p_kind = 'customer_receivable' then
    if not exists (select 1 from public.customers where id = p_customer_id) then
      raise exception 'customer not found';
    end if;

    if p_amount is null or p_amount <= 0 then
      raise exception 'opening receivable must be greater than zero';
    end if;

    if exists (
      select 1
      from public.opening_balances
      where kind = p_kind
        and customer_id = p_customer_id
    ) then
      raise exception 'opening customer balance already exists';
    end if;

  elsif p_kind = 'supplier_payable' then
    if not exists (select 1 from public.suppliers where id = p_supplier_id) then
      raise exception 'supplier not found';
    end if;

    if p_amount is null or p_amount <= 0 then
      raise exception 'opening payable must be greater than zero';
    end if;

    if exists (
      select 1
      from public.opening_balances
      where kind = p_kind
        and supplier_id = p_supplier_id
    ) then
      raise exception 'opening supplier balance already exists';
    end if;

  elsif p_kind = 'ready' then
    if not exists (select 1 from public.models where id = p_model_id) then
      raise exception 'model not found';
    end if;

    if p_quantity is null or p_quantity <= 0 then
      raise exception 'opening READY quantity must be greater than zero';
    end if;

    if p_quantity <> trunc(p_quantity) then
      raise exception 'opening READY quantity must be a whole number';
    end if;

    if p_unit_cost is null or p_unit_cost < 0 then
      raise exception 'opening READY unit cost must be zero or greater';
    end if;

    if exists (
      select 1
      from public.opening_balances
      where kind = 'ready'
        and model_id = p_model_id
    ) then
      raise exception 'opening READY balance already exists for this model';
    end if;
  end if;

  insert into public.opening_balances(
    kind,
    effective_date,
    account_id,
    customer_id,
    supplier_id,
    material_id,
    model_id,
    quantity,
    unit_cost,
    amount,
    notes
  ) values (
    p_kind,
    p_effective_date,
    p_account_id,
    p_customer_id,
    p_supplier_id,
    p_material_id,
    p_model_id,
    p_quantity,
    p_unit_cost,
    p_amount,
    p_notes
  )
  returning id into v_id;

  if p_kind in ('cash','bank') then
    insert into public.money_movements(
      account_id,
      direction,
      amount,
      source_type,
      source_id,
      movement_date,
      reference,
      notes
    ) values (
      p_account_id,
      'in',
      p_amount,
      'opening_balance',
      v_id,
      p_effective_date,
      'OPENING',
      p_notes
    );

  elsif p_kind = 'inventory' then
    insert into public.inventory_movements(
      movement_kind,
      material_id,
      quantity,
      unit_cost,
      reference,
      reason
    ) values (
      'opening_in',
      p_material_id,
      p_quantity,
      p_unit_cost,
      'OPENING',
      'opening balance'
    )
    returning id into v_movement_id;

    insert into public.inventory_layers(
      material_id,
      source_movement_id,
      received_at,
      original_quantity,
      remaining_quantity,
      unit_cost
    ) values (
      p_material_id,
      v_movement_id,
      p_effective_date,
      p_quantity,
      p_quantity,
      p_unit_cost
    );

  elsif p_kind = 'ready' then
    insert into public.ready_lots(
      source_wip_lot_id,
      source_return_line_id,
      source_opening_balance_id,
      model_id,
      original_pieces,
      remaining_pieces,
      unit_cost_snapshot
    ) values (
      null,
      null,
      v_id,
      p_model_id,
      p_quantity::integer,
      p_quantity::integer,
      p_unit_cost
    );
  end if;

  return v_id;
end;
$function$;

grant execute on function public.post_opening_balance(
  public.opening_balance_kind,
  date,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  numeric,
  text,
  uuid
) to authenticated;

revoke execute on function public.post_opening_balance(
  public.opening_balance_kind,
  date,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  numeric,
  text,
  uuid
) from anon;
