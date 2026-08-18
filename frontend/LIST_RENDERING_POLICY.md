# ThryftVerse List Rendering Policy

> **Authority:** Audit `13_ENGINEERING_ARCHITECTURE_MOTION_PERFORMANCE_MEDIA.md` §List policy; AGENTS.md §16 (Performance); Shopify FlashList v2 performant-components docs (2025–2026).
>
> **Purpose:** Every list in the app must use the correct rendering strategy, documented and tested. No list deviates from this policy without a written justification and a performance test.

---

## 1. Technology baseline

| Component | Version | Status |
|---|---|---|
| `@shopify/flash-list` | 2.2.1 | Production-ready (Shopify, Aug 2025) |
| React Native | 0.86 | New Architecture on |
| React | 19.2 | — |
| Reanimated | 4.5 family | UI-thread scroll handlers on native |

FlashList v2 is the default list component. It uses cell recycling (not mount/unmount virtualization) and does not require `estimatedItemSize`.

---

## 2. List categories and rendering strategy

### 2.1 Native masonry / discovery feed → FlashList v2
**Surfaces:** HomeScreen (For You / Following), BrowseScreen, UserProfileScreen (Shop/Looks grid)

- Use `FlashList` with `numColumns={2}` for masonry grids.
- FlashList v2 measures items automatically — no `estimatedItemSize` needed.
- Wrap FlashList in `Reanimated.createAnimatedComponent` on native for UI-thread scroll handlers.
- **On web:** use `ScrollView` + `.map()` fallback (FlashList v2 crashes on web with Reanimated 4.x — issue #9266, and "Changing onViewableItemsChanged on the fly is not supported").

### 2.2 Horizontal rails → FlashList v2 (horizontal)
**Surfaces:** RecommendationRail, RelatedItemsRail, SeenInLooksRail, PosterStoryRail

- Use `FlashList` with `horizontal`.
- `showsHorizontalScrollIndicator={false}`.
- `ItemSeparatorComponent` for consistent spacing (not padding inside item).

### 2.3 Simple bounded lists → FlashList v2
**Surfaces:** SettingsScreen, InboxScreen, MyOrdersScreen, MyListingsScreen

- Use `FlashList` (vertical, single column).
- For lists guaranteed <20 items, `FlatList` is acceptable but FlashList is preferred for recycling consistency.

### 2.4 Chat / message lists → FlashList v2 (inverted)
**Surfaces:** ChatScreen, GroupChatScreen

- Use `FlashList` with `inverted` for chat message lists.
- `renderItem` must be memoized via `useCallback`.

### 2.5 Web fallback → ScrollView + map
**Surfaces:** Any screen where FlashList v2 crashes or has unsupported behavior on web.

- Use `Platform.OS === 'web'` check.
- `ScrollView` + `.map()` with stable `key` from `item.id`.
- Document the specific FlashList issue that forces the fallback.
- Current known issue: `onViewableItemsChanged` callback cannot be changed dynamically (FlashList v2 internal limitation).

---

## 3. FlashList v2 performance rules (mandatory)

### 3.1 Memoize renderItem
`renderItem` must be wrapped in `useCallback` with correct dependency array. Inline arrow functions cause full re-renders of all visible items on every parent render.

```ts
// ✅ Correct
const renderItem = useCallback(({ item }) => (
  <MyItem item={item} />
), [dependencies]);

// ❌ Wrong — recreated every render
renderItem={({ item }) => <MyItem item={item} />}
```

### 3.2 Use getItemType for heterogeneous rows
When a list contains multiple item types (e.g. listings + clips + headers), provide `getItemType` so FlashList recycles cells of the same type:

```ts
const getItemType = useCallback((item) => item.type, []);
<FlashList getItemType={getItemType} ... />
```

### 3.3 Remove nested arbitrary key usage
Do not use `key={index}` or `key={someArbitraryValue}` inside FlashList items. FlashList v2 manages recycling keys internally. Nested `key` props interfere with cell recycling.

- `keyExtractor` on FlashList is the only key source needed.
- Inside `renderItem`, do not add `key` to child Views unless mapping a sub-array (use stable IDs, not indices).

### 3.4 Valid keyExtractor
Every FlashList must have a `keyExtractor` that returns a stable, unique string from the item. Fallback to index is acceptable only when no ID exists:

```ts
keyExtractor={(item) => item.id}
```

### 3.5 Memoize expensive derived data
Data transformations (e.g. `listings.map(transformToTile)`) must be wrapped in `useMemo`:

```ts
const feedData = useMemo(() => listings.map(transformTile), [listings]);
```

### 3.6 Profile in release mode only
Dev mode is 2–5× slower. FlashList appears slower than FlatList in dev mode due to smaller fixed window size. Always profile in release configuration.

### 3.7 overrideItemLayout for dynamic heights
When item heights vary (masonry), use `overrideItemLayout` to communicate span/size to FlashList:

```ts
overrideItemLayout={(layout, item) => {
  layout.span = 1;
}}
```

---

## 4. Viewability-driven video playback

For feeds with video content, use `useViewabilityPlayback` hook:
- Only the most-visible item plays (one active player).
- Settlement delay (350ms) avoids thrashing during fast scroll.
- Offscreen items pause immediately.

Spread the hook's `viewabilityPair` into FlashList:
```ts
const { activeIndex, viewabilityPair } = useViewabilityPlayback();
<FlashList {...viewabilityPair} ... />
```

Pass `shouldPlay={activeIndex === index}` to each video item.

---

## 5. Image resolution policy

### 5.1 Thumbnail vs full-resolution
- Grid/discovery thumbnails: use `priority="low"` and `downscaleWidth` to avoid loading full-resolution images for small tiles.
- Detail/gallery surfaces: use `priority="high"` for the primary image.
- CachedImage supports a `downscaleWidth` prop that appends resize parameters when the URI is from a supported CDN.

### 5.2 Prefetch
- Prefetch next visible media only (not the entire feed).
- Cancel obsolete fetches when the user scrolls away.
- `expo-image` handles memory-disk caching automatically via `cachePolicy="memory-disk"`.

### 5.3 Poster images for video
- Always pass `previewUri` (poster frame) for video sources.
- `usePoster={true}` on the Video component shows the poster until playback starts.
- Video `shouldPlay` is viewability-gated — never autoplay all videos.

### 5.4 Aspect ratio preservation
- Pass `aspectRatio` from the data model to compute layout height before image load.
- Skeletons must match the final aspect ratio exactly — zero layout shift.

---

## 6. Memory management

### 6.1 Long feed scroll
- FlashList recycling keeps memory bounded regardless of feed length.
- `recyclingKey` on ExpoImage ensures the image cache entry matches the recycled cell.
- `enforceEarlyResizing` downscales large images before decode.

### 6.2 Poster sessions
- CreatorCanvas/Studio must release video players on unmount.
- `useViewabilityPlayback.reset()` on screen blur/navigation away.
- Large composition documents should be validated once and cached, not re-parsed per render.

### 6.3 Web fallback memory
- Web `ScrollView` + `.map()` does not virtualize. For web-only long lists, implement windowing or limit the rendered set to 100 items with "load more" pagination.

---

## 7. Deviation register

Any screen that deviates from this policy must be listed here with justification.

| Screen | Deviation | Justification | Performance test |
|---|---|---|---|
| UserProfileScreen | Web uses ScrollView+map instead of FlashList | FlashList v2 crashes on web with dynamic `onViewableItemsChanged` (Reanimated 4.x issue #9266) | Manual scroll test on Safari/Chrome at 390pt viewport, 100+ items |
| ChatScreen | Inverted FlashList | Chat UX requires bottom-anchored scroll | Manual test: send 200 messages, verify scroll position and memory |

---

## 8. Checklist for new lists

Before adding a new list to any screen:

- [ ] Is this a masonry grid, horizontal rail, simple list, or chat? (§2)
- [ ] `renderItem` wrapped in `useCallback`? (§3.1)
- [ ] `getItemType` provided if heterogeneous? (§3.2)
- [ ] No nested `key={index}` inside items? (§3.3)
- [ ] `keyExtractor` returns stable unique ID? (§3.4)
- [ ] Derived data memoized? (§3.5)
- [ ] Video items use viewability-gated playback? (§4)
- [ ] Images use appropriate priority and downscale? (§5)
- [ ] Web fallback documented if needed? (§2.5, §7)
- [ ] Profiled in release mode? (§3.6)
