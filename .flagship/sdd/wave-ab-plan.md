# Wave A+B Plan — Truthful Commerce & Shared Interaction Quality

## Plan file
`.flagship/sdd/wave-ab-plan.md`

## BASE commit
`5a24cd32838f9941dcb5a2ed54ccb25327882e67`

## Global Constraints
- No masonry geometry changes
- No editor/poster department changes
- No co-own file modifications unless resolving a direct regression from this campaign
- No new features beyond what findings require
- No weakening tests or security to pass
- All existing concurrent work in the worktree preserved
- Use TypographyV2 from `theme/typography.v2` for all new typography
- Use `useReducedMotion` from `hooks/useReducedMotion` (shared hook) not Reanimated's own
- Anti-AI design: no new cards/pills/gradients/shadows/decorative surfaces
- Sequential dispatch for shared files; parallel for independent domains

## Tasks

### Task 1: F12 + F13 — TradeConfirmScreen (P0)
- File: `frontend/src/screens/TradeConfirmScreen.tsx`
- F12: Remove `routeFeeRate ?? 0.01` at line 110. When feeRate is absent, block commitment and show refresh/retry — never display a fabricated percentage.
- F13: `netValue > 5000` at line 134 is a proxy for the full hold policy (value OR >5% of public float). `delta > 0.02` at line 180 is an absolute deviation check. Both need server-authored confirmation requirements. If backend doesn't provide it, make the client behavior explicit about the approximation rather than presenting it as policy.

### Task 2: F11 + F15 — Checkout unknown outcome + indefinite pulse (P0/P2)
- Files: `frontend/src/components/checkout/PaymentStateBanner.tsx`, `frontend/src/utils/checkoutFlow.ts`, `frontend/src/components/checkout/PulsingDot.tsx`
- F11: Add `unknown_outcome` case to PaymentStateBanner switch (line 58). Remove `numberOfLines={2}` cap (line 124) for unknown_outcome so the full message is readable.
- F15: Replace `withRepeat(..., -1)` indefinite pulse in PulsingDot.tsx (line 28) and PaymentStateBanner.tsx (line 39) with a bounded pending indicator per charter.

### Task 3: F02 — Readiness instrumentation (P1)
- File: `frontend/src/performance/visuallyComplete.ts`
- `useVisuallyComplete` (line 58) and `useReadiness` (line 79) both call `markVisuallyComplete` on mount — mount ≠ visual completion.
- Add visit-scoped identity: per-visit ID, measure mount → critical data → first media → interactive separately. Complete only after required milestones for that surface.

### Task 4: F03 — Source-assertion tests (P1)
- File: `frontend/src/__tests__/nativeVisualAcceptance.test.ts`
- All assertions are `toContain`/`toMatch` on source strings — they verify component names exist, not visual quality.
- Rename to reflect what they actually test (structural/architectural assertions). Remove tautological claims. Keep useful architectural checks under accurate names.

### Task 5: F01 — Design.md stale assertions (P1)
- File: `Design.md`
- Fix future-dated benchmark (`benchmark-date: 2026-09-22` → actual access date).
- Correct runtime palette ownership (tokens exposed in ThemeContext.tsx).
- Resolve typography source-of-truth conflict (display 24 vs 32).
- Replace "already flagship" with evidence-qualified language.

### Task 6: F04 — Typography contracts (P1)
- Files: `frontend/src/theme/designTokens.ts`, `frontend/src/theme/typography.v2.ts`
- `designTokens.ts` `display: { size: 24 }` vs `typography.v2.ts` `display: { size: 32 }` — same role name, different geometry.
- Choose one canonical semantic role definition. Make compatibility exports genuine aliases.

### Task 7: F06 + F07 — Search scope + fabricated zeros (P1)
- File: `frontend/src/screens/UnifiedDiscoveryScreen.tsx`
- F06: `setSearchScope('items')` at line 212 inside query-change effect — resets People scope while typing. Remove the scope reset; let explicit selection own the scope.
- F07: `priceGbp ?? 0` (line 232), `likes: 0` (line 234), `condition: null` (line 231) — fabricate zero values. Preserve null/unknown rather than defaulting to 0.

### Task 8: F14 — Reduced-motion inconsistency (P1)
- Files: `frontend/src/creator/useCreatorPublishWorkflow.ts`, `frontend/src/creator/CreatorLayersSheet.tsx`, `frontend/src/creator/controls/CreatorSlider.tsx`, `frontend/src/creator/tools/commerce/ProductBrowserSheet.tsx`, `frontend/src/creator/tools/text/InlineTextEditor.tsx`, `frontend/src/creator/surfaces/CutoutPreviewSheet.tsx`, and any other files importing `useReducedMotion` from `react-native-reanimated` instead of `../hooks/useReducedMotion`.
- The shared `useReducedMotion` combines OS + in-app preferences and subscribes to OS changes. Reanimated's own hook reflects startup state only — no rerender on settings changes.
- Migrate all Reanimated `useReducedMotion` imports to the shared hook.

### Task 9: F10 — SellerHub partial-state ambiguity (P1)
- File: `frontend/src/screens/SellerHubScreen.tsx`
- `sellingOrders === null` (line 270) and `ownListings === null` (line 311) are ambiguous — null means loading OR failure.
- Add explicit resource states (loading/ready/failed) so failed fetches show retry instead of indefinite loading.

### Task 10: F18 — Visual gates triage (P1, read-only)
- File: `scripts/check-visual-release-gates.mjs` + report output
- Triage 50 P0-labelled findings, 18 P1-labelled findings, 138 warnings into true defect / exception / scanner limitation.
- Read-only analysis — produce triage report, no code changes.

### Task 11: F09 — SellerHub composition (P1)
- File: `frontend/src/screens/SellerHubScreen.tsx`
- Four pillar tiles render before financial hero, trust strip, orders module (line 244).
- Recompose: urgent operational task first, compact money summary, flat task queue. Secondary destinations below.
- NOTE: This is a visual recomposition — needs careful review. Do after F10.

### Task 12: F08 — Visual search facets (P1, large)
- Files: `frontend/src/screens/VisualSearchScreen.tsx`, `backend/api/src/routes/visualSearch.ts`
- Colour/style facets are text matches over returned candidates, not retrieval-scoped.
- Large effort — requires backend retrieval changes. May defer with rationale.

## Execution order
Sequential per shared file. Parallel for independent domains.

Batch 1 (P0): Task 1, Task 2 — parallel (different files)
Batch 2 (P1 evidence): Task 3, Task 4, Task 5 — parallel (different files)
Batch 3 (P1 interaction): Task 6, Task 7, Task 8, Task 9 — parallel (different files)
Batch 4: Task 10 (read-only) — parallel with Batch 3
Batch 5: Task 11 (after Task 9 — same file), Task 12 (deferred if too large)
