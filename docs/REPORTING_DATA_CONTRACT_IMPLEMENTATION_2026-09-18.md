# Reporting/Data Contract foundation — 2026-09-18

Status: IMPLEMENTED and verified on Supabase project Factory System V1.

## What changed

- Added sale classification: normal_sale / clearance_sale / return_redelivery.
- Added historical cost snapshots to cutting, READY and sale allocation layers.
- Added exact return-to-original-sale READY allocation lineage.
- Added financial credit amount to return lines.
- Updated normal sale posting to copy historical READY cost into sale allocations.
- Updated cutting posting to freeze model-level variable cost per piece at cut time.
- Updated WIP -> READY to carry the historical unit-cost snapshot.
- Updated returns to create customer credit and preserve COGS lineage.
- Added return re-delivery RPC that creates a new invoice marked return_redelivery and consumes only READY lots originating from the return.
- Made invoice balances return-aware.
- Added reporting views for sales, historical COGS, returns, customer accounts, supplier accounts and expenses.
- Restricted variable cutting-cost reporting to posted cutting operations.
- Added reporting data-quality view.

## Verification

Current invoice 123 remains 600 EGP outstanding, classified as normal_sale.
Historical COGS for its 2 sold pieces is 80 EGP (40 EGP/piece).
Current reporting data-quality view returns zero for all defined issue checks.
Existing production/test counts were not altered by the migration.

## Tool boundaries

- Supabase: schema, RPCs, source-of-truth data, reporting views and security.
- GitHub: version control, migration/docs source and frontend code.
- Canva: visual/prototype reference only; never a source of business data or reporting truth.

## Next execution step

Close the remaining return workflow UI and E2E tests, then close clearance-sale handling and reporting UI on top of these database contracts.
