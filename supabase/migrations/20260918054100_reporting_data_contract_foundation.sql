begin;

alter table public.sales
  add column if not exists sale_kind text not null default 'normal_sale';
alter table public.sales drop constraint if exists sales_sale_kind_check;
alter table public.sales add constraint sales_sale_kind_check
  check (sale_kind in ('normal_sale','clearance_sale','return_redelivery'));

alter table public.sale_lines
  add column if not exists source_return_line_id uuid references public.return_lines(id);

alter table public.cutting_operations
  add column if not exists variable_cost_per_piece_snapshot numeric(14,4);
alter table public.ready_lots
  add column if not exists unit_cost_snapshot numeric(14,4);
alter table public.return_damage_lots
  add column if not exists unit_cost_snapshot numeric(14,4);
alter table public.sale_ready_allocations
  add column if not exists unit_cost_snapshot numeric(14,4);
alter table public.return_lines
  add column if not exists financial_credit_amount numeric(16,2);

alter table public.cutting_operations
  drop constraint if exists cutting_operations_variable_cost_snapshot_nonnegative;
alter table public.cutting_operations
  add constraint cutting_operations_variable_cost_snapshot_nonnegative
  check (variable_cost_per_piece_snapshot is null or variable_cost_per_piece_snapshot >= 0);

alter table public.ready_lots
  drop constraint if exists ready_lots_unit_cost_snapshot_nonnegative;
alter table public.ready_lots
  add constraint ready_lots_unit_cost_snapshot_nonnegative
  check (unit_cost_snapshot is null or unit_cost_snapshot >= 0);

alter table public.return_damage_lots
  drop constraint if exists return_damage_lots_unit_cost_snapshot_nonnegative;
alter table public.return_damage_lots
  add constraint return_damage_lots_unit_cost_snapshot_nonnegative
  check (unit_cost_snapshot is null or unit_cost_snapshot >= 0);

alter table public.sale_ready_allocations
  drop constraint if exists sale_ready_allocations_unit_cost_snapshot_nonnegative;
alter table public.sale_ready_allocations
  add constraint sale_ready_allocations_unit_cost_snapshot_nonnegative
  check (unit_cost_snapshot is null or unit_cost_snapshot >= 0);

alter table public.return_lines
  drop constraint if exists return_lines_financial_credit_amount_nonnegative;
alter table public.return_lines
  add constraint return_lines_financial_credit_amount_nonnegative
  check (financial_credit_amount is null or financial_credit_amount >= 0);

create table if not exists public.return_line_sale_ready_allocations (
  id uuid primary key default gen_random_uuid(),
  return_line_id uuid not null references public.return_lines(id) on delete restrict,
  sale_ready_allocation_id uuid not null references public.sale_ready_allocations(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost_snapshot numeric(14,4),
  created_at timestamptz not null default now(),
  factory_id uuid references public.factories(id) on delete cascade,
  constraint return_line_sale_ready_allocations_unique
    unique (return_line_id, sale_ready_allocation_id),
  constraint return_line_sale_ready_allocations_cost_nonnegative
    check (unit_cost_snapshot is null or unit_cost_snapshot >= 0)
);

create index if not exists idx_return_line_sale_ready_allocations_return_line
  on public.return_line_sale_ready_allocations(return_line_id);
create index if not exists idx_return_line_sale_ready_allocations_sale_ready
  on public.return_line_sale_ready_allocations(sale_ready_allocation_id);

drop trigger if exists set_factory_scope on public.return_line_sale_ready_allocations;
create trigger set_factory_scope
before insert on public.return_line_sale_ready_allocations
for each row execute function private.set_factory_scope();

alter table public.return_line_sale_ready_allocations enable row level security;
drop policy if exists factory_scope_select on public.return_line_sale_ready_allocations;
create policy factory_scope_select on public.return_line_sale_ready_allocations
  for select using (factory_id = (select private.current_factory_id()));
drop policy if exists factory_scope_insert on public.return_line_sale_ready_allocations;
create policy factory_scope_insert on public.return_line_sale_ready_allocations
  for insert with check (factory_id = (select private.current_factory_id()));
drop policy if exists factory_scope_update on public.return_line_sale_ready_allocations;
create policy factory_scope_update on public.return_line_sale_ready_allocations
  for update using (factory_id = (select private.current_factory_id()))
  with check (factory_id = (select private.current_factory_id()));
drop policy if exists factory_scope_delete on public.return_line_sale_ready_allocations;
create policy factory_scope_delete on public.return_line_sale_ready_allocations
  for delete using (factory_id = (select private.current_factory_id()));

update public.cutting_operations co
set variable_cost_per_piece_snapshot = coalesce((
  select sum(mvc.amount_per_piece)
  from public.model_variable_costs mvc
  where mvc.model_id = co.model_id
), 0)
where co.variable_cost_per_piece_snapshot is null;

update public.ready_lots rl
set unit_cost_snapshot = (
  select round((
    coalesce((
      select sum(cia.quantity * cia.unit_cost) / nullif(co.actual_pieces,0)
      from public.cutting_inputs ci
      join public.cutting_input_allocations cia on cia.cutting_input_id = ci.id
      where ci.cutting_operation_id = co.id
    ), 0)
    + coalesce(co.variable_cost_per_piece_snapshot, 0)
  )::numeric,4)
  from public.wip_lots wl
  join public.cutting_operations co on co.id = wl.cutting_operation_id
  where wl.id = rl.source_wip_lot_id
)
where rl.unit_cost_snapshot is null and rl.source_wip_lot_id is not null;

update public.sale_ready_allocations sra
set unit_cost_snapshot = rl.unit_cost_snapshot
from public.ready_lots rl
where rl.id = sra.ready_lot_id and sra.unit_cost_snapshot is null;

alter table public.cutting_operations alter column variable_cost_per_piece_snapshot set not null;
alter table public.ready_lots alter column unit_cost_snapshot set not null;
alter table public.sale_ready_allocations alter column unit_cost_snapshot set not null;

create or replace function public.post_sale_and_invoice(
  p_invoice_number text, p_sale_date date, p_items jsonb,
  p_customer_id uuid default null, p_notes text default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_sale_id uuid; v_invoice_id uuid; v_line_id uuid;
  v_item jsonb; v_model_id uuid; v_qty integer; v_unit_price numeric(14,2);
  v_remaining integer; v_take integer; v_ready record;
begin
  if nullif(trim(p_invoice_number), '') is null then raise exception 'invoice number is required'; end if;
  if p_sale_date is null then raise exception 'sale date is required'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'sale must contain at least one line'; end if;
  if exists (select 1 from public.invoices where invoice_number = trim(p_invoice_number))
    then raise exception 'invoice number already exists: %', p_invoice_number; end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id=p_customer_id)
    then raise exception 'customer not found'; end if;

  insert into public.sales(customer_id,sale_date,sale_kind,notes)
  values (p_customer_id,p_sale_date,'normal_sale',p_notes) returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_model_id := (v_item->>'model_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_unit_price := coalesce((v_item->>'unit_price')::numeric,
      (select selling_price from public.models where id=v_model_id));

    if v_model_id is null or not exists (select 1 from public.models where id=v_model_id)
      then raise exception 'sale line model not found'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'sale line quantity must be greater than zero'; end if;
    if v_unit_price is null or v_unit_price < 0 then raise exception 'sale line unit price must be zero or greater'; end if;

    select coalesce(sum(remaining_pieces),0)::integer into v_remaining
    from public.ready_lots where model_id=v_model_id and remaining_pieces>0;
    if v_remaining < v_qty then
      raise exception 'insufficient READY stock for model %, requested %, available %',v_model_id,v_qty,v_remaining;
    end if;

    insert into public.sale_lines(sale_id,model_id,quantity,unit_price,source_return_line_id)
    values (v_sale_id,v_model_id,v_qty,v_unit_price,null) returning id into v_line_id;

    v_remaining := v_qty;
    for v_ready in
      select id,remaining_pieces,unit_cost_snapshot
      from public.ready_lots
      where model_id=v_model_id and remaining_pieces>0
      order by created_at,id
      for update
    loop
      exit when v_remaining<=0;
      v_take := least(v_remaining,v_ready.remaining_pieces);
      update public.ready_lots set remaining_pieces=remaining_pieces-v_take where id=v_ready.id;
      insert into public.sale_ready_allocations(sale_line_id,ready_lot_id,quantity,unit_cost_snapshot)
      values (v_line_id,v_ready.id,v_take,v_ready.unit_cost_snapshot);
      v_remaining := v_remaining-v_take;
    end loop;

    if v_remaining>0 then raise exception 'READY allocation failed for model %',v_model_id; end if;
  end loop;

  insert into public.invoices(sale_id,invoice_number,invoice_date)
  values(v_sale_id,trim(p_invoice_number),p_sale_date) returning id into v_invoice_id;

  insert into public.invoice_lines(invoice_id,model_id,quantity,unit_price)
  select v_invoice_id,model_id,quantity,unit_price from public.sale_lines where sale_id=v_sale_id;

  return jsonb_build_object('sale_id',v_sale_id,'invoice_id',v_invoice_id,'sale_kind','normal_sale');
exception
  when unique_violation then raise exception 'invoice number already exists: %',p_invoice_number;
end;
$function$;

create or replace function public.post_cutting(
  p_model_id uuid,p_cutting_date date,p_actual_pieces integer,p_inputs jsonb,p_notes text default null
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_cutting_id uuid; v_input_id uuid; v_movement_id uuid; v_material_id uuid;
  v_needed numeric(14,3); v_take numeric(14,3); v_item jsonb; v_layer record;
  v_variable_snapshot numeric(14,4):=0;
begin
  if p_model_id is null then raise exception 'model is required'; end if;
  if p_cutting_date is null then raise exception 'cutting date is required'; end if;
  if p_actual_pieces is null or p_actual_pieces<=0 then raise exception 'actual pieces must be greater than zero'; end if;
  if p_inputs is null or jsonb_array_length(p_inputs)=0 then raise exception 'cutting must contain at least one fabric input'; end if;
  if not exists(select 1 from public.models where id=p_model_id) then raise exception 'model not found'; end if;

  select coalesce(sum(amount_per_piece),0) into v_variable_snapshot
  from public.model_variable_costs where model_id=p_model_id;

  insert into public.cutting_operations(model_id,cutting_date,actual_pieces,status,notes,variable_cost_per_piece_snapshot)
  values(p_model_id,p_cutting_date,p_actual_pieces,'posted',p_notes,v_variable_snapshot)
  returning id into v_cutting_id;

  for v_item in
    select jsonb_build_object('material_id',material_id,'quantity',sum(quantity))
    from (
      select (value->>'material_id')::uuid material_id,(value->>'quantity')::numeric(14,3) quantity
      from jsonb_array_elements(p_inputs)
    ) s group by material_id
  loop
    v_material_id := (v_item->>'material_id')::uuid;
    v_needed := (v_item->>'quantity')::numeric;
    if v_material_id is null or v_needed is null or v_needed<=0
      then raise exception 'each cutting input needs a positive material_id and quantity'; end if;
    if not exists(select 1 from public.materials where id=v_material_id and kind='fabric')
      then raise exception 'cutting input must reference an existing fabric material: %',v_material_id; end if;

    insert into public.cutting_inputs(cutting_operation_id,material_id,actual_quantity)
    values(v_cutting_id,v_material_id,v_needed) returning id into v_input_id;

    for v_layer in
      select id,remaining_quantity,unit_cost
      from public.inventory_layers
      where material_id=v_material_id and remaining_quantity>0
      order by received_at,id for update
    loop
      exit when v_needed<=0;
      v_take := least(v_needed,v_layer.remaining_quantity);
      update public.inventory_layers set remaining_quantity=remaining_quantity-v_take where id=v_layer.id;

      insert into public.cutting_input_allocations(cutting_input_id,inventory_layer_id,quantity,unit_cost)
      values(v_input_id,v_layer.id,v_take,v_layer.unit_cost);

      insert into public.inventory_movements(
        movement_kind,material_id,quantity,unit_cost,cutting_operation_id,cutting_input_id,reference
      ) values('cutting_out',v_material_id,v_take,v_layer.unit_cost,v_cutting_id,v_input_id,'CUTTING')
      returning id into v_movement_id;

      v_needed := v_needed-v_take;
    end loop;

    if v_needed>0 then
      raise exception 'insufficient fabric stock for material %, missing %',v_material_id,v_needed;
    end if;
  end loop;

  insert into public.wip_lots(cutting_operation_id,model_id,original_pieces,remaining_pieces)
  values(v_cutting_id,p_model_id,p_actual_pieces,p_actual_pieces);
  return v_cutting_id;
end;
$function$;

create or replace function public.post_wip_to_ready(p_wip_lot_id uuid,p_pieces integer)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_wip record; v_ready_id uuid; v_unit_cost numeric(14,4);
begin
  if p_pieces is null or p_pieces<=0 then raise exception 'READY quantity must be greater than zero'; end if;

  select id,model_id,cutting_operation_id,remaining_pieces into v_wip
  from public.wip_lots where id=p_wip_lot_id for update;
  if not found then raise exception 'WIP lot not found'; end if;
  if p_pieces>v_wip.remaining_pieces then
    raise exception 'cannot move % pieces to READY; WIP has only % remaining',p_pieces,v_wip.remaining_pieces;
  end if;

  select round((
    coalesce((
      select sum(cia.quantity*cia.unit_cost)/nullif(co.actual_pieces,0)
      from public.cutting_inputs ci
      join public.cutting_input_allocations cia on cia.cutting_input_id=ci.id
      where ci.cutting_operation_id=v_wip.cutting_operation_id
    ),0)+coalesce(co.variable_cost_per_piece_snapshot,0)
  )::numeric,4)
  into v_unit_cost
  from public.cutting_operations co where co.id=v_wip.cutting_operation_id;

  if v_unit_cost is null then raise exception 'historical cost snapshot is unavailable for this WIP lot'; end if;

  update public.wip_lots set remaining_pieces=remaining_pieces-p_pieces where id=p_wip_lot_id;
  insert into public.ready_lots(source_wip_lot_id,model_id,original_pieces,remaining_pieces,unit_cost_snapshot)
  values(p_wip_lot_id,v_wip.model_id,p_pieces,p_pieces,v_unit_cost) returning id into v_ready_id;
  return v_ready_id;
end;
$function$;

create or replace function public.post_return(
  p_return_number text,p_sale_id uuid,p_return_date date,p_lines jsonb,p_notes text default null
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_return_id uuid; v_return_line_id uuid; v_sale_line_id uuid; v_model_id uuid;
  v_qty integer; v_outcome public.return_line_outcome; v_item jsonb; v_sold integer;
  v_already_returned integer; v_unit_price numeric(14,2); v_credit numeric(16,2);
  v_remaining integer; v_alloc_remaining integer; v_weighted_cost numeric(14,4):=0;
  v_cost_qty integer:=0; v_alloc record; v_used integer;
begin
  if nullif(trim(p_return_number),'') is null then raise exception 'return number is required'; end if;
  if p_sale_id is null then raise exception 'sale is required'; end if;
  if p_return_date is null then raise exception 'return date is required'; end if;
  if p_lines is null or jsonb_array_length(p_lines)=0 then raise exception 'return must contain at least one line'; end if;
  if not exists(select 1 from public.sales where id=p_sale_id) then raise exception 'sale not found'; end if;
  perform 1 from public.sales where id=p_sale_id for update;

  insert into public.returns(return_number,sale_id,return_date,notes)
  values(trim(p_return_number),p_sale_id,p_return_date,p_notes) returning id into v_return_id;

  for v_item in select value from jsonb_array_elements(p_lines)
  loop
    v_sale_line_id := (v_item->>'sale_line_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_outcome := (v_item->>'outcome')::public.return_line_outcome;
    if v_sale_line_id is null or v_qty is null or v_qty<=0 or v_outcome is null
      then raise exception 'each return line needs sale_line_id, positive quantity and outcome'; end if;

    select sl.quantity,sl.model_id,sl.unit_price into v_sold,v_model_id,v_unit_price
    from public.sale_lines sl
    where sl.id=v_sale_line_id and sl.sale_id=p_sale_id for update;
    if not found then raise exception 'sale line not found in sale'; end if;

    select coalesce(sum(rl.quantity),0) into v_already_returned
    from public.return_lines rl join public.returns r on r.id=rl.return_id
    where rl.sale_line_id=v_sale_line_id;

    if v_qty+v_already_returned>v_sold then
      raise exception 'cannot return % pieces; sale line has % sold and % already returned',v_qty,v_sold,v_already_returned;
    end if;

    v_credit := round((v_qty::numeric*v_unit_price)::numeric,2);

    insert into public.return_lines(return_id,sale_line_id,quantity,outcome,notes,financial_credit_amount)
    values(v_return_id,v_sale_line_id,v_qty,v_outcome,nullif(v_item->>'notes',''),v_credit)
    returning id into v_return_line_id;

    v_remaining:=v_qty; v_weighted_cost:=0; v_cost_qty:=0;

    for v_alloc in
      select id,quantity,unit_cost_snapshot
      from public.sale_ready_allocations
      where sale_line_id=v_sale_line_id
      order by created_at,id for update
    loop
      exit when v_remaining<=0;
      select coalesce(sum(quantity),0) into v_used
      from public.return_line_sale_ready_allocations
      where sale_ready_allocation_id=v_alloc.id;
      v_alloc_remaining:=v_alloc.quantity-v_used;
      if v_alloc_remaining<=0 then continue; end if;
      v_used:=least(v_remaining,v_alloc_remaining);

      insert into public.return_line_sale_ready_allocations(
        return_line_id,sale_ready_allocation_id,quantity,unit_cost_snapshot
      ) values(v_return_line_id,v_alloc.id,v_used,v_alloc.unit_cost_snapshot);

      v_weighted_cost:=v_weighted_cost+(v_used*v_alloc.unit_cost_snapshot);
      v_cost_qty:=v_cost_qty+v_used;
      v_remaining:=v_remaining-v_used;
    end loop;

    if v_remaining>0 then
      raise exception 'return cost lineage could not cover % pieces for sale line %',v_remaining,v_sale_line_id;
    end if;

    if v_outcome='good_ready' then
      insert into public.ready_lots(
        source_return_line_id,model_id,original_pieces,remaining_pieces,unit_cost_snapshot
      ) values(
        v_return_line_id,v_model_id,v_qty,v_qty,round(v_weighted_cost/nullif(v_cost_qty,0),4)
      );
    else
      insert into public.return_damage_lots(
        return_line_id,model_id,original_pieces,remaining_pieces,status,unit_cost_snapshot
      ) values(
        v_return_line_id,v_model_id,v_qty,v_qty,'damaged',round(v_weighted_cost/nullif(v_cost_qty,0),4)
      );
    end if;
  end loop;
  return v_return_id;
exception
  when unique_violation then raise exception 'return number already exists: %',p_return_number;
end;
$function$;

create or replace function public.post_return_repair_to_ready(p_return_line_id uuid,p_pieces integer)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare v_lot record; v_ready_id uuid;
begin
  if p_pieces is null or p_pieces<=0 then raise exception 'repair quantity must be greater than zero'; end if;
  select id,model_id,remaining_pieces,unit_cost_snapshot into v_lot
  from public.return_damage_lots
  where return_line_id=p_return_line_id and status='damaged' for update;
  if not found then raise exception 'damaged return lot not found'; end if;
  if p_pieces>v_lot.remaining_pieces then
    raise exception 'cannot repair % pieces; damaged lot has only % remaining',p_pieces,v_lot.remaining_pieces;
  end if;
  if v_lot.unit_cost_snapshot is null then raise exception 'historical cost snapshot is unavailable for this return'; end if;

  update public.return_damage_lots
  set remaining_pieces=remaining_pieces-p_pieces,
      status=case when remaining_pieces-p_pieces=0 then 'closed' else status end
  where id=v_lot.id;

  insert into public.ready_lots(
    source_return_line_id,model_id,original_pieces,remaining_pieces,unit_cost_snapshot
  ) values(p_return_line_id,v_lot.model_id,p_pieces,p_pieces,v_lot.unit_cost_snapshot)
  returning id into v_ready_id;
  return v_ready_id;
end;
$function$;

create or replace function public.post_return_redelivery(
  p_invoice_number text,p_sale_date date,p_return_line_id uuid,p_quantity integer,
  p_unit_price numeric default null,p_notes text default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_sale_id uuid; v_invoice_id uuid; v_line_id uuid;
  v_return record; v_sale_line record; v_original_price numeric(14,2); v_price numeric(14,2);
  v_already_redelivered integer; v_remaining integer; v_take integer; v_ready record;
begin
  if nullif(trim(p_invoice_number),'') is null then raise exception 'invoice number is required'; end if;
  if p_sale_date is null then raise exception 'sale date is required'; end if;
  if p_return_line_id is null then raise exception 'return line is required'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 're-delivery quantity must be greater than zero'; end if;

  select rl.id,rl.quantity,rl.outcome,r.sale_id,s.customer_id into v_return
  from public.return_lines rl
  join public.returns r on r.id=rl.return_id
  join public.sales s on s.id=r.sale_id
  where rl.id=p_return_line_id for update;

  if not found then raise exception 'return line not found'; end if;
  if v_return.customer_id is null then raise exception 'original return has no customer; re-delivery requires a customer'; end if;
  if v_return.outcome not in ('good_ready','repair') then raise exception 'return line is not eligible for direct re-delivery'; end if;

  select sl.id,sl.model_id,sl.unit_price into v_sale_line
  from public.sale_lines sl join public.return_lines rl on rl.sale_line_id=sl.id
  where rl.id=p_return_line_id for update;

  v_original_price:=v_sale_line.unit_price;
  v_price:=coalesce(p_unit_price,v_original_price);
  if v_price<0 then raise exception 're-delivery unit price cannot be negative'; end if;

  select coalesce(sum(sl.quantity),0) into v_already_redelivered
  from public.sale_lines sl where sl.source_return_line_id=p_return_line_id;

  if p_quantity+v_already_redelivered>v_return.quantity then
    raise exception 'cannot re-deliver % pieces; return line has % pieces and % already re-delivered',
      p_quantity,v_return.quantity,v_already_redelivered;
  end if;

  if exists(select 1 from public.invoices where invoice_number=trim(p_invoice_number))
    then raise exception 'invoice number already exists: %',p_invoice_number; end if;

  insert into public.sales(customer_id,sale_date,sale_kind,notes)
  values(v_return.customer_id,p_sale_date,'return_redelivery',p_notes)
  returning id into v_sale_id;

  insert into public.sale_lines(sale_id,model_id,quantity,unit_price,source_return_line_id)
  values(v_sale_id,v_sale_line.model_id,p_quantity,v_price,p_return_line_id)
  returning id into v_line_id;

  v_remaining:=p_quantity;
  for v_ready in
    select id,remaining_pieces,unit_cost_snapshot
    from public.ready_lots
    where source_return_line_id=p_return_line_id and remaining_pieces>0
    order by created_at,id for update
  loop
    exit when v_remaining<=0;
    v_take:=least(v_remaining,v_ready.remaining_pieces);
    update public.ready_lots set remaining_pieces=remaining_pieces-v_take where id=v_ready.id;
    insert into public.sale_ready_allocations(sale_line_id,ready_lot_id,quantity,unit_cost_snapshot)
    values(v_line_id,v_ready.id,v_take,v_ready.unit_cost_snapshot);
    v_remaining:=v_remaining-v_take;
  end loop;

  if v_remaining>0 then raise exception 'insufficient repaired/returned READY stock for re-delivery'; end if;

  insert into public.invoices(sale_id,invoice_number,invoice_date)
  values(v_sale_id,trim(p_invoice_number),p_sale_date) returning id into v_invoice_id;

  insert into public.invoice_lines(invoice_id,model_id,quantity,unit_price)
  values(v_invoice_id,v_sale_line.model_id,p_quantity,v_price);

  return jsonb_build_object(
    'sale_id',v_sale_id,'invoice_id',v_invoice_id,
    'sale_kind','return_redelivery','source_return_line_id',p_return_line_id
  );
exception
  when unique_violation then raise exception 'invoice number already exists: %',p_invoice_number;
end;
$function$;

create or replace view public.v_invoice_balances
with (security_invoker=true)
as
select
  i.id as invoice_id,
  i.invoice_number,
  i.invoice_date,
  s.customer_id,
  coalesce(sum(il.line_total),0)::numeric(16,2) as invoice_total,
  coalesce((select sum(ca.amount) from public.collection_allocations ca where ca.invoice_id=i.id),0)::numeric(16,2) as collected_total,
  greatest(
    coalesce(sum(il.line_total),0)
    - coalesce((select sum(ca.amount) from public.collection_allocations ca where ca.invoice_id=i.id),0)
    - coalesce((
      select sum(rl.financial_credit_amount)
      from public.return_lines rl join public.returns r on r.id=rl.return_id
      where r.sale_id=i.sale_id
    ),0),0
  )::numeric(16,2) as outstanding_total,
  s.sale_kind,
  coalesce((
    select sum(rl.financial_credit_amount)
    from public.return_lines rl join public.returns r on r.id=rl.return_id
    where r.sale_id=i.sale_id
  ),0)::numeric(16,2) as returned_credit_total
from public.invoices i
join public.sales s on s.id=i.sale_id
left join public.invoice_lines il on il.invoice_id=i.id
group by i.id,i.invoice_number,i.invoice_date,s.customer_id,s.sale_kind,i.sale_id;

create or replace view public.v_historical_cogs
with (security_invoker=true)
as
select
  sra.id as sale_ready_allocation_id,
  sl.id as sale_line_id,
  s.id as sale_id,
  i.id as invoice_id,
  i.invoice_number,
  s.sale_date,
  s.sale_kind,
  s.customer_id,
  sl.model_id,
  sra.ready_lot_id,
  sra.quantity,
  sra.unit_cost_snapshot,
  (sra.quantity*sra.unit_cost_snapshot)::numeric(16,2) as cogs_amount,
  (sra.unit_cost_snapshot is not null) as cost_complete
from public.sale_ready_allocations sra
join public.sale_lines sl on sl.id=sra.sale_line_id
join public.sales s on s.id=sl.sale_id
join public.invoices i on i.sale_id=s.id;

create or replace view public.v_sales_report
with (security_invoker=true)
as
select
  i.id as invoice_id,
  i.invoice_number,
  i.invoice_date,
  s.id as sale_id,
  s.customer_id,
  s.sale_kind,
  coalesce(sum(il.quantity),0)::integer as pieces,
  coalesce(sum(il.line_total),0)::numeric(16,2) as sales_amount
from public.invoices i
join public.sales s on s.id=i.sale_id
left join public.invoice_lines il on il.invoice_id=i.id
group by i.id,i.invoice_number,i.invoice_date,s.id,s.customer_id,s.sale_kind;

create or replace view public.v_returns_report
with (security_invoker=true)
as
select
  r.id as return_id,r.return_number,r.return_date,r.sale_id,s.customer_id,
  rl.id as return_line_id,rl.sale_line_id,sl.model_id,rl.quantity,rl.outcome,
  coalesce(rl.financial_credit_amount,0)::numeric(16,2) as financial_credit_amount
from public.returns r
join public.sales s on s.id=r.sale_id
join public.return_lines rl on rl.return_id=r.id
join public.sale_lines sl on sl.id=rl.sale_line_id;

create or replace view public.v_customer_account_balances
with (security_invoker=true)
as
with opening as (
  select customer_id,coalesce(sum(amount),0)::numeric(16,2) opening_receivable
  from public.opening_balances where kind='customer_receivable' group by customer_id
),
sales as (
  select customer_id,coalesce(sum(sales_amount),0)::numeric(16,2) billed_sales
  from public.v_sales_report where customer_id is not null group by customer_id
),
collections as (
  select s.customer_id,coalesce(sum(ca.amount),0)::numeric(16,2) collected
  from public.collection_allocations ca
  join public.invoices i on i.id=ca.invoice_id
  join public.sales s on s.id=i.sale_id
  where s.customer_id is not null group by s.customer_id
),
returns as (
  select s.customer_id,coalesce(sum(rl.financial_credit_amount),0)::numeric(16,2) return_credits
  from public.return_lines rl
  join public.returns r on r.id=rl.return_id
  join public.sales s on s.id=r.sale_id
  where s.customer_id is not null group by s.customer_id
)
select
  c.id customer_id,c.code,c.name,
  coalesce(o.opening_receivable,0)::numeric(16,2) opening_receivable,
  coalesce(s.billed_sales,0)::numeric(16,2) billed_sales,
  coalesce(col.collected,0)::numeric(16,2) collected,
  coalesce(r.return_credits,0)::numeric(16,2) return_credits,
  (coalesce(o.opening_receivable,0)+coalesce(s.billed_sales,0)-coalesce(col.collected,0)-coalesce(r.return_credits,0))::numeric(16,2) net_balance,
  greatest(coalesce(o.opening_receivable,0)+coalesce(s.billed_sales,0)-coalesce(col.collected,0)-coalesce(r.return_credits,0),0)::numeric(16,2) amount_due,
  greatest(-(coalesce(o.opening_receivable,0)+coalesce(s.billed_sales,0)-coalesce(col.collected,0)-coalesce(r.return_credits,0)),0)::numeric(16,2) customer_credit
from public.customers c
left join opening o on o.customer_id=c.id
left join sales s on s.customer_id=c.id
left join collections col on col.customer_id=c.id
left join returns r on r.customer_id=c.id;

create or replace view public.v_supplier_account_balances
with (security_invoker=true)
as
with opening as (
  select supplier_id,coalesce(sum(amount),0)::numeric(16,2) opening_payable
  from public.opening_balances where kind='supplier_payable' group by supplier_id
),
purchases as (
  select supplier_id,coalesce(sum(total_amount),0)::numeric(16,2) purchases
  from public.v_purchase_totals group by supplier_id
),
payments as (
  select supplier_id,coalesce(sum(amount),0)::numeric(16,2) payments
  from public.supplier_payments group by supplier_id
)
select
  s.id supplier_id,s.name,
  coalesce(o.opening_payable,0)::numeric(16,2) opening_payable,
  coalesce(p.purchases,0)::numeric(16,2) purchases,
  coalesce(pay.payments,0)::numeric(16,2) payments,
  (coalesce(o.opening_payable,0)+coalesce(p.purchases,0)-coalesce(pay.payments,0))::numeric(16,2) payable_balance
from public.suppliers s
left join opening o on o.supplier_id=s.id
left join purchases p on p.supplier_id=s.id
left join payments pay on pay.supplier_id=s.id;

create or replace view public.v_expense_report
with (security_invoker=true)
as
select expense_date,id as expense_id,expense_number,category_id,cost_type,amount,account_id,description,notes
from public.expenses;

create or replace view public.v_variable_cutting_costs
with (security_invoker=true)
as
select
  ci.cutting_operation_id,
  co.model_id,
  co.cutting_date,
  (sum(cia.quantity*cia.unit_cost))::numeric(16,2) variable_fabric_cost,
  co.actual_pieces,
  round((sum(cia.quantity*cia.unit_cost)/nullif(co.actual_pieces,0))::numeric,4) variable_cost_per_piece,
  co.variable_cost_per_piece_snapshot
from public.cutting_inputs ci
join public.cutting_input_allocations cia on cia.cutting_input_id=ci.id
join public.cutting_operations co on co.id=ci.cutting_operation_id
where co.status='posted'
group by ci.cutting_operation_id,co.model_id,co.cutting_date,co.actual_pieces,co.variable_cost_per_piece_snapshot;

create or replace view public.v_reporting_data_quality
with (security_invoker=true)
as
select 'sale_cost_snapshot_missing' issue_code,count(*)::bigint issue_count
from public.sale_ready_allocations where unit_cost_snapshot is null
union all
select 'cut_variable_cost_snapshot_missing',count(*)::bigint
from public.cutting_operations where status='posted' and variable_cost_per_piece_snapshot is null
union all
select 'return_financial_credit_missing',count(*)::bigint
from public.return_lines where financial_credit_amount is null
union all
select 'return_cost_lineage_missing',count(*)::bigint
from public.return_lines rl
where not exists(select 1 from public.return_line_sale_ready_allocations x where x.return_line_id=rl.id);

grant select on public.v_sales_report to authenticated;
grant select on public.v_historical_cogs to authenticated;
grant select on public.v_returns_report to authenticated;
grant select on public.v_customer_account_balances to authenticated;
grant select on public.v_supplier_account_balances to authenticated;
grant select on public.v_expense_report to authenticated;
grant select on public.v_reporting_data_quality to authenticated;

revoke all on public.v_sales_report from anon;
revoke all on public.v_historical_cogs from anon;
revoke all on public.v_returns_report from anon;
revoke all on public.v_customer_account_balances from anon;
revoke all on public.v_supplier_account_balances from anon;
revoke all on public.v_expense_report from anon;
revoke all on public.v_reporting_data_quality from anon;

revoke execute on function public.post_return_redelivery(text,date,uuid,integer,numeric,text) from anon,public;
grant execute on function public.post_return_redelivery(text,date,uuid,integer,numeric,text) to authenticated;

commit;