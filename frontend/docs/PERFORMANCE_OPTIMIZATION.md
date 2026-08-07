# Performance Optimization — August 2026 React Native Best Practices

This document records the current performance posture of the ThryftVerse
frontend, the optimizations applied in the August 2026 performance pass,
remaining work for production, and the targets that define "flagship
performance" for this app.

> **Companion document:** `docs/PERFORMANCE_MONITORING.md` covers the
> Sentry + EAS Observe instrumentation that collects production metrics.
> This document focuses on build-time and render-time optimizations.

---

## 1. Current performance posture

### Runtime engine

| Setting | Value | Location |
| --- | --- | --- |
| JS engine | Hermes (explicit) | `app.json` → `jsEngine: "hermes"` |
| New Architecture | Enabled | `app.json` → `newArchEnabled: true` |
| React Native | 0.85.3 | `package.json` |
| React | 19.2.3 | `package.json` |
| Reanimated | 4.3.1 (worklet runtime) | `package.json` |
| Expo SDK | 56 | `package.json` |

React Native 0.85 ships with the New Architecture as default and the old
bridge retired (since 0.82). Hermes V1 is the default JS engine. Both are
explicitly set in `app.json` so the config is self-documenting and
survives SDK upgrades.

### Bundle pipeline

| Setting | Value | Location |
| --- | --- | --- |
| Tree shaking (package exports) | Enabled | `metro.config.js` → `resolver.unstable_enablePackageExports` |
| ESM import conditions | `import` preferred | `metro.config.js` → `resolver.unstable_conditionNames` |
| Inline requires (lazy loading) | Enabled | `metro.config.js` → `transformer.inlineRequires` |
| Production minifier | terser (metro-minify-terser) | `metro.config.js` → `transformer.minifierPath` |
| Minifier config | Dead-code elimination, `drop_console`, 2 passes | `metro.config.js` → `transformer.minifierConfig` |
| Console stripping | `babel-plugin-transform-remove-console` (prod, preserves `console.error`) | `babel.config.js` |
| Reanimated plugin | Loaded (must be last) | `babel.config.js` |

### Navigation / lazy loading

All screen registrations in `src/navigation/AppNavigator.tsx` use the
lazy `getComponent={() => require('../screens/...').default}` pattern
except for two intentionally-eager initial routes:

- `AuthLandingScreen` — initial route when unauthenticated.
- `TabNavigator` — initial route when authenticated.

These are loaded at startup because they are the first screen the user
sees; every other screen is deferred until first navigation. Combined
with `transformer.inlineRequires`, this keeps the startup bundle to
only the auth/landing + tab-bar code path.

### Lists

| Screen / Component | List type | Tuned? |
| --- | --- | --- |
| HomeScreen | FlashList (animated) | `overrideItemLayout`, `keyExtractor` |
| BrowseScreen | FlashList → PinterestMasonryGrid | Masonry layout |
| InboxScreen | FlashList (animated) | `estimatedItemSize={76}`, `keyExtractor` |
| NotificationsScreen | SectionList | `removeClippedSubviews`, `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`, `keyExtractor` |
| MyListingsScreen | FlatList | `removeClippedSubviews`, `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`, `keyExtractor` |
| BundleBagScreen | FlatList | `removeClippedSubviews`, `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`, `keyExtractor` |
| PosterArchiveScreen | FlatList (2-col) | `removeClippedSubviews`, `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`, `keyExtractor` |
| MyOrdersScreen | FlatList (grouped) | `removeClippedSubviews`, `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`, `keyExtractor` |
| BulkListingScreen | FlatList | `removeClippedSubviews`, `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`, `keyExtractor` |
| ResolutionCentreScreen | FlatList | `removeClippedSubviews`, `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`, `keyExtractor` |
| explore/LooksTab | FlatList | `removeClippedSubviews`, `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`, `keyExtractor` |

FlashList v2 (`@shopify/flash-list@2.0.2`) is installed and used on the
highest-traffic discovery and inbox surfaces. FlatList is retained on
screens where the list is bounded or the layout (grouped, masonry,
multi-column) makes FlashList's recycling less beneficial.

### Dependencies

- **No `moment.js`** — the codebase uses native `Date` and `Intl` APIs.
- **No full `lodash`** — no lodash dependency at all.
- **Icon libraries** — `@expo/vector-icons` imported per-family
  (e.g. `import { Ionicons } from '@expo/vector-icons'`), which is
  tree-shaken at the family level by Metro.
- **`depcheck` results** — see §4 below.

---

## 2. What was optimized in this pass

### 2.1 Hermes + New Architecture (app.json)

- Added explicit `jsEngine: "hermes"` so the engine is self-documenting
  and does not silently fall back to JSC on a misconfigured build.
- Verified `newArchEnabled: true` is present (was already set).

### 2.2 Metro config (metro.config.js)

- Enabled `resolver.unstable_enablePackageExports` so Metro resolves the
  narrowest entry point a package publishes — the foundation for
  tree-shaking under Hermes bytecode.
- Set `resolver.unstable_conditionNames` to prefer ESM `import`
  conditions, giving Hermes export-level dead-code elimination.
- Enabled `transformer.inlineRequires` so `require()` calls are only
  evaluated on first use, shrinking the startup bundle.
- Configured `transformer.minifierConfig` with terser settings tuned for
  RN: `drop_console`, `dead_code`, `evaluate`, `conditionals`, `unused`,
  2 compression passes, identifier mangling with Reanimated worklet
  names preserved.
- Gated minification to production only (`transformer.minify` +
  `minifierPath`) so dev builds stay fast and debuggable.
- Preserved the existing `@stripe/stripe-react-native` web shim and
  `tslib` extraNodeModules resolution.

### 2.3 List rendering performance

- Added `removeClippedSubviews`, `windowSize`, `maxToRenderPerBatch`,
  and `initialNumToRender` to every FlatList/SectionList that can
  render 20+ items:
  - `NotificationsScreen` (SectionList)
  - `MyListingsScreen` (FlatList)
  - `BundleBagScreen` (FlatList)
  - `PosterArchiveScreen` (FlatList 2-col)
  - `MyOrdersScreen` (FlatList grouped)
  - `BulkListingScreen` (FlatList)
  - `ResolutionCentreScreen` (FlatList)
  - `explore/LooksTab` (FlatList)
- Added `estimatedItemSize={76}` to `InboxScreen` FlashList to avoid
  recycle-pool layout thrash on first scroll.
- Verified `keyExtractor` is set on all lists.
- Verified HomeScreen, BrowseScreen, and InboxScreen already use
  FlashList (no migration needed).

### 2.4 Lazy imports verification

- Audited all 100+ screen registrations in `AppNavigator.tsx`.
- Confirmed only `AuthLanding` and `MainTabs` use eager `component={}`
  (both are initial routes). Every other screen uses
  `getComponent={() => require(...)}`.

### 2.5 Performance monitoring hook

- Created `src/hooks/usePerformanceMonitor.ts`:
  - Tracks screen render time (navigation focus → first meaningful
    paint via `requestAnimationFrame`).
  - Tracks JS-thread scroll FPS via Reanimated 4 `useFrameCallback`
    worklet (runs on UI thread, does not perturb JS).
  - Logs `console.warn` in `__DEV__` when render time > 400ms or
    scroll FPS < 58 for 10+ consecutive frames.
  - No-op in production — `__DEV__` branches are eliminated by Metro +
    Hermes minification, so zero runtime cost.

### 2.6 Dependency audit

- Ran `npx depcheck`. Findings (all false positives — do NOT remove):
  - `expo-asset` — registered as an Expo plugin in `app.json`.
  - `react-native-screens` — peer dependency of
    `@react-navigation/native-stack` (auto-linked, not imported
    directly in source).
  - `tslib` — TypeScript runtime helpers, resolved via Metro
    `extraNodeModules` shim.
  - `@expo/ngrok` (devDep) — used for tunneling dev builds.
  - `@testing-library/react-native` (devDep) — used by vitest tests.
- Missing dependencies flagged by depcheck (not installed to avoid
  new-dependency risk per task constraints):
  - `expo-linking` — referenced in `App.tsx` (transitively available
    via `expo` core; depcheck does not resolve Expo's barrel exports).
  - `@expo/config-plugins` — referenced in `plugins/withPrivacyManifest.js`
    (transitively available via `expo` core).

---

## 3. What remains for production

### 3.1 FlashList migration candidates

The following FlatList usages could be migrated to FlashList if they
prove to be scroll-performance bottlenecks in production profiling:

- `MyListingsScreen` — seller listing list.
- `PosterArchiveScreen` — 2-column archive grid.
- `MyOrdersScreen` — grouped order history (outer list).
- `BulkListingScreen` — bulk batch list.
- `ResolutionCentreScreen` — support ticket list.
- `explore/LooksTab` — looks feed.

FlashList is already installed (`@shopify/flash-list@2.0.2`), so
migration is low-risk. However, the current FlatList tuning
(`removeClippedSubviews` + `windowSize` + batch caps) already addresses
the primary FlatList pathology (over-rendering off-screen items).
Migrate only if Sentry slow-frame data shows these screens dropping
below 58fps in production.

### 3.2 Bundle visualizer audit

- Run `npx react-native-bundle-visualizer` (or
  `expo export --dump-assetgraph`) on a production bundle to identify
  any remaining large modules.
- Verify Hermes bytecode size is under the 30MB install-size target.
- Check that no screen module exceeds ~50KB gzipped (a sign it should
  be split further).

### 3.3 Memoization audit

- Audit `renderItem` functions on all lists for inline arrow functions
  that create new closures on every render. Where a list item is
  expensive (e.g. `ProductCardV2` with media), wrap `renderItem` in
  `useCallback` and the item component in `React.memo`.
- Audit `useMemo` coverage for derived data passed to lists
  (filtered/sorted arrays).

### 3.4 Animation thread audit

- Verify that all scroll-driven animations use Reanimated `useAnimatedScrollHandler` + `useAnimatedStyle` (UI thread) rather than
  the legacy `Animated` API (JS thread).
- The codebase already uses Reanimated 4 worklets extensively; confirm
  no `Animated.event` scroll handlers remain on hot paths.

### 3.5 Image pipeline

- Verify `expo-image` is used for all remote images (it supports
  caching, downsampling, and native decoding off the JS thread).
- Audit `CachedImage` usage to ensure it delegates to `expo-image`
  rather than the legacy `Image` component.

---

## 4. Performance targets and how to measure them

| Target | Mid-tier Android | iPhone 13 | How to measure |
| --- | --- | --- | --- |
| Cold start TTI | < 2.0s | < 1.2s | EAS Observe `cold_launch` + `tti`; Sentry app-start transaction |
| Sustained scroll FPS | 58+ fps | 58+ fps | Sentry `frames.slow` measurement; `usePerformanceMonitor` in dev |
| Interaction latency | < 100ms | < 100ms | Sentry user-interaction tracing; `usePerformanceMonitor` render time |
| JS memory | < 180MB | < 180MB | Xcode Instruments / Android Studio Memory Profiler |
| Install size | < 30MB | < 30MB | EAS Build artifact size; `expo export` bundle size |

### Dev-mode measurement

Import `usePerformanceMonitor` in any screen during development:

```tsx
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';

function MyScreen() {
  const { renderMs, scrollFps, isScrolling } = usePerformanceMonitor({
    screenName: 'MyScreen',
  });
  // renderMs: time from focus to first paint
  // scrollFps: instantaneous FPS during scroll (0 when stationary)
  // isScrolling: true while a scroll gesture is active
  // Warnings are logged to console.warn automatically in __DEV__.
}
```

The hook is a no-op in production — `__DEV__` is a compile-time
constant, so all instrumentation branches are eliminated during
minification.

### Production measurement

See `docs/PERFORMANCE_MONITORING.md` for Sentry dashboard queries and
EAS Observe metric definitions.

---

## 5. Recommended ongoing monitoring

1. **Sentry slow/frozen frames** — monitor the
   `measurements.frames_slow_rate` and `measurements.frames_frozen_rate`
   per transaction. Any screen exceeding 5% slow frames warrants
   investigation.

2. **EAS Observe launch metrics** — track `cold_launch` and `tti`
   percentiles (p50, p90, p95) across releases. Regression beyond 10%
   should block a production rollout.

3. **Bundle size CI gate** — the existing `npm run check:bundle-size`
   script (`scripts/check-bundle-size.mjs`) should be run in CI on
   every PR touching `frontend/`.

4. **depcheck in CI** — run `npx depcheck` on dependency changes to
   catch genuinely unused packages before they inflate the bundle.

5. **Reanimated worklet audit** — the existing
   `npm run check:animated-scroll` script
   (`scripts/check-animated-scroll-usage.mjs`) enforces that scroll
   animations use Reanimated worklets, not the JS-thread `Animated` API.

6. **Hermes bytecode size** — after each production build, verify the
   Hermes bytecode bundle (in the APK/IPA) is under 30MB. If it grows,
   run a bundle visualizer to identify the source.
