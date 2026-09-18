create or replace function public.post_clearance_sale_and_invoice(
  p_invoice_number text,
  p_sale_date date,
  p_items jsonb,
  p_customer_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_sale_id uuid;
  v_invoice_id uuid;
  v_line_id uuid;
  v_item jsonb;
  v_model_id uuid;
  v_qty integer;
  v_unit_price numeric(14,2);
  v_remaining integer;
  v_take integer;
  v_ready record;
begin
  if nullif(trim(p_invoice_number),'') is null then
    raise exception 'invoice number is required';
  end if;
  if p_sale_date is null then
    raise exception 'sale date is required';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'clearance sale must contain at least one line';
  end if;
  if exists (select 1 from public.invoices where invoice_number=trim(p_invoice_number)) then
    raise exception 'invoice number already exists: %', p_invoice_number;
  end if;
  if p_customer_id is not null
     and not exists (select 1 from public.customers where id=p_customer_id) then
    raise exception 'customer not found';
  end if;

  insert into public.sales(customer_id, sale_date, sale_kind, notes)
  values(p_customer_id, p_sale_date, 'clearance_sale', p_notes)
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_model_id := (v_item->>'model_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric;

    if v_model_id is null
       or not exists (select 1 from public.models where id=v_model_id) then
      raise exception 'clearance sale line model not found';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'clearance sale line quantity must be greater than zero';
    end if;
    if v_unit_price is null or v_unit_price < 0 then
      raise exception 'clearance sale line unit price is required and must be zero or greater';
    end if;

    select coalesce(sum(remaining_pieces),0)::integer
      into v_remaining
    from public.ready_lots
    where model_id=v_model_id and remaining_pieces > 0;

    if v_remaining < v_qty then
      raise exception 'insufficient READY stock for clearance model %, requested %, available %',
        v_model_id, v_qty, v_remaining;
    end if;

    insert into public.sale_lines(
      sale_id, model_id, quantity, unit_price, source_return_line_id
    )
    values(
      v_sale_id, v_model_id, v_qty, v_unit_price, null
    )
    returning id into v_line_id;

    v_remaining := v_qty;

    for v_ready in
      select id, remaining_pieces, unit_cost_snapshot
      from public.ready_lots
      where model_id=v_model_id and remaining_pieces > 0
      order by created_at, id
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_ready.remaining_pieces);

      update public.ready_lots
      set remaining_pieces = remaining_pieces - v_take
      where id=v_ready.id;

      insert into public.sale_ready_allocations(
        sale_line_id, ready_lot_id, quantity, unit_cost_snapshot
      )
      values(
        v_line_id, v_ready.id, v_take, v_ready.unit_cost_snapshot
      );

      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      raise exception 'READY allocation failed for clearance model %', v_model_id;
    end if;
  end loop;

  insert into public.invoices(sale_id, invoice_number, invoice_date)
  values(v_sale_id, trim(p_invoice_number), p_sale_date)
  returning id into v_invoice_id;

  insert into public.invoice_lines(invoice_id, model_id, quantity, unit_price)
  select v_invoice_id, model_id, quantity, unit_price
  from public.sale_lines
  where sale_id=v_sale_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_id', v_invoice_id,
    'sale_kind', 'clearance_sale'
  );
exception
  when unique_violation then
    raise exception 'invoice number already exists: %', p_invoice_number;
end;
$function$;

revoke execute on function public.post_clearance_sale_and_invoice(text,date,jsonb,uuid,text) from public;
revoke execute on function public.post_clearance_sale_and_invoice(text,date,jsonb,uuid,text) from anon;
grant execute on function public.post_clearance_sale_and_invoice(text,date,jsonb,uuid,text) to authenticated;
