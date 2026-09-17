# G7 — Cutting UI Review — 2026-09-17

## Review result
The previous cutting screen was a visual placeholder and did not implement the approved operation.

Problems found:
- The model `<option>` values did not carry `model_id`.
- The fabric `<option>` values did not carry `material_id`.
- Only one fabric row was available although one cutting operation may use multiple fabrics.
- The screen had no actual-pieces field.
- The button did not call `post_cutting`; it only showed an informational message.
- The wording implied a separate start/end process, while the approved G2 contract records actual fabric quantities and actual pieces together in one cutting operation.

## Implemented G7 correction
A dedicated `cutting_v1.js` module now:
- Uses real model/material IDs.
- Supports multiple fabric rows in one operation.
- Requires actual quantity for every fabric line.
- Requires actual piece count in the same form.
- Calls the existing atomic `post_cutting` RPC.
- Lets the RPC enforce inventory sufficiency and atomic rollback.
- Creates WIP through the existing business logic; no direct WIP writes from the UI.

## Business logic preserved
- One model per cutting operation.
- Multiple fabric inputs allowed.
- No expected-piece input.
- Actual meters + actual pieces are recorded together.
- Fabric is deducted atomically using existing inventory-layer/FIFO allocation logic.
- Insufficient stock rejects the whole operation.
- WIP is created from actual pieces.
- G2 current model cost remains based on the latest completed/posting cutting operation.

No production transactions were inserted by this UI build.
