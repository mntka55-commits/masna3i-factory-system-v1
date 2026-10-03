-- post_return() only reads existing lineage and inserts new lineage rows.
-- Keep direct editing/removal unavailable to authenticated users.
revoke update, delete on table public.return_line_sale_ready_allocations from authenticated;
