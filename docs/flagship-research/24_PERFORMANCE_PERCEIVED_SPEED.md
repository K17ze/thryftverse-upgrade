# 24 — Performance & Perceived Speed

> **Department:** Performance Engineering & Perceived Speed
> **Benchmark date:** 2026-08-01
> **Scope:** Launch time, TTI, image loading, scroll FPS, bundle size, lazy loading, code splitting, memory management, render optimization, perceived performance, skeleton strategy, prefetching, caching.
> **Charter references:** AGENTS.md §16 (Performance), §17 (Motion and Interaction), §14 (State Completeness), §4 (comparative visual-fidelity protocol, media storytelling); Design.md "Perceived Performance & Visual Completion", "Media Quality & Art Direction Pipeline", "Performance gate".

---

## 1. 2026 Competitor Benchmark

The apps ThryftVerse benchmarks against — Instagram, Pinterest, eBay, Snapchat, Depop, Vinted — treat performance as a product feature, not an engineering afterthought. Their 2026 patterns reveal a converging set of strategies.

### Instagram

Instagram's client performance team published their background prefetching framework as a foundational strategy: they built an offline-mode cache infrastructure that delivers content from disk as if it came from the network, then layered a centralized background prefetching system on top to populate that cache with unseen content before the user reaches it. The principle is "zero wasted bytes over the network, zero wasted bytes on disk" and "instantaneous content delivery" regardless of network conditions ([Instagram Engineering — Improving performance with background data prefetching](https://instagram-engineering.com/improving-performance-with-background-data-prefetching-b191acb39898)). On the web side, Instagram achieved a 25% reduction in image load times and a 56% drop in user wait time at the end of the feed through resource hinting — preloading critical resources and prefetching likely-next resources before they are explicitly requested ([LinkedIn — How Resource Hinting Helped Instagram](https://www.linkedin.com/pulse/how-resource-hinting-helped-instagram-achieve-25-reduction-kumar-strkc)). Their skeleton strategy uses structural placeholders that match the final feed card geometry exactly, with progressive loading where individual elements become visible as soon as they load rather than waiting for the full page.

### Pinterest

Pinterest defines "Visually Complete" as a first-class metric — the moment all images are rendered and videos are playing on the Home Feed, or when the full-screen video starts on Video Pin Closeup. They built the Visually Complete logic into their base UI class (`BaseSurface`) so every surface gets perceived-latency measurement automatically, reducing the cost from two engineer-weeks per surface to near-zero ([Pinterest Engineering — Performance for Everyone](https://medium.com/pinterest-engineering/performance-for-everyone-21a560260d08)). A partnership with Product Science uncovered 1.35 seconds of latency savings on iOS: 1.12s from unnecessary startup animation sequences (splash → logo pulse → bounce → nav bar fade-in) that held back content that was already ready to display, and 230ms pin-render delays during scroll caused by queue prioritization issues ([Product Science — Pinterest iOS case study](https://www.productscience.ai/case-studies/pinterest-ios)). Pinterest also sends a dummy HTTP HEAD request during early app startup to establish a video network connection before any video URLs are returned from the server, eliminating video startup latency ([Pinterest Engineering — Improving the Player on Android](https://medium.com/pinterest-engineering/improving-the-player-on-android-8b7faf9009cf)).

### eBay / Snapchat / Depop

eBay's 2026 approach centers on bundle splitting and deferred module loading — heavy listing-creation and seller-tools flows are loaded on demand rather than at startup. Snapchat's perceived-performance strategy is built around the "instant feedback" principle: every tap produces a visual response within one frame, even if the underlying operation takes 200-400ms. Depop, as a social-commerce app closest to ThryftVerse's domain, prioritizes feed scroll FPS and image loading speed as the two metrics that directly correlate with listing engagement and seller conversion.

### Converging patterns

| Dimension | 2026 industry standard |
|---|---|
| Cold start TTI | <2s mid-range Android, <1.2s iPhone 13 ([RapidNative — 2026 Playbook](https://www.rapidnative.com/blogs/react-native-performance-optimization-2026-playbook)) |
| Sustained scroll FPS | 58+ fps on p99 device |
| Interaction latency | <100ms tap to first visual feedback |
| JS memory working set | <180MB for normal-complexity app |
| Bundle size (JS) | 2-6MB Hermes bytecode for mid-sized app ([72Technologies — App Size Bloat](https://www.72technologies.com/blog/react-native-app-size-bloat-2026)) |
| Image loading | Native disk+memory cache (SDWebImage/Glide), blurhash placeholders, prefetch next N items |
| Skeleton strategy | Structural placeholders matching final geometry, 400ms-3s window, shimmer for liveness |
| Prefetching | Background prefetch of next-likely content, resource hinting for critical-path resources |
| Code splitting | Lazy-load non-critical modules, defer heavy feature modules until first navigation |

---

## 2. Psychology & Principles

### Perceived vs actual performance

Users do not experience milliseconds. They experience visual cues, uncertainty, and anticipation. A "fast" app is not the one with the lowest API latency — it is the one that manages the wait. Research shows that users filter time through visual cues and mental models: a generic spinner tells the user "wait for an unknown duration," while a skeleton screen gives them a structural preview that shifts them from passive waiting to active anticipation ([Timothy Graf — Psychology of Perceived Performance](https://timgraf.com/ui/the-psychology-of-perceived-performance-why-skeleton-screens-beat-spinners-in-2026/)).

### The 200ms rule

The Doherty threshold, established in IBM research, states that users perceive response times under 200ms as instantaneous. Above 200ms, the user becomes aware of the wait. Above 1s, their attention begins to drift. Above 3s, they suspect something is broken. This is not a soft guideline — it is a perceptual hard limit that governs bounce rates, engagement, and conversion. Every interaction in ThryftVerse must produce a visual response within 100ms (the 2026 industry target) and complete within 200ms to remain in the "instant" perceptual band.

### The skeleton effect

Skeleton screens reduce perceived wait time by providing structural preview — but the research is nuanced. The 2017 Viget study with 136 participants found that skeleton screen users actually estimated waiting *longer* than spinner users in some conditions, because skeletons imply a promise: if the real content does not match the skeleton's structure, users feel tricked ([Viget — A Bone to Pick with Skeleton Screens](https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens); [Codexical — Skeleton Screens Don't Always Win](https://www.codexical.com/posts/2026-05-09-skeleton-screens-vs-spinners-science)). The 2026 consensus is that skeletons win in a narrow band: loads between 400ms and 3s, predictable layouts (feeds, profiles, product grids), skeleton geometry matching the real layout exactly, and content-heavy (not action-heavy) surfaces. Outside that band, a spinner or content-first rendering is better ([72Technologies — Skeleton Screens vs Spinners 2026](https://www.72technologies.com/blog/skeleton-screens-vs-spinners-2026)).

### Progressive loading

Progressive loading — where individual elements become visible as soon as they load, rather than displaying all at once — is the pattern Facebook/Instagram pioneered. It works because it provides continuous evidence of progress. The key implementation principle: above-fold content loads first, below-fold content loads as the user approaches it, and every element has a matching placeholder so there is no layout shift.

### The "never block the main thread" rule

iOS and Android display at least 60fps, giving the UI system at most 16.67ms per frame to do all work. If any thread — JS, UI, or render — exceeds that budget, a frame is dropped and the UI appears janky ([React Native — Performance Overview](https://reactnative.dev/docs/performance)). The 2026 rule is absolute: no synchronous work on the JS thread during scroll. Heavy computations are deferred to `InteractionManager.runAfterInteractions`, moved to Reanimated worklets on the UI thread, or pre-computed and cached.

### The "first contentful paint" obsession

The moment a screen stops feeling empty and starts feeling useful defines perceived speed more than any backend metric. Users do not think about API latency or database queries — they care about one question: "how long until I can actually do something?" ([Digia — Screen Load Performance](https://www.digia.tech/post/screen-load-performance-mobile-apps-fmp-tti)). This is why Pinterest built Visually Complete into their base UI class, and why Instagram prefetches content before the user reaches it.

---

## 3. Architectural Issues & Engineering Flaws

Performance debt is not a cosmetic issue — it blocks production directly. The failure modes are concrete and compounding:

### Slow launch = bounce

Android Vitals flags cold starts at 5+ seconds as "excessive" and uses this data to influence Play Store search ranking. In practice, most teams target <2s on a mid-range device — the threshold where launch feels instant to a human. Exceeding it means the app's Play Store visibility takes a direct hit ([Luciq — Mobile App Cold Start](https://www.luciq.ai/blog/what-is-a-cold-start)). On iOS, Apple recommends first frame in under 400ms, with total launch under 1-2s before frustration sets in. A 3.8s cold start on a mid-tier Android — a common state for unoptimized React Native apps — produces an immediate bounce from a significant fraction of users.

### Janky scroll = "cheap app" perception

Scroll jank is the single most visible performance defect. Users do not name it as "frame drops" — they perceive it as the app feeling "cheap," "laggy," or "broken." A list scrolling at 42fps on a mid-range Android is not a minor issue; it is a brand-quality issue that undermines trust in the marketplace. The root cause is almost always the JS thread being blocked during scroll: synchronous filtering, inline style computation, bridge serialization per-item, or GC pauses from growing arrays ([DEV — Benchmarking React Native's Bridge Bottleneck](https://dev.to/kollittle/i-benchmarked-react-natives-bridge-bottleneck-heres-what-actually-fixed-82-of-frame-drops-57mn)).

### Large bundle = install abandonment

App install size directly correlates with install rates. Every MB over the baseline reduces install conversion, particularly on cellular networks and in emerging markets. A Hermes bytecode bundle for a mid-sized app should be 2-6MB; if it is 15MB, something is very wrong — usually entire-library imports (`import _ from 'lodash'` instead of `import debounce from 'lodash/debounce'`), unstripped icon fonts, or moment.js locales ([72Technologies — App Size Bloat](https://www.72technologies.com/blog/react-native-app-size-bloat-2026)).

### Memory leaks = crashes

The most insidious memory issue in React Native is the disconnect between the JS heap and the native heap. Hermes GC sees only the small JS handle for a native-backed object — a few bytes — while the object keeps megabytes alive in C++ (bitmaps, video buffers, camera buffers, JSI native module allocations). The JS heap snapshot can be flat while resident memory climbs until Android kills the process with an `OutOfMemoryError` ([Medium — Your React Native Heap Snapshot Is Lying to You](https://medium.com/@developershanker95/your-react-native-heap-snapshot-is-lying-to-you-2298f05a5f52)). In 2026, worklet compilation leaks are a documented production issue: `HermesRuntime` instances from Reanimated worklets persist after component unmount, with 2,263 instances retained in 60 seconds of pan/zoom in one reported case ([react-native-reanimated Issue #9438](https://github.com/software-mansion/react-native-reanimated/issues/9438)).

### The compounding nature of perf debt

Performance debt compounds. Each regression is too small to notice on the day it lands, but over six months the launch quietly slides from "satisfying snap" to "kind of sluggish." Averages hide this because they are dragged toward fast devices and warm caches — the complaints come from the p75 and p95, the slow quarter of users on older devices ([Rork Lab — Cold Start Regression Field Notes](https://rorklab.net/en/articles/rork-dev/rork-cold-start-regression-tti-instrumentation-startup-budget-field-notes)). Without a CI startup budget and per-release regression tracking, the drift is invisible until users complain.

---

## 4. AI Slop Diagnosis

AI-generated code creates predictable, identifiable performance problems. These are the patterns to audit for and eliminate:

### Unnecessary re-renders

AI models frequently generate components that re-render on every parent update because they are not wrapped in `React.memo` and their props are not referentially stable. A component that re-renders 5× when it should render once is 5× the JS thread work — the #1 underestimated problem in React Native ([AgileSoft Labs — 15 Fixes That Work](https://www.agilesoftlabs.com/blog/2026/03/react-native-performance-optimization)).

### Missing memoization

AI code often computes derived values inline during render: `data.filter(...).map(...)` runs synchronously on the JS thread on every render. The fix is `useMemo` for derived data and `useCallback` for handlers passed to memoized children. But AI models also over-apply memoization blindly — `useMemo` on trivial values adds overhead without benefit. The rule: measure before and after ([Shopify — Performant Components](https://github.com/Shopify/flash-list/blob/main/documentation/docs/fundamentals/performant-components.md)).

### Inline style objects

`style={{ flex: 1 }}` creates a new object on every render, defeating `React.memo` because the style prop is never referentially equal. AI-generated code is saturated with inline style objects. The ThryftVerse codebase has **561 instances** of `style={{` across `frontend/src` — each one is a potential re-render trigger on a memoized child. The fix is `StyleSheet.create` or `useMemo(() => [styles.foo, dynamicStyle], [deps])`.

### Expensive computations in render

AI models place sorting, filtering, date formatting, and image URL construction directly in the render path. These should be memoized or moved to `useMemo` with proper dependency arrays. In FlashList item components, this is especially critical: when recycling, the item component re-renders with new data, so any per-render computation is multiplied by the recycle rate.

### Missing key props

AI-generated lists frequently use array index as the key or omit keys entirely. This causes React to reuse the wrong component instances during recycling, producing visual glitches and wasted reconciliation work. FlashList v2 specifically warns that using `key` prop inside item components breaks recycling ([Shopify — Performant Components](https://github.com/Shopify/flash-list/blob/main/documentation/docs/fundamentals/performant-components.md)).

### The "AI doesn't profile" problem

The fundamental issue: AI models do not profile. They write code that looks correct but has never been measured against a frame budget. A senior engineer writes the same component, then opens React DevTools Profiler, checks the render count, and optimizes. AI models skip this step entirely. The result is code that passes TypeScript and tests but drops frames in production on a mid-range Android.

---

## 5. Current ThryftVerse Audit

### What is working

ThryftVerse has a solid performance foundation in several areas:

- **FlashList adoption**: 202 FlashList matches vs 79 FlatList matches — the majority of lists use FlashList v2 (`@shopify/flash-list` 2.0.2, `frontend/package.json:70`).
- **expo-image with native caching**: `CachedImage.tsx` wraps `expo-image` with `cachePolicy="memory-disk"`, blurhash placeholders, focal-point positioning, CDN downscaling with derivative buckets, and recycling keys (`frontend/src/components/CachedImage.tsx:328-333`). 565 CachedImage usages across the codebase.
- **Reanimated 4 worklets**: 371 `runOnJS` usages indicate heavy worklet adoption for UI-thread animations (`react-native-reanimated` 4.5.1).
- **React Query caching**: `queryClient.ts` has sensible defaults — 5min staleTime, 30min gcTime, retry with non-retryable status codes, `refetchOnWindowFocus: false` (`frontend/src/platform/server/queryClient.ts:17-28`).
- **Performance monitoring hooks**: `usePerformanceMonitor` tracks render time and scroll FPS via Reanimated `useFrameCallback` worklet (`frontend/src/hooks/usePerformanceMonitor.ts`). `FrameProfiler` provides ring-buffer-based frame metrics with jank scoring (`frontend/src/creator/core/performance/FrameProfiler.ts`).
- **Bundle size CI gate**: `check-bundle-size.mjs` exports the iOS bundle and compares against a threshold (`frontend/scripts/check-bundle-size.mjs`).
- **Console stripping**: `babel.config.js` strips `console.log/warn` in production, preserving `console.error` (`frontend/babel.config.js:11-13`).
- **Skeleton coverage**: Screen-specific skeletons exist for ProductDetail, Chat, Settings, Trade, AssetDetail, AuctionDetail, WriteReview, CreateSyndicate, PosterViewer, and Inbox (`frontend/src/components/skeletons/`, `frontend/src/screens/`).
- **Image prefetching**: `imagePreloader.ts` provides batched prefetch with concurrency control (`frontend/src/utils/imagePreloader.ts`). `CommerceMediaStage` and `MediaStage` prefetch next-page images on gallery page change (`frontend/src/components/commerce/CommerceMediaStage.tsx:793-796`).

### Concrete defects

**P0 — Launch path is unoptimized**

- **15 fonts loaded synchronously at startup**: `App.tsx:119-135` loads 7 Inter weights plus 8 decorative fonts (Anton, BebasNeue, Caveat, DancingScript, Lobster, Pacifico, PlayfairDisplay, PressStart2P) via `useFonts()`. The decorative fonts are used only in the Poster/Look composer but block the entire app's first paint. This adds hundreds of milliseconds to cold start TTI. **Fix**: Load only Inter (regular, medium, semibold, bold) at startup; lazy-load decorative fonts when the creator surface mounts.
  — `frontend/App.tsx:119-135`

- **No explicit New Architecture / Hermes V1 configuration**: `app.config.js` and `app.json` do not set `newArchEnabled` or `jsEngine: "hermes"` explicitly. Expo SDK 57 / React Native 0.86 defaults to the New Architecture and Hermes, but the absence of explicit configuration means a regression in defaults would go unnoticed. React Native 0.84+ ships Hermes V1 as default with 7.6% faster TTI on low-end Android and 9% faster bundle load on iOS ([React Native 0.84 blog](https://reactnative.dev/blog/2026/02/11/react-native-0.84)).
  — `frontend/app.config.js:70-77`, `frontend/app.json`

- **4.5s boot timeout**: `App.tsx:138-143` sets a 4.5s timeout before showing a boot-timed-out fallback. This is a safety net, but it signals that the boot path is slow enough to need a 4.5s fallback. A flagship app should never approach this threshold.
  — `frontend/App.tsx:138-143`

**P1 — Render optimization gaps**

- **561 inline style objects**: `style={{ ... }}` appears 561 times across `frontend/src`. Each creates a new object on every render, defeating `React.memo` on children that receive these styles. Examples: `frontend/src/screens/VerificationScreen.tsx:392` (`style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}`), `frontend/src/screens/AuctionDetailScreen.tsx:1531` (`style={{ height: Space.md }}`), `frontend/src/navigation/AppNavigator.tsx:102` (`style={{ flex: 1 }}`).
  — 561 instances across `frontend/src/`

- **76 React.memo usages for 565 CachedImage usages**: The ratio of `React.memo` (76) to `CachedImage` (565) suggests most CachedImage instances are not memoized. Since CachedImage is a heavy component (Reanimated shared values, animated styles, CDN URL construction), every parent re-render triggers a CachedImage re-render with new inline-style props.
  — `frontend/src/components/CachedImage.tsx:79` (not wrapped in `React.memo`)

- **Only 3 files use estimatedItemSize / getItemLayout**: FlashList requires `estimatedItemSize` for correct recycling. Without it, FlashList falls back to measurement, causing scroll position jumps and blank rows. Only `PinterestMasonryGrid.tsx`, `FullscreenMediaViewer.tsx`, and `CoOwnMarketHighlightsCarousel.tsx` use these props. The remaining ~199 FlashList usages are missing `estimatedItemSize`.
  — `frontend/src/components/discover/PinterestMasonryGrid.tsx:54`, `frontend/src/components/product/FullscreenMediaViewer.tsx:377`, `frontend/src/components/coown/CoOwnMarketHighlightsCarousel.tsx:165`

- **79 FlatList usages not migrated to FlashList**: FlatList does not recycle views — it mounts and unmounts cells, causing bridge traffic and native view churn. Files still using FlatList: `LookCommentsSheet.tsx:182`, `AIEffectGrid.tsx:294`, `CaptionEditorSheet.tsx:520`, `ProductBrowserSheet.tsx:511`, `PublicProfileConnectionsSheet.tsx:150,186`.
  — 79 instances across `frontend/src/`

- **Only 2 files tune FlatList virtualization props**: `removeClippedSubviews`, `windowSize`, `initialNumToRender`, `maxToRenderPerBatch` appear only in `NotificationsScreen.tsx:864-867` and `CoOwnMarketHighlightsCarousel.tsx:177-179`. All other FlatLists use defaults.
  — `frontend/src/screens/NotificationsScreen.tsx:864-867`

**P1 — No code splitting**

- **0 `React.lazy` usages, 0 `Suspense` boundaries**: The entire JS bundle is loaded at startup. Heavy feature modules (creator canvas, auction detail, co-own trade, poster composer) are bundled into the main bundle and parsed at launch. React Native does not support `React.lazy` natively in the same way as web, but the equivalent — deferred module loading via `InteractionManager.runAfterInteractions` or conditional imports — is absent (0 `InteractionManager` usages).
  — 0 matches across `frontend/src/`

**P1 — Prefetching is limited**

- **Only 13 prefetch matches**: Image prefetching exists in `PosterViewerScreen.tsx` (next-frame prefetch), `CommerceMediaStage.tsx` (next-gallery-page prefetch), `MediaStage.tsx` (next-item prefetch), and `imagePreloader.ts` (batched preload). But there is no systematic prefetching on predictable navigation paths: tapping a product card does not prefetch the product detail images before navigation completes; scrolling a feed does not prefetch the next page's images until pagination fires.
  — `frontend/src/screens/PosterViewerScreen.tsx:407,413`, `frontend/src/components/commerce/CommerceMediaStage.tsx:793,796`

**P1 — Performance monitoring is not production-deployed**

- **`usePerformanceMonitor` is used in only 1 screen**: The hook exists and is well-designed (dev-only, Reanimated worklet FPS sampling, render-time measurement), but it is imported only in `PosterComposerScreen.tsx:147`. The other ~40 screens in the app have no performance instrumentation.
  — `frontend/src/creator/poster/PosterComposerScreen.tsx:147`

- **No production performance telemetry**: `usePerformanceMonitor` early-returns in production (`if (!__DEV__) return`). There is no production performance monitoring — no Sentry performance transactions, no Firebase Performance Monitoring, no custom perf endpoint. The `FrameProfiler` is creator-canvas-only and dev-only (`frontend/src/creator/core/performance/FrameProfiler.ts`).
  — `frontend/src/hooks/usePerformanceMonitor.ts:112,149`

**P2 — Bundle size threshold is unclear**

- **Bundle size threshold is 1.5MB**: `check-bundle-size.mjs` defaults to 1.5MB (`1_572_864` bytes). For a Hermes bytecode bundle, 1.5MB is very tight — a mid-sized app should be 2-6MB. This threshold may be causing false failures or may not be running in CI at all (it requires `npx expo export` which is slow). The script is not wired into the `verify:phase` script (`frontend/package.json:38`).
  — `frontend/scripts/check-bundle-size.mjs:31`, `frontend/package.json:38`

**P2 — No memory management strategy**

- **No `clearImageCache` usage on logout**: `imagePreloader.ts` exports `clearImageCache()` (`frontend/src/utils/imagePreloader.ts:64-70`) but there is no evidence it is called on logout or memory-pressure events. Image cache grows unbounded.
- **No worklet cleanup**: With 371 `runOnJS` usages and Reanimated 4 worklets, the documented worklet memory leak ([react-native-reanimated #9438](https://github.com/software-mansion/react-native-reanimated/issues/9438)) is a risk. No explicit `cancelAnimation` or worklet disposal patterns are visible outside `CachedImage.tsx:117`.

---

## 6. Micro Improvements (Per-Component)

### CachedImage

- Wrap `CachedImage` in `React.memo` with a custom comparator that checks `uri`, `downscaleWidth`, `contentFit`, `focalPoint`, `priority`, and `isVisible` — skipping `style` if it is a `StyleSheet` reference.
- Move the `sourceUri` CDN URL construction (currently in `useMemo`, `CachedImage.tsx:166-210`) to a module-level pure function to reduce closure overhead.
- Add `recyclingKey` to all `CachedImage` usages in FlashList items (currently only set internally).

### FlashList item components

- Audit every FlashList `renderItem` component: wrap in `React.memo`, ensure all callbacks are `useCallback`-stable, move inline styles to `StyleSheet.create`.
- Add `estimatedItemSize` to every FlashList — measure the median row height at design time or via `onLayout` at runtime.
- Remove `key` prop from item components (FlashList v2 warns this breaks recycling).

### FlatList → FlashList migration

- Migrate `LookCommentsSheet.tsx`, `AIEffectGrid.tsx`, `CaptionEditorSheet.tsx`, `ProductBrowserSheet.tsx`, `PublicProfileConnectionsSheet.tsx` to FlashList with `estimatedItemSize`.
- For remaining FlatLists (short lists <20 items where FlashList overhead is not recoupable), add `getItemLayout` where row heights are fixed.

### Inline style elimination

- Replace all 561 `style={{ ... }}` instances with `StyleSheet.create` references or `useMemo`-wrapped style arrays.
- For dynamic styles (e.g., `style={{ height: Space.md }}`), use `useMemo(() => StyleSheet.create({ spacer: { height: Space.md } }), [Space.md])`.

### Font loading

- Split font loading: load Inter (400, 500, 600, 700) at startup; lazy-load decorative fonts (Anton, BebasNeue, Caveat, DancingScript, Lobster, Pacifico, PlayfairDisplay, PressStart2P) when the creator surface first mounts via `expo-font`'s `loadAsync`.

---

## 7. Macro Improvements (The Performance System)

### 7.1 Render optimization contract

Establish a linting rule and code review gate:
- No inline style objects in JSX — use `StyleSheet.create` or memoized style arrays.
- Every component rendered inside a FlashList `renderItem` must be wrapped in `React.memo`.
- Every callback passed to a memoized child must be `useCallback`-stable.
- No `filter`/`map`/`sort` chains in render — wrap in `useMemo` with proper deps.
- No `Date.now()`, `Math.random()`, or `new Date()` in render — these produce new values every render and break memoization.

### 7.2 Image pipeline

The current `CachedImage` is strong. The gaps are:
- **Stable cache keys for signed URLs**: If ThryftVerse uses signed S3/CloudFront URLs, the cache key changes on every URL expiry, defeating the disk cache. Derive a stable cache key from the URL pathname (excluding signature query params) and pass it as `recyclingKey` ([Rork Lab — Signed URL Cache Key Design](https://rorklab.net/en/articles/rork-dev/rork-expo-image-signed-url-stable-cache-key-design)).
- **Priority-aware loading**: Above-fold images load with `priority="high"`; below-fold images load with `priority="low"`. The `isVisible` prop exists but is not consistently passed from list surfaces.
- **WebP/AVIF delivery**: Ensure the CDN serves WebP/AVIF to reduce payload by 25-50% vs JPEG ([React Native Relay — expo-image Guide](https://reactnativerelay.com/article/expo-image-tutorial-caching-blurhash-2026)).

### 7.3 Code splitting strategy

React Native does not support `React.lazy`/`Suspense` in the same way as web, but the equivalent patterns are:
- **`InteractionManager.runAfterInteractions`**: Defer heavy module initialization until after the first interaction completes. Currently 0 usages — adopt for creator canvas, auction detail, and co-own trade module initialization.
- **Conditional native module loading**: TurboModules load lazily on demand in the New Architecture. Verify that native modules are not eagerly initialized at startup.
- **Deferred font loading**: As noted in §6, split decorative fonts from the startup path.

### 7.4 Prefetching system

Build a centralized prefetching layer:
- **Navigation-triggered prefetch**: When a user taps a product card, prefetch the product detail's hero image and first gallery image before navigation completes. Use `expo-image`'s `Image.prefetch()` with `cachePolicy: 'memory-disk'`.
- **Scroll-triggered prefetch**: When a FlashList's `onScroll` reports that the user is within N items of the end, prefetch the next page's first 4 images.
- **Background prefetch**: Following Instagram's model, prefetch the next feed page's content in the background after the current page renders, storing it in the React Query cache ([Instagram Engineering — Background Data Prefetching](https://instagram-engineering.com/improving-performance-with-background-data-prefetching-b191acb39898)).

### 7.5 Caching architecture

The React Query setup is solid but can be improved:
- **Per-query staleTime tuning**: `useListingQueries.ts` already has surface-specific staleTimes (5min for listings, 15min for detail, 1min for search). Extend this pattern to all query hooks.
- **Optimistic cache seeding**: On app launch, seed the React Query cache with the last-known home feed and profile data from AsyncStorage, so the first render shows stale-but-instant content while the fresh fetch completes.
- **Image cache budget**: Configure expo-image's disk cache size limit (platform-specific: SDWebImage on iOS, Glide on Android). Clear on logout via `clearImageCache()`.

### 7.6 Performance monitoring CI

- **Wire `check-bundle-size.mjs` into CI**: Add it to the `verify:phase` script or a dedicated CI step. Set the threshold to a realistic value (3MB for Hermes bytecode, not 1.5MB).
- **Add a startup budget**: Following Rork Lab's approach, set a p75 cold-start budget (e.g., <2s on Pixel 6a) and track it per release. Use `expo-application` launch timestamp + `performance.mark('app:interactive')` (already present in `App.tsx:152`) to measure TTI ([Rork Lab — TTI Instrumentation](https://rorklab.net/en/articles/rork-dev/rork-cold-start-regression-tti-instrumentation-startup-budget-field-notes)).
- **Deploy `usePerformanceMonitor` to all primary screens**: Home, Explore, ProductDetail, Profile, Chat, Inbox, AuctionDetail. In production, route warnings to Sentry as performance breadcrumbs (not console.warn, which is stripped).
- **Add React DevTools Profiler to the dev workflow**: The profiler is the only way to identify unnecessary re-renders. Document the workflow in the engineering wiki.

### 7.7 Memory management

- **Image cache cleanup on logout**: Call `clearImageCache()` from `imagePreloader.ts` during the logout flow.
- **Worklet disposal audit**: For every component using `useFrameCallback` or `useAnimatedReaction`, verify that `cancelAnimation` is called in the cleanup function. The documented Reanimated 4 worklet leak ([react-native-reanimated #9438](https://github.com/software-mansion/react-native-reanimated/issues/9438)) makes this critical.
- **Native memory monitoring**: In production, use `HermesInternal.getInstrumentedStats()` to track the Hermes heap, and platform-level memory APIs (iOS `os_proc_available_memory`, Android `Debug.getNativeHeapAllocatedSize`) to track native heap growth. The native heap is where the silent leaks live ([Medium — Heap Snapshot Is Lying](https://medium.com/@developershanker95/your-react-native-heap-snapshot-is-lying-to-you-2298f05a5f52)).

### 7.8 Hermes optimization

- **Verify Hermes bytecode is shipped**: Check for `.hbc` files in the build output. If the app is shipping raw JS, startup time is 30-50% slower than necessary ([React Native — Using Hermes](https://reactnative.dev/docs/hermes)).
- **Enable `-O` optimization**: The Hermes compiler's `-O` flag yields 10-22% bundle size reduction by stripping the symbol table. Requires a two-step sourcemap merge for production debugging ([BestHub — Optimizing Hermes Bytecode Bundle Size](https://www.besthub.dev/articles/optimizing-hermes-bytecode-bundle-size-and-sourcemap-handling-in-react-native-5c90bba9cc4b)).
- **Use xz compression**: Reduces the ZIP-compressed HBC bundle by 20-26% ([BestHub](https://www.besthub.dev/articles/optimizing-hermes-bytecode-bundle-size-and-sourcemap-handling-in-react-native-5c90bba9cc4b)).
- **Enable bsdiff for OTA patches**: `app.json` already has `enableBsdiffPatchSupport: true` (`app.json:121`) — verify it is producing small incremental patches.

---

## 8. Flagship Acceptance Criteria

A ThryftVerse screen or surface is flagship-performance-ready when ALL of the following are true:

| Criterion | Target | Measurement |
|---|---|---|
| Cold start TTI | <2.0s mid-range Android (Pixel 6a), <1.2s iPhone 13 | `performance.mark('app:interactive')` — `App.tsx:152` |
| Sustained scroll FPS | 58+ fps on p99 device | `usePerformanceMonitor` scroll FPS sampling |
| Interaction response | <100ms tap to first visual feedback | React DevTools Profiler + manual testing |
| JS bundle size | <4MB Hermes bytecode (production) | `check-bundle-size.mjs` in CI |
| JS memory working set | <180MB for normal session | Hermes instrumented stats + platform memory APIs |
| Memory leaks | Zero monotonic growth across 50 mount/unmount cycles | Xcode Instruments / Android Studio Profiler |
| Skeleton coverage | Every async surface has a geometry-matching skeleton | Design.md "Perceived Performance & Visual Completion" |
| Prefetching | Predictable navigation paths prefetch next-surface images | `Image.prefetch()` on card tap, scroll-end, background |
| Visually Complete | Every primary surface has a defined Visually Complete condition | Design.md surface contracts |
| Layout shift | Zero above-fold layout shift after image decode | Skeleton aspect-ratio parity |
| Reduced motion | All animations have instant/fade fallback | `useReducedMotion` in all animated components |
| Re-render hygiene | No unnecessary re-renders in FlashList items | React DevTools Profiler — render count ≤1 per data change |

---

## 9. Priority & Sequencing

### Phase 1 — Launch path (P0, immediate)

1. Split font loading: Inter at startup, decorative fonts lazy-loaded on creator surface mount.
2. Explicitly configure Hermes V1 and New Architecture in `app.config.js`.
3. Seed React Query cache with last-known home feed / profile on launch for instant first render.
4. Verify Hermes bytecode (`.hbc`) is shipped in production builds.

### Phase 2 — Render optimization (P1, same pass)

1. Eliminate 561 inline style objects → `StyleSheet.create` or memoized style arrays.
2. Wrap all FlashList `renderItem` components in `React.memo` with stable callbacks.
3. Add `estimatedItemSize` to every FlashList.
4. Migrate remaining 79 FlatLists to FlashList (or add `getItemLayout` + virtualization tuning for short lists).
5. Wrap `CachedImage` in `React.memo` with custom comparator.

### Phase 3 — Prefetching & caching (P1, same pass)

1. Build navigation-triggered image prefetch (card tap → prefetch detail hero).
2. Build scroll-triggered next-page image prefetch.
3. Implement stable cache keys for signed URLs.
4. Wire `clearImageCache()` into logout flow.

### Phase 4 — Performance monitoring (P1, same pass)

1. Deploy `usePerformanceMonitor` to all primary screens (Home, Explore, ProductDetail, Profile, Chat, Inbox, AuctionDetail).
2. Route production performance warnings to Sentry breadcrumbs.
3. Wire `check-bundle-size.mjs` into CI with a realistic 3MB threshold.
4. Add startup budget tracking per release (p75 cold start on Pixel 6a class).

### Phase 5 — Memory & advanced (P2, follow-up)

1. Audit all `useFrameCallback` / `useAnimatedReaction` usages for cleanup.
2. Add native memory monitoring (Hermes stats + platform APIs).
3. Enable Hermes `-O` optimization and xz compression in CI.
4. Implement `InteractionManager.runAfterInteractions` for heavy module initialization.

---

## 10. Token-Level Spec Table

| Dimension | Budget / Target | Enforcement | Source |
|---|---|---|---|
| **Launch time (cold start TTI)** | <2.0s Android Pixel 6a, <1.2s iPhone 13 | `performance.mark('app:interactive')` + Sentry breadcrumb | `App.tsx:152`, [RapidNative 2026](https://www.rapidnative.com/blogs/react-native-performance-optimization-2026-playbook) |
| **Launch time (warm start)** | <1.0s | Navigation focus timestamp → first paint | [Android Vitals](https://developer.android.com/topic/performance/vitals/launch-time) |
| **Scroll FPS (sustained)** | 58+ fps on p99 device | `usePerformanceMonitor` Reanimated worklet sampling | `usePerformanceMonitor.ts:164-205` |
| **Scroll FPS (minimum acceptable)** | 45 fps (below this = P1 defect) | `usePerformanceMonitor` warning at <58 for 10 frames | `usePerformanceMonitor.ts:72-73` |
| **Interaction response** | <100ms tap to first visual feedback | React DevTools Profiler + manual testing | [RapidNative 2026](https://www.rapidnative.com/blogs/react-native-performance-optimization-2026-playbook) |
| **Render time (per screen mount)** | <400ms first paint after navigation focus | `usePerformanceMonitor` render-time warning | `usePerformanceMonitor.ts:71` |
| **Frame budget (per frame)** | 16.67ms (60fps) | `FrameProfiler` ring buffer, drop threshold 25ms | `FrameProfiler.ts:60,66` |
| **JS bundle size** | <4MB Hermes bytecode (production) | `check-bundle-size.mjs` in CI, threshold 4MB | `check-bundle-size.mjs:31`, [72Technologies](https://www.72technologies.com/blog/react-native-app-size-bloat-2026) |
| **Install size (IPA/AAB)** | <50MB initial install | App Store Connect / Play Console | [72Technologies](https://www.72technologies.com/blog/react-native-app-size-bloat-2026) |
| **JS memory working set** | <180MB normal session | `HermesInternal.getInstrumentedStats()` + platform memory APIs | `usePerformanceMonitor.ts:22`, [RapidNative 2026](https://www.rapidnative.com/blogs/react-native-performance-optimization-2026-playbook) |
| **Native heap ceiling** | <350MB (Android kill threshold varies by device) | Android Studio Profiler / Xcode Instruments | [Medium — Heap Snapshot](https://medium.com/@developershanker95/your-react-native-heap-snapshot-is-lying-to-you-2298f05a5f52) |
| **Image disk cache** | 200MB ceiling (configurable per platform) | expo-image cache config + `clearImageCache()` on logout | `imagePreloader.ts:64-70` |
| **Image memory cache** | LRU, evicted on memory pressure | expo-image `cachePolicy="memory-disk"` (already set) | `CachedImage.tsx:328` |
| **Prefetch distance (navigation)** | 1 screen ahead (hero + first gallery image) | `Image.prefetch()` on card tap, before navigation | `CommerceMediaStage.tsx:793-796` |
| **Prefetch distance (scroll)** | 4 items ahead of last visible item | FlashList `onScroll` / `onEndReached` triggered prefetch | [Instagram Engineering](https://instagram-engineering.com/improving-performance-with-background-data-prefetching-b191acb39898) |
| **Prefetch concurrency** | 4 concurrent image prefetches | `imagePreloader.ts` `maxConcurrent: 4` | `imagePreloader.ts:16` |
| **Skeleton duration (min)** | 400ms — below this, skeleton flashes; use content-first | Design.md "Perceived Performance" | [72Technologies — Skeletons 2026](https://www.72technologies.com/blog/skeleton-screens-vs-spinners-2026) |
| **Skeleton duration (max)** | 3s — above this, users suspect broken; add progress indicator | Design.md "Perceived Performance" | [72Technologies](https://www.72technologies.com/blog/skeleton-screens-vs-spinners-2026) |
| **Skeleton geometry** | Exact match to final layout (same aspect ratio, same row count, same rhythm) | Design.md "Performance gate" | Design.md:1541-1549 |
| **Layout shift** | Zero above-fold shift after image decode | Skeleton aspect-ratio parity, server media dimensions | Design.md:627-629 |
| **React Query staleTime (default)** | 5min | `queryClient.ts:20` | `queryClient.ts:20` |
| **React Query gcTime (default)** | 30min | `queryClient.ts:21` | `queryClient.ts:21` |
| **React Query retry** | 2 retries, non-retryable on 400/401/403/404/409/422 | `queryClient.ts:5-14` | `queryClient.ts:5-14` |
| **Font loading (startup)** | 4 Inter weights only (400, 500, 600, 700) | `useFonts()` in `App.tsx` — split decorative fonts | `App.tsx:119-135` |
| **Font loading (deferred)** | 8 decorative fonts loaded on creator surface mount | `expo-font` `loadAsync` in creator module | `App.tsx:126-134` |
| **Console output (production)** | Stripped (except `console.error`) | `babel.config.js` `transform-remove-console` | `babel.config.js:11-13` |
| **Re-render count (FlashList items)** | ≤1 per data change | React DevTools Profiler | [Shopify — Performant Components](https://github.com/Shopify/flash-list/blob/main/documentation/docs/fundamentals/performant-components.md) |
| **Inline style objects** | 0 in production code | ESLint rule + code review | 561 current instances |
| **`React.memo` coverage** | 100% of FlashList `renderItem` components | Code review gate | 76 current usages |
| **`estimatedItemSize` coverage** | 100% of FlashList usages | Code review gate | 3 current usages |
| **Reduced motion fallback** | All animations have instant/fade fallback | `useReducedMotion` in all animated components | `CachedImage.tsx:103,146` |
| **Worklet cleanup** | `cancelAnimation` in every `useFrameCallback` cleanup | Code review + memory profiler | `CachedImage.tsx:117` |
| **Boot timeout** | <2s (current fallback: 4.5s) | `App.tsx` boot timeout + Sentry TTI mark | `App.tsx:138-143` |
| **OTA patch size** | <85% reduction via bsdiff | `app.json` `enableBsdiffPatchSupport` | `app.json:121`, [BestHub](https://www.besthub.dev/articles/optimizing-hermes-bytecode-bundle-size-and-sourcemap-handling-in-react-native-5c90bba9cc4b) |

---

## References

1. React Native — Performance Overview. https://reactnative.dev/docs/performance
2. RapidNative — React Native Performance Optimization: The 2026 Playbook. https://www.rapidnative.com/blogs/react-native-performance-optimization-2026-playbook
3. React Native Relay — Ultimate Guide React Native Performance Optimization 2026. https://reactnativerelay.com/article/ultimate-guide-react-native-performance-optimization-2026
4. AgileSoft Labs — React Native Performance: 15 Fixes That Work (2026). https://www.agilesoftlabs.com/blog/2026/03/react-native-performance-optimization
5. Apptitude — React Native Performance Optimization: Production Playbook. https://apptitude.io/blog/react-native-performance-optimization/
6. 72Technologies — Skeleton Screens vs Spinners: A 2026 UX Decision Guide. https://www.72technologies.com/blog/skeleton-screens-vs-spinners-2026
7. Codexical — Skeleton Screens Don't Always Win. The Data Will Surprise You. https://www.codexical.com/posts/2026-05-09-skeleton-screens-vs-spinners-science
8. Timothy Graf — The Psychology of Perceived Performance. https://timgraf.com/ui/the-psychology-of-perceived-performance-why-skeleton-screens-beat-spinners-in-2026/
9. Viget — A Bone to Pick with Skeleton Screens. https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens
10. Digia — Screen Load Performance: How FMP and TTI Shape Mobile App Speed. https://www.digia.tech/post/screen-load-performance-mobile-apps-fmp-tti
11. Shopify — FlashList Performant Components. https://github.com/Shopify/flash-list/blob/main/documentation/docs/fundamentals/performant-components.md
12. Hambardzumian — FlashList vs FlatList: React Native Lists. https://hambardzumian.com/blog/react-native-flashlist-recycling-flatlist-performance
13. Shopify Engineering — FlashList v2: A ground-up rewrite. https://shopify.engineering/flashlist-v2
14. React Native Relay — expo-image Tutorial: Caching, Blurhash, and Performance (2026). https://reactnativerelay.com/article/expo-image-tutorial-caching-blurhash-2026
15. Rork Lab — Switching to Signed URLs Killed My Image Cache. https://rorklab.net/en/articles/rork-dev/rork-expo-image-signed-url-stable-cache-key-design
16. Rork Lab — Slow Images in My Rork Wallpaper App: Switching to expo-image. https://rorklab.net/en/articles/app-dev/rork-wallpaper-image-loading-expo-image-performance-guide
17. React Native — Optimizing JavaScript Loading. https://reactnative.dev/docs/optimizing-javascript-loading
18. React Native — Using Hermes. https://reactnative.dev/docs/hermes
19. 72Technologies — React Native App Size Audit: Cutting Bundle Bloat in 2026. https://www.72technologies.com/blog/react-native-app-size-bloat-audit-2026
20. 72Technologies — React Native App Size: What's Actually Bloating Your Bundle. https://www.72technologies.com/blog/react-native-app-size-bloat-2026
21. BestHub — Optimizing Hermes Bytecode Bundle Size and SourceMap Handling. https://www.besthub.dev/articles/optimizing-hermes-bytecode-bundle-size-and-sourcemap-handling-in-react-native-5c90bba9cc4b
22. Android Developers — App startup time. https://developer.android.com/topic/performance/vitals/launch-time
23. Luciq — Mobile App Cold Start Explained. https://www.luciq.ai/blog/what-is-a-cold-start
24. Rork Lab — Cold Start Regression TTI Instrumentation and Startup Budget. https://rorklab.net/en/articles/rork-dev/rork-cold-start-regression-tti-instrumentation-startup-budget-field-notes
25. Android Developers — Baseline Profiles Case Study: Android Calendar. https://developer.android.com/topic/performance/baselineprofiles/case-study-android-calendar
26. Medium — Your React Native Heap Snapshot Is Lying to You. https://medium.com/@developershanker95/your-react-native-heap-snapshot-is-lying-to-you-2298f05a5f52
27. react-native-reanimated Issue #9438 — Worklet compilations leak HermesRuntime instances. https://github.com/software-mansion/react-native-reanimated/issues/9438
28. react-native-worklets-core Issue #271 — WorkletRuntime Hermes contexts persist after unmount. https://github.com/margelo/react-native-worklets-core/issues/271
29. SWMansion — The Memory Hermes Can't See: Stale Shadow Nodes. https://swmansion.com/blog/the-memory-hermes-cant-see-stale-shadow-nodes-in-react-native/
30. React Native — Profiling. https://reactnative.dev/docs/profiling
31. DEV — I Benchmarked React Native's Bridge Bottleneck. https://dev.to/kollittle/i-benchmarked-react-natives-bridge-bottleneck-heres-what-actually-fixed-82-of-frame-drops-57mn
32. AptixLabs — How to keep a React Native app at 60fps. https://aptixlabs.com/insights/react-native-60fps
33. Instagram Engineering — Improving performance with background data prefetching. https://instagram-engineering.com/improving-performance-with-background-data-prefetching-b191acb39898
34. Pinterest Engineering — Performance for Everyone. https://medium.com/pinterest-engineering/performance-for-everyone-21a560260d08
35. Product Science — Pinterest iOS case study. https://www.productscience.ai/case-studies/pinterest-ios
36. Pinterest Engineering — Improving the Player on Android. https://medium.com/pinterest-engineering/improving-the-player-on-android-8b7faf9009cf
37. LinkedIn — How Resource Hinting Helped Instagram Achieve 25% Reduction in Image Load Times. https://www.linkedin.com/pulse/how-resource-hinting-helped-instagram-achieve-25-reduction-kumar-strkc
38. React Native 0.84 — Hermes V1 by Default. https://reactnative.dev/blog/2026/02/11/react-native-0.84
39. React Native 0.82 — A New Era. https://reactnative.dev/blog/2025/10/08/react-native-0.82
40. Rork Lab — Two Months of Rork × Hermes in Production. https://rorklab.net/en/articles/rork-dev/rork-hermes-two-months-production-cold-start-memory-review
41. Zenodo — Performance Optimization and Architectural Evolution in React Native Mobile Applications. https://doi.org/10.5281/zenodo.17519381
42. Rork Lab — Staged Migration to the New Architecture. https://rorklab.net/en/articles/rork-dev/rork-new-architecture-fabric-turbomodules-staged-migration-six-apps
43. Margelo — How Margelo Helped Discord Improve React Native's New Architecture Performance. https://blog.margelo.com/margelo-discord-react-native-performance
