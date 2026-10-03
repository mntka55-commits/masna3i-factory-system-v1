-- Preserve factory isolation on account-level views.
-- Supabase/Postgres public views otherwise execute with the view owner's privileges
-- and can bypass underlying RLS policies.

alter view public.v_customer_account_balances
  set (security_invoker = true);

alter view public.v_customer_account_statement
  set (security_invoker = true);

alter view public.v_supplier_account_statement
  set (security_invoker = true);
