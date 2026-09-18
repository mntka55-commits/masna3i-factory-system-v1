create or replace view public.v_reporting_daily_financials
with (security_invoker = true)
as
with sales_day as (
  select
    i.factory_id,
    sr.invoice_date as report_date,
    coalesce(sum(case when sr.sale_kind='normal_sale' then sr.sales_amount else 0 end),0)::numeric(16,2) as normal_sales,
    coalesce(sum(case when sr.sale_kind='clearance_sale' then sr.sales_amount else 0 end),0)::numeric(16,2) as clearance_sales,
    coalesce(sum(case when sr.sale_kind='return_redelivery' then sr.sales_amount else 0 end),0)::numeric(16,2) as return_redelivery_sales,
    coalesce(sum(sr.sales_amount),0)::numeric(16,2) as gross_sales
  from public.v_sales_report sr
  join public.invoices i on i.id=sr.invoice_id
  group by i.factory_id, sr.invoice_date
),
cogs_day as (
  select
    i.factory_id,
    hc.sale_date as report_date,
    coalesce(sum(hc.cogs_amount),0)::numeric(16,2) as historical_cogs
  from public.v_historical_cogs hc
  join public.invoices i on i.id=hc.invoice_id
  group by i.factory_id, hc.sale_date
),
returns_day as (
  select
    r.factory_id,
    rr.return_date as report_date,
    coalesce(sum(rr.financial_credit_amount),0)::numeric(16,2) as return_credits
  from public.v_returns_report rr
  join public.returns r on r.id=rr.return_id
  group by r.factory_id, rr.return_date
),
return_cogs_day as (
  select
    r.factory_id,
    rc.return_date as report_date,
    coalesce(sum(rc.returned_cogs),0)::numeric(16,2) as returned_cogs
  from public.v_return_cogs rc
  join public.returns r on r.id=rc.return_id
  group by r.factory_id, rc.return_date
),
collections_day as (
  select
    c.factory_id,
    c.collection_date as report_date,
    coalesce(sum(c.amount),0)::numeric(16,2) as collections
  from public.collections c
  group by c.factory_id, c.collection_date
),
expenses_day as (
  select
    e.factory_id,
    e.expense_date as report_date,
    coalesce(sum(case when e.cost_type='fixed' then e.amount else 0 end),0)::numeric(16,2) as fixed_expenses,
    coalesce(sum(case when e.cost_type='variable' then e.amount else 0 end),0)::numeric(16,2) as variable_expenses,
    coalesce(sum(e.amount),0)::numeric(16,2) as operating_expenses
  from public.expenses e
  group by e.factory_id, e.expense_date
),
dates as (
  select factory_id, report_date from sales_day
  union
  select factory_id, report_date from cogs_day
  union
  select factory_id, report_date from returns_day
  union
  select factory_id, report_date from return_cogs_day
  union
  select factory_id, report_date from collections_day
  union
  select factory_id, report_date from expenses_day
)
select
  d.factory_id,
  d.report_date,
  coalesce(s.normal_sales,0)::numeric(16,2) as normal_sales,
  coalesce(s.clearance_sales,0)::numeric(16,2) as clearance_sales,
  coalesce(s.return_redelivery_sales,0)::numeric(16,2) as return_redelivery_sales,
  coalesce(s.gross_sales,0)::numeric(16,2) as gross_sales,
  coalesce(r.return_credits,0)::numeric(16,2) as return_credits,
  (coalesce(s.gross_sales,0)-coalesce(r.return_credits,0))::numeric(16,2) as net_sales,
  coalesce(c.historical_cogs,0)::numeric(16,2) as historical_cogs,
  coalesce(rc.returned_cogs,0)::numeric(16,2) as returned_cogs,
  (coalesce(c.historical_cogs,0)-coalesce(rc.returned_cogs,0))::numeric(16,2) as net_cogs,
  (coalesce(s.gross_sales,0)-coalesce(r.return_credits,0)-coalesce(c.historical_cogs,0)+coalesce(rc.returned_cogs,0))::numeric(16,2) as gross_margin,
  coalesce(col.collections,0)::numeric(16,2) as collections,
  coalesce(e.fixed_expenses,0)::numeric(16,2) as fixed_expenses,
  coalesce(e.variable_expenses,0)::numeric(16,2) as variable_expenses,
  coalesce(e.operating_expenses,0)::numeric(16,2) as operating_expenses
from dates d
left join sales_day s using (factory_id, report_date)
left join cogs_day c using (factory_id, report_date)
left join returns_day r using (factory_id, report_date)
left join return_cogs_day rc using (factory_id, report_date)
left join collections_day col using (factory_id, report_date)
left join expenses_day e using (factory_id, report_date);

create or replace view public.v_inventory_valuation
with (security_invoker = true)
as
select
  m.id as material_id,
  m.code,
  m.name,
  m.kind,
  m.unit,
  coalesce(sum(case when l.remaining_quantity > 0 then l.remaining_quantity else 0 end),0)::numeric(14,3) as current_quantity,
  m.minimum_stock,
  coalesce(sum(case when l.remaining_quantity > 0 then l.remaining_quantity * l.unit_cost else 0 end),0)::numeric(16,2) as inventory_value
from public.materials m
left join public.inventory_layers l on l.material_id=m.id
group by m.id, m.code, m.name, m.kind, m.unit, m.minimum_stock;

create or replace view public.v_model_sales_performance
with (security_invoker = true)
as
select
  s.factory_id,
  s.sale_date as report_date,
  s.id as sale_id,
  s.sale_kind,
  sl.id as sale_line_id,
  sl.model_id,
  m.code as model_code,
  m.name as model_name,
  sl.quantity as pieces,
  sl.unit_price,
  sl.line_total as sales_amount,
  coalesce(sum(sra.quantity * sra.unit_cost_snapshot),0)::numeric(16,2) as historical_cogs
from public.sales s
join public.sale_lines sl on sl.sale_id=s.id
join public.models m on m.id=sl.model_id
left join public.sale_ready_allocations sra on sra.sale_line_id=sl.id
group by
  s.factory_id, s.sale_date, s.id, s.sale_kind,
  sl.id, sl.model_id, m.code, m.name, sl.quantity, sl.unit_price, sl.line_total;

grant select on public.v_reporting_daily_financials to authenticated;
grant select on public.v_inventory_valuation to authenticated;
grant select on public.v_model_sales_performance to authenticated;
revoke all on public.v_reporting_daily_financials from anon;
revoke all on public.v_inventory_valuation from anon;
revoke all on public.v_model_sales_performance from anon;
