create or replace function public.post_stocktake(
  p_material_id uuid, p_actual_quantity numeric, p_effective_date date, p_notes text default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_system_quantity numeric; v_difference numeric; v_movement_id uuid; v_remaining numeric; v_take numeric; v_layer record; v_weighted_cost numeric;
begin
  if p_material_id is null then raise exception 'material is required'; end if;
  if p_actual_quantity is null or p_actual_quantity < 0 then raise exception 'actual quantity must be zero or greater'; end if;
  if p_effective_date is null then raise exception 'effective date is required'; end if;
  if not exists(select 1 from public.materials where id=p_material_id) then raise exception 'material not found'; end if;
  select coalesce(sum(case when movement_kind in ('purchase_in','opening_in','adjustment_in') then quantity else -quantity end),0) into v_system_quantity from public.inventory_movements where material_id=p_material_id;
  v_difference:=p_actual_quantity-v_system_quantity;
  if v_difference=0 then return null; end if;
  if v_difference>0 then
    select coalesce(sum(il.remaining_quantity*il.unit_cost)/nullif(sum(il.remaining_quantity),0),0) into v_weighted_cost from public.inventory_layers il where il.material_id=p_material_id and il.remaining_quantity>0;
    insert into public.inventory_movements(movement_kind,material_id,quantity,unit_cost,reference,reason) values('adjustment_in',p_material_id,v_difference,v_weighted_cost,'STOCKTAKE','جرد مخزن') returning id into v_movement_id;
    insert into public.inventory_layers(material_id,source_movement_id,received_at,original_quantity,remaining_quantity,unit_cost) values(p_material_id,v_movement_id,p_effective_date,v_difference,v_difference,v_weighted_cost);
  else
    v_remaining:=abs(v_difference);
    for v_layer in select id,remaining_quantity from public.inventory_layers where material_id=p_material_id and remaining_quantity>0 order by received_at,id for update loop
      exit when v_remaining<=0; v_take:=least(v_remaining,v_layer.remaining_quantity);
      update public.inventory_layers set remaining_quantity=remaining_quantity-v_take where id=v_layer.id; v_remaining:=v_remaining-v_take;
    end loop;
    if v_remaining>0 then raise exception 'stocktake quantity cannot reduce inventory below zero'; end if;
    insert into public.inventory_movements(movement_kind,material_id,quantity,unit_cost,reference,reason) values('adjustment_out',p_material_id,abs(v_difference),null,'STOCKTAKE','جرد مخزن') returning id into v_movement_id;
  end if;
  return v_movement_id;
end; $$;
revoke execute on function public.post_stocktake(uuid,numeric,date,text) from public,anon;
grant execute on function public.post_stocktake(uuid,numeric,date,text) to authenticated;