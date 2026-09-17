# G7 — Model Cost View Access Fix — 2026-09-17

## Observed issue
The Models page failed while loading `v_model_current_costs` with `permission denied for view v_model_current_costs`.

Because `modelsView()` loads models, WIP, READY, and current costs together, this permission error aborted the render and left the previous view visible while the page heading showed “الموديلات”. This explains the screenshot where “قصة قص جديدة”/dashboard content appeared without “＋ إضافة موديل”.

## Root cause
`public.v_model_current_costs` was created with `security_invoker=true`, but the `authenticated` role did not have SELECT privilege on the view itself.

## Fix
Granted SELECT on `public.v_model_current_costs` to `authenticated` and explicitly revoked access from `anon`.

The view remains `security_invoker=true`, so underlying table RLS continues to apply to the authenticated user.

## Business logic impact
None. This is an access-control fix only.

The approved G2 rule remains unchanged:
- Latest posted/completed cutting operation for the model is the source of current actual consumption.
- Current model cost = latest actual fabric consumption cost per piece + approved variable cost per piece.
- Fixed costs remain separate in V1.
- FIFO remains inventory valuation/layer logic, not model-cost logic.

## Verification
After migration:
- `authenticated` SELECT on the view: true
- `anon` SELECT on the view: false
- `security_invoker`: true

No production/test data was inserted or changed.
