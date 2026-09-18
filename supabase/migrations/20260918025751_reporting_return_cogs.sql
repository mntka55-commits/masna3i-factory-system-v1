create or replace view public.v_return_cogs
with (security_invoker=true)
as
select
  r.id as return_id,
  r.return_number,
  r.return_date,
  r.sale_id,
  rl.id as return_line_id,
  sum(rsa.quantity)::integer as pieces,
  coalesce(sum(rsa.quantity * rsa.unit_cost_snapshot),0)::numeric(16,2) as returned_cogs
from public.returns r
join public.return_lines rl on rl.return_id = r.id
join public.return_line_sale_ready_allocations rsa on rsa.return_line_id = rl.id
group by r.id,r.return_number,r.return_date,r.sale_id,rl.id;

grant select on public.v_return_cogs to authenticated;
revoke all on public.v_return_cogs from anon;