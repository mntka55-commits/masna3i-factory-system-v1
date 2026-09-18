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
