create table if not exists public.return_damage_dispositions (
  id uuid primary key default gen_random_uuid(),
  return_damage_lot_id uuid not null references public.return_damage_lots(id),
  return_line_id uuid not null references public.return_lines(id),
  disposition text not null check (disposition in ('repair','discounted_sale','scrap')),
  quantity integer not null check (quantity > 0),
  effective_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  factory_id uuid not null references public.factories(id)
);

create index if not exists idx_return_damage_dispositions_line
  on public.return_damage_dispositions(return_line_id,effective_date);
create index if not exists idx_return_damage_dispositions_lot
  on public.return_damage_dispositions(return_damage_lot_id,effective_date);

alter table public.return_damage_dispositions enable row level security;

drop policy if exists return_damage_dispositions_select on public.return_damage_dispositions;
create policy return_damage_dispositions_select on public.return_damage_dispositions
for select to authenticated
using (factory_id = private.current_factory_id());

drop policy if exists return_damage_dispositions_insert on public.return_damage_dispositions;
create policy return_damage_dispositions_insert on public.return_damage_dispositions
for insert to authenticated
with check (factory_id = private.current_factory_id());

drop policy if exists return_damage_dispositions_update on public.return_damage_dispositions;
create policy return_damage_dispositions_update on public.return_damage_dispositions
for update to authenticated
using (factory_id = private.current_factory_id())
with check (factory_id = private.current_factory_id());

drop policy if exists return_damage_dispositions_delete on public.return_damage_dispositions;
create policy return_damage_dispositions_delete on public.return_damage_dispositions
for delete to authenticated
using (factory_id = private.current_factory_id());

grant select on public.return_damage_dispositions to authenticated;
revoke all on public.return_damage_dispositions from anon;

create or replace view public.v_return_damage_dispositions
with (security_invoker=true)
as
select
  d.id,
  d.return_damage_lot_id,
  d.return_line_id,
  d.disposition,
  d.quantity,
  d.effective_date,
  d.notes,
  d.created_at,
  d.factory_id
from public.return_damage_dispositions d;

grant select on public.v_return_damage_dispositions to authenticated;
revoke all on public.v_return_damage_dispositions from anon;

create or replace function public.post_return_repair_to_ready(
  p_return_line_id uuid,
  p_pieces integer
) returns uuid
language plpgsql
security invoker
set search_path=public
as $function$
declare
  v_lot record;
  v_ready_id uuid;
begin
  if p_pieces is null or p_pieces <= 0 then
    raise exception 'repair quantity must be greater than zero';
  end if;

  select
    rdl.id,
    rdl.return_line_id,
    rl.outcome,
    rdl.factory_id,
    rdl.model_id,
    rdl.remaining_pieces,
    rdl.unit_cost_snapshot
  into v_lot
  from public.return_damage_lots rdl
  join public.return_lines rl on rl.id=rdl.return_line_id
  where rdl.return_line_id=p_return_line_id
    and rdl.status='damaged'
  for update;

  if not found then raise exception 'damaged return lot not found'; end if;
  if v_lot.outcome <> 'repair' then raise exception 'return line is not marked for repair'; end if;
  if p_pieces > v_lot.remaining_pieces then
    raise exception 'cannot repair % pieces; damaged lot has only % remaining',p_pieces,v_lot.remaining_pieces;
  end if;
  if v_lot.unit_cost_snapshot is null then
    raise exception 'historical cost snapshot is unavailable for this return';
  end if;

  update public.return_damage_lots
  set remaining_pieces=remaining_pieces-p_pieces,
      status=case when remaining_pieces-p_pieces=0 then 'closed' else status end
  where id=v_lot.id;

  insert into public.return_damage_dispositions(
    return_damage_lot_id,return_line_id,disposition,quantity,effective_date,factory_id
  ) values (
    v_lot.id,v_lot.return_line_id,'repair',p_pieces,current_date,v_lot.factory_id
  );

  insert into public.ready_lots(
    source_return_line_id,model_id,original_pieces,remaining_pieces,unit_cost_snapshot,factory_id
  )
  values (
    p_return_line_id,v_lot.model_id,p_pieces,p_pieces,v_lot.unit_cost_snapshot,v_lot.factory_id
  )
  returning id into v_ready_id;

  return v_ready_id;
end;
$function$;

create or replace function public.post_return_damage_to_discounted_sale(
  p_return_line_id uuid,
  p_pieces integer,
  p_notes text default null
) returns uuid
language plpgsql
security invoker
set search_path=public
as $function$
declare
  v_lot record;
  v_ready_id uuid;
begin
  if p_pieces is null or p_pieces <= 0 then
    raise exception 'discounted sale preparation quantity must be greater than zero';
  end if;

  select
    rdl.id,
    rdl.return_line_id,
    rl.outcome,
    rdl.factory_id,
    rdl.model_id,
    rdl.remaining_pieces,
    rdl.unit_cost_snapshot
  into v_lot
  from public.return_damage_lots rdl
  join public.return_lines rl on rl.id=rdl.return_line_id
  where rdl.return_line_id=p_return_line_id
    and rdl.status='damaged'
  for update;

  if not found then raise exception 'damaged return lot not found'; end if;
  if v_lot.outcome <> 'discounted_sale' then raise exception 'return line is not marked for discounted sale'; end if;
  if p_pieces > v_lot.remaining_pieces then
    raise exception 'cannot prepare % pieces; damaged lot has only % remaining',p_pieces,v_lot.remaining_pieces;
  end if;
  if v_lot.unit_cost_snapshot is null then
    raise exception 'historical cost snapshot is unavailable for this return';
  end if;

  update public.return_damage_lots
  set remaining_pieces=remaining_pieces-p_pieces,
      status=case when remaining_pieces-p_pieces=0 then 'closed' else status end
  where id=v_lot.id;

  insert into public.return_damage_dispositions(
    return_damage_lot_id,return_line_id,disposition,quantity,effective_date,notes,factory_id
  ) values (
    v_lot.id,v_lot.return_line_id,'discounted_sale',p_pieces,current_date,p_notes,v_lot.factory_id
  );

  insert into public.ready_lots(
    source_return_line_id,model_id,original_pieces,remaining_pieces,unit_cost_snapshot,factory_id
  )
  values (
    p_return_line_id,v_lot.model_id,p_pieces,p_pieces,v_lot.unit_cost_snapshot,v_lot.factory_id
  )
  returning id into v_ready_id;

  return v_ready_id;
end;
$function$;

create or replace function public.post_return_damage_to_scrap(
  p_return_line_id uuid,
  p_pieces integer,
  p_notes text default null
) returns uuid
language plpgsql
security invoker
set search_path=public
as $function$
declare
  v_lot record;
  v_disposition_id uuid;
begin
  if p_pieces is null or p_pieces <= 0 then
    raise exception 'scrap quantity must be greater than zero';
  end if;

  select
    rdl.id,
    rdl.return_line_id,
    rl.outcome,
    rdl.factory_id,
    rdl.remaining_pieces
  into v_lot
  from public.return_damage_lots rdl
  join public.return_lines rl on rl.id=rdl.return_line_id
  where rdl.return_line_id=p_return_line_id
    and rdl.status='damaged'
  for update;

  if not found then raise exception 'damaged return lot not found'; end if;
  if v_lot.outcome <> 'scrap' then raise exception 'return line is not marked for scrap'; end if;
  if p_pieces > v_lot.remaining_pieces then
    raise exception 'cannot scrap % pieces; damaged lot has only % remaining',p_pieces,v_lot.remaining_pieces;
  end if;

  update public.return_damage_lots
  set remaining_pieces=remaining_pieces-p_pieces,
      status=case when remaining_pieces-p_pieces=0 then 'closed' else status end
  where id=v_lot.id;

  insert into public.return_damage_dispositions(
    return_damage_lot_id,return_line_id,disposition,quantity,effective_date,notes,factory_id
  ) values (
    v_lot.id,v_lot.return_line_id,'scrap',p_pieces,current_date,p_notes,v_lot.factory_id
  )
  returning id into v_disposition_id;

  return v_disposition_id;
end;
$function$;

revoke execute on function public.post_return_repair_to_ready(uuid,integer) from public,anon;
grant execute on function public.post_return_repair_to_ready(uuid,integer) to authenticated;
revoke execute on function public.post_return_damage_to_discounted_sale(uuid,integer,text) from public,anon;
grant execute on function public.post_return_damage_to_discounted_sale(uuid,integer,text) to authenticated;
revoke execute on function public.post_return_damage_to_scrap(uuid,integer,text) from public,anon;
grant execute on function public.post_return_damage_to_scrap(uuid,integer,text) to authenticated;

create or replace function public.post_sale_and_invoice(
  p_invoice_number text,
  p_sale_date date,
  p_items jsonb,
  p_customer_id uuid default null,
  p_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path=public
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
  if nullif(trim(p_invoice_number), '') is null then raise exception 'invoice number is required'; end if;
  if p_sale_date is null then raise exception 'sale date is required'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'sale must contain at least one line'; end if;
  if exists (select 1 from public.invoices where invoice_number = trim(p_invoice_number)) then
    raise exception 'invoice number already exists: %', p_invoice_number;
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'customer not found'; end if;

  insert into public.sales(customer_id, sale_date, sale_kind, notes)
  values (p_customer_id, p_sale_date, 'normal_sale', p_notes)
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_model_id := (v_item->>'model_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_unit_price := coalesce(
      (v_item->>'unit_price')::numeric,
      (select selling_price from public.models where id = v_model_id)
    );

    if v_model_id is null or not exists (select 1 from public.models where id = v_model_id) then
      raise exception 'sale line model not found'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'sale line quantity must be greater than zero'; end if;
    if v_unit_price is null or v_unit_price < 0 then raise exception 'sale line unit price must be zero or greater'; end if;

    select coalesce(sum(remaining_pieces),0)::integer
      into v_remaining
    from public.ready_lots r
    where r.model_id = v_model_id
      and r.remaining_pieces > 0
      and not exists (
        select 1
        from public.return_lines rl
        where rl.id = r.source_return_line_id
          and rl.outcome = 'discounted_sale'
      );

    if v_remaining < v_qty then
      raise exception 'insufficient READY stock for model %, requested %, available %', v_model_id, v_qty, v_remaining;
    end if;

    insert into public.sale_lines(sale_id, model_id, quantity, unit_price, source_return_line_id)
    values (v_sale_id, v_model_id, v_qty, v_unit_price, null)
    returning id into v_line_id;

    v_remaining := v_qty;
    for v_ready in
      select r.id, r.remaining_pieces, r.unit_cost_snapshot
      from public.ready_lots r
      where r.model_id = v_model_id
        and r.remaining_pieces > 0
        and not exists (
          select 1
          from public.return_lines rl
          where rl.id = r.source_return_line_id
            and rl.outcome = 'discounted_sale'
        )
      order by r.created_at, r.id
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_ready.remaining_pieces);
      update public.ready_lots set remaining_pieces=remaining_pieces-v_take where id=v_ready.id;
      insert into public.sale_ready_allocations(sale_line_id,ready_lot_id,quantity,unit_cost_snapshot)
      values(v_line_id,v_ready.id,v_take,v_ready.unit_cost_snapshot);
      v_remaining := v_remaining-v_take;
    end loop;

    if v_remaining > 0 then raise exception 'READY allocation failed for model %',v_model_id; end if;
  end loop;

  insert into public.invoices(sale_id, invoice_number, invoice_date)
  values(v_sale_id,trim(p_invoice_number),p_sale_date)
  returning id into v_invoice_id;

  insert into public.invoice_lines(invoice_id,model_id,quantity,unit_price)
  select v_invoice_id,model_id,quantity,unit_price
  from public.sale_lines
  where sale_id=v_sale_id;

  return jsonb_build_object('sale_id',v_sale_id,'invoice_id',v_invoice_id,'sale_kind','normal_sale');
exception
  when unique_violation then
    raise exception 'invoice number already exists: %',p_invoice_number;
end;
$function$;

revoke execute on function public.post_sale_and_invoice(text,date,jsonb,uuid,text) from public,anon;
grant execute on function public.post_sale_and_invoice(text,date,jsonb,uuid,text) to authenticated;