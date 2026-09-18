
drop view if exists public.v_model_material_costs;

create view public.v_model_material_costs
with (security_invoker = true)
as
with latest_purchase_price as (
  select distinct on (pi.factory_id, pl.material_id)
    pi.factory_id, pl.material_id, pl.unit_price
  from public.purchase_invoices pi
  join public.purchase_lines pl on pl.purchase_invoice_id = pi.id
  order by pi.factory_id, pl.material_id, pi.purchase_date desc, pi.created_at desc
),
latest_inventory_cost as (
  select distinct on (im.factory_id, im.material_id)
    im.factory_id, im.material_id, im.unit_cost
  from public.inventory_movements im
  where im.quantity > 0
    and im.unit_cost is not null
    and im.movement_kind in ('purchase_in','opening_in','adjustment_in')
  order by im.factory_id, im.material_id, im.created_at desc, im.id desc
)
select
  mm.factory_id, mm.model_id, mm.id as model_material_id, mm.material_id,
  m.code as material_code, m.name as material_name, m.kind as material_kind, m.unit,
  mm.quantity_per_piece,
  coalesce(lpp.unit_price, lic.unit_cost) as source_unit_price,
  mm.unit_cost_override,
  coalesce(mm.unit_cost_override, lpp.unit_price, lic.unit_cost) as effective_unit_price,
  case
    when mm.unit_cost_override is not null then 'owner_override'
    when lpp.unit_price is not null then 'latest_purchase'
    when lic.unit_cost is not null then 'warehouse'
    else 'unavailable'
  end as price_source,
  case
    when mm.quantity_per_piece is not null
     and coalesce(mm.unit_cost_override, lpp.unit_price, lic.unit_cost) is not null
    then (mm.quantity_per_piece * coalesce(mm.unit_cost_override, lpp.unit_price, lic.unit_cost))::numeric(16,4)
    else null
  end as recipe_cost_per_piece
from public.model_materials mm
join public.materials m on m.id = mm.material_id
left join latest_purchase_price lpp
  on lpp.factory_id = mm.factory_id and lpp.material_id = mm.material_id
left join latest_inventory_cost lic
  on lic.factory_id = mm.factory_id and lic.material_id = mm.material_id;

create or replace view public.v_model_current_costs
with (security_invoker = true)
as
with latest_cut as (
  select distinct on (co.factory_id, co.model_id)
    co.factory_id, co.model_id, co.id as cutting_operation_id, co.cutting_date, co.actual_pieces
  from public.cutting_operations co
  where co.status='posted' and co.actual_pieces>0
  order by co.factory_id, co.model_id, co.cutting_date desc, co.created_at desc
),
latest_purchase_price as (
  select distinct on (pi.factory_id, pl.material_id)
    pi.factory_id, pl.material_id, pl.unit_price
  from public.purchase_invoices pi
  join public.purchase_lines pl on pl.purchase_invoice_id=pi.id
  order by pi.factory_id, pl.material_id, pi.purchase_date desc, pi.created_at desc
),
latest_inventory_cost as (
  select distinct on (im.factory_id, im.material_id)
    im.factory_id, im.material_id, im.unit_cost
  from public.inventory_movements im
  where im.quantity>0 and im.unit_cost is not null
    and im.movement_kind in ('purchase_in','opening_in','adjustment_in')
  order by im.factory_id, im.material_id, im.created_at desc, im.id desc
),
fabric_cost as (
  select
    lc.factory_id,lc.model_id,lc.cutting_operation_id,lc.actual_pieces,
    coalesce(sum(ci.actual_quantity * coalesce(mm.unit_cost_override,lpp.unit_price,lic.unit_cost,0)),0) as fabric_cost,
    coalesce(sum(ci.actual_quantity),0) as consumed_quantity
  from latest_cut lc
  join public.cutting_inputs ci on ci.cutting_operation_id=lc.cutting_operation_id
  left join public.model_materials mm on mm.model_id=lc.model_id and mm.material_id=ci.material_id
  left join latest_purchase_price lpp on lpp.factory_id=lc.factory_id and lpp.material_id=ci.material_id
  left join latest_inventory_cost lic on lic.factory_id=lc.factory_id and lic.material_id=ci.material_id
  group by lc.factory_id,lc.model_id,lc.cutting_operation_id,lc.actual_pieces
),
accessory_cost as (
  select
    lc.factory_id,lc.model_id,lc.cutting_operation_id,lc.actual_pieces,
    coalesce(sum(
      case when mm.quantity_per_piece is not null and mm.quantity_per_piece>0
        then mm.quantity_per_piece * coalesce(mm.unit_cost_override,lpp.unit_price,lic.unit_cost,0)
        else 0 end
    ),0) as accessory_cost_per_piece
  from latest_cut lc
  join public.model_materials mm on mm.model_id=lc.model_id
  join public.materials m on m.id=mm.material_id and m.kind='accessory'
  left join latest_purchase_price lpp on lpp.factory_id=lc.factory_id and lpp.material_id=mm.material_id
  left join latest_inventory_cost lic on lic.factory_id=lc.factory_id and lic.material_id=mm.material_id
  group by lc.factory_id,lc.model_id,lc.cutting_operation_id,lc.actual_pieces
),
variable_costs as (
  select mvc.factory_id,mvc.model_id,coalesce(sum(mvc.amount_per_piece),0) as variable_cost_per_piece
  from public.model_variable_costs mvc
  group by mvc.factory_id,mvc.model_id
)
select
  fc.factory_id,fc.model_id,fc.cutting_operation_id,fc.actual_pieces,fc.consumed_quantity,
  case when fc.actual_pieces>0 then fc.consumed_quantity/fc.actual_pieces else 0 end as consumption_per_piece,
  case when fc.actual_pieces>0 then fc.fabric_cost/fc.actual_pieces else 0 end as fabric_cost_per_piece,
  coalesce(ac.accessory_cost_per_piece,0) as accessory_cost_per_piece,
  coalesce(vc.variable_cost_per_piece,0) as variable_cost_per_piece,
  (
    case when fc.actual_pieces>0 then fc.fabric_cost/fc.actual_pieces else 0 end
    + coalesce(ac.accessory_cost_per_piece,0)
    + coalesce(vc.variable_cost_per_piece,0)
  ) as current_cost_per_piece
from fabric_cost fc
left join accessory_cost ac on ac.factory_id=fc.factory_id and ac.model_id=fc.model_id and ac.cutting_operation_id=fc.cutting_operation_id
left join variable_costs vc on vc.factory_id=fc.factory_id and vc.model_id=fc.model_id;

grant select on public.v_model_material_costs to authenticated;
grant select on public.v_model_current_costs to authenticated;
revoke select on public.v_model_material_costs from anon;
revoke select on public.v_model_current_costs from anon;
