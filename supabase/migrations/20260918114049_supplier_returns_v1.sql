-- Supplier purchase returns V1.
-- Default approved return price = original purchase-line price.
-- Owner may override approved_unit_price.
create table if not exists public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,
  supplier_id uuid not null references public.suppliers(id),
  return_date date not null,
  approved_total numeric(16,2) not null default 0 check (approved_total >= 0),
  notes text,
  created_at timestamptz not null default now(),
  factory_id uuid not null references public.factories(id)
);

create table if not exists public.supplier_return_lines (
  id uuid primary key default gen_random_uuid(),
  supplier_return_id uuid not null references public.supplier_returns(id) on delete restrict,
  purchase_line_id uuid not null references public.purchase_lines(id),
  quantity numeric(14,3) not null check (quantity > 0),
  original_unit_price numeric(14,4) not null check (original_unit_price >= 0),
  approved_unit_price numeric(14,4) not null check (approved_unit_price >= 0),
  line_total numeric(16,2) generated always as (quantity * approved_unit_price) stored,
  created_at timestamptz not null default now(),
  factory_id uuid not null references public.factories(id),
  unique (supplier_return_id, purchase_line_id)
);

alter table public.inventory_movements
  add column if not exists supplier_return_line_id uuid;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_supplier_return_line_id_fkey;

alter table public.inventory_movements
  add constraint inventory_movements_supplier_return_line_id_fkey
  foreign key (supplier_return_line_id) references public.supplier_return_lines(id);

create index if not exists idx_supplier_returns_supplier_date
  on public.supplier_returns(supplier_id, return_date);
create index if not exists idx_supplier_return_lines_purchase_line
  on public.supplier_return_lines(purchase_line_id);

alter table public.supplier_returns enable row level security;
alter table public.supplier_return_lines enable row level security;

drop policy if exists supplier_returns_select on public.supplier_returns;
create policy supplier_returns_select on public.supplier_returns
for select to authenticated
using (factory_id = private.current_factory_id());

drop policy if exists supplier_returns_insert on public.supplier_returns;
create policy supplier_returns_insert on public.supplier_returns
for insert to authenticated
with check (factory_id = private.current_factory_id());

drop policy if exists supplier_returns_update on public.supplier_returns;
create policy supplier_returns_update on public.supplier_returns
for update to authenticated
using (factory_id = private.current_factory_id())
with check (factory_id = private.current_factory_id());

drop policy if exists supplier_returns_delete on public.supplier_returns;
create policy supplier_returns_delete on public.supplier_returns
for delete to authenticated
using (factory_id = private.current_factory_id());

drop policy if exists supplier_return_lines_select on public.supplier_return_lines;
create policy supplier_return_lines_select on public.supplier_return_lines
for select to authenticated
using (factory_id = private.current_factory_id());

drop policy if exists supplier_return_lines_insert on public.supplier_return_lines;
create policy supplier_return_lines_insert on public.supplier_return_lines
for insert to authenticated
with check (factory_id = private.current_factory_id());

drop policy if exists supplier_return_lines_update on public.supplier_return_lines;
create policy supplier_return_lines_update on public.supplier_return_lines
for update to authenticated
using (factory_id = private.current_factory_id())
with check (factory_id = private.current_factory_id());

drop policy if exists supplier_return_lines_delete on public.supplier_return_lines;
create policy supplier_return_lines_delete on public.supplier_return_lines
for delete to authenticated
using (factory_id = private.current_factory_id());

grant select on public.supplier_returns, public.supplier_return_lines to authenticated;
revoke all on public.supplier_returns, public.supplier_return_lines from anon;

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

  select s.factory_id into v_supplier_factory_id
  from public.suppliers s
  where s.id = p_supplier_id
  for update;
  if not found then raise exception 'supplier not found'; end if;

  if exists (select 1 from public.supplier_returns where return_number = trim(p_return_number)) then
    raise exception 'supplier return number already exists';
  end if;

  insert into public.supplier_returns(
    return_number, supplier_id, return_date, approved_total, notes, factory_id
  ) values (
    trim(p_return_number), p_supplier_id, p_return_date, 0, p_notes, v_supplier_factory_id
  )
  returning id into v_return_id;

  for v_item in select value from jsonb_array_elements(p_lines)
  loop
    v_purchase_line_id := nullif(trim(v_item->>'purchase_line_id'),'')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    if v_purchase_line_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'each supplier return line needs purchase_line_id and positive quantity';
    end if;

    select pi.supplier_id, pi.factory_id, pl.material_id, pl.quantity, pl.unit_price
      into v_supplier_id, v_factory_id, v_material_id, v_purchase_qty, v_original_price
    from public.purchase_lines pl
    join public.purchase_invoices pi on pi.id = pl.purchase_invoice_id
    where pl.id = v_purchase_line_id
    for update of pl, pi;

    if not found then raise exception 'purchase line not found'; end if;
    if v_supplier_id <> p_supplier_id then raise exception 'purchase line belongs to another supplier'; end if;
    if v_factory_id is distinct from v_supplier_factory_id then raise exception 'purchase line belongs to another factory'; end if;

    select coalesce(sum(srl.quantity),0) into v_existing_returned
    from public.supplier_return_lines srl
    join public.supplier_returns sr on sr.id = srl.supplier_return_id
    where srl.purchase_line_id = v_purchase_line_id
      and sr.supplier_id = p_supplier_id;

    if v_qty > (v_purchase_qty - v_existing_returned) then
      raise exception 'return quantity exceeds remaining quantity from purchase invoice line';
    end if;

    select coalesce(sum(il.remaining_quantity),0) into v_available
    from public.inventory_layers il
    where il.source_purchase_line_id = v_purchase_line_id
      and il.factory_id = v_factory_id;

    if v_qty > v_available then
      raise exception 'return quantity exceeds currently available inventory from this purchase line';
    end if;

    v_approved_price := coalesce((v_item->>'approved_unit_price')::numeric, v_original_price);
    if v_approved_price < 0 then raise exception 'approved return price cannot be negative'; end if;

    insert into public.supplier_return_lines(
      supplier_return_id, purchase_line_id, quantity,
      original_unit_price, approved_unit_price, factory_id
    ) values (
      v_return_id, v_purchase_line_id, v_qty,
      v_original_price, v_approved_price, v_factory_id
    )
    returning id into v_line_id;

    v_remaining := v_qty;
    v_cost_total := 0;

    for v_layer in
      select id, remaining_quantity, unit_cost
      from public.inventory_layers
      where source_purchase_line_id = v_purchase_line_id
        and factory_id = v_factory_id
        and remaining_quantity > 0
      order by received_at, id
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_layer.remaining_quantity);
      update public.inventory_layers
      set remaining_quantity = remaining_quantity - v_take
      where id = v_layer.id;
      v_cost_total := v_cost_total + (v_take * v_layer.unit_cost);
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then raise exception 'inventory changed while processing supplier return'; end if;

    v_weighted_unit_cost := case when v_qty = 0 then 0 else v_cost_total / v_qty end;

    insert into public.inventory_movements(
      movement_kind, material_id, quantity, unit_cost,
      purchase_line_id, reference, reason, supplier_return_line_id, factory_id
    ) values (
      'supplier_return_out', v_material_id, v_qty, v_weighted_unit_cost,
      v_purchase_line_id, trim(p_return_number), 'مرتجع مورد', v_line_id, v_factory_id
    );

    v_total := v_total + round(v_qty * v_approved_price, 2);
  end loop;

  update public.supplier_returns set approved_total = v_total where id = v_return_id;
  return v_return_id;
end;
$function$;

revoke execute on function public.post_supplier_return(text, uuid, date, jsonb, text) from public, anon;
grant execute on function public.post_supplier_return(text, uuid, date, jsonb, text) to authenticated;

create or replace view public.v_purchase_balances as
with returned as (
  select srl.purchase_line_id,
         sum(srl.line_total)::numeric(16,2) as returned_line_total
  from public.supplier_return_lines srl
  group by srl.purchase_line_id
),
returns_by_invoice as (
  select pl.purchase_invoice_id,
         sum(coalesce(r.returned_line_total,0))::numeric(16,2) as returned_amount
  from public.purchase_lines pl
  left join returned r on r.purchase_line_id = pl.id
  group by pl.purchase_invoice_id
)
select pt.purchase_invoice_id,
       pt.supplier_id,
       pt.total_amount,
       coalesce(sum(spa.amount),0)::numeric(16,2) as paid_amount,
       (pt.total_amount - coalesce(sum(spa.amount),0) - coalesce(rbi.returned_amount,0))::numeric(16,2) as remaining_amount,
       coalesce(rbi.returned_amount,0)::numeric(16,2) as returned_amount
from public.v_purchase_totals pt
left join public.supplier_payment_allocations spa on spa.purchase_invoice_id = pt.purchase_invoice_id
left join returns_by_invoice rbi on rbi.purchase_invoice_id = pt.purchase_invoice_id
group by pt.purchase_invoice_id, pt.supplier_id, pt.total_amount, rbi.returned_amount;

create or replace view public.v_supplier_account_balances as
with opening as (
  select supplier_id, coalesce(sum(amount),0)::numeric(16,2) as opening_payable
  from public.opening_balances
  where kind='supplier_payable'
  group by supplier_id
), purchases as (
  select supplier_id, coalesce(sum(total_amount),0)::numeric(16,2) as purchases
  from public.v_purchase_totals
  group by supplier_id
), payments as (
  select supplier_id, coalesce(sum(amount),0)::numeric(16,2) as payments
  from public.supplier_payments
  group by supplier_id
), returns as (
  select supplier_id, coalesce(sum(approved_total),0)::numeric(16,2) as returns_total
  from public.supplier_returns
  group by supplier_id
)
select s.id as supplier_id,
       s.name,
       coalesce(o.opening_payable,0)::numeric(16,2) as opening_payable,
       coalesce(p.purchases,0)::numeric(16,2) as purchases,
       coalesce(pay.payments,0)::numeric(16,2) as payments,
       (coalesce(o.opening_payable,0) + coalesce(p.purchases,0) - coalesce(pay.payments,0) - coalesce(r.returns_total,0))::numeric(16,2) as payable_balance,
       coalesce(r.returns_total,0)::numeric(16,2) as returns_total
from public.suppliers s
left join opening o on o.supplier_id=s.id
left join purchases p on p.supplier_id=s.id
left join payments pay on pay.supplier_id=p.supplier_id
left join returns r on r.supplier_id=s.id;

create or replace view public.v_supplier_returns_report as
select sr.id,
       sr.return_number,
       sr.supplier_id,
       s.name as supplier_name,
       sr.return_date,
       sr.approved_total,
       sr.notes,
       count(srl.id)::int as line_count
from public.supplier_returns sr
join public.suppliers s on s.id=sr.supplier_id
left join public.supplier_return_lines srl on srl.supplier_return_id=sr.id
group by sr.id, sr.return_number, sr.supplier_id, s.name, sr.return_date, sr.approved_total, sr.notes;

grant select on public.v_purchase_balances, public.v_supplier_account_balances, public.v_supplier_returns_report to authenticated;
revoke all on public.v_purchase_balances, public.v_supplier_account_balances, public.v_supplier_returns_report from anon;