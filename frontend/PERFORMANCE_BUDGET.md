# Performance Budget

> **Authority:** 2026 August React Native performance research; AGENTS.md §16 (Performance).
>
> **Purpose:** Define measurable performance targets for ThryftVerse so every
> engineer can reason about whether a change is within budget or regresses a
> critical metric. These targets are for mid-tier Android (e.g. Pixel 6a /
> Snapdragon 7-class) and iPhone 13 unless otherwise noted.

---

## Targets (2026 August research)

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Cold start (TTI) | < 2.0s Android, < 1.2s iOS | 2–3s | > 3s |
| Screen transition | < 300ms | 300–500ms | > 500ms |
| Sustained scroll FPS | 58+ fps | 45 fps | < 30 fps |
| Interaction latency | < 100ms | 100–200ms | > 200ms |
| JS bundle size | < 2MB | 2–4MB | > 4MB |
| Image load (cached) | < 50ms | 50–200ms | > 200ms |
| JS thread idle | > 80% | 60–80% | < 60% |
| JS memory working set | < 180MB | 180–250MB | > 250MB |
| Install size (APK/IPA) | < 30MB | 30–50MB | > 50MB |

---

## Optimization checklist

- [x] Hermes engine enabled (default since RN 0.70; confirmed in `android/gradle.properties` `hermesEnabled=true`)
- [x] New Architecture enabled (Fabric + TurboModules + JSI; confirmed in `android/gradle.properties` `newArchEnabled=true`)
- [x] FlashList used for lists > 1 screen (60+ screens already migrated; see PERFORMANCE_AUDIT.md for remaining FlatList instances)
- [x] Reanimated worklets for animations (off JS thread; Reanimated 4.5 installed, `react-native-worklets` plugin active)
- [x] Metro tree-shaking configured (`inlineRequires` opt-in with blockList in `metro.config.js`; Metro tree-shakes unused exports automatically)
- [x] Image caching enabled (`expo-image` with `cachePolicy="memory-disk"` widely used across 25+ components)
- [x] Memoization on expensive components (React Compiler enabled in `babel.config.js` — auto-memoises components and hooks)
- [x] Lazy loading for heavy screens (React Navigation `getComponent(() => require(...))` pattern + `inlineRequires` defers module evaluation)
- [ ] Bundle size analyzed and under budget (run `npm run bundle:analyze` to verify; target < 2MB JS bundle)

---

## Measurement methodology

### Cold start (TTI)
- Measure in **release mode only** — dev mode is 2–5× slower.
- Android: `adb shell am start -W com.thryftverse.app` reports `TotalTime`.
- iOS: Instruments → App Launch template, measure to first frame.
- Target: < 2.0s on Pixel 6a (mid-tier Android), < 1.2s on iPhone 13.

### Sustained scroll FPS
- Use the in-app `performanceMonitor` (`src/platform/monitoring/performanceMonitor.ts`).
- Scroll a feed for 10 seconds at consistent speed.
- 99th-percentile device should sustain 58+ fps.
- Dev mode profiling is invalid — always profile in release.

### JS memory working set
- Android: Android Studio Profiler → Memory, or `adb shell dumpsys meminfo`.
- iOS: Instruments → Allocations, mark heap snapshot after sustained use.
- Target: < 180MB after 5 minutes of active use.

### Bundle size
- Run `npm run bundle:analyze` (Expo Atlas) to produce a visual bundle tree.
- Target: < 2MB for the JS bundle (Hermes bytecode).
- Install size: check EAS build output for APK/IPA size. Target < 30MB.

---

## Enforcement

- Any PR that regresses a target metric from green to yellow requires
  justification in the PR description.
- Any PR that regresses a target from green/yellow to critical is blocked
  until the regression is fixed or the target is formally revised.
- Run `npm run check:bundle-size` in CI to enforce bundle size limits.
- Run `npm run check:residue` to catch production code residue (console.log,
  debug flags) that bypasses babel stripping.
