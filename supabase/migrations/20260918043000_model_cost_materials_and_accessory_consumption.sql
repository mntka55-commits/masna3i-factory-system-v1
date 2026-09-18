
alter table public.model_materials
  add column if not exists unit_cost_override numeric(14,4);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_materials_unit_cost_override_nonnegative'
      and conrelid = 'public.model_materials'::regclass
  ) then
    alter table public.model_materials
      add constraint model_materials_unit_cost_override_nonnegative
      check (unit_cost_override is null or unit_cost_override >= 0);
  end if;
end
$$;

create or replace view public.v_model_material_costs as
with latest_purchase_price as (
  select distinct on (pi.factory_id, pl.material_id)
    pi.factory_id, pl.material_id, pl.unit_price
  from public.purchase_invoices pi
  join public.purchase_lines pl on pl.purchase_invoice_id = pi.id
  order by pi.factory_id, pl.material_id, pi.purchase_date desc, pi.created_at desc
)
select
  mm.factory_id, mm.model_id, mm.id as model_material_id, mm.material_id,
  m.code as material_code, m.name as material_name, m.kind as material_kind, m.unit,
  mm.quantity_per_piece, lpp.unit_price as source_unit_price, mm.unit_cost_override,
  coalesce(mm.unit_cost_override, lpp.unit_price) as effective_unit_price,
  case
    when mm.quantity_per_piece is not null
     and coalesce(mm.unit_cost_override, lpp.unit_price) is not null
    then (mm.quantity_per_piece * coalesce(mm.unit_cost_override, lpp.unit_price))::numeric(16,4)
    else null
  end as recipe_cost_per_piece
from public.model_materials mm
join public.materials m on m.id = mm.material_id
left join latest_purchase_price lpp
  on lpp.factory_id = mm.factory_id and lpp.material_id = mm.material_id;

drop view if exists public.v_model_current_costs cascade;

create view public.v_model_current_costs
with (security_invoker = true)
as
with latest_cut as (
  select distinct on (co.factory_id, co.model_id)
    co.factory_id, co.model_id, co.id as cutting_operation_id, co.cutting_date, co.actual_pieces
  from public.cutting_operations co
  where co.status = 'posted' and co.actual_pieces > 0
  order by co.factory_id, co.model_id, co.cutting_date desc, co.created_at desc
),
latest_purchase_price as (
  select distinct on (pi.factory_id, pl.material_id)
    pi.factory_id, pl.material_id, pl.unit_price
  from public.purchase_invoices pi
  join public.purchase_lines pl on pl.purchase_invoice_id = pi.id
  order by pi.factory_id, pl.material_id, pi.purchase_date desc, pi.created_at desc
),
fabric_cost as (
  select
    lc.factory_id, lc.model_id, lc.cutting_operation_id, lc.actual_pieces,
    coalesce(sum(ci.actual_quantity * coalesce(mm.unit_cost_override, lpp.unit_price, 0)), 0) as fabric_cost,
    coalesce(sum(ci.actual_quantity), 0) as consumed_quantity
  from latest_cut lc
  join public.cutting_inputs ci on ci.cutting_operation_id = lc.cutting_operation_id
  left join public.model_materials mm
    on mm.model_id = lc.model_id and mm.material_id = ci.material_id
  left join latest_purchase_price lpp
    on lpp.factory_id = lc.factory_id and lpp.material_id = ci.material_id
  group by lc.factory_id, lc.model_id, lc.cutting_operation_id, lc.actual_pieces
),
accessory_cost as (
  select
    lc.factory_id, lc.model_id, lc.cutting_operation_id, lc.actual_pieces,
    coalesce(sum(
      case
        when mm.quantity_per_piece is not null and mm.quantity_per_piece > 0
        then mm.quantity_per_piece * coalesce(mm.unit_cost_override, lpp.unit_price, 0)
        else 0
      end
    ), 0) as accessory_cost_per_piece
  from latest_cut lc
  join public.model_materials mm on mm.model_id = lc.model_id
  join public.materials m on m.id = mm.material_id and m.kind = 'accessory'
  left join latest_purchase_price lpp
    on lpp.factory_id = lc.factory_id and lpp.material_id = mm.material_id
  group by lc.factory_id, lc.model_id, lc.cutting_operation_id, lc.actual_pieces
),
variable_costs as (
  select mvc.factory_id, mvc.model_id,
         coalesce(sum(mvc.amount_per_piece), 0) as variable_cost_per_piece
  from public.model_variable_costs mvc
  group by mvc.factory_id, mvc.model_id
)
select
  fc.factory_id, fc.model_id, fc.cutting_operation_id, fc.actual_pieces, fc.consumed_quantity,
  case when fc.actual_pieces > 0 then fc.consumed_quantity / fc.actual_pieces else 0 end as consumption_per_piece,
  case when fc.actual_pieces > 0 then fc.fabric_cost / fc.actual_pieces else 0 end as fabric_cost_per_piece,
  coalesce(ac.accessory_cost_per_piece, 0) as accessory_cost_per_piece,
  coalesce(vc.variable_cost_per_piece, 0) as variable_cost_per_piece,
  (
    case when fc.actual_pieces > 0 then fc.fabric_cost / fc.actual_pieces else 0 end
    + coalesce(ac.accessory_cost_per_piece, 0)
    + coalesce(vc.variable_cost_per_piece, 0)
  ) as current_cost_per_piece
from fabric_cost fc
left join accessory_cost ac
  on ac.factory_id = fc.factory_id
 and ac.model_id = fc.model_id
 and ac.cutting_operation_id = fc.cutting_operation_id
left join variable_costs vc
  on vc.factory_id = fc.factory_id and vc.model_id = fc.model_id;

grant select on public.v_model_material_costs to authenticated;
grant select on public.v_model_current_costs to authenticated;
revoke select on public.v_model_material_costs from anon;
revoke select on public.v_model_current_costs from anon;

create or replace function public.post_cutting(
  p_model_id uuid, p_cutting_date date, p_actual_pieces integer, p_inputs jsonb, p_notes text default null
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_cutting_id uuid; v_input_id uuid; v_movement_id uuid; v_material_id uuid;
  v_needed numeric(14,3); v_take numeric(14,3); v_item jsonb; v_layer record;
  v_accessory record; v_variable_snapshot numeric(14,4) := 0;
begin
  if p_model_id is null then raise exception 'model is required'; end if;
  if p_cutting_date is null then raise exception 'cutting date is required'; end if;
  if p_actual_pieces is null or p_actual_pieces <= 0 then raise exception 'actual pieces must be greater than zero'; end if;
  if p_inputs is null or jsonb_array_length(p_inputs) = 0 then raise exception 'cutting must contain at least one fabric input'; end if;
  if not exists(select 1 from public.models where id = p_model_id) then raise exception 'model not found'; end if;

  select coalesce(sum(amount_per_piece), 0)
  into v_variable_snapshot
  from public.model_variable_costs
  where model_id = p_model_id;

  insert into public.cutting_operations(
    model_id, cutting_date, actual_pieces, status, notes, variable_cost_per_piece_snapshot
  )
  values (p_model_id, p_cutting_date, p_actual_pieces, 'posted', p_notes, v_variable_snapshot)
  returning id into v_cutting_id;

  for v_item in
    select jsonb_build_object('material_id', material_id, 'quantity', sum(quantity))
    from (
      select (value->>'material_id')::uuid as material_id,
             (value->>'quantity')::numeric(14,3) as quantity
      from jsonb_array_elements(p_inputs)
    ) s
    group by material_id
  loop
    v_material_id := (v_item->>'material_id')::uuid;
    v_needed := (v_item->>'quantity')::numeric;

    if v_material_id is null or v_needed is null or v_needed <= 0 then
      raise exception 'each cutting input needs a positive material_id and quantity';
    end if;

    if not exists (
      select 1 from public.materials where id = v_material_id and kind = 'fabric'
    ) then
      raise exception 'cutting input must reference an existing fabric material: %', v_material_id;
    end if;

    insert into public.cutting_inputs(cutting_operation_id, material_id, actual_quantity)
    values (v_cutting_id, v_material_id, v_needed)
    returning id into v_input_id;

    for v_layer in
      select id, remaining_quantity, unit_cost
      from public.inventory_layers
      where material_id = v_material_id and remaining_quantity > 0
      order by received_at, id
      for update
    loop
      exit when v_needed <= 0;
      v_take := least(v_needed, v_layer.remaining_quantity);

      update public.inventory_layers
      set remaining_quantity = remaining_quantity - v_take
      where id = v_layer.id;

      insert into public.cutting_input_allocations(
        cutting_input_id, inventory_layer_id, quantity, unit_cost
      )
      values (v_input_id, v_layer.id, v_take, v_layer.unit_cost);

      insert into public.inventory_movements(
        movement_kind, material_id, quantity, unit_cost,
        cutting_operation_id, cutting_input_id, reference
      )
      values ('cutting_out', v_material_id, v_take, v_layer.unit_cost,
              v_cutting_id, v_input_id, 'CUTTING')
      returning id into v_movement_id;

      v_needed := v_needed - v_take;
    end loop;

    if v_needed > 0 then
      raise exception 'insufficient fabric stock for material %, missing %', v_material_id, v_needed;
    end if;
  end loop;

  for v_accessory in
    select mm.material_id, mm.quantity_per_piece
    from public.model_materials mm
    join public.materials m on m.id = mm.material_id
    where mm.model_id = p_model_id
      and m.kind = 'accessory'
      and coalesce(mm.quantity_per_piece, 0) > 0
  loop
    v_needed := round(v_accessory.quantity_per_piece * p_actual_pieces, 3);

    for v_layer in
      select id, remaining_quantity, unit_cost
      from public.inventory_layers
      where material_id = v_accessory.material_id and remaining_quantity > 0
      order by received_at, id
      for update
    loop
      exit when v_needed <= 0;
      v_take := least(v_needed, v_layer.remaining_quantity);

      update public.inventory_layers
      set remaining_quantity = remaining_quantity - v_take
      where id = v_layer.id;

      insert into public.inventory_movements(
        movement_kind, material_id, quantity, unit_cost,
        cutting_operation_id, reference, reason
      )
      values ('cutting_out', v_accessory.material_id, v_take, v_layer.unit_cost,
              v_cutting_id, 'ACCESSORY', 'model recipe consumption');

      v_needed := v_needed - v_take;
    end loop;

    if v_needed > 0 then
      raise exception 'insufficient accessory stock for material %, missing %', v_accessory.material_id, v_needed;
    end if;
  end loop;

  insert into public.wip_lots(cutting_operation_id, model_id, original_pieces, remaining_pieces)
  values (v_cutting_id, p_model_id, p_actual_pieces, p_actual_pieces);

  return v_cutting_id;
end;
$function$;

create or replace function public.post_wip_to_ready(p_wip_lot_id uuid, p_pieces integer)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_wip record; v_ready_id uuid; v_unit_cost numeric(14,4);
begin
  if p_pieces is null or p_pieces <= 0 then raise exception 'READY quantity must be greater than zero'; end if;

  select id, model_id, cutting_operation_id, remaining_pieces
  into v_wip
  from public.wip_lots where id = p_wip_lot_id for update;

  if not found then raise exception 'WIP lot not found'; end if;
  if p_pieces > v_wip.remaining_pieces then
    raise exception 'cannot move % pieces to READY; WIP has only % remaining', p_pieces, v_wip.remaining_pieces;
  end if;

  select round((
    coalesce((
      select sum(cia.quantity * cia.unit_cost) / nullif(co.actual_pieces,0)
      from public.cutting_inputs ci
      join public.cutting_input_allocations cia on cia.cutting_input_id = ci.id
      where ci.cutting_operation_id = v_wip.cutting_operation_id
    ),0)
    + coalesce((
      select sum(im.quantity * im.unit_cost) / nullif(co.actual_pieces,0)
      from public.inventory_movements im
      join public.materials m on m.id = im.material_id
      where im.cutting_operation_id = v_wip.cutting_operation_id
        and im.movement_kind = 'cutting_out'
        and m.kind = 'accessory'
    ),0)
    + coalesce(co.variable_cost_per_piece_snapshot,0)
  )::numeric,4)
  into v_unit_cost
  from public.cutting_operations co
  where co.id = v_wip.cutting_operation_id;

  if v_unit_cost is null then raise exception 'historical cost snapshot is unavailable for this WIP lot'; end if;

  update public.wip_lots
  set remaining_pieces = remaining_pieces - p_pieces
  where id = p_wip_lot_id;

  insert into public.ready_lots(
    source_wip_lot_id, model_id, original_pieces, remaining_pieces, unit_cost_snapshot
  )
  values (p_wip_lot_id, v_wip.model_id, p_pieces, p_pieces, v_unit_cost)
  returning id into v_ready_id;

  return v_ready_id;
end;
$function$;