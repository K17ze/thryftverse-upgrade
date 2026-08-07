# Shared Element Transition Plan — Home → ItemDetail

> **Status:** Navigator migration complete. Feature flag and screen type
> import migration remain. NOT fully implemented yet.
>
> This document records the findings of an investigation into adding shared
> element transitions for hero images when navigating from the Home discovery
> feed to the ItemDetail screen.

---

## 1. What the transition would look like

When a user taps a product card in the Home "For You" / "Following" masonry
grid, the primary listing image would animate continuously from its position
and size inside the grid tile into the full-bleed hero media stage on
ItemDetailScreen — instead of the current hard cut / push transition.

The visual effect:

1. User taps a grid tile on HomeScreen.
2. The grid tile's hero image lifts off the grid and expands/morphs into the
   ItemDetailScreen `CommerceMediaStage` hero frame.
3. The rest of the ItemDetailScreen chrome (header, seller row, description)
   fades/slides in beneath the morphing image.
4. On back navigation, the reverse happens — the hero image contracts back
   into the grid tile position.

This gives the user a sense of spatial continuity: the detail screen feels
like an expansion of the thumbnail they tapped, not an unrelated new surface.

---

## 2. Current source image structure (HomeScreen)

**File:** `frontend/src/screens/HomeScreen.tsx`

The `ExploreGridItem` component (line ~303) renders each grid tile. The hero
image is wrapped in a `SharedTransitionView`:

```tsx
// HomeScreen.tsx — ExploreGridItem (lines ~316–365)
const sharedTag = item.mediaType === 'image' && item.routeId
  ? `image-${item.routeId}-0`
  : undefined;

// ...

<SharedTransitionView
  style={styles.exploreSharedMedia}
  sharedTransitionTag={sharedTag}
>
  {item.mediaUri ? (
    <MediaPreview
      uri={item.mediaUri}
      posterUri={item.posterUri}
      style={styles.exploreImage}
      ...
    />
  ) : (
    <ListingMediaPlaceholder category={item.category} />
  )}
</SharedTransitionView>
```

Key observations:
- The shared tag is already defined: `image-${item.routeId}-0` (only for
  image-type media, not video).
- `SharedTransitionView` (`frontend/src/components/SharedTransitionView.tsx`)
  is a thin wrapper around `Reanimated.View` that forwards the
  `sharedTransitionTag` prop.
- The inner `MediaPreview` renders a `CachedImage` (expo-image based) for
  images — **not** a `Reanimated.Image`. Reanimated's shared element
  transition animates the `Animated.View` wrapper, so this is compatible.

---

## 3. Current destination image structure (ItemDetailScreen)

**File:** `frontend/src/screens/ItemDetailScreen.tsx`

The hero media stage is `CommerceMediaStage` (line ~527):

```tsx
<CommerceMediaStage
  images={item.images}
  objectId={item.id}
  ...
/>
```

**File:** `frontend/src/components/commerce/CommerceMediaStage.tsx`

Inside `CommerceMediaStage`, each media page is rendered by `MediaPage`
(line ~71). For images without a focal point, it uses
`SharedTransitionImage`:

```tsx
// CommerceMediaStage.tsx — MediaPage (lines ~212–218)
<SharedTransitionImage
  source={{ uri: item.uri }}
  style={subComponentStyles.image}
  resizeMode={item.fit ?? 'contain'}
  sharedTransitionTag={sharedTransitionTag}
  onError={() => setFailed(true)}
/>
```

The tag is passed from `CommerceMediaStage` (line ~477):

```tsx
sharedTransitionTag={index === 0 && objectId ? `image-${objectId}-0` : undefined}
```

Key observations:
- The destination tag is already defined: `image-${objectId}-0` — matching
  the HomeScreen source tag pattern `image-${item.routeId}-0`.
- `SharedTransitionImage` (`frontend/src/components/SharedTransitionImage.tsx`)
  is a thin wrapper around `Reanimated.Image` that forwards the
  `sharedTransitionTag` prop.
- **Type mismatch:** The source (HomeScreen) wraps a `CachedImage` inside a
  `SharedTransitionView` (Reanimated.View), while the destination
  (ItemDetailScreen) uses `SharedTransitionImage` (Reanimated.Image).
  Reanimated's shared element transitions match by `sharedTransitionTag`
  string, not by component type, so this should still work — but it should
  be verified during implementation.

---

## 4. `sharedTransitionTag` values

Both source and destination already use the same tag convention:

| Surface | Tag formula | Example |
|---|---|---|
| HomeScreen grid tile (source) | `image-${item.routeId}-0` | `image-abc123-0` |
| ItemDetailScreen hero (destination) | `image-${objectId}-0` | `image-abc123-0` |

Where `routeId` (Home) and `objectId` / `item.id` (ItemDetail) refer to the
same listing ID. The `-0` suffix denotes the primary (first) image index.

**No tag changes are needed** — the tags already match. The infrastructure
(`SharedTransitionView`, `SharedTransitionImage`, tag assignment) is already
in place.

---

## 5. Files that need to change

### 5.1. Navigator migration (COMPLETE)

**File:** `frontend/src/navigation/AppNavigator.tsx`

**Status:** ✅ Migrated from `@react-navigation/stack` to
`@react-navigation/native-stack`.

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
const Stack = createNativeStackNavigator<RootStackParamList>();
```

The migration preserved all ~80 routes, all screen options, and all
presentation styles. Key API mappings:

| JS stack option | native-stack equivalent |
|---|---|
| `CardStyleInterpolators.forHorizontalIOS` | default push (automatic) |
| `CardStyleInterpolators.forVerticalIOS` | `presentation: 'modal'` |
| `cardStyle` | `contentStyle` |
| `transitionSpec` | removed (native handles transitions) |
| `gestureDirection` | removed (native infers from presentation) |
| `cardOverlayEnabled` | removed (transparentModal provides overlay) |
| `animationEnabled: false` | `animation: 'none'` |

**Remaining work:** ~100 screen files still import `StackScreenProps` /
`StackNavigationProp` from `@react-navigation/stack`. The
`@react-navigation/stack` package remains installed so these imports
resolve. See `docs/NAVIGATOR_MIGRATION_PLAN.md` for the incremental type
migration plan.

### 5.2. Reanimated feature flag

**File:** Reanimated plugin configuration (babel.config.js or
react-native-reanimated plugin options)

Reanimated 4.x requires the `ENABLE_SHARED_ELEMENT_TRANSITIONS` feature flag
to be enabled. Currently no feature flags are configured in the project.

**Required change:** Add the feature flag to the Reanimated Babel plugin
configuration:

```js
// babel.config.js (or equivalent)
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'react-native-reanimated/plugin',
        {
          sharedElementTransitions: true,
        },
      ],
    ],
  };
};
```

### 5.3. react-native-screens version

**Current:** `react-native-screens` 4.25.2 (from package.json)

Reanimated 4.2.0+ shared element transitions require
`react-native-screens` 4.19+ for proper snapshot handling during
swipe-back. The current version (4.25.2) satisfies this requirement.

However, there is a known workaround needed: react-native-screens needs a
fix to avoid keeping a snapshot of the transitioning view on the popped
screen. This fix is available in nightly releases and may already be in
4.25.2 — should be verified during implementation.

### 5.4. HomeScreen (source) — minimal changes

**File:** `frontend/src/screens/HomeScreen.tsx`

The `SharedTransitionView` wrapper and tag are already in place. The main
risk is that `CachedImage` (expo-image) inside a `Reanimated.View` with
`sharedTransitionTag` may not participate correctly in the transition
because expo-image renders a native view that Reanimated may not snapshot
properly.

**Potential change:** If expo-image doesn't work with shared transitions,
the source image may need to switch to `Reanimated.Image` (standard
React Native Image) for the first render, or use a bridging approach.

### 5.5. ItemDetailScreen / CommerceMediaStage (destination) — minimal changes

**File:** `frontend/src/components/commerce/CommerceMediaStage.tsx`

The `SharedTransitionImage` and tag are already in place. The destination
uses `Reanimated.Image` which is the canonical component for shared
element transitions.

**Potential change:** The `contentFit` / `resizeMode` difference between
source (`cover` on Home) and destination (`contain` on ItemDetail) may
cause a visible crop shift during the morph. This may need alignment.

---

## 6. Reanimated version support

**Current version:** `react-native-reanimated` 4.3.1 (from package.json)

**New Architecture:** Enabled (`newArchEnabled: true` in app.json)

**Verdict:** Reanimated 4.3.1 **does support** shared element transitions,
but with important caveats:

1. **Feature flag required:** The `ENABLE_SHARED_ELEMENT_TRANSITIONS`
   feature flag must be enabled in the Reanimated Babel plugin config.
   Without it, `sharedTransitionTag` props are silently ignored.

2. **Experimental status:** Shared element transitions are explicitly
   marked as "experimental" and "not recommended for production use yet"
   in the official Reanimated 4.x documentation.

3. **New Architecture only (for Reanimated 4):** Shared element transitions
   in Reanimated 4 work on the New Architecture (Fabric). The app has
   `newArchEnabled: true`, so this requirement is satisfied.

4. **Native stack required:** `@react-navigation/native-stack` is required.
   The app currently uses `@react-navigation/stack` (JS-based), which is
   a blocker.

---

## 7. Risks and fallback behavior

### 7.1. Navigator migration risk (HIGH)

Migrating from `@react-navigation/stack` to `@react-navigation/native-stack`
is the highest-risk change. It affects:
- Every screen's transition behaviour
- Header rendering (native headers vs JS headers)
- Gesture handling (swipe-back behaviour changes)
- `CardStyleInterpolators` usage (not supported in native-stack)
- Modal presentation differences

**Mitigation:** Audit every screen transition, header config, and
`CardStyleInterpolators` usage before migrating. Test each tab and
pushed screen.

### 7.2. expo-image compatibility (MEDIUM)

`CachedImage` is based on `expo-image`, which renders a native
`ExpoImage` view. Reanimated's shared element transitions work by
snapshotting the view's render tree. Native third-party views may not
participate correctly.

**Fallback:** If expo-image doesn't work with shared transitions, the
transition will silently not play — the app falls back to the standard
push transition. No crash, just no animation. This is the default
behaviour when `sharedTransitionTag` matching fails.

### 7.3. Image crop / aspect ratio mismatch (MEDIUM)

The Home grid tile uses `contentFit="cover"` with a variable aspect ratio
from `resolveListingMediaHeightRatio`. The ItemDetail hero uses
`contentFit="contain"` (or a focal-point-based fit). During the morph,
the image may appear to crop/uncrop abruptly.

**Mitigation:** Align the `contentFit` strategy or use a
`sharedTransitionStyle` custom transition that handles the crop
interpolation.

### 7.4. Video media (LOW)

The shared tag is only set for `mediaType === 'image'`. Video tiles do
not participate in the transition. This is correct — video shared element
transitions are more complex and out of scope.

### 7.5. FlashList virtualization (LOW)

HomeScreen uses FlashList for the grid. Items that are recycled/offscreen
won't have their `sharedTransitionTag` registered. If the user taps a tile
that has been recycled, the transition won't play. This is acceptable
fallback behaviour.

### 7.6. Experimental feature stability (MEDIUM)

Reanimated explicitly warns this feature is experimental. It may have:
- Performance bottlenecks (transforms recalculated too eagerly)
- iOS header height issues
- Modal interaction issues on iOS
- Missing custom progress transitions for swipe-back

**Fallback:** If the feature proves unstable, disable the feature flag.
The `sharedTransitionTag` props become no-ops and the app reverts to
standard push transitions with no code removal needed.

---

## 8. Implementation order

1. ~~**Migrate navigator** from `@react-navigation/stack` to
   `@react-navigation/native-stack`~~ ✅ Complete.
2. **Enable feature flag** in Reanimated Babel plugin config
   (`sharedElementTransitions: true`).
3. **Migrate screen type imports** — ~100 files still import
   `StackScreenProps` / `StackNavigationProp` from `@react-navigation/stack`.
   Switch to `NativeStackScreenProps` / `NativeStackNavigationProp` from
   `../navigation/types` (see `docs/NAVIGATOR_MIGRATION_PLAN.md`).
4. **Verify** shared transition plays with existing tag infrastructure
   (tags already match — no tag changes needed).
5. **Handle expo-image compatibility** if needed (may require source image
   component swap on HomeScreen).
6. **Align contentFit** between source and destination if crop shift is
   visible.
7. **Test** reduced-motion users (transition should be disabled or
   instant).
8. **Test** swipe-back gesture on iOS.
9. **Test** video tiles (should gracefully skip transition).

---

## 9. Summary

| Aspect | Status |
|---|---|
| `sharedTransitionTag` on source (Home) | Already in place |
| `sharedTransitionTag` on destination (ItemDetail) | Already in place |
| Tag values match | Yes — `image-{listingId}-0` |
| Reanimated version supports it | Yes — 4.3.1 (with feature flag) |
| New Architecture enabled | Yes |
| Feature flag enabled | **No** — needs to be added |
| Native stack navigator | ✅ **Yes** — migrated to `@react-navigation/native-stack` |
| Screen type imports migrated | **No** — ~100 files still use `StackScreenProps` from `@react-navigation/stack` (see `NAVIGATOR_MIGRATION_PLAN.md`) |
| react-native-screens version | 4.25.2 (sufficient) |
| expo-image compatibility | **Unknown** — needs testing |
| Feature stability | Experimental — not production-ready |

**Bottom line:** The tag infrastructure is already wired on both screens.
The navigator migration is complete. The remaining blockers are (1) the
Reanimated feature flag and (2) the incremental screen type import
migration (~100 files). The feature flag is a one-line config change; the
type migration is mechanical but touches many files.
