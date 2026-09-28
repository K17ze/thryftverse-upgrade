# Task G — Portfolio recovery + group permissions (findings 23, 24)

Spec: `docs/research/current-uiux-parity-audit-2026-09-28.md` findings 23 (P2) and 24 (P2).
Plan: `.flagship/plans/audit-2026-09-28-implementation-plan.md` Task G.

## Files changed

- `frontend/src/components/portfolio/PortfolioPartialBanner.tsx` — rewritten.
- `frontend/src/screens/PortfolioScreen.tsx` — minimal wiring edit only (banner props).
- `frontend/src/screens/GroupPermissionsScreen.tsx` — skeleton loading state, relocated
  read-only explanation, style cleanup.
- `frontend/src/__tests__/partialStateRecovery.test.tsx` — NEW, 11 tests.

No other files touched. No git state changes, no new dependencies, no edits outside `frontend/`.

## Finding 23 — portfolio partial-state recovery

**Banner (`PortfolioPartialBanner.tsx`)**

- Added `onRetry?: () => void`, `refreshing?: boolean`, `staleCount?: number` props.
- Quiet retry action: transparent ≥44pt (`Control.hit`) text button, "Try again",
  `accessibilityRole="button"`, `accessibilityLabel="Retry loading portfolio"`,
  `accessibilityState={{ busy, disabled }}`; while `refreshing` it is disabled and shows
  a small `ActivityIndicator` in place of the label.
- Removed `numberOfLines={2}` — the warning and the stale-detail line now reflow freely
  at 200% text. No line clamps anywhere in the banner.
- Layout is now icon + flex column (warning text, optional stale line, retry action) so
  the action gets full-width text beside it rather than stealing width at large text.
- New styles are a local `StyleSheet` in the component file (matching the
  `CoOwnOfflineBanner`/`CoOwnReconciliationBanner` convention) — `portfolioScreenStyles.ts`
  was not edited since it is outside the task's file ownership.
- The banner container deliberately does NOT get `accessible`/`role=alert`: grouping the
  subtree would swallow the retry button's independent focus stop.

**Screen wiring (`PortfolioScreen.tsx`, ~line 146)**

- `<PortfolioPartialBanner onRetry={handleRefresh} refreshing={refreshing}
  staleCount={positions.reduce((c, p) => (p.mark?.isStale ? c + 1 : c), 0)} />`
- The retry invokes the same `handleRefresh` as pull-to-refresh — recovery is now
  discoverable without the hidden gesture, and both paths share the latest-wins
  `requestTokenRef` guard in `usePortfolioData`.
- Total qualification: the banner ("Some positions are unavailable. Totals may be
  incomplete.") renders directly above the FlashList whose header contains
  `PortfolioSummaryCard`, so a partial total is never visually presented as complete —
  verified by test asserting the qualifier precedes "Portfolio value" in reading order.
- Stale naming: `staleCount` is derived from per-position `mark.isStale` provenance
  (`CoOwnPositionVM.mark`, populated by both the projection and legacy N+1 paths in
  `services/coOwnPortfolio.ts`). The banner line "N position(s) show a stale mark —
  flagged on the row below" points at the per-row "Stale mark" badge that
  `CoOwnPositionCard` already renders (`CoOwnPositionCard.tsx:196`).

**Not done / limitation (ownership):** failed asset IDs exist in the service contract
(`CoOwnPortfolioResult.failedAssetIds`, legacy path only — the projection mapper drops
them) but `usePortfolioData.ts` does not expose `failedAssetIds`/`holdingsCount`, and
that file is outside Task G's ownership. Missing (unfetched) positions therefore remain
a global statement, not a per-position label — they have no row to label anyway. If the
orchestrator wants the count ("N positions couldn't be loaded"), `usePortfolioData`
needs to surface `failedAssetIds`/`holdingsCount` — flagged for a follow-up.

## Finding 24 — group permissions presentation

**Loading skeleton**

- Replaced the centered `ActivityIndicator` with a restrained skeleton rendered inside
  the same `styles.content` padding as the loaded layout: the real intro block
  (static copy is known at load — no shimmer on known content) plus a
  `testID="group-permissions-skeleton"` list container that maps over `PERMISSIONS`
  (3 rows derived from the real list, not a hardcoded count).
- Each row reuses `styles.permissionBlock`/`permissionDivider`/`permissionHeading`/
  `permissionCopy` — identical hairline-separated geometry, no card stack.
- Bars via the shared `SkeletonLoader` (`frontend/src/components/SkeletonLoader.tsx`):
  title `height=TypographyV2.bodyStrong.lineHeight` (21), value line
  `height=TypographyV2.meta.lineHeight` (14) with the same `marginTop: Space.xs`, plus
  a 20×20 chevron slot. Row minHeight `Control.hit` (44) matches loaded rows; loading→
  content geometry stays stable.
- Container keeps `accessibilityLabel="Loading group permissions"` and gains
  `accessible` so screen readers announce the label once instead of traversing bars.
- Removed the now-unused `centerState` style; `ActivityIndicator` import is retained
  for the per-row pending spinner.

**Read-only explanation**

- Moved from below the full list into the intro (`introBlock`), directly above the
  first affected control — rendered in both loading and ready branches.
- Distinguishable explanations driven by server capability + connectivity:
  - authority-denied (`capabilities && !capabilities.canManage`):
    "You can review these settings, but only an owner or admin can change them."
  - offline (`isOffline`): "Offline — reconnect to change permissions."
  Both can render together when both apply; neither is hardcoded — the copy keys off
  `capabilities.canManage` from `fetchGroupSettingsFromApi` and `useConnectivity`.
- Removed the old bottom `readOnlyCopy` block and its style.
- Rows remain expandable for read-only users (values stay inspectable; the collapsed
  heading already announces current scope). Radio options keep
  `accessibilityState={{ checked, disabled }}`.
- `updatePermission` reconciliation-after-uncertain-update path (PATCH fail → refetch →
  confirm/revert) is untouched and is covered by two new tests.

## Tests — `src/__tests__/partialStateRecovery.test.tsx` (11 tests, all pass)

Convention: `react-test-renderer` + `act` + `vi.mock`, matching the existing
`portfolioPresentation`/`portfolioDataLifecycle` suites (no existing suite actually
imports `@testing-library/react-native`). `SkeletonLoader` is mocked because it pulls
`expo-linear-gradient`, which `setup.ts` does not mock.

- Banner retry invokes the refresh handler; busy/disabled while refreshing.
- No `numberOfLines` clamps anywhere in the banner.
- Screen-level: partial state keeps position rows visible; "Totals may be incomplete"
  precedes "Portfolio value" (qualified total); stale count names degradation; banner
  retry calls the same `handleRefresh` the `RefreshControl` uses.
- Loading: no `ActivityIndicator`, exactly 3 skeleton rows with loaded geometry
  (21/14/20pt slots ×3), hairline dividers on rows 2–3 but not row 1.
- Authority-denied explanation precedes "Edit group info" in reading order and does not
  appear when offline-only; offline copy likewise does not appear when authority-denied.
- Read-only expansion: radios render with `disabled: true` — values inspectable.
- Reconciliation: lost PATCH response → refetch → "Permission updated" on confirmed
  value, or "Could not update this permission" + revert when the server did not apply.

## Verification

- `npx vitest run src/__tests__/partialStateRecovery.test.tsx` — 11/11 pass.
- Related existing suites: `portfolioPresentation` (4), `portfolioDataLifecycle` (1),
  `groupChatInfoParity` (24), `stateTruthfulnessRepairs` (23), `accessibilityAcceptance`
  (5) — all pass.
- `npx tsc --noEmit` — zero errors in Task G files. NOTE: the run still reports
  pre-existing TS2367 errors in `agentStudioResources.test.tsx` (Task D) and
  `coownFinancialReadability.test.tsx` (Task A) — other in-flight tasks' files,
  untouched here.

## Concerns / handoff

1. `usePortfolioData` does not expose `failedAssetIds`/`holdingsCount`, so missing
   positions can't be counted/named in the banner without a hook change (out of scope).
   Per-position *stale* labeling is already end-to-end (`mark.isStale` → row badge +
   banner count).
2. Native rendering not verified — tests are source/renderer-level only (no device in
   this environment, consistent with the audit's own limitation note).
3. Other parallel tasks' test files currently fail `tsc --noEmit` (TS2367 `node.type`
   comparisons) — orchestrator review item, not caused by this change.

---

## Adversarial-review fixes (round 2)

### Fix 1 — IMPORTANT: failed refresh dropped the partial qualifier

**Defect:** `usePortfolioData.ts` catch branch ran `setIsPartial(false)` while the
previously-fetched `positions`/`summary` were retained on screen. A failed refresh over
partial data therefore removed the "Totals may be incomplete" banner and presented the
same incomplete totals as complete (and now stale) — a direct violation of F23's
"never present a partial total as complete".

**Fix:** removed `setIsPartial(false)` from the catch, with an explanatory comment.
`isPartial` now always describes the retained data: it is set accurately on every
successful fetch (`result.partial ?? false`), cleared alongside `positions`/`summary`
on the viewer-change reset, and — critically — left untouched on failure so a retained
partial dataset keeps its qualifier. A failed initial load (no retained positions)
still lands on `PortfolioErrorScreen` via the `isError && positions.length === 0`
branch, which precedes the partial branch in `PortfolioScreen`.

### Fix 2 — MINOR: dead `introTitle` style

Removed the unused `introTitle` entry from `createStyles` in
`GroupPermissionsScreen.tsx` (leftover after the intro became copy-only).

### New tests (now 13 total, all pass)

- `usePortfolioData` (real hook, mocked service): load partial → `handleRefresh` fails
  → `isPartial` stays `true`, positions retained, error toast fired — qualifier and
  data persist together.
- Control case: load partial → refresh succeeds with complete data → `isPartial`
  clears to `false` and positions replace correctly (qualifier removed only when the
  data is actually replaced).
- Test-harness note: `useBackendData` mock must return a *stable* `listings` array —
  it is a `loadPortfolio` dependency, and a per-render array re-fires the focus-effect
  fetch and silently consumes the mock queue.

### Re-verification

- `npx vitest run src/__tests__/partialStateRecovery.test.tsx` — 13/13 pass.
- `portfolioPresentation` + `portfolioDataLifecycle` + `groupChatInfoParity` +
  `stateTruthfulnessRepairs` + `accessibilityAcceptance` — 57 tests, all pass.
- `npx tsc --noEmit` — zero errors in Task G files (other in-flight tasks' test files
  still report their own pre-existing TS2367 issues, unchanged by this round).

### Files changed this round

- `frontend/src/hooks/portfolio/usePortfolioData.ts` — removed `setIsPartial(false)`
  from the fetch catch branch (ownership extension granted).
- `frontend/src/screens/GroupPermissionsScreen.tsx` — removed dead `introTitle` style.
- `frontend/src/__tests__/partialStateRecovery.test.tsx` — +2 tests, harness extension
  (`useStore.getState`, `useFocusEffect`, `useBackendData`, service + apiClient mocks).
