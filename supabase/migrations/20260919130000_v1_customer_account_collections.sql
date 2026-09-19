create or replace function public.post_customer_collection(
  p_customer_id uuid,
  p_amount numeric,
  p_collection_date date,
  p_account_id uuid,
  p_allocations jsonb,
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_factory_id uuid;
  v_collection_id uuid;
  v_item jsonb;
  v_invoice_id uuid;
  v_alloc_amount numeric(16,2);
  v_alloc_total numeric(16,2) := 0;
  v_outstanding numeric(16,2);
  v_invoice_customer uuid;
begin
  v_factory_id := private.current_factory_id();
  if v_factory_id is null then
    raise exception 'active factory is required';
  end if;

  if p_customer_id is null then
    raise exception 'customer is required';
  end if;

  if not exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.factory_id = v_factory_id
  ) then
    raise exception 'customer not found in current factory';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'collection amount must be greater than zero';
  end if;

  if p_collection_date is null then
    raise exception 'collection date is required';
  end if;

  if p_account_id is null then
    raise exception 'cash/bank account is required';
  end if;

  if not exists (
    select 1
    from public.money_accounts ma
    where ma.id = p_account_id
      and ma.factory_id = v_factory_id
      and ma.active = true
  ) then
    raise exception 'active cash/bank account is required';
  end if;

  if p_allocations is null
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'collection must contain at least one invoice allocation';
  end if;

  for v_item in select value from jsonb_array_elements(p_allocations)
  loop
    begin
      v_invoice_id := nullif(trim(v_item->>'invoice_id'), '')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'invalid invoice id in allocation';
    end;

    v_alloc_amount := (v_item->>'amount')::numeric;

    if v_invoice_id is null or v_alloc_amount is null or v_alloc_amount <= 0 then
      raise exception 'each allocation needs invoice_id and positive amount';
    end if;

    if (
      select count(*)
      from jsonb_array_elements(p_allocations) x
      where nullif(trim(x->>'invoice_id'), '')::uuid = v_invoice_id
    ) > 1 then
      raise exception 'duplicate invoice allocation is not allowed';
    end if;

    select i.id, s.customer_id
      into v_invoice_id, v_invoice_customer
    from public.invoices i
    join public.sales s on s.id = i.sale_id
    where i.id = v_invoice_id
      and i.factory_id = v_factory_id
      and s.factory_id = v_factory_id
    for update;

    if not found then
      raise exception 'invoice not found in current factory';
    end if;

    if v_invoice_customer <> p_customer_id then
      raise exception 'invoice belongs to another customer';
    end if;

    select vb.outstanding_total
      into v_outstanding
    from public.v_invoice_balances vb
    where vb.invoice_id = v_invoice_id;

    v_outstanding := coalesce(v_outstanding, 0);

    if v_alloc_amount > v_outstanding then
      raise exception 'collection exceeds invoice outstanding amount';
    end if;

    v_alloc_total := v_alloc_total + v_alloc_amount;
  end loop;

  if round(v_alloc_total, 2) <> round(p_amount, 2) then
    raise exception 'allocation total must equal collection amount';
  end if;

  insert into public.collections(
    collection_date,
    account_id,
    amount,
    reference,
    notes,
    factory_id
  )
  values(
    p_collection_date,
    p_account_id,
    p_amount,
    p_reference,
    p_notes,
    v_factory_id
  )
  returning id into v_collection_id;

  for v_item in select value from jsonb_array_elements(p_allocations)
  loop
    insert into public.collection_allocations(
      collection_id,
      invoice_id,
      amount,
      factory_id
    )
    values(
      v_collection_id,
      nullif(trim(v_item->>'invoice_id'), '')::uuid,
      (v_item->>'amount')::numeric,
      v_factory_id
    );
  end loop;

  insert into public.money_movements(
    account_id,
    direction,
    amount,
    source_type,
    source_id,
    movement_date,
    reference,
    notes,
    factory_id
  )
  values(
    p_account_id,
    'in',
    p_amount,
    'collection',
    v_collection_id,
    p_collection_date,
    p_reference,
    p_notes,
    v_factory_id
  );

  return v_collection_id;
end;
$function$;

revoke all on function public.post_customer_collection(uuid,numeric,date,uuid,jsonb,text,text) from public;
revoke all on function public.post_customer_collection(uuid,numeric,date,uuid,jsonb,text,text) from anon;
grant execute on function public.post_customer_collection(uuid,numeric,date,uuid,jsonb,text,text) to authenticated;
