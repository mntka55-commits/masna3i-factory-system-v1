# PC V1 Account Regression — 2026-10-03

## Result
PASS — account-level customer/supplier financial path verified inside a rolled-back database transaction.

## Customer
Opening receivable: 1,000
Collection: 400
Expected balance after collection: 600
Observed balance: 600.00
Money movement: +400, direction=in
Statement: one collection credit event for 400
Over-collection 700: rejected by `post_customer_collection_account`
No extra collection persisted after rejection.

## Supplier
Opening payable: 1,000
Payment: 400
Expected balance after payment: 600
Observed balance: 600.00
Money movement: -400, direction=out
Statement: one supplier-payment credit event for 400
Over-payment 700: rejected by `post_supplier_payment_account`
No extra payment persisted after rejection.

## Security
Live views verified with `security_invoker=true`:
- v_customer_account_balances
- v_customer_account_statement
- v_supplier_account_balances
- v_supplier_account_statement

## Data hygiene
The QA transactions were executed in a transaction and rolled back.
No business/test transaction was intentionally left behind.

## Next gate
PC visual E2E → A4 printing/reprint → second identity isolation → PC V1 freeze.
