-- Supplier return table DML privileges are required because the RPC is SECURITY INVOKER.
grant insert, update on public.supplier_returns to authenticated;
grant insert, update on public.supplier_return_lines to authenticated;
revoke delete on public.supplier_returns, public.supplier_return_lines from authenticated;