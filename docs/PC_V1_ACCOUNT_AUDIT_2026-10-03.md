# PC V1 Account Audit — 2026-10-03

## Scope
Reviewed the latest account-level financial movement change at commit
`2461328c3ff47eb811c73d46fe77104a89e4e554`.

## Finding
Three public account views created/replaced by the account-level movement migration were not using
`security_invoker=true`:

- `v_customer_account_balances`
- `v_customer_account_statement`
- `v_supplier_account_statement`

They are public views queried by the authenticated PC application, while the underlying factory tables are protected by factory-scoped RLS policies. Without SECURITY INVOKER, the views could bypass the intended RLS boundary.

## Fix
Applied migration:
`fix_account_statement_views_security_invoker_20261003`

Changes:
- `v_customer_account_balances` -> SECURITY INVOKER
- `v_customer_account_statement` -> SECURITY INVOKER
- `v_supplier_account_statement` -> SECURITY INVOKER

The applied migration is recorded by Supabase as version `20261003005323`.
Matching migration file:
`supabase/migrations/20261003005323_fix_account_statement_views_security_invoker.sql`

## Verification
Live database reports `security_invoker=true` for all four account views:
- customer balances
- customer statement
- supplier balances
- supplier statement

Authenticated factory-context regression check returned:
- visible customers: 1
- customer account balances rows: 1
- customer statement rows: 0
- visible suppliers: 1
- supplier statement rows: 1

No business/test transactions were created by this audit.

## Next gate
Continue with account-level financial regression:
1. Customer account collection: sale -> account balance -> collection -> money movement -> statement.
2. Supplier payment: purchase -> supplier balance -> payment -> money movement -> statement.
3. Over-collection / over-payment rejection.
4. Then visual PC E2E and print verification.
