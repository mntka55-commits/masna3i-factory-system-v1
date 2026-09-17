# G2 — Model Cost Data Contract

## Authority

Business rules come from `FACTORY_SYSTEM_V1_CANONICAL_MASTER_CLEANED_2026-09-16`.
The older `FACTORY_SYSTEM_MASTER_PLAN_FINAL_01` is used only where it provides detail that does not conflict with the Canonical Master.

## Approved rules

- Model master data: code, name, selling price, sizes, colors.
- A model may use more than one material.
- Accessories/materials can be defined with a quantity per piece.
- Variable production costs include sewing, ironing, and other approved variable cost items.
- Variable model cost is separate from factory fixed costs.
- Factory fixed costs are not allocated to models in V1.
- Current model cost uses actual fabric consumption with the latest purchase price, plus approved variable model costs.
- Historical cutting cost must not be changed retroactively.
- FIFO remains an inventory-layer valuation rule and is not the model-cost rule.
- Net Profit is not a core V1 calculation.

## Supabase implementation

### `model_materials`

Added:
- `quantity_per_piece numeric(14,4)` — optional. This supports per-piece quantities for accessories/materials. It does not replace actual fabric consumption recorded by cutting.

### `model_variable_costs`

Added fields:
- `model_id`
- `cost_type`: `sewing | ironing | other`
- `name`
- `amount_per_piece`
- `notes`
- `factory_id`
- `created_at`

The table is factory-scoped with RLS and the standard `set_factory_scope` insert trigger.

## Deliberately not implemented yet

No new cost-calculation view is being introduced at this stage. The Canonical Master defines the cost rule but does not explicitly define how to select a historical cutting event when deriving a current model cost. That selection rule must be fixed before adding a derived current-cost view.

## Status

Schema portion of the G2 Cost Data Contract: **implemented and verified**.

Remaining G2 decision: define the source-selection rule for `actual fabric consumption` when producing the current derived model cost view.
