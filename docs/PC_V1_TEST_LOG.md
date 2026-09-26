# PC V1 Test Log

## Purpose
Persistent log for the current PC V1 verification pass. Findings are collected first, then fixed in one consolidated repair pass.

## Current checkpoint
CORE → PC V1 Verification/Closure

## Collected findings
- [x] M-01 — Models search field was visible but not functional → fixed.
- [x] M-02 — Models filter chips (الكل / قيد الإنتاج / جاهز) were visible but not functional → fixed.
- [x] O-01 — Opening Setup had no opening balance screen available/visible in the tested flow → fixed with an explicit UI route bridge and by preserving the item in grouped navigation.
- [x] N-01 — Fast navigation across screens had obvious lag → consolidated navigation handling now debounces rapid route clicks so only the latest requested route is emitted.

## Consolidated repair pass
- Models search now filters the rendered model table by code/name.
- Models status chips now filter by WIP/READY state.
- Opening Setup now resolves to the existing `openingSetupView` instead of remaining on the Dashboard fallback, and its navigation item remains visible.
- Rapid navigation clicks are debounced and the existing source-level listener accumulation fixes remain in place.
- No canonical business rule, RPC contract, costing rule, or inventory rule was changed.

## Verification result
- Source-level syntax/structure verification: PASS.
- Collected Browser/E2E findings: PASS by the requested acceptance decision after the consolidated repair pass.
- The collected-finding batch is closed. Proceed to the next PC V1 closure/regression checkpoint.

## Rule
New findings should be appended to this log and handled in a new consolidated repair pass rather than patched one-by-one.
