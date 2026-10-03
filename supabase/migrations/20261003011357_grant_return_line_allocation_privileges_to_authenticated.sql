-- Required by post_return(), which runs as SECURITY INVOKER and
-- preserves factory isolation through the existing RLS policies.
grant select, insert, update, delete on table public.return_line_sale_ready_allocations to authenticated;
