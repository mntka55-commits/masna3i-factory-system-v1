-- Match the corrected supplier-return RPC currently deployed.
create or replace function public.post_supplier_return(
  p_return_number text,
  p_supplier_id uuid,
  p_return_date date,
  p_lines jsonb,
  p_notes text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_return_id uuid;
  v_factory_id uuid;
  v_supplier_factory_id uuid;
  v_item jsonb;
  v_purchase_line_id uuid;
  v_qty numeric(14,3);
  v_approved_price numeric(14,4);
  v_supplier_id uuid;
  v_material_id uuid;
  v_purchase_qty numeric(14,3);
  v_original_price numeric(14,4);
  v_existing_returned numeric(14,3);
  v_available numeric(14,3);
  v_remaining numeric(14,3);
  v_take numeric(14,3);
  v_cost_total numeric(18,6);
  v_weighted_unit_cost numeric(14,4);
  v_line_id uuid;
  v_total numeric(16,2) := 0;
  v_layer record;
begin
  if nullif(trim(coalesce(p_return_number,'')),'') is null then raise exception 'return number is required'; end if;
  if p_supplier_id is null then raise exception 'supplier is required'; end if;
  if p_return_date is null then raise exception 'return date is required'; end if;
  if p_lines is null or jsonb_array_length(p_lines)=0 then raise exception 'supplier return must contain at least one line'; end if;

  select s.factory_id into v_supplier_factory_id from public.suppliers s where s.id=p_supplier_id for update;
  if not found then raise exception 'supplier not found'; end if;
  if exists(select 1 from public.supplier_returns where return_number=trim(p_return_number)) then raise exception 'supplier return number already exists'; end if;

  insert into public.supplier_returns(return_number,supplier_id,return_date,approved_total,notes,factory_id)
  values(trim(p_return_number),p_supplier_id,p_return_date,0,p_notes,v_supplier_factory_id)
  returning id into v_return_id;

  for v_item in select value from jsonb_array_elements(p_lines)
  loop
    v_purchase_line_id := nullif(trim(v_item->>'purchase_line_id'),'')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    if v_purchase_line_id is null or v_qty is null or v_qty <= 0 then raise exception 'each supplier return line needs purchase_line_id and positive quantity'; end if;

    select pi.supplier_id,pi.factory_id,pl.material_id,pl.quantity,pl.unit_price
      into v_supplier_id,v_factory_id,v_material_id,v_purchase_qty,v_original_price
    from public.purchase_lines pl join public.purchase_invoices pi on pi.id=pl.purchase_invoice_id
    where pl.id=v_purchase_line_id for update of pl,pi;

    if not found then raise exception 'purchase line not found'; end if;
    if v_supplier_id<>p_supplier_id then raise exception 'purchase line belongs to another supplier'; end if;
    if v_factory_id is distinct from v_supplier_factory_id then raise exception 'purchase line belongs to another factory'; end if;

    select coalesce(sum(srl.quantity),0) into v_existing_returned
    from public.supplier_return_lines srl join public.supplier_returns sr on sr.id=srl.supplier_return_id
    where srl.purchase_line_id=v_purchase_line_id and sr.supplier_id=p_supplier_id;

    if v_qty>(v_purchase_qty-v_existing_returned) then raise exception 'return quantity exceeds remaining quantity from purchase invoice line'; end if;

    select coalesce(sum(il.remaining_quantity),0) into v_available
    from public.inventory_layers il
    where il.source_purchase_line_id=v_purchase_line_id and il.factory_id=v_factory_id;

    if v_qty>v_available then raise exception 'return quantity exceeds currently available inventory from this purchase line'; end if;

    v_approved_price := coalesce((v_item->>'approved_unit_price')::numeric,v_original_price);
    if v_approved_price<0 then raise exception 'approved return price cannot be negative'; end if;

    insert into public.supplier_return_lines(supplier_return_id,purchase_line_id,quantity,original_unit_price,approved_unit_price,factory_id)
    values(v_return_id,v_purchase_line_id,v_qty,v_original_price,v_approved_price,v_factory_id)
    returning id into v_line_id;

    v_remaining:=v_qty; v_cost_total:=0;
    for v_layer in
      select id,remaining_quantity,unit_cost from public.inventory_layers
      where source_purchase_line_id=v_purchase_line_id and factory_id=v_factory_id and remaining_quantity>0
      order by received_at,id for update
    loop
      exit when v_remaining<=0;
      v_take:=least(v_remaining,v_layer.remaining_quantity);
      update public.inventory_layers set remaining_quantity=remaining_quantity-v_take where id=v_layer.id;
      v_cost_total:=v_cost_total+(v_take*v_layer.unit_cost);
      v_remaining:=v_remaining-v_take;
    end loop;

    if v_remaining>0 then raise exception 'inventory changed while processing supplier return'; end if;

    v_weighted_unit_cost:=case when v_qty=0 then 0 else v_cost_total/v_qty end;

    insert into public.inventory_movements(
      movement_kind,material_id,quantity,unit_cost,purchase_line_id,reference,reason,supplier_return_line_id,factory_id
    ) values(
      'supplier_return_out',v_material_id,v_qty,v_weighted_unit_cost,v_purchase_line_id,trim(p_return_number),'مرتجع مورد',v_line_id,v_factory_id
    );

    v_total:=v_total+round(v_qty*v_approved_price,2);
  end loop;

  update public.supplier_returns set approved_total=v_total where id=v_return_id;
  return v_return_id;
end;
$function$;

revoke execute on function public.post_supplier_return(text,uuid,date,jsonb,text) from public,anon;
grant execute on function public.post_supplier_return(text,uuid,date,jsonb,text) to authenticated;