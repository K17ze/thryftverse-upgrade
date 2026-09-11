# Phase 2 — Home Screen Deconstruction Report

## Summary

Monolithic `HomeScreen.tsx` (1,809 LOC) deconstructed into an orchestrator (727 LOC) plus 5 extracted components in `frontend/src/components/home/`. Net reduction: 1,082 lines (59.8%).

## Extractions

### 1. PosterStoryArtwork → `components/home/PosterStoryArtwork.tsx` (78 LOC)

**What was moved:** The `React.memo`-wrapped `PosterStoryArtwork` component (original lines 160–210), including its composition-document validation, video/image/text fallback chain, and `CreatorCanvas` rendering.

**Props wired:** `{ story: PosterStory }` — single prop, unchanged from original.

**Styles moved:** `posterImage`, `posterTextArtwork`, `posterTextArtworkCopy` — moved into a local `createStyles(colors)` factory following the `CommerceDetailIdentity` pattern.

**Constants moved:** `POSTER_CARD_WIDTH` (76), `POSTER_CARD_HEIGHT` (135) — defined locally in the component file.

**Imports:** `Video`/`ResizeMode` from `../compat/Video`, `CachedImage`, `useAppTheme`/`ThemeColors`, `isVideoUri`, `safeValidateDocument`/`CreatorDocument`, `CreatorCanvas`, `PosterStory` type, `Space`/`FontFamily` from designTokens, `TypographyV2`.

**Memoization preserved:** `React.memo` wrapper intact; `useMemo` for styles and composition document unchanged.

---

### 2. HomeLookBreak → `components/home/HomeLookBreak.tsx` (106 LOC)

**What was moved:** The inline "Looks to shop" rail rendered inside `renderFeedItem` when `isLookMarker(item)` was true (original lines 895–932). This was an inline JSX block with no separate function.

**Props wired:**
- `looks: HomeLookBreakLook[]` — the look items array (typed via `HomeLookBreakLook` interface)
- `windowWidth: number` — for the full-span width

**Hooks used internally:** `useAppTheme`, `useHaptic`, `useNavigation` — component is self-contained.

**Styles moved:** All inline styles (`flashListItem`, inner padding, header row, scroll content, look card, look image, tagged badge) moved into a local `createStyles(colors)` factory. `GRID_GAP` (Space.sm) defined locally.

**Constants moved:** `LOOK_CARD_WIDTH` (120), `LOOK_CARD_HEIGHT` (160) — defined locally.

**Behavior preserved:** Haptic feedback on look press, navigation to `LookDetail`, accessibility labels with title/tagged-count, `CachedImage` with `downscaleWidth`, tagged-count badge overlay.

---

### 3. HomeStoryRail → `components/home/HomeStoryRail.tsx` (215 LOC)

**What was moved:** The `renderPosters` `useCallback` (original lines 698–804) — the poster story rail with loading skeletons, sorting (unwatched-first), watched/unwatched states, creator overlays, frame-count badges, unwatched badges, haptics, and press behavior.

**Props wired:**
- `postersLoading: boolean`
- `posters: PosterStory[]`

**Hooks used internally:** `useAppTheme`, `useHaptic`, `useNavigation`.

**Styles moved:** 17 styles moved into local `createStyles(colors)`: `postersSection`, `postersScroll`, `posterCard`, `posterTile`, `posterTileRing`, `posterTileInner`, `posterTileSeen`, `posterShade`, `posterCreatorOverlay`, `posterCreatorName`, `posterFreshDot`, `posterSeenDot`, `frameCountBadge`, `frameCountBadgeText`, `unwatchedBadge`, `unwatchedBadgeText`. Also imports `PosterStoryArtwork` from `./PosterStoryArtwork`.

**Constants moved:** `POSTER_CARD_WIDTH` (76), `POSTER_CARD_HEIGHT` (135) — defined locally.

**Behavior preserved:** Loading skeleton (4 `PremiumSkeletonTile`s), unwatched-first sort, `unwatchedCount` computation, `showUnwatchedBadge` logic, `AnimatedPressable` with haptic + `PosterViewer` navigation, accessibility labels, `Ionicons` layers icon for frame counts, fresh/seen dots.

---

### 4. HomeHeader → `components/home/HomeHeader.tsx` (219 LOC)

**What was moved:** The floating header JSX (original lines 971–1041) plus the three animated style computations (`headerHeightStyle`, `headerTitleStyle`, `headerShadowStyle` — original lines 370–389).

**Props wired:**
- `scrollY: SharedValue<number>` — scroll position shared value (for shadow + title animations)
- `headerHeightSV: SharedValue<number>` — header height shared value (for height animation)
- `isGuest: boolean`
- `notificationCount: number`
- `liveShoppingEnabled: boolean`

**Design decision:** Instead of passing pre-computed animated styles (which would require complex Reanimated type exports), the component receives `SharedValue<number>` props and computes its own `useAnimatedStyle` hooks internally. This matches the established `CommerceDetailHeader` pattern in the codebase.

**Hooks used internally:** `useAppTheme`, `useSafeAreaInsets`, `useNavigation` (derives `rootNavigation` via `getParent()?.getParent()`), `useSignupWall`, `useAnimatedStyle`, `interpolate`, `Extrapolation`.

**Styles moved:** 12 styles moved into local `createStyles(colors)`: `floatingHeaderShell`, `headerForeground`, `headerTitleWrap`, `brandTitle`, `guestLabel`, `headerRight`, `liveBadge`, `liveDot`, `liveBadgeText`, `headerBtn`, `notificationBadge`, `notificationBadgeText`.

**Behavior preserved:** Guest sign-in press → `AuthLanding`, sell button with `requireAuth('create_listing')` guard, search → `rootNavigation.navigate('UnifiedDiscovery')`, notifications → `NotificationsList` with badge count (99+ cap), live shopping badge gated by feature flag, animated header height/shadow/title opacity, all accessibility labels and hints.

---

### 5. HomeFeedHeader → `components/home/HomeFeedHeader.tsx` (515 LOC)

**What was moved:** The `ListHeaderComponent` content (original lines 1088–1295) including feed tabs, algorithm signal chips, editorial header, story rail mount, new-listings banner, consolidated status surface (offline/sync-error/degraded), and all loading/empty/error states.

**Also moved:** `renderNewListingsBanner` function (lines 806–833), `renderExploreLoadingState` function (lines 835–864), and `SKELETON_HEIGHT_RATIOS` constant (line 104) — all now internal to `HomeFeedHeader`.

**Props wired (30 props):**
- Feed tabs: `feedMode`, `onFeedModeChange`, `followingListingsCount`
- Signal chips: `signals` (`DynamicSignalChip[]`), `selectedSignal`, `onSelectSignal`
- Editorial: `newHomeFeedEnabled`
- Story rail: `postersLoading`, `posters`
- New listings: `newListingCount`, `onAcknowledgeNewListings`
- Status: `isOffline`, `hasSyncError`, `isSyncing`, `isRefreshing`, `forYouIsDegraded`, `onRetry`
- Loading/empty/error: `showLoadingSkeleton`, `showFollowingLoading`, `showForYouLoading`, `feedDataLength`
- Following feed: `followingError`, `followingHasFollowing`, `onFollowingRefresh`
- For You feed: `forYouError`, `forYouIsEmpty`, `forYouHasError`, `onForYouRefresh`
- Navigation: `onBrowse`
- Grid: `gridTileWidth`

**Hooks used internally:** `useAppTheme`, `useHaptic` (for feed tab selection).

**Styles moved:** 22 styles moved into local `createStyles(colors)`: `feedTabBar`, `feedTab`, `feedTabLabel`, `feedTabLabelActive`, `feedTabCount`, `feedTabCountActive`, `feedTabIndicator`, `signalRail`, `signalRailContent`, `signalChip`, `signalChipPersonalized`, `signalChipActive`, `signalDot`, `signalDotActive`, `signalChipText`, `signalChipTextActive`, `editorialHeader`, `editorialEyebrow`, `editorialTitle`, `newListingsBannerWrap`, `newListingsBanner`, `newListingsBannerContent`, `newListingsBannerIconWrap`, `newListingsBannerText`, `feedStatusBanner`, `degradedRow`, `degradedText`, `exploreLoadingGrid`, `exploreLoadingColumn`, `skeletonTileWrap`.

**Exports:** `FeedMode` type (consumed by `HomeScreen` and `HomeMasonryFeed`).

**Behavior preserved:** All 7 empty/error/loading states (offline, following-error, following-empty, foryou-error, foryou-empty, premium-empty, loading-skeleton), `OfflineBanner`/`SyncRetryBanner`/degraded inline state, feed tab haptic + MMKV persistence callback, signal chip haptic + personalization dot, editorial header gated by feature flag, `HomeStoryRail` composition.

---

### 6. HomeMasonryFeed → `components/home/HomeMasonryFeed.tsx` (164 LOC)

**What was moved:** The `AnimatedFlashList` shell (original lines 1043–1321) including the `AnimatedFlashList` platform-specific definition, `renderFeedItem` callback, `getItemType`, `overrideItemLayout`, `keyExtractor`, and the `Reanimated.View` feed-opacity wrapper.

**Also moved:** `LookFeedMarker` interface, `FeedDataItem` type, `isLookMarker` function, `extractFeedImageUri` function (original lines 119–158) — all exported for the screen to consume. `AnimatedFlashList` constant (lines 113–117). `GRID_GAP` constant.

**Props wired (16 props):**
- `feedOpacity: SharedValue<number>` — for crossfade opacity
- `data: FeedDataItem[]`
- `contentContainerStyle: StyleProp<ViewStyle>`
- `onScroll`, `scrollEventThrottle`, `viewabilityConfig`, `onViewableItemsChanged`
- `onEndReached`, `onEndReachedThreshold`
- `ListHeaderComponent`, `ListFooterComponent`, `refreshControl` — composed by the screen
- `gridTileWidth`, `windowWidth` — for tile width computation
- `formatPrice` — price formatter from `useFormattedPrice`
- `onTilePress`, `onTileLongPress` — tile interaction callbacks
- `activePlaybackIndex` — viewability-driven playback index

**Design decision:** `HomeMasonryFeed` receives `ListHeaderComponent` (which is `HomeFeedHeader`) as a prop, composed by the screen. This produces the cleanest orchestrator — the screen owns all state and composes the header, footer, and refresh control, while `HomeMasonryFeed` owns the masonry rendering shell.

**Hooks used internally:** `useAppTheme`, `useAnimatedStyle` (for feed opacity).

**Styles moved:** `feedShell` (`{ flex: 1 }`), `flashListItem` (padding/gutter) — moved into local `createStyles(colors)`.

**Exports:** `FeedDataItem`, `LookFeedMarker` types; `isLookMarker`, `extractFeedImageUri` functions — consumed by `HomeScreen`.

---

### 7. Barrel Export → `components/home/index.ts` (12 LOC)

Exports all 5 components plus their prop interfaces and shared types (`FeedDataItem`, `LookFeedMarker`, `FeedMode`, `isLookMarker`, `extractFeedImageUri`).

---

## Masonry Geometry Preservation

**Confirmed preserved — no changes to masonry geometry:**

| Property | Value | Location |
|---|---|---|
| `masonry` | `true` | `HomeMasonryFeed.tsx` → `AnimatedFlashList` prop |
| `numColumns` | `2` | `HomeMasonryFeed.tsx` → `AnimatedFlashList` prop |
| `overrideItemLayout` | featured → span 2, look markers → span 2 | `HomeMasonryFeed.tsx` |
| Featured item span | `item.featured ? 2 : 1` | `HomeMasonryFeed.tsx` |
| Look marker span | `2` (full row) | `HomeMasonryFeed.tsx` |
| Tile width (normal) | `gridTileWidth = floor((windowWidth - Space.sm*2) / 2)` | `HomeScreen.tsx` (unchanged) |
| Tile width (featured) | `floor(windowWidth - Space.sm*2)` | `HomeMasonryFeed.tsx` `renderFeedItem` |
| `flashListItem` padding | `paddingHorizontal: Space.xs, paddingBottom: GRID_GAP (Space.sm)` | `HomeMasonryFeed.tsx` styles |
| `AnimatedFlashList` web fallback | Plain `FlashList` on web, `Reanimated.createAnimatedComponent` on native | `HomeMasonryFeed.tsx` |

---

## Late Import Fix

The late mid-file imports of `useDynamicAlgorithmSignals` and `matchesSignal`/`DynamicSignalChip` (original lines 214–215) have been moved to the proper import block at the top of `HomeScreen.tsx` (now lines 48–49). The anti-pattern is eliminated.

---

## Final LOC Count

| File | LOC |
|---|---|
| `HomeScreen.tsx` (orchestrator) | **727** (was 1,809) |
| `PosterStoryArtwork.tsx` | 78 |
| `HomeLookBreak.tsx` | 106 |
| `HomeStoryRail.tsx` | 215 |
| `HomeHeader.tsx` | 219 |
| `HomeFeedHeader.tsx` | 515 |
| `HomeMasonryFeed.tsx` | 164 |
| `index.ts` | 12 |
| **Total extracted** | **1,309** |
| **Net reduction** | **1,082 lines (59.8%)** |

---

## tsc Result

```
node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```
**Result: 0 errors, 0 warnings.** Clean pass.

---

## ESLint Result

```
node ./node_modules/eslint/bin/eslint.js src/screens/HomeScreen.tsx src/components/home/ --max-warnings=999
```
**Result: 0 errors, 119 warnings.**

All warnings are pre-existing `i18next/no-literal-string` warnings (literal strings in JSX/props — standard for this codebase) and minor `react-hooks/exhaustive-deps` / `@typescript-eslint/no-unused-vars` warnings that were present in the original file. No new lint errors or warnings were introduced by the extraction.

---

## Concerns

1. **Pre-existing dead code retained:** `feedStatus` (computed via `getBackendSyncStatus` but never consumed in JSX), `currentUser` (destructured from `useStore` but never used), `showFollowingRefreshing` (assigned but never used), `spring` (destructured from `useMotionConfig` but never used), `hasPersonalizedSignals` (destructured from `useDynamicAlgorithmSignals` but never used). These were pre-existing in the original file and are retained to avoid changing business logic per constraint #6.

2. **`HomeFeedHeader` prop count:** The component has 30 props, which is high. This is a natural consequence of the header's breadth (tabs, signals, editorial, story rail, banner, 7 loading/empty/error states). The alternative — grouping into nested objects — would reduce parameter count but increase indirection. The flat prop interface was chosen for transparency.

3. **`HomeMasonryFeed` `onScroll` typed as `any`:** The scroll handler is either a Reanimated `useAnimatedScrollHandler` result (native) or a plain JS callback (web). These have incompatible types. The original code used `any` for `AnimatedFlashList` as well. This is a pre-existing pattern, not a regression.

4. **`formatPrice` typed as `(...args: any[]) => string`:** Matches the existing `FormatPriceFn` type in `HomeDiscoveryCard.tsx`. The `any` is a pre-existing pattern in the codebase.
