# Performance Monitoring — Sentry + EAS Observe

This document describes the frontend performance monitoring configuration for
ThryftVerse, what metrics are captured, how to view them, and how to add
custom performance marks.

> **Source of truth:** `src/platform/monitoring/sentry.ts`, `App.tsx`,
> `src/platform/monitoring/observe.ts`.

---

## 1. Overview

The app ships two complementary observability layers:

| Layer | Package | Purpose |
| --- | --- | --- |
| Sentry Performance | `@sentry/react-native` (~7.11) | Transactions, slow/frozen frames, profiling, session replay, breadcrumbs |
| EAS Observe | `expo-observe` (Open Beta) | Cold/Warm launch, TTI, TTR, bundle load time |

Both are initialised defensively. If a native module or package is missing
(e.g. Expo Go, bare builds without the package), lightweight no-op stubs are
used so the app never crashes.

---

## 2. Sentry configuration

Sentry is initialised in `src/platform/monitoring/sentry.ts` via
`initSentry()`, which is called once at app startup in `App.tsx`.

### Sample rates

| Option | Dev | Production | Rationale |
| --- | --- | --- | --- |
| `tracesSampleRate` | `1.0` (100%) | `0.2` (20%) | Full coverage in dev for fast feedback; bounded volume/cost in production while still capturing representative slow/frozen-frame data |
| `profilesSampleRate` | `1.0` (100%) | `0.1` (10%) | Full profiling locally; sampled profiling in production |
| `replaysOnErrorSampleRate` | `1.0` | `1.0` | Every error session gets a replay |
| `replaysSessionSampleRate` | `0.0` | `0.0` | No replay for normal sessions (overhead + storage) |

### Performance options enabled

| Option | Effect |
| --- | --- |
| `enableAutoPerformanceTracing` | Drives screen-load transactions, app-start measurement, user-interaction tracing |
| `enableAppStartTracking` | Adds app-start measurements to the first route transaction |
| `enableUserInteractionTracing` | Trace touch/gesture interactions |
| `enableNativeFramesTracking` | **Slow frames (>16.67ms) and frozen frames (>700ms)** added as measurements to every root span/transaction — the core slow-frame-detection signal |
| `enableStallTracking` | Tracks JS event-loop stalls and adds them as measurements |
| `enableAutoSessionTracking` | Automatic session start/end on foreground/background |
| `enableNativeCrashHandling` | Native crash capture (iOS/Android) |
| `enableWatchdogTerminationTracking` | OOM / watchdog-termination tracking (iOS) |

### Integrations

| Integration | Purpose |
| --- | --- |
| `httpClientIntegration()` | Capture failed HTTP requests as breadcrumbs/events |
| `mobileReplayIntegration({ maskAllText: false, maskAllImages: true })` | Session replay on errors. **Privacy:** text content is never captured; all images are masked |
| `reactNavigationIntegration({ enableTimeToInitialDisplay: true })` | Creates a transaction per screen transition for per-screen TTI / load time. The navigation container ref is registered at runtime via `registerSentryNavigationContainer()` |

> **Note on SDK API names:** The installed SDK is `@sentry/react-native@~7.11`.
> The browser-SDK names `replayIntegration` and `enableScreenTracking` do not
> exist in this version. The RN equivalents — `mobileReplayIntegration` and
> `reactNavigationIntegration` — are used instead. All integrations are added
> defensively: if an integration is not exported by the installed SDK, it is
> silently skipped.

---

## 3. Metrics tracked

### Per-transaction measurements

Every root span/transaction receives these measurements when performance
tracing is active:

- **Slow frames** — frames taking >16.67ms to render (i.e. dropping below
  60 FPS). Reported as `frames.slow` / slow-frame percentage.
- **Frozen frames** — frames taking >700ms to render (perceived as a freeze).
  Reported as `frames.frozen` / frozen-frame percentage.
- **JS stalls** — event-loop stall duration (`event_loop_stalls`).
- **App start** — cold/warm start duration when a route transaction exists.

### Screen-level transactions

Each React Navigation screen transition creates a transaction named after the
destination route, with:

- **Time to Initial Display** — time from navigation dispatch to the first
  rendered frame of the new screen.
- The slow/frozen-frame measurements above, scoped to that screen.

### Breadcrumbs

| Category | When | Data |
| --- | --- | --- |
| `navigation` | Every screen transition | `Navigated to <route name>` |
| `performance` | App mounted / interactive | `App interactive` + timestamp |

### EAS Observe (launch metrics)

Collected by `expo-observe` when available:

- `cold_launch` / `warm_launch`
- `tti` (Time to Interactive) — recorded by the first `markInteractive()` call
- `cold_ttr` / `warm_ttr` (Time to First Render) — recorded by `markFirstRender()`
- Bundle load time

`markInteractive()` is called from multiple "app is usable" points
(`app_mounted`, `navigation_ready`, `splash_resolved`, `deep_link_invite`).
Only the first call records the TTI metric.

---

## 4. Viewing metrics in the Sentry dashboard

1. **Navigate to** your Sentry project → **Performance** → **Transactions**.
2. **Screen transactions** appear as transactions named after the route
   (e.g. `MainTabs`, `Chat`, `ListingDetail`).
3. Select a transaction to view:
   - **Span tree** — navigation dispatch → first render → subsequent spans
   - **Measurements** — `frames.slow`, `frames.frozen`, `event_loop_stalls`
   - **Histogram** — TTI distribution for that screen
4. **Slow/frozen frames** are visible on each transaction's **Measurements**
   tab and in the **Mobile Vitals** section of the event detail view.
5. **App starts** appear under **Performance** → **App Starts** (when
   `enableAppStartTracking` is active).
6. **Profiles** appear under the transaction's **Profile** tab (when
   `profilesSampleRate` > 0).
7. **Session replays** appear on error events under the **Replay** tab (when
   `replaysOnErrorSampleRate` > 0).
8. **Breadcrumbs** (navigation + performance) appear on every event's
   **Breadcrumbs** timeline.

### Key Sentry queries

| Metric | Query |
| --- | --- |
| Screens with worst TTI | `transaction.duration:avg` grouped by `transaction` |
| Slow-frame % | `measurements.frames_slow_rate:avg` grouped by `transaction` |
| Frozen-frame % | `measurements.frames_frozen_rate:avg` grouped by `transaction` |
| JS stalls | `measurements.event_loop_stalls:avg` grouped by `transaction` |

---

## 5. Adding custom performance marks

### Option A — Sentry breadcrumb (lightweight, always available)

```ts
import { Sentry } from '../platform/monitoring';

Sentry.addBreadcrumb?.({
  category: 'performance',
  message: 'Feed first contentful render',
  level: 'info',
  data: { timestamp: Date.now(), itemCount: 20 },
});
```

### Option B — User Timing API (browser `performance.mark`)

```ts
useEffect(() => {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      performance.mark('feed:interactive');
    }
  } catch {
    // performance API may be unavailable.
  }
}, []);
```

### Option C — EAS Observe TTI signal

```ts
import { markInteractive } from '../platform/monitoring';

markInteractive({ surface: 'feed_first_render' });
```

Only the first `markInteractive()` call per launch records the TTI metric; it
is safe to call from every "app is usable" point.

### Option D — Custom Sentry transaction (advanced)

```ts
import { Sentry } from '../platform/monitoring';

const txn = (Sentry as any).startTransaction?.({
  name: 'image-upload',
  op: 'media.upload',
});
// ... do work ...
txn?.finish?.();
```

> Prefer breadcrumbs and `markInteractive()` for most product surfaces.
> Reserve manual transactions for genuinely custom flows that are not already
> covered by screen or interaction tracing.

---

## 6. Privacy

- **Session Replay:** `maskAllText: false` is intentional — we do **not**
  capture text content. `maskAllImages: true` masks all images. Replays are
  only recorded on error sessions (`replaysSessionSampleRate: 0`).
- **`beforeSend`:** scrubs `request.headers`, `request.cookies`, and
  `request.data` from every event, and filters out breadcrumbs in sensitive
  categories (`auth`, `payment`, `chat`, `profile`).
- **User context:** only attached for authenticated users via
  `setSentryUser()`. Non-authenticated users have no PII attached.

---

## 7. Resilience

All Sentry calls are guarded:

- `Sentry` is a `Proxy` that resolves to the real client when initialised, or
  to a no-op stub when Sentry is unavailable (no DSN, package missing).
- `isSentryAvailable()` short-circuits helpers like `setSentryUser` and
  `registerSentryNavigationContainer` so they never crash.
- Every integration is added inside a `try/catch` so a missing integration
  never breaks init.
- `resetSentryForTesting()` restores the stub state for unit tests.

---

## 8. File reference

| File | Role |
| --- | --- |
| `src/platform/monitoring/sentry.ts` | Sentry init, performance config, integrations, navigation registration, user context, stub |
| `src/platform/monitoring/observe.ts` | EAS Observe wrapper (`markInteractive`, `markFirstRender`, `ObserveRoot`) |
| `src/platform/monitoring/appNavigation.ts` | Navigation ref holder for crash-recovery reset |
| `src/platform/monitoring/index.ts` | Barrel exports for the monitoring layer |
| `App.tsx` | Calls `initSentry()`, registers navigation ref, emits navigation + performance breadcrumbs, calls `markInteractive()` |
