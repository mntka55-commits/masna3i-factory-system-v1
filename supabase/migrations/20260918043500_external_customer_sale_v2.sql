
alter table public.sales
  add column if not exists external_customer_name text;

create or replace function public.post_sale_and_invoice_v2(
  p_invoice_number text,
  p_sale_date date,
  p_items jsonb,
  p_customer_id uuid default null,
  p_external_customer_name text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_sale_id uuid;
  v_external_name text;
begin
  v_external_name := nullif(trim(p_external_customer_name), '');

  if p_customer_id is not null and v_external_name is not null then
    raise exception 'choose a registered customer or an external customer, not both';
  end if;

  if p_customer_id is null and v_external_name is null then
    -- anonymous/external sale is still allowed without a saved account name
    null;
  end if;

  v_result := public.post_sale_and_invoice(
    p_invoice_number,
    p_sale_date,
    p_items,
    p_customer_id,
    p_notes
  );

  v_sale_id := (v_result->>'sale_id')::uuid;

  if v_external_name is not null then
    update public.sales
    set external_customer_name = v_external_name
    where id = v_sale_id;
  end if;

  return v_result;
end;
$function$;

create or replace function public.post_clearance_sale_and_invoice_v2(
  p_invoice_number text,
  p_sale_date date,
  p_items jsonb,
  p_customer_id uuid default null,
  p_external_customer_name text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_sale_id uuid;
  v_external_name text;
begin
  v_external_name := nullif(trim(p_external_customer_name), '');

  if p_customer_id is not null and v_external_name is not null then
    raise exception 'choose a registered customer or an external customer, not both';
  end if;

  v_result := public.post_clearance_sale_and_invoice(
    p_invoice_number,
    p_sale_date,
    p_items,
    p_customer_id,
    p_notes
  );

  v_sale_id := (v_result->>'sale_id')::uuid;

  if v_external_name is not null then
    update public.sales
    set external_customer_name = v_external_name
    where id = v_sale_id;
  end if;

  return v_result;
end;
$function$;

grant execute on function public.post_sale_and_invoice_v2(text,date,jsonb,uuid,text,text) to authenticated;
grant execute on function public.post_clearance_sale_and_invoice_v2(text,date,jsonb,uuid,text,text) to authenticated;
revoke execute on function public.post_sale_and_invoice_v2(text,date,jsonb,uuid,text,text) from anon;
revoke execute on function public.post_clearance_sale_and_invoice_v2(text,date,jsonb,uuid,text,text) from anon;
