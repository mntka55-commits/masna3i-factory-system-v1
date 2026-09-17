# G2 — Data Contract Decision

Date: 2026-09-17

## Approved decision

For the current model cost shown to the user, the **latest completed/posting cutting operation for that model** is the source of the model's current actual consumption.

Current cost per piece is derived as:

`(actual fabric consumption in latest completed cut × latest purchase price per material) / actual pieces + approved variable cost per piece`

## Boundaries

- This is a **current model cost** calculation only.
- Historical cutting costs are not rewritten retroactively.
- FIFO remains an inventory valuation/layer rule and is not replaced by this model-cost rule.
- Fixed factory costs remain separate and are not allocated to models in V1.
- No standalone Orders stage.
- Cutting remains one model per operation, with actual fabric quantity and actual pieces recorded together.

## Implementation

Supabase view: `public.v_model_current_costs`

The view uses the latest posted cutting operation per factory/model, derives actual consumption from `cutting_inputs`, uses the latest purchase price per material for the current model-cost calculation, and adds `model_variable_costs.amount_per_piece`.

The view is `security_invoker=true` and is subject to the underlying factory-scoped RLS.

## Verification

- Migration applied successfully.
- View exists and currently returns 0 rows because there are no model/cutting test records in production.
- Relevant business tables have RLS enabled.

## Source authority

`FACTORY_SYSTEM_V1_CANONICAL_MASTER_CLEANED_2026-09-16(1).docx` remains the business-logic authority. This document records the explicit decision made on 2026-09-17 to close the previously open point in G2.
