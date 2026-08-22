# Bundle Analysis & Hermes Heap Profiling

This document covers the tooling configured for analysing the ThryftVerse
React Native bundle composition (Expo Atlas) and runtime memory behaviour
(Hermes heap snapshots). Use these tools to keep the bundle lean and to
diagnose memory leaks before they reach production.

---

## 1. Expo Atlas — Bundle Composition Analysis

### What it is

Expo Atlas is a bundle visualiser built into Expo SDK 51+. When activated
via the `EXPO_UNSTABLE_ATLAS=true` environment variable, `expo export`
emits a `.expo/atlas/` directory containing an interactive HTML report
that shows every module in the bundle, its size, and its position in the
dependency graph.

### How to run

```bash
# Android bundle analysis — generates .expo/atlas/ and exports the Android bundle
npm run bundle:analyze

# iOS bundle analysis — generates .expo/atlas/ and exports the iOS bundle
npm run bundle:analyze:ios
```

Both scripts set `EXPO_UNSTABLE_ATLAS=true` via `cross-env` (for
cross-platform compatibility on Windows and Unix) and then run
`npx expo export` for the target platform.

After the export completes, open the generated HTML report:

```bash
# The report is at .expo/atlas/ — open it in a browser
npx expo-atlas .expo/atlas.jsonl
```

### How to interpret the Atlas report

1. **Module sizes** — The treemap shows each module sized by its
   contribution to the bundle. Focus on the largest modules first; a
   single large dependency often dominates 20–30% of the bundle.

2. **Duplicate modules** — Atlas highlights modules that appear multiple
   times in the bundle (e.g., two versions of `lodash` or `zod` pulled by
   different dependencies). Eliminate duplicates by pinning a single
   version in `package.json` resolutions or by replacing the dependency.

3. **Tree-shaking opportunities** — Modules that import an entire library
   (`import * as _ from 'lodash'`) instead of named exports
   (`import { debounce } from 'lodash'`) prevent tree-shaking. Atlas
   shows the full module graph so you can trace which import path pulls
   in unused code.

4. **Dependency chains** — Click any module to see its importers and
   imports. This reveals unexpected transitive dependencies (e.g., a
   small UI component pulling in a large charting library).

5. **Per-platform differences** — Run both `bundle:analyze` and
   `bundle:analyze:ios` and compare. Platform-specific modules
   (`@react-native-community/async-storage`, `react-native-vision-camera`)
   may appear on one platform but not the other.

### Acting on Atlas data

- **Inline requires** — Already enabled in `metro.config.js` via
  `getTransformOptions` with `inlineRequires: true` and a `blockList` for
  side-effect modules. This defers module evaluation (a TTI lever, not a
  bundle-size lever). Verify that new modules with top-level side effects
  are added to the `blockList`.

- **Lazy loading** — Use `React.lazy()` or React Navigation's
  `getComponent(() => require(...))` pattern to split screen-level code
  so it loads on demand rather than at cold start.

- **Dynamic imports** — Replace static `import` with `require()` inside
  event handlers or effects for rarely-used features (e.g., barcode
  scanning, share sheet) so the code is evaluated only when the feature
  is first used.

- **Dependency replacement** — If Atlas shows a large dependency that is
  used for a small feature, replace it with a lighter alternative
  (e.g., `date-fns` instead of `moment`, `zod` mini instead of full `zod`).

---

## 2. Metro Profiler — Build-Time Transform Analysis

### How to run

```bash
npm run bundle:profile
```

This runs `npx expo start --profile`, which activates Metro's built-in
profiler. The profiler instruments the transform pipeline and reports
per-file transform times, helping identify modules that are slow to
compile (e.g., large generated files, files with heavy Babel transforms).

Use this when iterating on build speed, not for bundle-size analysis.

---

## 3. Hermes Heap Snapshots — Runtime Memory Analysis

### Overview

A Hermes heap snapshot (`.heapsnapshot`) is a full graph of every
JavaScript object alive in the Hermes VM at a point in time. It is the
primary tool for diagnosing memory leaks, retained closures, and
unexpected object retention in a React Native app.

### Build configuration

The `expo-build-properties` plugin (SDK 57) does **not** support a
`hermesFlags` config key. Its schema (`pluginConfig.d.ts`) only exposes
`useHermesV1` (boolean) for Hermes-related configuration. React Native
0.85's `HermesInstance` Kotlin class likewise has no API to pass
arbitrary Hermes VM runtime flags (`-HEAP-PROFILE`,
`-Xgc-oom-handling=throw`) from Java/Kotlin — those flags are consumed
by the C++ `RuntimeConfig` inside the React Native JSI layer.

**Alternative approach (implemented):** A custom config plugin
(`plugins/withHermesProfiling.js`) is registered in `app.config.js` when
`EXPO_HERMES_PROFILING=true` is set. The plugin:

- **Android:** Adds `HERMES_PROFILING_ENABLED=true` to
  `gradle.properties` and sets `debuggable true` / `profileable true` on
  the release buildType in `app/build.gradle` so the Hermes inspector /
  CDP endpoint is reachable in a release build.

- **iOS:** Injects `HERMES_PROFILING_ENABLED = 1` into the Podfile and
  sets `ENABLE_INSPECTOR = YES` on the release build configuration so
  the Hermes debugger is available in release builds.

To build with profiling enabled:

```bash
# Android
EXPO_HERMES_PROFILING=true eas build --profile production --platform android

# iOS
EXPO_HERMES_PROFILING=true eas build --profile production --platform ios
```

> **Note:** The profiling build flags (`-HEAP-PROFILE`,
> `-Xgc-oom-handling=throw`) are Hermes VM runtime flags set in the C++
> `RuntimeConfig`. They are not exposed through `expo-build-properties`
> or the React Native Java/Kotlin API. To pass them directly, you would
> need to modify the C++ `HermesRuntimeFactory` in the React Native
> native source (`ReactCommon/jsi`), which requires building React
> Native from source (`buildReactNativeFromSource: true` in
> `expo-build-properties`). The custom plugin above enables the
> inspector infrastructure so heap snapshots can be captured at runtime
> via Chrome DevTools without modifying C++ code.

### How to capture a heap snapshot

#### Method A: Chrome DevTools (recommended for interactive analysis)

1. **Start a dev build** with Metro connected:
   ```bash
   npm run dev
   ```

2. **Open Chrome DevTools:**
   - Navigate to `chrome://inspect` in Chrome or Edge.
   - Click **Configure...** next to "Discover network targets" and add
     `localhost:8081` (Metro's default port).
   - Wait for the ThryftVerse Hermes target to appear.
   - Click **inspect** under the target.

3. **Switch to the Memory tab.**

4. **Take a heap snapshot:**
   - Select **Heap snapshot** and click **Take snapshot**.
   - The snapshot captures every live JavaScript object in the Hermes VM.

5. **Analyse retained objects:**
   - Use the **Summary** view to group objects by constructor name.
   - Look for unexpected large retentions (e.g., arrays of images,
     closures holding large scopes, cached API responses).
   - Use the **Comparison** view to diff two snapshots (see below).

#### Method B: Automated capture script

```bash
# Capture from a running iOS simulator dev build
bash scripts/capture-heap-snapshot.sh --platform ios

# Capture from a running Android emulator dev build
bash scripts/capture-heap-snapshot.sh --platform android
```

The script tries `npx react-native heap-snapshot` first (first-class CLI)
and falls back to the Hermes CDP `HeapProfiler.takeHeapSnapshot` method
if the CLI is unavailable. Snapshots are saved to
`scripts/heap-snapshots/`.

#### Diffing snapshots to isolate leaks

1. Capture a **baseline** snapshot before exercising the suspect flow.
2. Exercise the flow (e.g., navigate to a screen, scroll a feed, open
   and close a sheet).
3. Capture a **second** snapshot.
4. In Chrome DevTools, load both snapshots and use the **Comparison**
   view to see objects allocated between the two snapshots.
5. Objects that remain in the second snapshot but are not expected
   (e.g., detached DOM nodes, orphaned closures, stale timers) are
   leaks.

### What to look for in heap snapshots

- **Closures** — Anonymous functions that capture large scopes. Common
  in `useCallback` / `useMemo` with missing dependency arrays.
- **Retained event listeners** — Listeners added via
  `addEventListener` or `NetInfo.addEventListener` that are never
  removed.
- **Stale timers** — `setInterval` / `setTimeout` callbacks that hold
  references to component state after unmount.
- **Large cached data** — React Query caches, MMKV entries, or image
  buffers that grow unbounded.
- **Detached components** — React component instances that are no
  longer mounted but still referenced by a closure or timer.

---

## 4. Performance Targets

From `AGENTS.md` — these targets must be measured in **release mode only**
(dev mode is 2–5x slower and is not a valid measurement environment).

| Metric | Target | Definition |
|--------|--------|------------|
| navigation → immediate shell | < 100 ms | Route mount renders the static screen frame (header, rails, background) |
| navigation → first meaningful skeleton | < 200 ms | Skeleton matching final silhouette is visible |
| cached feed → first useful content | < 300 ms | At least one real content tile decoded and visible from cached payload |
| cold network → first useful content | < 800 ms | First real content tile from a network response (TTFB + decode) |
| image decode → visible media | < 150 ms per image | From `onLoad` to painted pixels |
| interaction → visual acknowledgement | < 100 ms | Press/scroll/tap produces a visible response within one frame budget |
| frame budget | no dropped-frame clusters | No 3+ consecutive dropped frames during scroll or transition |

### How bundle analysis maps to these targets

- **Cold start (< 800 ms)** — The bundle size directly affects cold
  start. A smaller bundle means fewer modules to evaluate. Use Atlas to
  identify and remove large unused dependencies. Use `inlineRequires`
  (already enabled) to defer module evaluation past TTI.

- **Navigation (< 100 ms shell, < 200 ms skeleton)** — Screen-level
  code should be lazy-loaded so navigating to a screen does not
  evaluate unrelated modules. Atlas shows which modules are pulled by
  each screen.

- **Frame budget (no dropped-frame clusters)** — Memory pressure from
  retained objects causes GC pauses, which manifest as dropped frames.
  Heap snapshots identify the retained objects causing GC pressure.

---

## 5. CI Integration

The `scripts/analyze-bundle.sh` script combines Atlas export with a
bundle-size regression gate:

```bash
# Local run (opens Atlas visualiser)
bash scripts/analyze-bundle.sh

# CI run (skips interactive Atlas, fails if bundle > 5% over baseline)
CI=1 bash scripts/analyze-bundle.sh
```

The baseline is stored in `scripts/bundle-baseline.json`. Update it only
when bundle growth is intentional and justified in the PR description.

---

## 6. Summary of Scripts

| Script | Purpose |
|--------|---------|
| `npm run bundle:analyze` | Export Android bundle with Atlas (`EXPO_UNSTABLE_ATLAS=true`) |
| `npm run bundle:analyze:ios` | Export iOS bundle with Atlas (`EXPO_UNSTABLE_ATLAS=true`) |
| `npm run bundle:profile` | Start Metro with built-in profiler (`expo start --profile`) |
| `bash scripts/analyze-bundle.sh` | Full CI gate: Atlas + bundle-size regression check |
| `bash scripts/capture-heap-snapshot.sh` | Capture a Hermes heap snapshot from a running dev build |

## 7. Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `EXPO_UNSTABLE_ATLAS` | Activates Expo Atlas during `expo export` | `false` |
| `EXPO_HERMES_PROFILING` | Registers `withHermesProfiling` config plugin | `false` |
| `CI` | When set, `analyze-bundle.sh` skips interactive Atlas | unset |
