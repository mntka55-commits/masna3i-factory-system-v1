-- The PC Model Detail screen maintains this table directly.
-- Existing RLS policies keep all DML scoped to the authenticated user's current factory.
grant select, insert, update, delete on table public.model_variable_costs to authenticated;
