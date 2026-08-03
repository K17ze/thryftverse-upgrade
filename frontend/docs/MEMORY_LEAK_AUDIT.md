# Frontend Memory Leak Audit — useEffect Cleanup, Timers, Listeners

**Audit date:** 2026-08-03
**Auditor:** Automated (WS28)
**Scope:** All frontend source files in `frontend/src/`

---

## Methodology

Per 2026 August React Native memory leak best practices, the audit searched for:

1. `useEffect` blocks containing `setInterval` / `setTimeout` without a cleanup return
2. `useEffect` blocks containing `addEventListener` / `addListener` without a cleanup return
3. Async operations (`fetch`, API calls) inside `useEffect` that call `setState` after the component unmounts
4. Navigation listeners (`navigation.addListener`) not cleaned up on unmount
5. WebSocket connections not closed on unmount
6. Animated API listeners not removed on unmount

Search commands used:

```
grep -rn "setInterval|setTimeout" frontend/src/
grep -rn "addEventListener|addListener|removeListener" frontend/src/
grep -rn "WebSocket|new WebSocket" frontend/src/
```

---

## Files Scanned

### Flagship screens (highest user traffic)

| File | Timers | Listeners | Async setState | Verdict |
|------|--------|-----------|----------------|---------|
| `screens/HomeScreen.tsx` | setInterval + setTimeout | AppState | mounted flag present | Clean |
| `screens/ChatScreen.tsx` | 3× setTimeout refs | NetInfo + AppState | cancelled flags present | Clean (undoTimerRef already cleared in unmount effect) |
| `screens/CheckoutScreen.tsx` | setTimeout (util) | AppState | isMountedRef present | Clean |
| `screens/LoginScreen.tsx` | none | none | none | Clean |
| `screens/SellScreen.tsx` | none | none (uses useConnectivity hook) | none | Clean |
| `screens/AuctionDetailScreen.tsx` | none | none | isMountedRef present | Clean (isMountedRef already guards all async setState) |
| `screens/ItemDetailScreen.tsx` (ProductDetail) | none | none | cancelled flag present | Clean |
| `screens/SettingsScreen.tsx` | none | none | mounted flag present | Clean |
| `App.tsx` | setTimeout | Linking + Network | mounted/cancelled flags present | Clean |

### Other screens & components

| File | Timers | Listeners | Async setState | Verdict |
|------|--------|-----------|----------------|---------|
| `screens/VisualSearchScreen.tsx` | 2× setTimeout | none | **Fixed** (runSearch + animation) | **Fixed** |
| `screens/InboxScreen.tsx` | none | NetInfo | none | Clean |
| `screens/AuthLandingScreen.tsx` | none | Linking | none | Clean |
| `screens/AddressFormScreen.tsx` | none | navigation.addListener | none | Clean |
| `screens/CreatePosterScreen.tsx` | none | navigation.addListener | none | Clean |
| `screens/CreateLookScreen.tsx` | none | navigation.addListener | none | Clean |
| `screens/PosterViewerScreen.tsx` | setInterval | AppState | none | Clean |
| `screens/OutfitBuilderScreen.tsx` | setTimeout | none | none | Clean |
| `components/Toast.tsx` | setTimeout | none | none | Clean |
| `components/Confetti.tsx` | setTimeout | none | none | Clean |
| `components/BottomSheet.tsx` | none | BackHandler | none | Clean |
| `components/coown/CoOwnPriceTick.tsx` | setTimeout | none | none | Clean |
| `components/discover/HeroCarousel.tsx` | setInterval | none | none | Clean |
| `components/discover/EditorialDiscoveryHero.tsx` | setInterval | none | none | Clean |
| `components/chat/AttachmentReviewSheet.tsx` | setTimeout | none | none | Clean |
| `components/chat/MarketplaceChatCard.tsx` | setInterval | none | none | Clean |
| `components/orders/DispatchCountdown.tsx` | setInterval | none | none | Clean |
| `components/product/FullscreenMediaViewer.tsx` | none | AppState | none | Clean |
| `components/commerce/CommerceMediaStage.tsx` | none | AppState | none | Clean |
| `components/compat/Video.tsx` | none | player.addListener | disposed flag | Clean |
| `components/poster/StickerEditorSheet.tsx` | setTimeout (memoized debounce) | none | none | Clean |
| `platform/native/NativeMenu.tsx` | none | BackHandler | none | Clean |
| `platform/native/NativeSheet.tsx` | none | BackHandler | none | Clean |
| `platform/server/useMobileQueryLifecycle.ts` | none | NetInfo + AppState | none | Clean |
| `hooks/useConnectivity.ts` | none | NetInfo | none | Clean |
| `hooks/useUnreadNotificationCount.ts` | none | AppState | none | Clean |
| `hooks/useReducedMotion.ts` | none | AccessibilityInfo | mounted flag | Clean |
| `hooks/useServerClock.ts` | none | AppState | none | Clean |
| `creator/CreatorCanvas.tsx` | setInterval | none | none | Clean |
| `creator/CreatorAssetPicker.tsx` | 4× setTimeout | none | mountedRef present | Clean |
| `creator/CreatorStudioShell.tsx` | none | window keydown | none | Clean |

### Services / libs (non-component)

| File | Notes |
|------|-------|
| `services/mediaUpload.ts` | `setTimeout` inside a Promise — not a component effect, no leak |
| `services/mediaUploadQueue.ts` | `setTimeout` inside a polling resolver — not a component effect, no leak |
| `lib/backendDiagnostics.ts` | `setTimeout` + `AbortController` — cleaned up after fetch resolves |

### WebSocket

No `WebSocket` or `new WebSocket` usage found anywhere in `frontend/src/`.

---

## Potential Leaks Found

### 1. VisualSearchScreen.tsx — RNAnimated.loop not stopped + async setState after unmount + unguarded setTimeout

**File:** `frontend/src/screens/VisualSearchScreen.tsx`
**Lines:** 69–95 (animation), 227–253 (runSearch), 259 (handleRefresh setTimeout)

Three issues:

**(a) RNAnimated.loop never stopped:** The scanline loading animation used `RNAnimated.loop(...).start()` inside a `useEffect` with **no cleanup return**. When `status` changed away from `'loading'`, the loop was not explicitly stopped — it relied on the next effect run to start a different animation. If the component unmounted while `status === 'loading'`, the loop continued running.

**(b) `runSearch` async setState after unmount:** `runSearch` awaited `visualSearch(payload)` and then called `setResults`, `setVisualMatching`, `setResultNote`, `setStatus` without checking if the component was still mounted.

**(c) `handleRefresh` unguarded setTimeout:** `setTimeout(() => setRefreshing(false), 400)` had no cleanup and no mounted check.

**Severity:** Medium (animation leak + 4 setState calls after unmount).

**Fix applied:**
- Captured the loop reference and returned `() => loop.stop()` as cleanup
- Captured the fade-out animation reference and returned `() => fadeOut.stop()` as cleanup
- Added `isMountedRef` with mount/unmount `useEffect`
- Added `if (!isMountedRef.current) return;` after `await visualSearch(payload)` in `runSearch`
- Guarded `setRefreshing(false)` in `handleRefresh` with `if (isMountedRef.current)`

---

## Fixes Applied — Summary

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| `screens/VisualSearchScreen.tsx` | 69–99 | `RNAnimated.loop` not stopped on cleanup | Captured loop ref, returned `() => loop.stop()` |
| `screens/VisualSearchScreen.tsx` | 89–97 | Fade-out animation not stopped on cleanup | Captured anim ref, returned `() => fadeOut.stop()` |
| `screens/VisualSearchScreen.tsx` | 232 | `runSearch` async setState after unmount | Added `isMountedRef` guard after `await` |
| `screens/VisualSearchScreen.tsx` | 271 | `handleRefresh` setTimeout unguarded | Guarded `setRefreshing` with `if (isMountedRef.current)` |

---

## Files Confirmed Clean (no action needed)

All other files with timers, listeners, or async operations were confirmed to already have proper cleanup:

- **HomeScreen.tsx** — `setInterval` + `AppState` both cleaned up in return; `refreshTimerRef` cleared in cleanup; async `fetchPosterStories` guarded with `mounted` flag
- **ChatScreen.tsx** — all 3 timer refs (`undoTimerRef`, `scrollTimerRef`, `composerPersistTimerRef`) cleared in unmount effect; NetInfo + AppState subscriptions cleaned up; async composer hydration guarded with `cancelled` flag; async partner profile fetch guarded with `active` flag
- **AuctionDetailScreen.tsx** — `isMountedRef` guards all async setState in `fetchDetail` and `fetchRelatedAuctions` after `await`; `setIsTransitionRefreshing` guarded in `.finally()`
- **CheckoutScreen.tsx** — `AppState` subscription cleaned up; async payment status check guarded with `isMountedRef`
- **LoginScreen.tsx** — no timers, listeners, or async effects
- **SellScreen.tsx** — upload queue subscription cleaned up; uses `useConnectivity` hook (already clean)
- **ItemDetailScreen.tsx** — async `getPriceAlertStatus` guarded with `cancelled` flag; analytics handler cleaned up
- **SettingsScreen.tsx** — async `getPushPermissionStatus` guarded with `mounted` flag
- **App.tsx** — all 6 `useEffect` blocks have proper cleanup (timeout, subscription, mounted/cancelled flags)
- **InboxScreen.tsx** — NetInfo subscription cleaned up
- **AuthLandingScreen.tsx** — Linking subscription cleaned up
- **AddressFormScreen.tsx** — navigation listener returns unsubscribe
- **CreatePosterScreen.tsx** — navigation listener returns unsubscribe
- **CreateLookScreen.tsx** — navigation listener returns unsubscribe
- **PosterViewerScreen.tsx** — AppState + setInterval both cleaned up
- **Toast.tsx** — setTimeout cleaned up
- **Confetti.tsx** — setTimeout cleaned up
- **BottomSheet.tsx** — BackHandler cleaned up
- **All hooks** (useConnectivity, useUnreadNotificationCount, useReducedMotion, useServerClock) — all subscriptions cleaned up
- **All platform components** (NativeMenu, NativeSheet, useMobileQueryLifecycle) — all listeners cleaned up
- **All discover/carousel components** (HeroCarousel, EditorialDiscoveryHero) — setInterval cleaned up
- **All countdown components** (DispatchCountdown, MarketplaceChatCard, CoOwnPriceTick) — timers cleaned up
- **CreatorAssetPicker.tsx** — all 4 debounce timers cleaned up; `mountedRef` guards async fetches
- **CreatorCanvas.tsx** — setInterval cleaned up
- **CreatorStudioShell.tsx** — window keydown listener cleaned up
- **Video.tsx** — player.addListener cleaned up with disposed flag
- **StickerEditorSheet.tsx** — memoized debounce (timer cleared on each call)

---

## Recommendations for Preventing Future Leaks

1. **Always return a cleanup function from `useEffect`** when the effect creates:
   - `setInterval` / `setTimeout` → return `() => clearInterval(id)` / `() => clearTimeout(id)`
   - `addEventListener` / `addListener` → return `() => subscription.remove()`
   - `RNAnimated.loop` / `RNAnimated.timing` → return `() => animation.stop()`
   - Subscriptions (NetInfo, AppState, BackHandler, Linking, navigation) → return the unsubscribe function

2. **Guard async setState with an `isMountedRef` or `cancelled` flag:**
   ```ts
   useEffect(() => {
     let cancelled = false;
     fetchData().then((data) => {
       if (!cancelled) setData(data);
     });
     return () => { cancelled = true; };
   }, []);
   ```

3. **For timers stored in refs (debounce/undo patterns), clear them in an unmount effect:**
   ```ts
   useEffect(() => {
     return () => {
       if (timerRef.current) clearTimeout(timerRef.current);
     };
   }, []);
   ```

4. **Prefer `AbortController` for fetch-based effects** when the API supports it — it cancels the network request itself, not just the state update.

5. **No WebSocket connections exist in the codebase today.** If WebSocket support is added in the future, ensure `ws.close()` is called in the effect cleanup.

6. **Consider adding an ESLint rule** `react-hooks/exhaustive-deps` (already enabled) and a custom rule or review checklist that flags any `useEffect` containing `await` without a mounted/cancelled guard.
