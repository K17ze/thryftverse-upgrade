# Co-Own Surface-to-System Review — Findings U61–U68

This document records the implementation notes for the eight findings from the
Co-Own surface-to-system review covering shared native quality and engineering
concerns.

---

## U61 — Financial Typography Grammar

**Status: Implemented**

The financial typography grammar is enforced through `CoOwnNumericText.tsx`
and the `Numeric` design tokens:

- **Tabular figures**: `fontVariant: ['tabular-nums']` is applied from the
  `Numeric` style preset and re-asserted after any consumer `style` override so
  a style prop can never accidentally revert to proportional figures.
- **Stable decimal alignment**: `formatValue()` uses
  `minimumFractionDigits` and `maximumFractionDigits` set to the same
  precision, so every value of the same type renders with the same number
  of decimal places.
- **Explicit signs**: the `signed` prop emits `+` for positive and `−`
  (U+2212 true minus) for negative values. Zero has no sign.
- **Readable currency/unit labels**: the `unit` suffix renders after the
  value with a space separator (e.g. `▲ 1,234.56 1ZE`).
- **No digit-driven layout jumps**: tabular-nums ensures every digit
  occupies the same advance width, so values of different magnitudes
  do not cause horizontal jitter on tick.

---

## U62 — Text Scaling Adaptation

**Status: Implemented**

Components that cap text scaling or truncate were reviewed:

- `CoOwnNumericText`: `numberOfLines` and `maxFontSizeMultiplier` are now
  consumer-controlled props. Critical totals should leave
  `maxFontSizeMultiplier` unset so the value wraps to multiple lines
  rather than truncating.
- `CoOwnPriceTick`: price value `numberOfLines` increased from 1 to 2 so
  a long price wraps to a second line at large text sizes. The `valueRow`
  now has `flexWrap: 'wrap'` so the glyph and age label can wrap below
  the price. `maxFontSizeMultiplier` is an optional prop.
- `CoOwnSegmentNav`: tab label `maxFontSizeMultiplier` increased from
  1.2 to 1.3 so navigation labels remain readable at large text sizes.
  The 44pt hit target is preserved by the fixed-height Pressable.

---

## U63 — Control Target Verification

**Status: Implemented**

- **44pt hit areas**: `CoOwnSegmentNav` tab buttons are `height: 44` with
  `flex: 1` — the full envelope is the hit target even though the visual
  text is smaller. `CoOwnCandleChart` range chips have `minWidth: 44,
  minHeight: 44`. The `AssetDetailModals` close button uses
  `Control.hit` (44) width/height for the `sheetCloseTarget`.
- **Modal focus restoration**: `BottomSheet` now accepts an optional
  `triggerRef` prop, passed through to `useModalFocusManagement`. When
  provided, screen reader focus is restored to the trigger element on
  close (WCAG 2.2 §2.4.3). Callers (e.g. `AssetDetailModals`) should pass
  the ref of the button that opened the sheet. The `useModalFocusManagement`
  hook already implements the open→focus-content, close→focus-trigger
  lifecycle; the `triggerRef` prop is the missing wiring.
- **hitSlop verification**: the `AssetDetailModals` close button uses
  `hitSlop={12}` around a 44pt `sheetCloseTarget` — the hit area already
  meets the 44pt minimum without the slop, which provides extra margin.

---

## U64 — Direction Encoding

**Status: Implemented**

Direction is now encoded with BOTH color AND text/sign/glyph in all
three components:

| Component  | Up         | Down        | Flat          |
|------------|------------|-------------|---------------|
| NumericText| green + ▲ + `+` | red + ▼ + `−` | neutral + ▬ + no sign |
| PriceTick  | green + ▲ + `+` | red + ▼ + `−` | neutral + ▬ + no sign |
| CandleChart| green body + ▲ text | red body + ▼ text | neutral body + ▬ text |

Changes:
- `CoOwnNumericText`: flat glyph changed from `−` (U+2212) to `▬`
  (U+25AC) so it cannot be confused with a negative value.
- `CoOwnPriceTick`: flat glyph changed from `−` to `▬`. Accessibility
  label for flat direction changed from "unchanged" to "flat".
- `CoOwnCandleChart`: `candleDirection()` already used `▬` for flat.
  Candle rendering now uses a neutral color (`textMuted`/`borderSubtle`)
  for flat candles instead of treating `c >= o` as up. Volume bars
  follow the same encoding.

---

## U65 — Motion Preservation

**Status: Verified and documented**

`CoOwnSegmentNav` motion behavior:

- **Interruptible tab movement**: Reanimated's `withTiming` is naturally
  interruptible — selecting a new tab mid-animation cancels the previous
  tween and starts from the current shared-value position. No explicit
  `cancel()` or flag is needed.
- **Stable price/selection readout**: the underline is the only animated
  element. Tab labels, badges, and the active/inactive color transition
  are instant — the selection readout stays stable during the glide.
- **Reduced motion**: when `useReducedMotion()` returns true, the
  underline snaps instantly (`underlineTranslateX.value = targetX`) with
  no `withTiming` call.
- **No page-wide animation on refresh**: the segment nav does not
  animate on data refresh. Only the underline responds to tab selection.
  Pull-to-refresh is handled by `RefreshControl` in the parent screen
  and does not trigger any segment-nav animation.

---

## U66 — Freshness Clock

**Status: Implemented (hook + chart); orchestrator deferred**

**Problem**: `AssetDetailScreen.tsx` computes `dataStale` and
`dataStaleAgeLabel` inside a `React.useMemo` that calls `Date.now()`.
Because the memo only re-evaluates when its dependencies change
(`asset`, `dataLoadedAt`, `orderBookStreaming`), the age label freezes
— the user sees "12s ago" that never advances.

**Solution**: a new `useBoundedAgeClock` hook
(`frontend/src/hooks/useBoundedAgeClock.ts`):
- Ticks every 30 seconds to trigger re-renders for age displays.
- Bounded: stops ticking after 24 hours to save battery.
- Foreground revalidation: emits an immediate tick when the app returns
  to the foreground (`AppState` → `'active'`) so the age label is
  correct the moment the user looks at the screen.
- Returns a `tick` number consumed as a dependency by age computations.

**Applied to `CoOwnCandleChart`**: the chart now accepts an optional
`lastTradeTimestampMs` prop. When provided, it computes age locally
using `useBoundedAgeClock` so the age label keeps advancing even if the
parent does not re-render. Falls back to `lastAgeSeconds` when not
provided.

**Separation of last-trade age from book observation time**: the chart's
age clock tracks the last trade execution timestamp. The order book
stream's freshness (`isStreaming`, `hasGap`) is a separate truth managed
by `useCoOwnOrderBookStream`. These are independent: a live streaming
book proves the transport is fresh, while an old last execution in a
quiet market is an honest old fact.

**Deferred (requires editing AssetDetailScreen.tsx)**: the
`dataStale`/`dataStaleAgeLabel` memo in `AssetDetailScreen` still uses
`Date.now()` inside `useMemo`. To fully fix this, the orchestrator should
either:
1. Consume `useBoundedAgeClock` and add the `tick` to the memo's
   dependency array, or
2. Move the age computation into a dedicated `useMarketFreshness` hook
   that encapsulates the bounded clock + staleness logic.

This is documented as a pending item because the orchestrator
(`AssetDetailScreen.tsx`) is out of scope for this pass.

---

## U67 — Native Geometry & Performance Matrix

**Status: Documentation only — no device available**

No physical device was available during this review to measure:

- Actual touch-target geometry at various screen densities
- Animation frame rates (Reanimated shared-value transitions, Skia
  canvas rendering)
- Scroll performance under load (large candle series, order book
  updates)
- Memory footprint of the Skia canvas vs. SVG fallback
- Text rendering at maximum OS text-scale settings

**Pending qualification items**:
1. **Touch target audit on device**: verify that 44pt Pressables
   render at the expected physical size on iPhone SE (small screen)
   and iPad Pro (large screen).
2. **Animation jank test**: record Reanimated underline glide and
   price-tick flash at 120fps to detect dropped frames.
3. **Skia canvas memory**: profile `CoOwnCandleChart` with 90+ candles
   on a low-end Android device.
4. **Large text-scale rendering**: screenshot all Co-Own surfaces at
   iOS "Larger Text" maximum setting to verify no truncation or
   layout collapse.

These should be completed before production sign-off.

---

## U68 — Orchestrator Extraction Plan

**Status: Documentation only — no implementation**

`AssetDetailScreen.tsx` (1156 lines) is a large orchestrator that mixes
server queries, manual fetch state, and stream data. Below is the
analysis and proposed extraction by owner responsibility.

### Current responsibilities managed by AssetDetailScreen

#### 1. Server queries (React Query)
- `useCoOwnAssetQuery(assetId)` — asset metadata, market snapshot,
  candles, rights, risk disclosures
- `useCoOwnHoldingsQuery(currentUser?.id)` — viewer's holdings
- `useInvalidateCoOwnAsset()` — cache invalidation
- `useSellerTrust(asset?.issuerId)` — issuer trust signal

#### 2. Manual fetch state (useState + useEffect)
- `lastDistribution` — most recent distribution (fetchCoOwnDistributions)
- `corporateActions` — latest 3 corporate actions
  (fetchCoOwnAssetCorporateActions)
- `yourOpenOrders` — viewer's open orders for this asset
  (fetchMyCoOwnAssetOrders)
- `relatedAssets` — same-issuer sibling assets (listCoOwnAssets)
- `hasActiveOrders` — derived from yourOpenOrders
- `pendingCancels` — optimistic cancel tracking Set
- `cancellingOrderId` — in-flight cancel tracking

#### 3. Stream data (realtime hook)
- `useCoOwnOrderBookStream(assetId)` — order book snapshot + deltas,
  reconnection, foreground revalidation, gap detection

#### 4. Command recovery
- `handleCancelOrder` — optimistic cancel with rollback on failure
- `handleRefresh` — pull-to-refresh coordinating asset, order book,
  and holdings refetch
- `retryOrderBook` / `retryHoldings` — individual retry callbacks

#### 5. UI state
- `activeTab`, `candleRange`, `showVolume`, `fullscreenIndex`
- Sheet state (`useAssetDetailSheets`)
- Price alert form state (`usePriceAlertForm`)
- `pendingTradeSide` — trade intent carried through education gate
- `refreshKey` — manual refresh trigger
- `dataLoadedAt` — staleness baseline

#### 6. Derived view model
- `dataStale` / `dataStaleAgeLabel` — staleness computation (uses
  `Date.now()` inside `useMemo` — see U66)
- `viewModel` — `buildCoOwnViewModel` from asset + order book +
  viewer units
- `lifecycleState` — offering/secondary/closed derivation
- Position/P&L computation (positionValueGbp, unrealizedPnlGbp, etc.)

### Proposed extraction by owner responsibility

#### A. `useMarketObservation` — market data owner
Owns: order book stream, staleness computation, dominant price
derivation, depth status, spread, reconciliation state.

```
const {
  orderBook, isStreaming, hasGap, hasError,
  dataStale, dataStaleAgeLabel,
  dominantPriceValue, dominantPriceLabel, dominantPriceTimestamp,
  bestBid, bestAsk, spreadGbp, depthStatusLabel,
  reconciliationActive,
  refetch: refetchOrderBook,
} = useMarketObservation(assetId, asset);
```

This hook would consume `useCoOwnOrderBookStream` and
`useBoundedAgeClock` (U66 fix) so staleness keeps aging without a
manual re-render.

#### B. `useViewerPosition` — viewer position/orders owner
Owns: holdings query, open orders fetch, cancel command, P&L
computation, optimistic cancel tracking.

```
const {
  yourHolding, yourUnits,
  yourOpenOrders, yourOpenOrdersLoading, yourOpenOrdersFailed,
  hasActiveOrders,
  cancellingOrderId,
  handleCancelOrder,
  refetch: refetchHoldings,
} = useViewerPosition(assetId, currentUser?.id);
```

This hook would own the `pendingCancels` Set, the
`fetchMyCoOwnAssetOrders` effect, and the `cancelCoOwnOrder` command
with optimistic removal and rollback.

#### C. `useSupportingRecords` — supporting records owner
Owns: distributions, corporate actions, related assets. These are
read-only supporting data with their own loading/error states.

```
const {
  lastDistribution, distributionsLoading, distributionsFailed,
  corporateActions, corporateActionsLoading, corporateActionsFailed,
  relatedAssets, relatedAssetsLoading,
} = useSupportingRecords(assetId, asset?.issuerId);
```

Each sub-fetch could be an individual React Query mutation or a
`useEffect`-backed hook, but they share the same `refreshKey`
dependency for coordinated refresh.

#### D. `useCommandRecovery` — command recovery owner
Owns: pull-to-refresh coordination, retry callbacks, refreshKey
management.

```
const {
  refreshing, handleRefresh,
  refreshKey,
} = useCommandRecovery(assetId, {
  assetQuery, holdingsQuery, refetchOrderBook,
});
```

This hook would own the `refreshKey` state and the
`Promise.allSettled` coordination so every surface refreshes
together.

### Migration approach

1. Extract `useMarketObservation` first — it has the clearest boundary
   (order book stream + staleness) and the U66 freshness fix lives here.
2. Extract `useViewerPosition` second — it owns the most complex
   command (cancel with optimistic rollback).
3. Extract `useSupportingRecords` third — straightforward read-only
   fetches.
4. Extract `useCommandRecovery` last — it coordinates the others.

After extraction, `AssetDetailScreen` becomes a pure orchestrator:
it calls the four hooks, composes the sections, and manages only UI
state (activeTab, sheets, fullscreen). The view-model derivation
(`buildCoOwnViewModel`, lifecycle state, P&L) can move into
`useMarketObservation` or a dedicated `useAssetViewModel` hook.

### Constraint

`AssetDetailScreen.tsx` was not edited in this pass. The extraction
above is the plan for a future refactoring wave.
