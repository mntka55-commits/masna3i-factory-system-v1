-- V1 alignment: enforce the current Good/Repair return rule and exclude
-- return redelivery from sales-performance totals while keeping it visible separately.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.return_lines'::regclass
      and conname = 'return_lines_v1_outcome_check'
  ) then
    alter table public.return_lines
      add constraint return_lines_v1_outcome_check
      check (outcome::text in ('good_ready','repair'));
  end if;
end
$$;

create or replace view public.v_reporting_daily_financials
with (security_invoker = true)
as
with sales_day as (
  select
    i.factory_id,
    i.invoice_date as report_date,
    coalesce(sum(case when sr.sale_kind='normal_sale' then sr.sales_amount else 0 end),0)::numeric(16,2) as normal_sales,
    coalesce(sum(case when sr.sale_kind='clearance_sale' then sr.sales_amount else 0 end),0)::numeric(16,2) as clearance_sales,
    coalesce(sum(case when sr.sale_kind='return_redelivery' then sr.sales_amount else 0 end),0)::numeric(16,2) as return_redelivery_sales,
    (
      coalesce(sum(case when sr.sale_kind='normal_sale' then sr.sales_amount else 0 end),0)
      + coalesce(sum(case when sr.sale_kind='clearance_sale' then sr.sales_amount else 0 end),0)
    )::numeric(16,2) as gross_sales
  from public.v_sales_report sr
  join public.invoices i on i.id=sr.invoice_id
  group by i.factory_id, i.invoice_date
),
cogs_day as (
  select
    i.factory_id,
    hc.sale_date as report_date,
    coalesce(sum(hc.cogs_amount),0)::numeric(16,2) as historical_cogs
  from public.v_historical_cogs hc
  join public.invoices i on i.id=hc.invoice_id
  join public.sales s on s.id=i.sale_id
  where s.sale_kind in ('normal_sale','clearance_sale')
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

grant select on public.v_reporting_daily_financials to authenticated;
revoke all on public.v_reporting_daily_financials from anon;

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
where s.sale_kind in ('normal_sale','clearance_sale')
group by
  s.factory_id, s.sale_date, s.id, s.sale_kind,
  sl.id, sl.model_id, m.code, m.name, sl.quantity, sl.unit_price, sl.line_total;

grant select on public.v_model_sales_performance to authenticated;
revoke all on public.v_model_sales_performance from anon;
