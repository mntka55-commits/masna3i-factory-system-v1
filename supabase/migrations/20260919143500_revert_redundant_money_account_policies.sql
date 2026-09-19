-- Revert redundant duplicate money-account policies.
-- The existing factory_scope_* policies already enforce the required factory isolation.
drop policy if exists money_accounts_select_v1 on public.money_accounts;
drop policy if exists money_accounts_insert_v1 on public.money_accounts;
drop policy if exists money_accounts_update_v1 on public.money_accounts;
