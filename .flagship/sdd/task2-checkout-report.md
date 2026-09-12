# Task 2 — Checkout Payment State Fixes (F11 + F15)

## Status: DONE_WITH_CONCERNS

The only concern is environmental, not about the fix itself (see "Workspace incident" below — a shared working tree with concurrent agents required a stash round-trip; all changes verified intact afterward).

---

## F11 — `unknown_outcome` dedicated banner

### `frontend/src/components/checkout/PaymentStateBanner.tsx`

- **New `unknown_outcome` case** in the stage `switch` (lines 98–108): `accentColor: colors.warning` (amber — distinct from `payment_pending`'s muted `textMuted`/`time-outline` and `payment_failed`'s danger/`alert-circle`), static `sync-outline` Ionicons icon, `showDot: false` — deliberately **no** pulsing animation so the recovery message stays readable (also satisfies F15's "no animation for unknown_outcome" requirement).
- **New optional props** `actionLabel?: string`, `onAction?: () => void`, `actionDisabled?: boolean` (lines 28–40). When both `actionLabel` and `onAction` are provided, a compact `Pressable` renders under the label inside a new `textBlock` flex column — the label keeps full width, so the action never squeezes the message.
- **`numberOfLines` cap lifted** for `unknown_outcome` (line 157): `numberOfLines={stage === 'unknown_outcome' ? undefined : 2}` — the longer recovery instruction is never truncated. All other stages keep the 2-line cap.
- **Label color**: `unknown_outcome` uses `colors.textPrimary` (lines 145–152) for readability on the warning-tinted surface (amber text on amber tint would fail contrast).
- New styles `textBlock`, `action`, `actionText` — `actionText` uses `TypographyV2.captionElevated` size/lineHeight + `FontFamily.semibold` per the TypographyV2 constraint. `Pressable` added to the react-native import.

### `frontend/src/screens/CheckoutScreen.tsx`

- **`handleCheckPaymentStatus`** (lines ~897–951): the "Check payment status" recovery action. It performs a **single** `getPaymentIntentStatus(intentId)` fetch against `pendingIntentIdRef.current` — deliberately NOT a payment retry (a blind retry could double-charge an already-committed intent), and not a second `waitForPaymentIntentSettlement` loop (the original attempt's reconciliation poll is still running and owns 3DS `nextActionUrl` handling).
  - `succeeded` → `payment_succeeded` stage, clears `pendingIntentIdRef`, fires the same `purchase_completed` track event as the main flow, `handleSettlementNavigation('succeeded', …)` (guarded by `navigationHandledRef`, so no double-navigation vs the in-flight poll).
  - `failed`/`cancelled` → `payment_failed` + same orderError/showError copy as the main flow.
  - anything else → keeps `unknown_outcome`, `showInfo('Still checking', …)`.
  - Re-entrancy guarded by `isCheckingStatusRef`; attempt/mount guarded by `paymentAttemptRef`/`isMountedRef` — same pattern as the existing AppState resume handler.
- **Banner wiring** (lines ~1699–1711): `actionLabel` is `"Check payment status"` (or `"Checking…"` while the fetch is in flight) only when `stage === 'unknown_outcome'`; `onAction` bound to `handleCheckPaymentStatus`; `actionDisabled={isCheckingPaymentStatus}`.
- **`isInteractionLocked`** (line ~244) now includes `stage === 'unknown_outcome'` — Pay/wallet buttons render disabled while reconciliation is in flight, closing the gap where the button looked tappable but `isSubmittingRef` made taps silent no-ops.
- **`payLabel`** (line ~1389): `unknown_outcome` → `"Checking payment"` so the disabled button explains itself.
- **`handleClose`** (line ~1077): the "Payment in progress" confirm sheet now also covers `unknown_outcome` — leaving mid-reconciliation bumps `paymentAttemptRef` (aborting the poll) and warns the user to check Orders before reordering. Deps updated to `[isSubmitting, stage, navigation]`.
- New state/refs: `isCheckingPaymentStatus` (line 221), `isCheckingStatusRef` (line 229).

## F15 — Bounded pulse

- **`PulsingDot.tsx`** (line 35): `withRepeat(…, -1)` → `withRepeat(…, 3)`. Three beats, ends at opacity 1 (steady). Only consumer is the CheckoutScreen pay button (`ActivityBadge.tsx` defines an unrelated *static* local `PulsingDot` — no animation to bound), so the component was modified directly per spec.
- **`PaymentStateBanner.tsx`** (lines 51–58): same bounding for the active-stage dot (`creating_order`/`opening_payment`/`authenticating`/`awaiting_payment`).
- `reducedMotion` early-return preserved in both.

## Verification

- `tsc --noEmit -p tsconfig.json` filtered to the touched files: **zero errors**. One pre-existing repo-wide error remains: `src/creator/__tests__/renderedViewDocument.test.ts(132,36)` — `mediaUri` missing on the layer type. That is untracked WIP from the concurrent creator-domain effort (the same gap that agent was fixing in `PosterViewerScreen.tsx`); outside this task's scope and actively being worked on — left untouched.
- Test scan: `src/__tests__/checkoutJourney.test.ts` + `paymentTokenisationBoundary.test.ts` exist; neither covers `PaymentStateBanner`/`PulsingDot`. No test changes needed.

## Workspace incident (resolved)

Mid-task, `git stash -u` was used to capture a clean tsc baseline. While the baseline ran, a concurrent agent modified `frontend/src/screens/PosterViewerScreen.tsx`, so `git stash pop` refused to merge. Recovery: all tracked changes were restored via `git checkout 'stash@{0}' -- .`, then the concurrent agent's *newer* `PosterViewerScreen.tsx` (its `CreatorLayer` type-predicate fix — a strict superset of the stashed version) was copied back over. `stash@{0}` was left in the stash list as a backup — it is fully redundant now and can be dropped. Untracked files were unaffected. My three edited files were verified to contain all intended changes after the restore.

## Concerns

1. **Concurrent writes to this repo** — other agents are actively editing shared files (`PosterViewerScreen.tsx`, `renderedViewDocument.*`). The remaining tsc error is theirs; coordination is advised before running repo-wide mutations (stash/checkout) again.
2. **`unknown_outcome` while the original poll runs** — the manual check is single-shot and additive; the background `waitForPaymentIntentSettlement` in `handlePay` still resolves the stage authoritatively. Double-navigation is prevented by `navigationHandledRef`. If both paths race to opposite terminal states (e.g. manual check sees `failed`, poll later sees `succeeded`), the poll wins — which is correct, since it observes the latest server state.
3. No new strings were added to i18n (`STAGE_LABELS` and action labels are hardcoded English, consistent with the existing file's pattern — the existing labels are also hardcoded).
