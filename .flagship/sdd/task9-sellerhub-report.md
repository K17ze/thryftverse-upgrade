# Task 9 — F10: SellerHub null = loading-or-failure ambiguity — Report

**Status:** DONE
**Date:** 2026 (session)
**Files changed:**
- `frontend/src/screens/SellerHubScreen.tsx` (346 → 392 lines; stays under the 400-line orchestrator cap enforced by `sellerAnalyticsAndHubUpgrade.test.ts`)
- `frontend/src/components/seller/SellerOrdersModule.tsx` (+`ordersFailed` prop)
- `frontend/src/components/seller/SellerListingsModule.tsx` (+`isFailed` prop)
- `frontend/src/components/seller/SellerAnalyticsModule.tsx` (+`isSparklineFailed` prop)

## What changed

### 1. Explicit per-resource lifecycle
Added `type ResourceStatus = 'loading' | 'ready' | 'failed'` (module scope) plus three
status states alongside the existing data states:

- `sellingOrdersStatus` — for `sellingOrders` (orders rail)
- `ownListingsStatus` — for `ownListings` (listings rail)
- `dailyPointsStatus` — for `dailyPoints` (sparkline; `isSparklineLoading` state removed, now derived)

`null` now means only "no payload" (initial, cleared on failure, or pre-fetch); lifecycle lives
in the status fields. The three states are distinguished:

- `'loading'` → fetch in flight (skeleton, and only when `data === null` so pull-to-refresh
  doesn't flash skeletons over existing content)
- `'ready'` → data usable (rail / chart / honest empty states)
- `'failed'` → fetch rejected → inline `SyncRetryBanner` + module failure props suppress
  misleading empty copy ("No orders yet", "Nothing listed yet", "Not enough views yet for a chart")

### 2. `fetchHubResource` helper (never rejects)
New module-level helper drives `status: 'loading'` → fetch → `'ready'` | `'failed'` (+`setData(null)`
and `console.warn` on rejection). `load()` keeps its `Promise.all` shape — the three optional
resources now run through `fetchHubResource`, so rejection is captured per-resource instead of
being collapsed into `null` by a `.catch(() => null)`. The overview and import-batch promises are
unchanged (overview failure still produces the full-screen `FlagshipState` error via `loadError`;
import failures still produce the existing `importError` banner).

### 3. Loading checks fixed
- `isOrdersLoading={sellingOrdersStatus === 'loading' && sellingOrders === null}`
- `isLoading={ownListingsStatus === 'loading' && ownListings === null}`
- `isSparklineLoading={dailyPointsStatus === 'loading' && dailyPoints === null}`

### 4. Inline error + retry
Reused the codebase's canonical inline retry component `SyncRetryBanner`
(`frontend/src/components/SyncRetryBanner.tsx`, already used by HomeFeedHeader/BrowseScreen/
ClosetScreen) rendered immediately above the affected module, styled by new
`styles.resourceErrorBanner` (`marginHorizontal: Space.md, marginTop: Space.lg`). Each banner
carries a `telemetryContext` (`seller_hub_orders` / `seller_hub_views` / `seller_hub_listings`),
which wires into the existing `sync_retry_banner_impression` / `sync_retry_tapped` telemetry.

Messages: "Couldn't load orders." / "Couldn't load store views." / "Couldn't load your listings."

### 5. Retry semantics
Each banner's Retry invokes only its own resource loader (`loadOrders` / `loadOwnListings` /
`loadDailyPoints` — `useCallback`s shared with `load()`). Because `fetchHubResource` sets status
to `'loading'` on entry, the retry path is: banner → skeleton → rail or banner again. Pull-to-
refresh (`onRefresh` → `load()`) resets all three statuses the same way, satisfying the
"refreshAll resets to 'loading' on retry" requirement (there is no literal `refreshAll`; `load()`
is that function). The full-screen `loadError` retry path also flows through `load()`.

## Constraints honored
- No visual layout changes on happy path; failure adds an inline banner only.
- `components/coown/` untouched. No new features; navigation/haptics/analytics preserved.
- `Promise.all` orchestration retained; per-resource rejection now produces `failed`, not `null`.
- Screen remains a lean orchestrator — 392 lines < 400 test cap.

## Verification
- `tsc --noEmit -p tsconfig.json` → exit 0, zero diagnostics (whole project clean; zero hits for
  SellerHub/module files).
- `npx vitest run src/__tests__/sellerAnalyticsAndHubUpgrade.test.ts` → 42/42 pass, including the
  `< 400 lines` assertion and module-content assertions.

## Concerns / notes
- On a refresh where the *overview* fetch rejects while resources succeed, `loadError` is set but
  content still renders (pre-existing behavior; `loadError && !overview` gate). Resource promises
  still settle and resolve their own statuses — no stuck 'loading'.
- On failure during pull-to-refresh, stale data is cleared (`setData(null)`) and replaced by the
  inline banner — per spec ("rejected → status failed, data = null").
- `SyncRetryBanner` shows "Retrying..." only via its `isRetrying` prop; here retry flips status to
  'loading', which swaps banner→skeleton — equivalent feedback without a second flag.
