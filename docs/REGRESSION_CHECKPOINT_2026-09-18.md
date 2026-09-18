# MASNA3I FACTORY SYSTEM V1 — Regression Checkpoint
## 2026-09-18

## الحالة
- Business Flow: PASS
- G3 Auth / Factory Isolation: PASS retained from prior verified test
- G4 Atomic Core: PASS retained from prior verified test
- G5 Cutting / WIP / READY: PASS retained from prior verified test
- Reports V1 DB + Code closure: PASS
- Full Regression: IN PROGRESS
- Browser visual/E2E: PENDING where browser access is unavailable
- Pilot: NOT STARTED

## Reports V1 closure
Implemented and deployed:
- v_reporting_daily_financials
- v_inventory_valuation
- v_model_sales_performance
All three views use security_invoker=true.
Authenticated SELECT is granted; anon SELECT is revoked.
Frontend reports_v1.js now consumes reporting views instead of inventing reporting formulas.
Net Profit is not presented as a basic V1 report metric, consistent with the Canonical Master.

## Verified current reporting baseline
- Net Sales: 600 EGP
- Net COGS: 80 EGP
- Gross Margin: 520 EGP
- Collections: 0 EGP
- Fixed Expenses: 0 EGP
- Variable Expenses: 0 EGP
- FAB-001 current quantity: 80 m
- FAB-001 inventory value: 1600 EGP
- TEST-001 sold pieces in current baseline: 2
- TEST-001 sales: 600 EGP
- TEST-001 historical COGS: 80 EGP
- Reporting data-quality issue counts: 0

## Regression results completed in this checkpoint

| Test | Result | Notes |
|---|---|---|
| Duplicate supplier payment for same invoice in one payload | PASS | DB unique constraint prevents duplicate allocation; transaction fails/rolls back |
| Multiple collections on same invoice | PASS | 100 + 200 accepted; total collection reached 300 in temporary transaction |
| Over-collection | PASS | 601 against 600 outstanding rejected |
| Sale over READY | PASS | Request for 5 while only 4 READY rejected |
| Multi-model invoice | PASS | 2 lines created, total 450 in temporary transaction; transaction rolled back |
| Supplier return above available stock | PASS | 81 m against available 80 rejected |
| Negative stocktake quantity | PASS | Negative actual quantity rejected |
| Baseline cleanup after temporary tests | PASS | Temporary test rows removed |
| Printing code review | PASS (code) | Printing/reprint functions only read operational data and call browser print; no write operation in print code |
| Browser print/reprint visual test | PENDING | No browser/computer tool available in this execution |
| Cross-factory isolation rerun | RETAINED PASS | Current DB has one factory + one active membership; prior G3 isolation test remains source-of-truth |
| Non-member Reports isolation via SQL impersonation | NOT VALID AS A RUNTIME TEST | SQL MCP executes as postgres; auth.uid()/RLS cannot be impersonated this way. No application bug is inferred from this test. |
| Reports access contract | PASS (DB contract) | New report views are security_invoker=true; authenticated SELECT=true; anon SELECT=false |

## Baseline after regression
- Invoice 123: total 600, collected 0, outstanding 600
- PUR-001: total 2000, paid 0, remaining 2000, returned 0
- READY: 4
- WIP: 4
- Temporary regression supplier-return rows: 0
- Temporary stocktake regression movements: 0

## Notes on runtime verification
A direct anonymous Data API call could not be executed from this environment because external DNS/network resolution is unavailable. The database privilege contract was verified instead. A real non-member authenticated runtime test remains a later E2E item requiring an actual second authenticated identity.

## Next execution order
1. Continue remaining backend regression where it is not already PASS or where recent changes affect it.
2. Close remaining browser visual/E2E checks when browser capability is available.
3. Mobile V1 after PC Core + Regression closure.
4. Pilot with the real factory.
5. Any pilot issue is fixed at source, then impacted regression tests are rerun.

## Rules
- Canonical Master remains the business-rule source of truth.
- No silent business-rule changes.
- No demo/test data remains in production.
- Fix from source, then retest.

## Correction — return decision source of truth
The previous damaged-return disposition change was based on an older rule and has been reverted.
Current V1 rule: customer return outcome is Good/Repair; return redelivery is a new invoice for the same customer when applicable; clearance/discounted sale is a separate SALE operation, not a return outcome; scrap is exceptional, not a normal return workflow.
No test data remains from the reverted work.


## Alignment correction — current return/reporting rules
- Return outcomes are enforced as Good/Repair only at the database boundary; legacy enum labels are no longer accepted by `return_lines`.
- Return redelivery remains a separate `return_redelivery` invoice for the same customer when applicable.
- Return redelivery is shown separately for visibility but is excluded from sales-performance totals, net sales, COGS, and gross margin.
- Clearance sale remains a separate `clearance_sale` operation.
- The Returns UI no longer contains any legacy Scrap outcome label.

## Latest alignment verification — 2026-09-18
- The stale three-outcome return implementation remains reverted.
- Database constraint return_lines_v1_outcome_check rejects legacy discounted_sale / scrap outcomes; no return data exists in production baseline.
- Legacy disposition table/view remain absent.
- Return redelivery remains a separate return_redelivery invoice and is excluded from sales-performance totals, model sales performance, historical COGS, and gross margin; it remains visible as a separate report field.
- Regression test passed with a temporary redelivery invoice: return_redelivery_sales=1000 while gross/net sales, COGS, and gross margin remained 0; temporary rows were removed.
- Regression test passed for legacy return outcome rejection; temporary rows were removed.
- Applied migration: 20260918125358_v1_align_return_reporting_rules.

## Regression progress — return / printing / opening
- Returns backend regression: PASS.
  - Good return -> READY.
  - Repair return -> damaged lot.
  - Repair -> READY.
  - Return redelivery -> new invoice for same customer, original/custom price accepted.
  - Over-return rejected.
  - Over-redelivery rejected.
  - Over-repair rejected.
  - Atomic return failure rolls back all partial work.
- Printing/Reprint code review: PASS.
  - Printing code reads invoice data and calls browser print only.
  - No insert/update/delete/RPC write operation exists in printing_v1.js.
  - Browser visual A4 print/reprint verification remains PENDING because browser/computer capability is unavailable.
- Opening backend regression: PASS.
  - Cash opening creates the opening money movement.
  - Inventory opening creates opening inventory movement + layer.
  - Duplicate opening for same cash account/material is rejected.
  - Invalid zero values are rejected.
  - Tests executed inside rollback transactions; no regression data persisted.

## Regression progress — account statements
- Customer account statement backend regression: PASS.
  - Temporary registered-customer sale: 300 EGP debit.
  - Temporary collection: 100 EGP credit.
  - Final running balance: 200 EGP.
- Supplier account statement backend regression: PASS.
  - PUR-001 purchase: 2000 EGP debit.
  - Temporary supplier payment: 500 EGP credit.
  - Final running balance: 1500 EGP.
- Both tests ran inside rollback transactions; no regression data persisted.
