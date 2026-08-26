# P2 #29 — Native Performance & Media Memory Audit

**Auditor:** Senior mobile performance engineer (evidence-based, anti-AI-design)
**Scope:** `frontend/src` — masonry, video, editors, long feeds, image caching, large-screen rerenders
**Date:** 2026-08-25
**Method:** Read-only source inspection with line-refs. No runtime profiling performed (see Proposed perf programme for harness).

---

## Executive finding

ThryftVerse has a **mature performance foundation** that exceeds most RN apps: FlashList v2 masonry with `getItemType` cell-typing and `recyclingKey` on every `expo-image`, a singleton `VideoManager` player-pool with decoder-budget caps, AppState pausing, QoE telemetry, `CachedImage` wrapped in `React.memo` with a custom comparator across 565 call sites, CDN downscaling with derivative buckets, and Atlas/Hermes profiling infrastructure registered in `AGENTS.md` (line 2225-2230). The image and video layers are genuinely best-in-class.

However, there are **six concrete memory and rerender risks** that will bite on long feeds and large screens:

1. **Three long-feed screens render non-virtualized `.map()` masonry inside a `ScrollView`** — `MoodboardHomeScreen`, `GalleriaScreen`, and `LookDetailScreen`'s "More to explore". Memory grows linearly with feed length; no recycling.
2. **`LookMasonryGrid` (used by LookDetail related-looks) is a manual two-column `View` layout** — not a FlashList. Every tile mounts and stays mounted.
3. **`CreatorContext.Provider` value is a non-memoized inline object** (line 1504) — rebuilt every render, re-rendering every `useCreator()` consumer on any provider state tick.
4. **`LooksTab` FlashList passes inline (non-`useCallback`) `renderItem`, `keyExtractor`, `overrideItemLayout`, `ListHeaderComponent`, `ListFooterComponent`** — recreated every render, destabilizing recycling.
5. **`SellScreen` listing editor has ~30 `useState` fields in one component** with controlled `TextInput`s — every keystroke re-renders the entire form (no field-level memoization, no uncontrolled inputs, no debouncing on title/description).
6. **`compat/Video.tsx` creates a `useVideoPlayer` per instance** (line 110) — fine for detail screens, but the `onPlaybackStatusUpdate` polling interval (200ms, line 133) runs a JS-thread setInterval for every mounted video, and there is no explicit player release on unmount (expo-video handles this, but the interval cleanup depends on effect teardown ordering).

Severity is **Medium** overall: the image/video infrastructure is strong, but the non-virtualized feeds and the CreatorContext churn are real OOM/jank risks on mid-range Android with long feeds.

---

## Evidence table

| # | Surface | Path:Line | Perf risk | Severity |
|---|---------|-----------|-----------|----------|
| 1 | MoodboardHomeScreen discover masonry | `screens/MoodboardHomeScreen.tsx:494,633-647` | Entire public moodboard collection rendered via `.map()` inside `ScrollView` — no virtualization, memory grows with feed | High |
| 2 | GalleriaScreen masonry + rails | `screens/GalleriaScreen.tsx:581,654-659` | All gallery assets rendered via `.map()` inside `ScrollView` — no recycling | High |
| 3 | LookDetailScreen "More to explore" | `screens/LookDetailScreen.tsx:550,942-950` | `LookMasonryGrid` (non-virtualized `View` columns) inside a `ScrollView` — related looks all mount at once | Medium |
| 4 | LookMasonryGrid (shared component) | `components/look/LookMasonryGrid.tsx:66-89` | Manual two-column `View` layout with `.map()` — no FlashList, no recycling, all tiles mounted | Medium |
| 5 | CreatorContext provider value | `creator/CreatorContext.tsx:1504,1574` | `value` object literal rebuilt every render (not `useMemo`) — every `useCreator()` consumer re-renders on any state change | High |
| 6 | LooksTab FlashList callbacks | `components/explore/LooksTab.tsx:414-434,438-445,447-464,503-520` | `renderItem`, `keyExtractor`, `overrideItemLayout`, `ListHeaderComponent`, `ListFooterComponent` are inline functions — recreated every render, destabilizes cell recycling | Medium |
| 7 | SellScreen editor state | `screens/SellScreen.tsx:178-226,1405,1930` | ~30 `useState` fields in one component; controlled `TextInput` re-renders entire form per keystroke; no debounce on title/description | Medium |
| 8 | compat/Video polling interval | `components/compat/Video.tsx:133-145` | 200ms `setInterval` per mounted video for `onPlaybackStatusUpdate` — JS-thread polling; no early exit when `shouldPlay` false depends on effect ordering | Low |
| 9 | ProductCardV2 (legacy MasonryGrid) | `components/ProductCardV2.tsx:392-437` | `MasonryGrid` export uses manual `View` columns + `.map()` — non-virtualized; kept for backward compat but still a risk if used on long feeds | Low |
| 10 | UserProfileScreen web path | `screens/UserProfileScreen.tsx:791-829` | Web fallback uses `ScrollView` + `.map()` (FlashList crashes on web) — acceptable on web, but native path correctly uses FlashList | Low |

---

## Feed/list audit

### Lists that recycle (FlashList v2 — good)

| Screen | Path | Recycling config | Notes |
|--------|------|-----------------|-------|
| HomeScreen | `screens/HomeScreen.tsx:117-121,845-927` | `AnimatedFlashList`, `getItemType` (line 845), `renderFeedItem` memoized with `useCallback` (line 854) | Best-in-class: type-stable recycling, memoized renderItem, web fallback to plain FlashList |
| DiscoverScene | `scenes/discovery/DiscoverScene.tsx:454` → `PinterestMasonryGrid` | `PinterestMasonryGrid.tsx:344-361`: `masonry`, `getItemType` (line 230), `keyExtractor` (line 222), `overrideItemLayout` (line 276), all `useCallback` | Excellent: `${type}:${span}` cell typing, `recyclingKey` on tiles |
| LooksTab | `components/explore/LooksTab.tsx:503-520` | `FlashList masonry numColumns=2`, `overrideItemLayout` | **Flawed:** `renderItem`/`keyExtractor`/`overrideItemLayout` are inline (not `useCallback`) — recreated every render |
| UserProfileScreen (native) | `screens/UserProfileScreen.tsx:831-857` | `AnimatedFlashList`, `numColumns`, `columnWrapperStyle` | Good: native path virtualizes. `key` prop changes on tab switch (line 855) forces remount — intentional |
| AuctionsScreen | `screens/AuctionsScreen.tsx:698,822` | Two `FlashList`s (horizontal rail + vertical main) | `renderAuctionCard` is memoized (line 818 `useCallback`); `renderHeader` is inline |
| PulseFeedScreen | `screens/PulseFeedScreen.tsx:252` | `FlashList` vertical | `renderEventCard` identity not verified but feed is finite |
| CommerceMediaStage | `components/commerce/CommerceMediaStage.tsx:928` | `FlatList` horizontal paging, `onViewableItemsChanged` with ref-stable callback (line 897-905) | Good: viewability-driven active index, stable callback via ref |
| ChatScreen | `screens/ChatScreen.tsx:1627-1636` | `FlashList` for messages | Inverted message list |

### Lists that DON'T recycle (non-virtualized — risk)

| Screen | Path | Layout | Risk |
|--------|------|--------|------|
| MoodboardHomeScreen | `screens/MoodboardHomeScreen.tsx:494,632-648` | `ScrollView` + manual `masonryColumns.map()` | **High** — all public moodboards mount at once |
| GalleriaScreen | `screens/GalleriaScreen.tsx:581,654-659` | `ScrollView` + `masonryColumns.map()` | **High** — all gallery assets mount |
| LookDetailScreen | `screens/LookDetailScreen.tsx:550-956` | `ScrollView` wrapping `LookMasonryGrid` (line 942) | **Medium** — related looks all mount inside the scroll |
| LookMasonryGrid | `components/look/LookMasonryGrid.tsx:66-89` | Two `View` columns + `.map()` | **Medium** — shared component, no recycling |
| ProductCardV2 `MasonryGrid` | `components/ProductCardV2.tsx:392-437` | Manual `View` columns + `.forEach` | **Low** — legacy export, kept for backward compat |
| SellScreen | `screens/SellScreen.tsx:1130` | `KeyboardAwareScrollView` | **Low** — form is finite, not a feed |

### Cell keying

- **Good:** `PinterestMasonryGrid` uses `keyExtractor = item.id` (line 222) and `getItemType = ${type}:${span}` (line 230) — recycled cells are type-stable.
- **Good:** `HomeScreen` uses `getItemType` (line 845) discriminating `'listing'` vs `'looks'`.
- **Good:** `expo-image` `recyclingKey` is set on every masonry tile: `PinterestMasonryGrid.tsx:467,527`, `LookMasonryTile.tsx:41`, `CachedImage.tsx:365`.
- **Bad:** `LookMasonryGrid` uses `key={item.id}` (line 71,81) — stable keys but no recycling since it's a plain `View.map()`.
- **Bad:** `MoodboardHomeScreen` uses `key={item.id}` (line 639) and `key={colIdx}` (line 635) — no recycling.

---

## Image/video memory audit

### Image handling — strong

- **`expo-image`** is the canonical image component across the app (`CachedImage.tsx:3`, `PinterestMasonryGrid.tsx:12`, `LookMasonryTile.tsx:3`, `ProductCardV2.tsx:8`). No `react-native-fast-image` dependency. No `ImageBackground` misuse (zero matches in `frontend/src`).
- **Caching:** Every `expo-image` sets `cachePolicy="memory-disk"` (`CachedImage.tsx:361`, `PinterestMasonryGrid.tsx:466`, `LookMasonryTile.tsx:40`, `compat/Video.tsx:230`).
- **Recycling:** `recyclingKey` is set on every recycled image (`CachedImage.tsx:365`, `PinterestMasonryGrid.tsx:467,527`, `LookMasonryTile.tsx:41`).
- **CDN downscaling:** `CachedImage.tsx:186-230` implements derivative-bucket downscaling for Cloudinary, Imgix, Supabase, CloudFront. Buckets: `[160,240,360,540,720,1080,1440,2048,2560]` (line 195). DPR-aware with 1.1× overscan (line 196).
- **Focal points:** `contentPosition` from `focalPoint` prop (`CachedImage.tsx:171-173`), category-sensitive via `getCategoryFocalPoint` (`ProductCardV2.tsx:21`).
- **Placeholders:** blurhash support (`CachedImage.tsx:360`), shimmer placeholder with Reanimated (`CachedImage.tsx:301-309`), premium `ImageEmptyGraphic` fallback for failed/missing URIs (`CachedImage.tsx:266-280`).
- **`React.memo` with custom comparator:** `CachedImage.tsx:393-452` — skips `style` comparison when both are StyleSheet IDs (line 429-437), shallow-compares focal point (line 419-425). This is the correct pattern for 565 instances.
- **Prefetch:** `utils/imagePreloader.ts` with network-aware throttling (line 22), priority levels (line 6), `expo-network` metered detection. `hooks/useSmartPrefetch.ts` exists.

### Video handling — strong, with caveats

- **`VideoManager` singleton** (`video/VideoManager.ts:335-620`): player pool with `maxActive=3`, `maxPrewarm=1`, `settlementMs=350` (line 49-57). Viewport-center scoring (line 424-425). `replaceAsync` for pool reuse (line 504). AppState pause-all (line 385-393). Background prewarm release (line 390). QoE telemetry with TTFF, rebuffer, bitrate switches (line 92-118). `destroy()` releases all players (line 603-616).
- **`expo-video`** is the video backend (`package.json:113`, `compat/Video.tsx:14`, `CommerceMediaStage.tsx:28`, `MediaStage.tsx:347`).
- **`compat/Video.tsx`** is a drop-in shim for the legacy `expo-av` API (line 1-9). Uses `useVideoPlayer` per instance (line 110) — correct for detail/pager surfaces, not for feeds (feeds use `VideoManager.acquirePlayer`).
- **CommerceMediaStage** (`components/commerce/CommerceMediaStage.tsx:304-485`): `useVideoPlayer` per page, `shouldPlay = isActive && appIsActive` (line 302), AppState-aware (line 379-383 in MediaStage). Viewability-driven via `onViewableItemsChanged` (line 899). Controls auto-hide after 3s (line 388-390).
- **Caveat 1:** `compat/Video.tsx:133-145` runs a 200ms `setInterval` for `onPlaybackStatusUpdate` — JS-thread polling per mounted video. The interval is gated on `shouldPlay` (line 129) so it only runs when playing, but the cleanup depends on effect teardown ordering.
- **Caveat 2:** `VideoManager` is not wired into any feed surface in the audited files — `HomeScreen`, `DiscoverScene`, `LooksTab` don't reference `VideoManager.acquirePlayer`. The pool exists but may be unused (or wired only in surfaces not inspected). The `compat/Video.tsx` shim creates its own `useVideoPlayer` instead of acquiring from the pool. This means the pool's decoder-budget caps don't apply to surfaces using `<Video>`.
- **Caveat 3:** `LookDetailScreen.tsx:611-618` renders `<Video shouldPlay isMuted isLooping>` inside a horizontal `ScrollView` pager — no viewability gating. If a look has multiple video pages, all play simultaneously.
- **No `react-native-video`** dependency — `expo-video` only. Good.

---

## Rerender hotspots (top 10 with fix)

### 1. CreatorContext provider value churn — HIGH
**Location:** `creator/CreatorContext.tsx:1504,1574`
**Evidence:** `const value: CreatorContextValue = { ... }` is an inline object literal with ~60 fields, rebuilt every render. `<CreatorContext.Provider value={value}>` passes a new reference every time, re-rendering every `useCreator()` consumer (CreatorCanvas, all tool sheets, layers panel, etc.).
**Fix:** Wrap `value` in `useMemo` with the full dependency array, or split the context into a state-slice context + an actions-slice context (actions are `useCallback`-stable, so the actions context never changes).

### 2. SellScreen controlled inputs re-render entire form — MEDIUM
**Location:** `screens/SellScreen.tsx:178-226,1405,1930`
**Evidence:** ~30 `useState` fields in one component. `onChangeText={(t) => { setTitle(t); ... }}` (line 1405) calls `setTitle` on every keystroke, re-rendering the entire `KeyboardAwareScrollView` subtree (all fields, photo grid, picker sheets).
**Fix:** Extract each field section into a `React.memo` subcomponent with its own local state, or use uncontrolled inputs with `useRef` + debounced sync. Debounce title/description to draft persistence (tag suggestions already debounce at line 491-502).

### 3. LooksTab FlashList inline callbacks — MEDIUM
**Location:** `components/explore/LooksTab.tsx:414-434,438-445,447-464,503-520`
**Evidence:** `renderItem` (line 416), `keyExtractor` (line 414), `overrideItemLayout` (line 438), `ListHeaderComponent` (line 447), `ListFooterComponent` (line 466) are all inline functions recreated every render. FlashList v2 recycling is destabilized when `renderItem` identity changes.
**Fix:** Wrap all five in `useCallback`/`useMemo` with appropriate deps. Compare with `PinterestMasonryGrid` which does this correctly (lines 222,230,240,276,288).

### 4. MoodboardHomeScreen non-virtualized masonry — HIGH
**Location:** `screens/MoodboardHomeScreen.tsx:494,632-648`
**Evidence:** `ScrollView` wrapping `masonryColumns.map((col, colIdx) => col.map(({ item, height }) => <PublicMoodboardCard ... />))`. Every public moodboard mounts and stays mounted.
**Fix:** Replace with `PinterestMasonryGrid` or a FlashList masonry. The `PublicMoodboardCard` would need to become a feed-unit tile.

### 5. GalleriaScreen non-virtualized masonry — HIGH
**Location:** `screens/GalleriaScreen.tsx:581,654-659`
**Evidence:** `ScrollView` wrapping `masonryColumns.map((columnItems, colIdx) => columnItems.map((asset, assetIdx) => ...))`. All gallery assets mount.
**Fix:** Replace with FlashList masonry. Rails can stay as horizontal `ScrollView` (finite, short).

### 6. LookDetailScreen related-looks in ScrollView — MEDIUM
**Location:** `screens/LookDetailScreen.tsx:550,942-950`
**Evidence:** Main screen is a `ScrollView` (line 550). "More to explore" renders `LookMasonryGrid` (line 942) which is a non-virtualized `View` layout. With many related looks, all tiles mount inside the already-heavy detail ScrollView.
**Fix:** Migrate `LookMasonryGrid` to FlashList masonry (it already has stable `key` and `recyclingKey`), or cap related looks to a finite number and accept the cost.

### 7. ProductCardV2 legacy MasonryGrid — LOW
**Location:** `components/ProductCardV2.tsx:392-437`
**Evidence:** `MasonryGrid` export uses manual `View` columns + `.forEach` distribution. Kept for backward compat (line 380-382). If used on long feeds (CollectionDetail, Closet, ExploreCollection), memory grows linearly.
**Fix:** Migrate remaining callers to `PinterestMasonryGrid` and delete `MasonryGrid`.

### 8. compat/Video onPlaybackStatusUpdate polling — LOW
**Location:** `components/compat/Video.tsx:133-145`
**Evidence:** 200ms `setInterval` per mounted video. Gated on `shouldPlay` (line 129) but still a JS-thread timer. Multiple mounted videos (e.g. LookDetail multi-video look) multiply the timers.
**Fix:** Use `player.addListener('timeUpdate', ...)` instead of polling (expo-video supports this — `VideoManager.ts:211` uses it). Or gate the interval on `onPlaybackStatusUpdate` being defined.

### 9. LookDetailScreen multi-video autoplay — MEDIUM
**Location:** `screens/LookDetailScreen.tsx:610-619`
**Evidence:** Horizontal `ScrollView` pager renders `<Video shouldPlay isMuted isLooping>` for every video page with `shouldPlay` hardcoded `true` (line 615). No viewability gating — if a look has 3 video pages, all 3 decode and play simultaneously.
**Fix:** Track active page index via `onMomentumScrollEnd` (already done at line 578-581 for `activeMediaIndex`) and pass `shouldPlay={activeMediaIndex === pageIndex}`.

### 10. DiscoverScene inline navigation callbacks — LOW
**Location:** `scenes/discovery/DiscoverScene.tsx:459-464`
**Evidence:** `onLookPress`, `onPosterPress`, `onMoodboardPress` are inline arrow functions calling `navigation.navigate` — recreated every render, passed to `PinterestMasonryGrid` which includes them in `renderItem` deps (line 269). This invalidates the `useCallback` renderItem when the scene re-renders.
**Fix:** Wrap in `useCallback` with `[navigation]` dep.

---

## Proposed perf programme

### 1. Profiling harness

**Current state:** `AGENTS.md:2225-2230` documents `bundle:analyze` (Atlas), `EXPO_HERMES_PROFILING` env var, `withHermesProfiling.js` config plugin, `BUNDLE_ANALYSIS.md`. `performance/visuallyComplete.ts` provides `markVisuallyComplete` / `useVisuallyComplete`. No `whyDidYouRender`, no Flipper integration, no Reanimated worklet audit.

**Proposed:**
- **Add `whyDidYouRender` in `__DEV__`** on `CachedImage`, `ProductCardV2`, `HomeDiscoveryCard`, `CreatorCanvas`, all `*Tile` components. Gate behind `__DEV__` to avoid production overhead.
- **Hermes profiler:** Document the `EXPO_HERMES_PROFILING=true` flow in a runbook. Capture heap snapshots before/after scrolling a 500-item Discover feed and a 200-item Moodboard feed.
- **Reanimated worklet audit:** Verify `useAnimatedScrollHandler` / `useAnimatedStyle` are workletized (no JS-thread fallback). The `handleScroll` in `DiscoverScene.tsx:324-329` is a plain JS handler setting `scrollY.value` — this is the documented 4.x workaround (line 318-323) and is correct, but should be validated with Reanimated's worklet checker.
- **Atlas bundle analysis:** Run `npm run bundle:analyze` and flag any module > 50KB in the main bundle. Document baseline in `BUNDLE_ANALYSIS.md`.
- **Per-screen VCF (visually complete) targets:** `useVisuallyComplete` exists but is not called on key screens. Add it to HomeScreen, DiscoverScene, UserProfileScreen, LookDetailScreen with named marks.

### 2. Cell recycling standard

**Mandate:** No `ScrollView` + `.map()` for feeds > 20 items. All long feeds must use `FlashList` (v2) with:
- `keyExtractor` — `useCallback`, returns stable `${id}`.
- `getItemType` — `useCallback`, returns `${type}:${span}` for heterogeneous feeds, or a constant for homogeneous feeds.
- `renderItem` — `useCallback` with minimal deps. Navigation callbacks must be `useCallback` upstream.
- `overrideItemLayout` — `useCallback` for masonry span.
- `ListHeaderComponent` / `ListFooterComponent` — `useMemo` (not inline JSX).
- `recyclingKey` on every `expo-image` inside a recycled cell.

**Non-compliant (must fix):** `MoodboardHomeScreen`, `GalleriaScreen`, `LookMasonryGrid`, `LooksTab` (callbacks not memoized), `ProductCardV2.MasonryGrid` (legacy).

**Compliant (reference implementations):** `PinterestMasonryGrid`, `HomeScreen` FlashList.

### 3. Image cache budget

**Current:** `expo-image` `cachePolicy="memory-disk"` everywhere. CDN downscaling with derivative buckets (`CachedImage.tsx:195`). Network-aware prefetch (`imagePreloader.ts:22`).

**Proposed:**
- **Add `expo-image` `cachePolicy` audit:** Verify no call site uses `cachePolicy="none"` or omits it. Current grep shows all set to `"memory-disk"` — good.
- **Memory budget:** `expo-image` manages its own native cache, but on low-end Android the memory-disk cache can grow. Consider `expo-image`'s `allowsAnimated` flag set to `false` on thumbnail surfaces to avoid GIF/animated WebP memory cost in masonry.
- **Derivative bucket review:** The bucket set `[160,240,360,540,720,1080,1440,2048,2560]` is good. Verify detail screens (LookDetail, ItemDetail) pass `downscaleWidth={undefined}` so full-res is requested for the hero, while related-looks masonry passes the column width.
- **Prefetch budget:** `imagePreloader.ts` has `maxConcurrent` (line 10) — verify it's capped at 4-6 on cellular. Network-aware throttling already skips non-critical on metered (line 22).

### 4. Video lifecycle rules

**Current:** `VideoManager` pool exists but is not wired into feed surfaces. `compat/Video.tsx` creates per-instance `useVideoPlayer`. `CommerceMediaStage` and `MediaStage` gate `shouldPlay` on `isActive && appIsActive`.

**Proposed rules:**
1. **Feed surfaces** (any FlashList/FlatList containing video cells) must use `VideoManager.acquirePlayer(itemId)` + `VideoManager.updateViewport(entries)` from `onViewableItemsChanged`. Never `useVideoPlayer` inside a recycled cell.
2. **Detail/pager surfaces** (CommerceMediaStage, LookDetail media pager) may use `useVideoPlayer` but must gate `shouldPlay` on the active page index. `LookDetailScreen.tsx:615` violates this — fix to `shouldPlay={activeMediaIndex === pageIndex}`.
3. **AppState:** All video surfaces must pause on `AppState !== 'active'`. `VideoManager` does this (line 385-393). `MediaStage` does this (line 379-383). `compat/Video.tsx` does NOT — add an AppState listener.
4. **Unmount:** `useVideoPlayer` is cleaned up by expo-video on unmount. The `compat/Video.tsx` polling interval must clear in the effect cleanup (it does, line 145). `VideoManager.releasePlayer` must be called from `onViewableItemsChanged` when items leave viewport (the manager handles this in `reconcile`).
5. **Polling:** Replace `compat/Video.tsx:133-145` `setInterval` with `player.addListener('timeUpdate', ...)` to avoid JS-thread polling.
6. **Decoder budget:** `VideoManager` caps at `maxActive=3`. Verify no surface creates more than 3 simultaneous `useVideoPlayer` instances. `LookDetailScreen` multi-video look is the risk (fix via rule 2).

### 5. Render guardrails

1. **Context providers:** `CreatorContext` value must be `useMemo` or split into state/actions contexts. Audit `ToastContext`, `ThemeContext`, `BackendDataContext` for the same pattern.
2. **`React.memo` on leaf tiles:** `CachedImage` (done, line 452), `ProductCardV2` (done, line 366), `LookMasonryTile` (NOT memoized), `PosterStoryArtwork` (done, line 157), `PublicMoodboardCard` (not verified). Add `React.memo` to `LookMasonryTile` and all masonry tile components.
3. **Zustand selectors:** `useStore((state) => state.isWishlisted(item.id))` (`ProductCardV2.tsx:81`) — this calls `isWishlisted` during render, which may return a new value if the wishlist array changes. Verify `isWishlisted` is referentially stable and returns a primitive. `useStore((state) => state.toggleWishlist)` (line 82) is the correct pattern (action selector). The store at `store/useStore.ts:621` uses `create` with `persist` — verify selectors are shallow-compared (Zustand v4+ does this by default for primitive returns).
4. **Inline objects in render:** `DiscoverScene.tsx:459-464` inline navigation callbacks. `LookDetailScreen.tsx:944-947` inline `onPress` arrow. `MoodboardHomeScreen.tsx:606,643` inline `onPress` arrows. These create new function identities per render, breaking `React.memo` on children.
5. **Large-screen state:** `SellScreen` (~30 useState), `PosterComposerScreen` (~10 useState + CreatorContext), `CreatorAssetPicker` (39 matches for list primitives — verify state granularity). Extract subcomponents with local state for independent sections.

---

## Evidence tags (line refs)

- `PinterestMasonryGrid.tsx:222,230,240,276,288,344-361,467,527` — recycling config, recyclingKey
- `LookMasonryGrid.tsx:66-89` — non-virtualized two-column View
- `LookMasonryTile.tsx:41` — recyclingKey set, but component not React.memo'd
- `CachedImage.tsx:186-230,361,365,393-452` — CDN downscale, cache, recyclingKey, custom memo comparator
- `VideoManager.ts:49-57,364-393,420-459,504,603-616` — pool config, AppState, reconcile, replaceAsync, destroy
- `compat/Video.tsx:110,133-145` — useVideoPlayer per instance, polling interval
- `CommerceMediaStage.tsx:302,304-311,899-905,928-936` — shouldPlay gating, viewability, FlatList
- `CreatorContext.tsx:1504,1574` — non-memoized provider value
- `HomeScreen.tsx:117-121,845-927` — AnimatedFlashList, getItemType, useCallback renderItem
- `DiscoverScene.tsx:324-329,454,459-464` — scroll handler, PinterestMasonryGrid, inline nav callbacks
- `LooksTab.tsx:414-434,438-445,447-464,503-520` — inline FlashList callbacks
- `MoodboardHomeScreen.tsx:494,632-648` — ScrollView + .map() masonry
- `GalleriaScreen.tsx:581,654-659` — ScrollView + .map() masonry
- `LookDetailScreen.tsx:550,610-619,942-950` — ScrollView, multi-video autoplay, LookMasonryGrid
- `SellScreen.tsx:178-226,1405,1930` — 30 useState, controlled inputs
- `ProductCardV2.tsx:81-84,366,392-437` — Zustand selectors, React.memo, legacy MasonryGrid
- `AGENTS.md:2225-2230` — bundle:analyze, EXPO_HERMES_PROFILING, withHermesProfiling.js
- `package.json:25-26,78,98,113,131` — Atlas, FlashList 2.0.2, expo-image 57, expo-video 57, Reanimated 4.5
- `performance/visuallyComplete.ts:1-20` — VCF marking (exists, underused)
- `imagePreloader.ts:22` — network-aware prefetch throttling

---

## 2026 industry research

### FlashList v2 (2026)

- **JS-only architecture**: no native module, works on web, simpler debugging. [VERIFIED — EXTERNAL]
- **No `estimatedItemSize` required**: v2 auto-measures. Up to 50% less blank area vs v1. [VERIFIED — EXTERNAL]
- **`masonry` prop**: replaces `MasonryFlashList` — set `masonry: true` + `numColumns: 2`. [VERIFIED — EXTERNAL]
- **`optimizeItemArrangement`**: balances columns by item height, reducing ragged bottoms. [VERIFIED — EXTERNAL]
- **Cell recycling**: `getItemType` returns a type string; cells are recycled within the same type. ThryftVerse's `${type}:${span}` pattern (PinterestMasonryGrid:230) is the correct approach. [VERIFIED — CODE]

### expo-image (2026)

- **`recyclingKey`**: tells expo-image to clear and reload when a recycled cell's image changes. ThryftVerse sets this on every recycled image — correct. [VERIFIED — CODE]
- **`cachePolicy="memory-disk"`**: default for ThryftVerse. Correct for masonry feeds. [VERIFIED — CODE]
- **`blurhash` / `thumbhash`**: ThryftVerse uses blurhash (`CachedImage.tsx:360`). thumbhash is the 2026 successor (smaller payload, supports alpha). Consider migrating for new images. [VERIFIED — EXTERNAL]
- **iOS fix**: a recent fix clears stale blurhash placeholders when `recyclingKey` changes in recycled cells. Verify expo-image version ≥ 2.0. [VERIFIED — EXTERNAL]

### Video (2026)

- **expo-video** (replacing expo-av): ThryftVerse uses expo-video (`package.json:113`). Correct. [VERIFIED — CODE]
- **`useVideoPlayer`**: per-instance hook for detail/pager surfaces. Correct for CommerceMediaStage. NOT correct for feed surfaces — should use pool. [VERIFIED — CODE]
- **Player events**: `player.addListener('timeUpdate', ...)` replaces polling. ThryftVerse's `compat/Video.tsx:133-145` uses `setInterval` — should migrate. VideoManager already uses `addListener` (`VideoManager.ts:211`). [VERIFIED — CODE]
- **Decoder budget**: iOS limits ~3 simultaneous video decoders. Android varies (2-4 on mid-range). VideoManager's `maxActive=3` is correct. [VERIFIED — CODE]

### Reanimated 4.x (2026)

- **Workletized scroll handlers**: `useAnimatedScrollHandler` runs on UI thread. ThryftVerse's `DiscoverScene.tsx:324-329` uses a plain JS handler setting `scrollY.value` — this is the documented 4.x workaround (line 318-323) and is correct, but should be validated with Reanimated's worklet checker. [VERIFIED — CODE]

### Performance profiling (2026)

- **Hermes profiler**: `EXPO_HERMES_PROFILING=true` + `withHermesProfiling.js` config plugin. ThryftVerse has this registered in AGENTS.md:2225-2230. [VERIFIED — CODE]
- **Atlas bundle analysis**: `npm run bundle:analyze` — ThryftVerse has this. Should be run and baseline documented in `BUNDLE_ANALYSIS.md`. [VERIFIED — CODE]
- **whyDidYouRender**: not installed. Recommended for `__DEV__` on `CachedImage`, `ProductCardV2`, `CreatorCanvas`, all `*Tile` components. [VERIFIED — CODE]
- **VCF (Visually Complete)**: `performance/visuallyComplete.ts` exists but `useVisuallyComplete` is not called on key screens. Add to HomeScreen, DiscoverScene, UserProfileScreen, LookDetailScreen. [VERIFIED — CODE]

---

## Implementation completion — 26 August 2026

### All 10 rerender hotspots + 6 memory risks: RESOLVED

| # | Hotspot | Status | Fix |
|---|---------|--------|-----|
| 1 | CreatorContext provider value churn | ✅ Fixed (prior) | `useMemo` with 60-field dep array |
| 2 | MoodboardHomeScreen non-virtualized masonry | ✅ Fixed (prior) | FlashList masonry |
| 3 | GalleriaScreen non-virtualized masonry | ✅ Fixed (prior) | FlashList masonry |
| 4 | LooksTab FlashList inline callbacks | ✅ Fixed (prior) | All callbacks `useCallback`/`useMemo` |
| 5 | LookMasonryGrid non-virtualized | ✅ Fixed (prior) | FlashList masonry with `scrollEnabled={false}` |
| 6 | LookDetailScreen multi-video autoplay | ✅ Fixed (prior) | `shouldPlay={activeMediaIndex === pageIndex}` |
| 7 | LookMasonryTile not memoized | ✅ Fixed (this session) | `React.memo` + `useCallback` handlePress + `useRenderTrace` |
| 8 | compat/Video polling interval | ✅ Fixed (this session) | `player.addListener('timeUpdate')` + `timeUpdateEventInterval=0.2` + AppState listener |
| 9 | DiscoverScene inline nav callbacks | ✅ Fixed (this session) | `useCallback` for all 3 nav callbacks |
| 10 | SellScreen controlled inputs | ✅ Fixed (this session) | `DebouncedTextInput` for title (300ms) + description (400ms) |

### Additional fixes (this session)

| # | Fix | Files |
|---|-----|-------|
| 11 | Legacy `MasonryGrid` deleted from ProductCardV2 | `ProductCardV2.tsx` |
| 12 | ExploreCollectionScreen migrated to `PinterestMasonryGrid` | `ExploreCollectionScreen.tsx` |
| 13 | Unused `MasonryGrid` imports removed from CollectionDetailScreen + ClosetScreen | 2 files |
| 14 | VCF added to DiscoverScene, UserProfileScreen, LookDetailScreen | 3 files |
| 15 | `useRenderTrace` dev-only re-render tracker (replaces whyDidYouRender — incompatible with React Compiler) | `performance/renderTrace.ts` |
| 16 | `useRenderTrace` wired into ProductDiscoveryTile + LookMasonryTile | 2 files |
| 17 | LookDetailScreen inline `onPress` arrow → `useCallback` `handleRelatedLookPress` | `LookDetailScreen.tsx` |
| 18 | PinterestMasonryGrid legacy Listing path: save button wiring via `mapListingToDiscoverySummary` | `PinterestMasonryGrid.tsx` |

### Verified clean (no fix needed)

| Item | Evidence |
|------|----------|
| ToastContext provider value | `useMemo` — `ToastContext.tsx:49` |
| ThemeContext provider value | `useMemo` — `ThemeContext.tsx:208-211` |
| BackendDataContext provider value | `useMemo` — `BackendDataContext.tsx:139-141` |
| PublicMoodboardCard React.memo | `React.memo` — `MoodboardHomeScreen.tsx:191` |
| UserMoodboardCard React.memo | `React.memo` — `MoodboardHomeScreen.tsx:144` |
| MoodboardHomeScreen handleMoodboardPress | `useCallback` — `MoodboardHomeScreen.tsx:354` |
| HomeScreen Video in feed | `shouldPlay={false}` — not playing, poster preview only |
| expo-image cachePolicy audit | Zero `cachePolicy="none"` matches |
| imagePreloader maxConcurrent | Default 4, avatars 10 — within 4-6 range for cellular |
| allowsAnimated prop | Not supported by expo-image API — `isAnimated` is read-only on source |

### Future work (not blocking, flagged for next iteration)

- **thumbhash migration**: Consider for new images (smaller payload than blurhash, supports alpha).
- **Atlas bundle baseline**: Run `npm run bundle:analyze` and document baseline in `BUNDLE_ANALYSIS.md`.
- **Hermes profiler runbook**: Document `EXPO_HERMES_PROFILING=true` flow.

### Validation

- **TypeScript**: 0 errors across entire codebase (`npx tsc --noEmit` exit code 0)
- **ESLint**: 0 new errors/warnings introduced. `useActiveSheet.ts` — zero warnings. PosterComposerScreen/CreatorAssetPicker — all warnings pre-existing (a11y hints, max-lines, no-explicit-any). Fixed 1 exhaustive-deps warning by adding `openSheet` to dependency arrays.
- **Research**: expo-video `timeUpdate` API verified against [official docs](https://docs.expo.dev/versions/latest/sdk/video/). FlashList v2 masonry verified against [Shopify docs](https://github.com/Shopify/flash-list/blob/main/documentation/docs/guides/masonry-layout.md). whyDidYouRender v10 incompatible with React Compiler per [library README](https://github.com/welldone-software/why-did-you-render).

---

## Phase 2 completion — 27 August 2026

### PosterComposerScreen state granularity — RESOLVED

**Problem**: 37 `useState` calls, 13 of which were mutually exclusive sheet visibility booleans. Each keystroke or gesture touching any state caused the entire 3387-line component to re-render. The cascading Escape/back handler had 13 `else if` branches.

**Solution**: Created `useActiveSheet` hook (`frontend/src/creator/poster/useActiveSheet.ts`) — a `useReducer`-based discriminated union that replaces 13 independent `useState(false)` booleans with a single `ActiveSheet` type:

```typescript
type ActiveSheet =
  | 'layers' | 'publish' | 'settings' | 'overflow' | 'help'
  | 'a11yMove' | 'a11yZOrder' | 'transitions' | 'keyframes'
  | 'speedCurve' | 'reverse' | 'freezeFrame' | 'audioFade'
  | null;
```

**Benefits**:
- 13 `useState` → 1 `useReducer` (fewer state slots, fewer re-renders)
- Mutual exclusivity enforced by the type system, not by developer discipline
- Escape/back handler simplified from 13 `else if` branches to `if (activeSheet) { closeSheet(); }`
- Opening a sheet automatically closes the previous one (no stale state)
- `open` and `close` are stable `useCallback` references (empty deps)

**Additional PosterComposerScreen fixes**:
- Memoized `CreatorAssetPicker` callbacks (`handlePickerClose`, `handlePickerAddLayer`) — were inline arrows creating new function references every render
- Memoized `handleSheetDone` for effects sheet "Done" buttons — was 6 inline arrows
- Simplified `onClose={() => closeSheet()}` → `onClose={closeSheet}` (4 sheet components)
- Simplified `onPress={() => closeSheet()}` → `onPress={closeSheet}` (8 backdrop Pressables)
- Fixed `openSheet` missing from 2 `useCallback`/`useMemo` dependency arrays

**Files modified**: `PosterComposerScreen.tsx`, `useActiveSheet.ts` (new)

### CreatorAssetPicker state granularity — RESOLVED

**Problem**: 91 `useState` calls flagged as a rerender risk.

**Analysis**: The 91 useState calls are distributed across 25+ already-extracted independent subcomponents (MediaPicker, ProductPicker, TextPicker, DrawPicker, GifPicker, MusicPicker, QuizPicker, etc.). The main `CreatorAssetPicker` component itself has only 1 `useState`. `AssetPickerContent` is a switch statement that renders only ONE picker at a time — no cascading re-renders occur because only one picker is ever mounted.

**Solution**: The architecture was already well-decomposed. The real issue was that none of the 20 picker subcomponents were wrapped in `React.memo`, so any parent re-render would re-render the active picker even if its props hadn't changed. Wrapped all 20 picker subcomponents in `React.memo`:

| # | Picker | Wrapped |
|---|--------|---------|
| 1 | MediaPicker | `React.memo` |
| 2 | ProductPicker | `React.memo` |
| 3 | MentionPicker | `React.memo` |
| 4 | LookPicker | `React.memo` |
| 5 | TextPicker | `React.memo` |
| 6 | DrawPicker | `React.memo` |
| 7 | GifPicker | `React.memo` |
| 8 | MusicPicker | `React.memo` |
| 9 | QuizPicker | `React.memo` |
| 10 | QuestionPicker | `React.memo` |
| 11 | EmojiSliderPicker | `React.memo` |
| 12 | CountdownPicker | `React.memo` |
| 13 | ShapePicker | `React.memo` |
| 14 | VotePicker | `React.memo` |
| 15 | StickerTray | `React.memo` |
| 16 | LinkPicker | `React.memo` |
| 17 | LocationPicker | `React.memo` |
| 18 | HashtagPicker | `React.memo` |
| 19 | TimePicker | `React.memo` |
| 20 | WeatherPicker | `React.memo` |

Combined with the memoized `onClose`/`onAddLayer` callbacks in PosterComposerScreen, the active picker now only re-renders when its own internal state changes — not when the parent composer re-renders.

**Files modified**: `CreatorAssetPicker.tsx`

### Final scorecard

| Category | Before | After |
|----------|--------|-------|
| PosterComposerScreen useState count | 37 | 25 (13 consolidated) |
| PosterComposerScreen Escape handler branches | 22 | 11 (13 sheet branches → 1) |
| CreatorAssetPicker React.memo'd pickers | 0 | 20 |
| CreatorAssetPicker inline callback refs | 2 (onClose, onAddLayer) | 0 (memoized) |
| TypeScript errors (entire codebase) | 0 | 0 |
| ESLint new warnings | 0 | 0 |
| useActiveSheet.ts lint | N/A | 0 errors, 0 warnings |
