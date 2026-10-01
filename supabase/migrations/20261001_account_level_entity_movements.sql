-- Account-level financial movements: invoices remain documents, balances follow actual entity movements.

alter table public.collections
  add column if not exists customer_id uuid;

create index if not exists idx_collections_factory_customer_date
  on public.collections(factory_id, customer_id, collection_date);

create index if not exists idx_supplier_payments_factory_supplier_date
  on public.supplier_payments(factory_id, supplier_id, payment_date);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'collections_customer_id_fkey'
      and conrelid = 'public.collections'::regclass
  ) then
    alter table public.collections
      add constraint collections_customer_id_fkey
      foreign key (customer_id) references public.customers(id)
      on delete restrict;
  end if;
end $$;

create or replace view public.v_customer_account_balances as
with opening as (
  select ob.customer_id,
         coalesce(sum(ob.amount), 0)::numeric(16,2) as opening_receivable
  from public.opening_balances ob
  where ob.kind = 'customer_receivable'::public.opening_balance_kind
    and ob.customer_id is not null
  group by ob.customer_id
),
sales as (
  select vsr.customer_id,
         coalesce(sum(vsr.sales_amount), 0)::numeric(16,2) as billed_sales
  from public.v_sales_report vsr
  where vsr.customer_id is not null
  group by vsr.customer_id
),
direct_collections as (
  select c.customer_id,
         coalesce(sum(c.amount), 0)::numeric(16,2) as collected
  from public.collections c
  where c.customer_id is not null
  group by c.customer_id
),
legacy_collections as (
  select s.customer_id,
         coalesce(sum(ca.amount), 0)::numeric(16,2) as collected
  from public.collection_allocations ca
  join public.collections c on c.id = ca.collection_id
  join public.invoices i on i.id = ca.invoice_id
  join public.sales s on s.id = i.sale_id
  where c.customer_id is null
    and s.customer_id is not null
  group by s.customer_id
),
returns as (
  select s.customer_id,
         coalesce(sum(rl.financial_credit_amount), 0)::numeric(16,2) as return_credits
  from public.return_lines rl
  join public.returns r on r.id = rl.return_id
  join public.sales s on s.id = r.sale_id
  where s.customer_id is not null
  group by s.customer_id
)
select
  c.id as customer_id,
  c.code,
  c.name,
  coalesce(o.opening_receivable,0)::numeric(16,2) as opening_receivable,
  coalesce(s.billed_sales,0)::numeric(16,2) as billed_sales,
  (coalesce(dc.collected,0) + coalesce(lc.collected,0))::numeric(16,2) as collected,
  coalesce(r.return_credits,0)::numeric(16,2) as return_credits,
  (
    coalesce(o.opening_receivable,0)
    + coalesce(s.billed_sales,0)
    - coalesce(dc.collected,0)
    - coalesce(lc.collected,0)
    - coalesce(r.return_credits,0)
  )::numeric(16,2) as net_balance,
  greatest(
    coalesce(o.opening_receivable,0)
    + coalesce(s.billed_sales,0)
    - coalesce(dc.collected,0)
    - coalesce(lc.collected,0)
    - coalesce(r.return_credits,0),
    0
  )::numeric(16,2) as amount_due,
  greatest(
    -(
      coalesce(o.opening_receivable,0)
      + coalesce(s.billed_sales,0)
      - coalesce(dc.collected,0)
      - coalesce(lc.collected,0)
      - coalesce(r.return_credits,0)
    ),
    0
  )::numeric(16,2) as customer_credit
from public.customers c
left join opening o on o.customer_id = c.id
left join sales s on s.customer_id = c.id
left join direct_collections dc on dc.customer_id = c.id
left join legacy_collections lc on lc.customer_id = c.id
left join returns r on r.customer_id = c.id;

create or replace view public.v_customer_account_statement as
with events as (
  select
    ob.customer_id,
    ob.effective_date as event_date,
    10 as event_rank,
    ob.created_at as source_created_at,
    ob.id as source_id,
    'opening_balance'::text as event_type,
    'رصيد افتتاحي'::text as event_label,
    'OPENING'::text as reference,
    ob.notes,
    ob.amount as debit_amount,
    0::numeric(16,2) as credit_amount
  from public.opening_balances ob
  where ob.kind = 'customer_receivable'::public.opening_balance_kind
    and ob.customer_id is not null

  union all

  select
    s.customer_id,
    i.invoice_date,
    20,
    i.created_at,
    i.id,
    case
      when s.sale_kind = 'return_redelivery' then 'return_redelivery'
      when s.sale_kind = 'clearance_sale' then 'clearance_sale'
      else 'sale'
    end,
    case
      when s.sale_kind = 'return_redelivery' then 'إعادة تسليم مرتجع'
      when s.sale_kind = 'clearance_sale' then 'بيع تصفية'
      else 'بيع'
    end,
    i.invoice_number,
    s.notes,
    coalesce(sum(il.line_total),0)::numeric(16,2),
    0::numeric(16,2)
  from public.invoices i
  join public.sales s on s.id = i.sale_id
  left join public.invoice_lines il on il.invoice_id = i.id
  where s.customer_id is not null
  group by s.customer_id, i.invoice_date, i.created_at, i.id,
           s.sale_kind, i.invoice_number, s.notes

  union all

  select
    c.customer_id,
    c.collection_date,
    30,
    c.created_at,
    c.id,
    'collection'::text,
    'تحصيل'::text,
    coalesce(nullif(trim(c.reference), ''), c.id::text),
    c.notes,
    0::numeric(16,2),
    c.amount::numeric(16,2)
  from public.collections c
  where c.customer_id is not null

  union all

  select
    s.customer_id,
    c.collection_date,
    31,
    c.created_at,
    ca.id,
    'collection'::text,
    'تحصيل'::text,
    coalesce(i.invoice_number, c.id::text),
    coalesce(nullif(trim(c.reference), ''), c.notes),
    0::numeric(16,2),
    ca.amount::numeric(16,2)
  from public.collection_allocations ca
  join public.collections c on c.id = ca.collection_id
  join public.invoices i on i.id = ca.invoice_id
  join public.sales s on s.id = i.sale_id
  where c.customer_id is null
    and s.customer_id is not null

  union all

  select
    s.customer_id,
    r.return_date,
    40,
    r.created_at,
    rl.id,
    'return'::text,
    'مرتجع عميل'::text,
    r.return_number,
    rl.notes,
    0::numeric(16,2),
    coalesce(rl.financial_credit_amount,0)::numeric(16,2)
  from public.return_lines rl
  join public.returns r on r.id = rl.return_id
  join public.sales s on s.id = r.sale_id
  where s.customer_id is not null
)
select
  customer_id,
  event_date,
  event_rank,
  source_created_at,
  source_id,
  event_type,
  event_label,
  reference,
  notes,
  debit_amount,
  credit_amount,
  sum(debit_amount - credit_amount) over (
    partition by customer_id
    order by event_date, event_rank, source_created_at, source_id
    rows between unbounded preceding and current row
  )::numeric(16,2) as running_balance
from events;

create or replace view public.v_supplier_account_statement as
with events as (
  select
    ob.supplier_id,
    ob.effective_date as event_date,
    10 as event_rank,
    ob.created_at as source_created_at,
    ob.id as source_id,
    'opening_balance'::text as event_type,
    'رصيد افتتاحي'::text as event_label,
    'OPENING'::text as reference,
    ob.notes,
    ob.amount as debit_amount,
    0::numeric(16,2) as credit_amount
  from public.opening_balances ob
  where ob.kind = 'supplier_payable'::public.opening_balance_kind
    and ob.supplier_id is not null

  union all

  select
    pi.supplier_id,
    pi.purchase_date,
    20,
    pi.created_at,
    pi.id,
    'purchase'::text,
    'شراء'::text,
    pi.invoice_number,
    pi.notes,
    coalesce(sum(pl.line_total),0)::numeric(16,2),
    0::numeric(16,2)
  from public.purchase_invoices pi
  left join public.purchase_lines pl on pl.purchase_invoice_id = pi.id
  group by pi.supplier_id, pi.purchase_date, pi.created_at, pi.id,
           pi.invoice_number, pi.notes

  union all

  select
    sp.supplier_id,
    sp.payment_date,
    30,
    sp.created_at,
    sp.id,
    'supplier_payment'::text,
    'دفعة للمورد'::text,
    coalesce(nullif(trim(sp.reference), ''), sp.id::text),
    sp.notes,
    0::numeric(16,2),
    sp.amount::numeric(16,2)
  from public.supplier_payments sp

  union all

  select
    sr.supplier_id,
    sr.return_date,
    40,
    sr.created_at,
    sr.id,
    'supplier_return'::text,
    'مرتجع شراء'::text,
    sr.return_number,
    sr.notes,
    0::numeric(16,2),
    sr.approved_total::numeric(16,2)
  from public.supplier_returns sr
)
select
  supplier_id,
  event_date,
  event_rank,
  source_created_at,
  source_id,
  event_type,
  event_label,
  reference,
  notes,
  debit_amount,
  credit_amount,
  sum(debit_amount - credit_amount) over (
    partition by supplier_id
    order by event_date, event_rank, source_created_at, source_id
    rows between unbounded preceding and current row
  )::numeric(16,2) as running_balance
from events;

create or replace function public.post_supplier_payment_account(
  p_supplier_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_account_id uuid,
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_factory_id uuid;
  v_payment_id uuid;
  v_balance numeric(16,2);
begin
  v_factory_id := private.current_factory_id();
  if v_factory_id is null then raise exception 'active factory is required'; end if;
  if p_supplier_id is null then raise exception 'supplier is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'payment amount must be greater than zero'; end if;
  if p_payment_date is null then raise exception 'payment date is required'; end if;
  if p_account_id is null then raise exception 'money account is required'; end if;

  perform 1 from public.suppliers
  where id = p_supplier_id and factory_id = v_factory_id
  for update;
  if not found then raise exception 'supplier not found in current factory'; end if;

  if not exists (
    select 1 from public.money_accounts
    where id = p_account_id and factory_id = v_factory_id and active = true
  ) then
    raise exception 'active cash/bank account is required';
  end if;

  select coalesce(payable_balance,0)
    into v_balance
  from public.v_supplier_account_balances
  where supplier_id = p_supplier_id;
  v_balance := coalesce(v_balance,0);

  if p_amount > v_balance then
    raise exception 'payment exceeds supplier account balance; balance is %', v_balance;
  end if;

  insert into public.supplier_payments(
    supplier_id, payment_date, account_id, amount, reference, notes, factory_id
  )
  values(
    p_supplier_id, p_payment_date, p_account_id, round(p_amount,2),
    nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), v_factory_id
  )
  returning id into v_payment_id;

  insert into public.money_movements(
    account_id, direction, amount, source_type, source_id,
    movement_date, reference, notes, factory_id
  )
  values(
    p_account_id, 'out', round(p_amount,2), 'supplier_payment',
    v_payment_id, p_payment_date, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), v_factory_id
  );

  return v_payment_id;
end;
$function$;

create or replace function public.post_customer_collection_account(
  p_customer_id uuid,
  p_amount numeric,
  p_collection_date date,
  p_account_id uuid,
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_factory_id uuid;
  v_collection_id uuid;
  v_balance numeric(16,2);
begin
  v_factory_id := private.current_factory_id();
  if v_factory_id is null then raise exception 'active factory is required'; end if;
  if p_customer_id is null then raise exception 'customer is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'collection amount must be greater than zero'; end if;
  if p_collection_date is null then raise exception 'collection date is required'; end if;
  if p_account_id is null then raise exception 'cash/bank account is required'; end if;

  perform 1 from public.customers
  where id = p_customer_id and factory_id = v_factory_id
  for update;
  if not found then raise exception 'customer not found in current factory'; end if;

  if not exists (
    select 1 from public.money_accounts
    where id = p_account_id and factory_id = v_factory_id and active = true
  ) then
    raise exception 'active cash/bank account is required';
  end if;

  select coalesce(amount_due,0)
    into v_balance
  from public.v_customer_account_balances
  where customer_id = p_customer_id;
  v_balance := coalesce(v_balance,0);

  if p_amount > v_balance then
    raise exception 'collection exceeds customer account balance; balance is %', v_balance;
  end if;

  insert into public.collections(
    customer_id, collection_date, account_id, amount, reference, notes, factory_id
  )
  values(
    p_customer_id, p_collection_date, p_account_id, round(p_amount,2),
    nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), v_factory_id
  )
  returning id into v_collection_id;

  insert into public.money_movements(
    account_id, direction, amount, source_type, source_id,
    movement_date, reference, notes, factory_id
  )
  values(
    p_account_id, 'in', round(p_amount,2), 'collection',
    v_collection_id, p_collection_date, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), v_factory_id
  );

  return v_collection_id;
end;
$function$;
