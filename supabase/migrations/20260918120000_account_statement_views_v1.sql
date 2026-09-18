-- Customer / supplier account statement views V1.
-- Read-only derived statements from original operational/financial movements.
create or replace view public.v_customer_account_statement
with (security_invoker = true)
as
with events as (
  select ob.customer_id, ob.effective_date event_date, 10 event_rank, ob.created_at source_created_at,
         ob.id source_id, 'opening_balance' event_type, 'رصيد افتتاحي' event_label, 'OPENING' reference,
         ob.notes, ob.amount::numeric(16,2) debit_amount, 0::numeric(16,2) credit_amount
  from public.opening_balances ob
  where ob.kind='customer_receivable' and ob.customer_id is not null

  union all

  select s.customer_id, i.invoice_date, 20, i.created_at, i.id,
         case when s.sale_kind='return_redelivery' then 'return_redelivery'
              when s.sale_kind='clearance_sale' then 'clearance_sale' else 'sale' end,
         case when s.sale_kind='return_redelivery' then 'إعادة تسليم مرتجع'
              when s.sale_kind='clearance_sale' then 'بيع تصفية' else 'بيع' end,
         i.invoice_number, s.notes, coalesce(sum(il.line_total),0)::numeric(16,2), 0::numeric(16,2)
  from public.invoices i
  join public.sales s on s.id=i.sale_id
  left join public.invoice_lines il on il.invoice_id=i.id
  where s.customer_id is not null
  group by s.customer_id,i.invoice_date,i.created_at,i.id,s.sale_kind,i.invoice_number,s.notes

  union all

  select s.customer_id, c.collection_date, 30, c.created_at, ca.id,
         'collection','تحصيل',i.invoice_number,
         coalesce(nullif(trim(c.reference),''),c.notes),
         0::numeric(16,2),ca.amount::numeric(16,2)
  from public.collection_allocations ca
  join public.collections c on c.id=ca.collection_id
  join public.invoices i on i.id=ca.invoice_id
  join public.sales s on s.id=i.sale_id
  where s.customer_id is not null

  union all

  select s.customer_id, r.return_date, 40, r.created_at, rl.id,
         'return','مرتجع عميل',r.return_number,rl.notes,
         0::numeric(16,2),coalesce(rl.financial_credit_amount,0)::numeric(16,2)
  from public.return_lines rl
  join public.returns r on r.id=rl.return_id
  join public.sales s on s.id=r.sale_id
  where s.customer_id is not null
)
select customer_id,event_date,event_rank,source_created_at,source_id,event_type,event_label,reference,notes,
       debit_amount,credit_amount,
       sum(debit_amount-credit_amount) over (
         partition by customer_id
         order by event_date,event_rank,source_created_at,source_id
         rows between unbounded preceding and current row
       )::numeric(16,2) running_balance
from events;

create or replace view public.v_supplier_account_statement
with (security_invoker = true)
as
with events as (
  select ob.supplier_id, ob.effective_date event_date, 10 event_rank, ob.created_at source_created_at,
         ob.id source_id,'opening_balance' event_type,'رصيد افتتاحي' event_label,'OPENING' reference,
         ob.notes,ob.amount::numeric(16,2) debit_amount,0::numeric(16,2) credit_amount
  from public.opening_balances ob
  where ob.kind='supplier_payable' and ob.supplier_id is not null

  union all

  select pi.supplier_id,pi.purchase_date,20,pi.created_at,pi.id,
         'purchase','شراء',pi.invoice_number,pi.notes,
         coalesce(sum(pl.line_total),0)::numeric(16,2),0::numeric(16,2)
  from public.purchase_invoices pi
  left join public.purchase_lines pl on pl.purchase_invoice_id=pi.id
  group by pi.supplier_id,pi.purchase_date,pi.created_at,pi.id,pi.invoice_number,pi.notes

  union all

  select sp.supplier_id,sp.payment_date,30,sp.created_at,spa.id,
         'supplier_payment','دفعة للمورد',pi.invoice_number,
         coalesce(nullif(trim(sp.reference),''),sp.notes),
         0::numeric(16,2),spa.amount::numeric(16,2)
  from public.supplier_payment_allocations spa
  join public.supplier_payments sp on sp.id=spa.supplier_payment_id
  join public.purchase_invoices pi on pi.id=spa.purchase_invoice_id

  union all

  select sr.supplier_id,sr.return_date,40,sr.created_at,sr.id,
         'supplier_return','مرتجع شراء',sr.return_number,sr.notes,
         0::numeric(16,2),sr.approved_total::numeric(16,2)
  from public.supplier_returns sr
)
select supplier_id,event_date,event_rank,source_created_at,source_id,event_type,event_label,reference,notes,
       debit_amount,credit_amount,
       sum(debit_amount-credit_amount) over (
         partition by supplier_id
         order by event_date,event_rank,source_created_at,source_id
         rows between unbounded preceding and current row
       )::numeric(16,2) running_balance
from events;

alter view public.v_purchase_balances set (security_invoker = true);
alter view public.v_supplier_account_balances set (security_invoker = true);
alter view public.v_supplier_returns_report set (security_invoker = true);

grant select on public.v_customer_account_statement, public.v_supplier_account_statement to authenticated;
revoke all on public.v_customer_account_statement, public.v_supplier_account_statement from anon;