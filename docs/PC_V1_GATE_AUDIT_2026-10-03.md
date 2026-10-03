# PC V1 Gate Audit — 2026-10-03

## Scope
This checkpoint continues PC V1 acceptance from the existing canonical implementation. It does not reopen business rules.

## Completed gates in this run

### Gate: Models / Model Detail
- Models module source syntax: PASS.
- Model search/filter implementation present: PASS.
- Model detail route is registered.
- Model material direct DML is protected by factory-scoped RLS.
- Model variable cost direct DML was found to be missing for authenticated users.
- Fixed by granting authenticated SELECT/INSERT/UPDATE/DELETE on `public.model_variable_costs`.
- Authenticated direct DML regression (insert/update/delete) in ROLLBACK: PASS.
- Safe UX fix committed: `model-detail` keeps the Models nav item active and uses the Models page heading.

### Gate: Production / Inventory / Purchasing / Sales
- Source syntax for all relevant PC modules: PASS.
- Authenticated end-to-end transactional regression in ROLLBACK:
  Purchase -> Cutting -> WIP -> READY -> Sale + Invoice -> Customer Collection -> Customer Return -> Supplier Payment -> Supplier Return -> Expense -> Stocktake.
- Final assertions:
  - Customer due = 20.00: PASS.
  - Supplier payable = 500.00: PASS.
  - Inventory = 30.000: PASS.
  - WIP = 2: PASS.
  - READY = 2: PASS.
  - Money account balance = 650.00: PASS.
  - Reporting model performance row: PASS.
  - Reporting daily financial row: PASS.
- QA fixture cleanup check after rollback: all QA-prefixed model/material/customer/supplier/account/invoice/return/expense counts = 0.

### Gate: Returns / Account Security
- Initial authenticated E2E exposed a real privilege defect in `post_return`: the function is SECURITY INVOKER and could not SELECT/INSERT into `return_line_sale_ready_allocations`.
- Fixed with factory-scoped RLS preserved.
- After the fix, the full authenticated E2E passed.
- Final hardening intentionally leaves only the required authenticated SELECT/INSERT capability on this internal linkage table; direct UPDATE/DELETE are not needed by the current PC implementation.

### Gate: Negative business-rule regression
PASS:
- Sale from WIP rejected.
- Oversell READY rejected.
- Duplicate opening balance rejected.
- Customer over-collection rejected.
- Supplier over-payment rejected.
- Supplier return above remaining purchased quantity rejected.
- Negative stocktake input rejected.

## Reporting / Printing structural gate
- Reports module source syntax: PASS.
- Reporting data sources are read-only views.
- Printing source safety: read-only data access; no insert/update/delete/rpc; print action is browser print.
- A4 print CSS is present.
- Physical browser print output remains unverified because this environment has no browser/computer-use tool.

## Identity isolation
- Authenticated current-user context resolves to the active factory correctly.
- Full second-user/second-factory isolation remains a final acceptance check and requires a real second authenticated identity; it is not marked PASS from a fabricated identity.

## Current blockers
1. Physical PC browser/E2E verification is still required.
2. Physical A4 print output is still required.
3. Full second-identity isolation is still required.
4. WIP UI has a known multi-lot limitation: it selects the oldest single lot. Do not replace this with sequential RPC calls because that could break atomicity; a reducer across lots would need a dedicated design if this becomes an acceptance blocker.

## Decision
PC V1 business/backend gates have now advanced materially. No business rule was reopened. Continue with physical browser acceptance, printing, and second-identity isolation before declaring PC V1 frozen.
