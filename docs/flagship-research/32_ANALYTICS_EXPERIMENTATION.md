# 32 — Analytics & Experimentation

> **Department:** Analytics Infrastructure, Experimentation Platform & Data-Driven Product Engineering
> **Benchmark date:** 2026-08-18
> **Scope:** Event tracking taxonomy, A/B testing infrastructure, feature flag systems, crash reporting, funnel analysis, retention metrics, conversion tracking, analytics infrastructure, experimentation platform, statistical significance, cohort analysis, session replay, performance monitoring, privacy-first analytics.
> **Charter references:** AGENTS.md §2 (deep system research, layer diagnosis), §4 (anti-AI-made design — "stateless UI", "truthful UI"), §6 (truthful UI — no fabricated success), §14 (state completeness); Design.md "Performance", "State Coverage".
> **Primary benchmarks:** Netflix (experimentation culture, chaos engineering), Pinterest (A/B framework, taste-based recommendations), Spotify (Discover Weekly experimentation), Instagram (funnel optimization), eBay (seller analytics, conversion funnels). Tooling benchmarks: PostHog (open-source product analytics + experimentation), Sentry (crash reporting + performance monitoring), LaunchDarkly/Statsig/GrowthBook (feature flags), EAS Observe (Expo performance monitoring).

---

## 1. 2026 Competitor Benchmark

Analytics and experimentation in 2026 is not a dashboard that someone looks at once a week — it is the decision-making infrastructure that determines what gets built, what gets shipped, and what gets killed. The companies that do this best (Netflix, Pinterest, Spotify) run hundreds of experiments per year and ship features based on data, not opinions. The companies that don't are flying blind — shipping features based on gut feeling and hoping they work.

### The 2026 analytics/experimentation stack

| Layer | 2026 industry standard | Tooling |
|---|---|---|
| Event tracking | Structured taxonomy (not ad-hoc events); standardized event names and payload schemas; PII scrubbing; analytics opt-out | PostHog, Amplitude, Mixpanel, custom |
| Feature flags | Server-side evaluation; per-user targeting; gradual rollout (0% → 1% → 10% → 50% → 100%); kill switch; variant payloads | LaunchDarkly, Statsig, GrowthBook, PostHog |
| A/B testing | Frequentist (t-test, confidence intervals) or Bayesian; statistical significance (p < 0.05); minimum detectable effect; sample size calculation; exposure tracking | PostHog Experiments, Statsig, GrowthBook |
| Crash reporting | Native crash capture (JS + native); breadcrumbs; release tracking; OTA update correlation; session replay on error | Sentry, Crashlytics, EAS Observe |
| Performance monitoring | Screen TTI, app start time, slow/frozen frames, JS stall tracking; 20% production sampling | Sentry Performance, EAS Observe, Firebase Perf |
| Funnel analysis | Step-by-step conversion tracking; drop-off identification; per-step conversion rate; cohort comparison | PostHog Funnels, Amplitude Funnels |
| Retention cohorts | Day 1, Day 7, Day 30 retention by cohort (signup date, acquisition channel, feature usage); retention curve visualization | PostHog Retention, Amplitude Retention |
| Session replay | Privacy-safe replay (mask text/images); error-triggered replay (not every session); mobile replay | Sentry Mobile Replay, FullStory, LogRocket |
| Privacy-first analytics | PII scrubbing; analytics opt-out; GDPR/CCPA compliance; Apple Privacy Preserving Ad Attribution; no cross-app tracking without ATT | PostHog (self-hosted option), Plausible |
| Statistical methodology | Welch's t-test (unequal variances); 95% confidence level default; minimum sample size; multiple comparison correction (Bonferroni) | PostHog frequentist, Statsig sequential |

Sources: [PostHog — React Native Experiments](https://posthog.com/docs/experiments/installation/react-native); [PostHog — React Native Library](https://posthog.com/docs/libraries/react-native); [PostHog — Adding Experiment Code](https://posthog.com/docs/experiments/adding-experiment-code); [PostHog — Frequentist Statistics](https://posthog.com/docs/experiments/statistics-frequentist); [PostHog — Experiments](https://posthog.com/docs/experiments).

### Netflix — the experimentation culture benchmark

Netflix runs hundreds of A/B tests per year. Every feature, UI change, and recommendation algorithm is tested before it ships to 100% of users. Netflix's experimentation culture is the benchmark: every team runs experiments, every experiment has a hypothesis and a success metric, and every ship decision is backed by data. The key insight: experimentation is not a tool — it's a culture. Tools (PostHog, Statsig) enable the culture; they don't create it.

### Pinterest — taste-based experimentation

Pinterest's A/B framework tests not just UI changes but recommendation algorithms. The "taste profile" is continuously experimented on: which signals improve recommendation quality? Which personalization weights drive engagement? Pinterest's experimentation platform can measure the impact of a recommendation change on 7-day retention, not just on immediate CTR. This is the benchmark for a marketplace with a taste-based feed — the experimentation platform must measure long-term metrics, not just immediate ones.

### Spotify — Discover Weekly experimentation

Spotify's Discover Weekly is continuously experimented on. Spotify tests algorithm changes, playlist length, introduction timing, and even the email subject line for the weekly notification. The key insight: a feature is never "done" — it's continuously experimented on and optimized. The experimentation platform is the permanent infrastructure for feature optimization, not a one-time validation tool.

### PostHog — the 2026 open-source benchmark

PostHog is the 2026 benchmark for product analytics + experimentation in one platform. It combines: event tracking, feature flags, A/B testing (frequentist + Bayesian), session replay, funnels, retention cohorts, and dashboards — all in one tool, with an open-source self-hosted option for privacy-sensitive use cases. For a React Native app, PostHog provides `posthog-react-native` with `useFeatureFlag` and `useFeatureFlagVariantKey` hooks for experiment variant access ([PostHog — React Native](https://posthog.com/docs/libraries/react-native)).

### Converging principles

1. **Experimentation is a culture, not a tool.** Tools enable experimentation; they don't create it. The culture is: every feature has a hypothesis, every ship decision is backed by data, and every experiment has a success metric and a kill criterion.
2. **Feature flags are the prerequisite for safe releases.** Every new feature is behind a feature flag, rolled out gradually (0% → 1% → 10% → 50% → 100%), and can be killed instantly if something goes wrong. Shipping code to 100% of users on day 1 is a 2020 practice, not a 2026 practice.
3. **Statistical significance is non-negotiable.** A/B test results without statistical significance are noise. p < 0.05 (95% confidence) is the default. Minimum sample size must be calculated before the experiment starts. Multiple comparison correction (Bonferroni) is needed when testing multiple metrics ([PostHog — Frequentist Statistics](https://posthog.com/docs/experiments/statistics-frequentist)).
4. **Exposure tracking is the experiment's foundation.** Only users who are exposed to a variant (via `getFeatureFlag()`) count in the experiment results. Users who have the flag but never encounter the feature are not exposed. Incorrect exposure tracking invalidates the experiment ([PostHog — Adding Experiment Code](https://posthog.com/docs/experiments/adding-experiment-code)).
5. **Privacy-first analytics is the default.** PII scrubbing, analytics opt-out, GDPR/CCPA compliance, and no cross-app tracking without ATT. Analytics that violate user trust are a liability, not an asset.
6. **Crash reporting with OTA correlation.** When a crash occurs, the report must include the OTA update ID (not just the binary version) so the team can correlate crashes to a specific update. Sentry's `dist` field (set to `Updates.updateId`) is the pattern.
7. **Performance monitoring is continuous.** Screen TTI, app start time, slow/frozen frames, and JS stall tracking are monitored in production (20% sampling), not just in development. A regression in screen TTI is a bug, not a "nice to have."

---

## 2. Psychology & Principles

### Measurement as a product engineering discipline

Measurement is not a separate function performed by a separate team — it is a product engineering discipline. Every engineer is responsible for instrumenting the features they build. Every PM is responsible for defining the success metrics of the features they spec. Every experiment has a hypothesis ("Changing X will improve Y by Z%") and a kill criterion ("If Y doesn't improve by W% in V days, revert"). Without this discipline, analytics is a graveyard of unexamined data.

### The Hawthorne effect in analytics

The Hawthorne effect: people behave differently when they know they're being observed. In analytics, this means that users who know they're being tracked may behave differently than users who don't. This is why analytics opt-out is important — not just for privacy compliance, but for data quality. A user who opts out is telling you they don't want to be tracked; including their data would be both unethical and inaccurate.

### Metric gaming risks

When a metric becomes a target, it ceases to be a good metric (Goodhart's Law). If "session length" is the target, engineers will add friction that keeps users in the app longer (e.g., slow transitions, unnecessary confirmations). If "CTR" is the target, designers will make buttons bigger and more aggressive. The defense: measure multiple metrics (primary + guardrail metrics), and define success as improvement on the primary metric without regression on guardrail metrics. A feature that improves CTR but reduces retention is not a success.

### Statistical significance vs practical significance

Statistical significance (p < 0.05) means the difference is probably real. Practical significance means the difference is large enough to matter. A 0.1% improvement in CTR with p < 0.01 is statistically significant but practically insignificant — the improvement is too small to justify the complexity of the change. The 2026 standard: report both statistical and practical significance; ship only changes that are both statistically significant and practically significant.

### The danger of vanity metrics

Vanity metrics (total users, total downloads, total sessions) look impressive but don't inform decisions. Actionable metrics (retention rate, conversion rate, CTR per feature, revenue per user) inform decisions. The 2026 standard: track actionable metrics, not vanity metrics. A dashboard of vanity metrics is a wall of numbers that nobody acts on.

### Cohort thinking

Cohort analysis compares groups of users who started at the same time (e.g., "users who signed up in July 2026"). This reveals whether retention is improving over time — if the July cohort has better Day 30 retention than the June cohort, something improved. Aggregate metrics ("average Day 30 retention") hide this signal. The 2026 standard: cohort-based retention tracking, not aggregate retention.

### Privacy-preserving analytics as trust

Analytics that respect user privacy build trust. Analytics that secretly track users erode trust. The 2026 standard: transparent analytics (the user knows what's tracked), controllable analytics (the user can opt out), and privacy-preserving analytics (PII is scrubbed, data is aggregated where possible). Apple's Privacy Preserving Ad Attribution is the extreme case — attribution is computed on-device without revealing individual user behavior to the advertiser.

---

## 3. Architectural Issues & Engineering Flaws

Analytics/experimentation debt blocks production in concrete ways:

### No analytics = flying blind

Without event tracking, the team has no data on user behavior. Which features are used? Which are ignored? Where do users drop off in the signup funnel? Without this data, product decisions are guesses. A feature that seems important might be used by 2% of users; a feature that seems minor might be the primary retention driver. Without analytics, the team can't tell the difference.

### No A/B testing = opinion-driven, not data-driven

Without A/B testing, every feature ship is a bet. The team ships a change and hopes it improves the metric. If the metric goes up, they attribute it to the change (correlation ≠ causation). If the metric goes down, they revert and try something else. A/B testing replaces hope with measurement: the change is shipped to 50% of users, the metric is compared between the two groups, and the result is statistically significant or not. Without A/B testing, the team is opinion-driven; with it, they're data-driven.

### No crash reporting = unknown failures

Without crash reporting, crashes are invisible. The team doesn't know a crash is happening until users complain on social media or leave 1-star reviews. By then, the crash has affected thousands of users. Crash reporting catches crashes in real-time, with stack traces, breadcrumbs, and OTA update correlation. Without it, the team is reactive; with it, they're proactive.

### No funnels = no conversion optimization

Without funnel analysis, the team doesn't know where users drop off. The signup funnel might be: install → open → signup form → email verification → first screen. If 60% of users drop off at the email verification step, that's the highest-leverage optimization target. Without funnels, the team optimizes random steps; with funnels, they optimize the step with the highest drop-off.

### No feature flags = risky releases

Without feature flags, every release ships to 100% of users simultaneously. If the release has a bug, 100% of users are affected. With feature flags, the release ships to 1% of users first; if there's a bug, it affects 1% and can be reverted instantly. Without feature flags, releases are high-stakes events; with them, releases are low-stakes experiments.

### No retention cohorts = no churn visibility

Without retention cohorts, the team sees "average Day 30 retention is 5%" but doesn't know if retention is improving or declining. Cohort analysis reveals: "June cohort Day 30 = 4%, July cohort Day 30 = 6%" — retention is improving. Without cohorts, the team can't tell if their retention efforts are working.

### Privacy compliance for analytics

Analytics that track PII without consent violate GDPR/CCPA. Analytics that track across apps without ATT violate Apple's guidelines. The `analyticsOptOut` flag and PII scrubbing are not optional — they're legal requirements. Without them, the app is non-compliant and exposed to fines.

---

## 4. AI Slop Diagnosis

AI-generated analytics code has predictable failure modes:

### Tracking events with no taxonomy

AI models fire `trackEvent('button_click')` on every button press with no standardized taxonomy. The analytics dashboard fills up with ad-hoc events: `button_click`, `tap`, `press`, `click`, `button_tap` — all meaning the same thing but with different names. A senior engineer defines a taxonomy: `screen_view`, `funnel_step`, `feature_usage`, `button_tap` — and uses it consistently. ThryftVerse has this — `telemetry.ts` defines `trackScreenView`, `trackFunnelStep`, `trackFeatureUsage`, `trackButtonTap` with standardized event names.

### Firing events on every render

AI models put `trackEvent` calls inside `useEffect` with no dependency array, firing the event on every render. A screen that re-renders 10 times sends 10 `screen_view` events. A senior engineer uses the correct dependency array or fires the event on mount only.

### No event deduplication

AI models fire events without deduplication. A double-tap produces two events. A senior engineer debounces or deduplicates.

### No session management

AI models fire events without session context. Each event is standalone — there's no `session_id` linking events from the same session. A senior engineer attaches `session_id` to every event so the team can reconstruct user journeys.

### Fake A/B test with no statistical rigor

AI models generate A/B test code that randomly assigns users to control/test and compares the results with a simple `if (testConversion > controlConversion)` check. No sample size calculation, no statistical significance test, no confidence interval. A senior engineer uses a proper experimentation platform (PostHog, Statsig) with frequentist or Bayesian analysis.

### Sentry initialized but no breadcrumbs

AI models initialize Sentry (`Sentry.init({ dsn: ... })`) but never call `Sentry.addBreadcrumb()`. When a crash occurs, the report has a stack trace but no context — what screen was the user on? What action did they just take? A senior engineer adds breadcrumbs at key interaction points.

### Feature flags hardcoded, not flaggable

AI models use `const FEATURE_ENABLED = true` instead of a feature flag system. To disable the feature, the team must release a new binary. A senior engineer uses a feature flag system where the flag can be toggled server-side without a release.

---

## 5. Current ThryftVerse Audit (file:line defects)

### Crash reporting & performance monitoring — `frontend/src/platform/monitoring/sentry.ts`

**Strengths (genuinely well-built):**
- `sentry.ts:40-154` — comprehensive Sentry initialization with: DSN from expo config, environment detection, release + dist (OTA updateId correlation), tracesSampleRate (100% dev, 20% prod), profilesSampleRate (100% dev, 10% prod), auto session tracking, native crash handling, watchdog termination tracking, auto performance tracing, app start tracking, user interaction tracing, native frames tracking (slow/frozen frames), stall tracking
- `sentry.ts:74-83` — mobile session replay with privacy controls: `maskAllText: false`, `maskAllImages: true`, `replaysOnErrorSampleRate: 1.0`, `replaysSessionSampleRate: 0.0` — replay only on errors, not every session
- `sentry.ts:85-98` — React Navigation integration with `enableTimeToInitialDisplay: true` — per-screen TTI tracking
- `sentry.ts:136-153` — `beforeSend` hook that strips `request.headers`, `request.cookies`, `request.data` and filters sensitive breadcrumbs (auth, payment, chat, profile) — privacy-first crash reporting
- `sentry.ts:156-159` — expo-updates attribution: tags events with OTA update context for crash-to-update correlation
- `sentry.ts:26-28` — SentryStub Proxy: no-op when Sentry is not configured — the app works without Sentry
- `sentry.ts:67-72` — defensive integration loading: each integration is only added when the SDK exports it — resilient across SDK versions

**Defects:**
| Line (file) | Defect |
|---|---|
| `sentry.ts:79` | `maskAllText: false` — text is NOT masked in session replay. This could expose PII (user names, message content) in error replays. Should be `maskAllText: true` for a marketplace with chat and payment data. |
| Missing | No `setUser()` call on login — crash reports don't include the user ID, making it harder to reproduce user-specific crashes. |
| Missing | No custom breadcrumbs at key interaction points (add to cart, initiate checkout, send message) — crash reports lack interaction context. |

### Event tracking — `frontend/src/lib/telemetry.ts`

**Strengths (genuinely well-built):**
- `telemetry.ts:18-40` — PII scrubbing: 20 PII key fragments (email, phone, address, name, username, password, token, avatar, bio, dob, birthdate, ssn, national, passport, device, ip, lat, lon, latitude, longitude) — defence-in-depth PII stripping
- `telemetry.ts:42-54` — `scrubPII` function: drops any payload key matching a PII fragment (case-insensitive) — PII never leaves the client
- `telemetry.ts:56-65` — `analyticsOptOut` flag: module-level opt-out, synced with user preferences via `setAnalyticsOptOut`
- `telemetry.ts:71-101` — `trackTelemetryEvent`: checks opt-out → scrubs PII → calls handler → logs in dev → sends to backend (`/analytics/events`) → best-effort (catches errors, never crashes the app)
- `telemetry.ts:115-155` — standardized tracking helpers: `trackScreenView`, `trackFunnelStep`, `trackFeatureUsage`, `trackButtonTap` — consistent taxonomy
- `telemetry.test.ts` (7.2KB) — test coverage for telemetry

**Defects:**
| Line (file) | Defect |
|---|---|
| `telemetry.ts:94-100` | `fetchJson('/analytics/events', ...)` — sends every event as a separate HTTP request. No batching, no offline queue. For a high-volume analytics pipeline, this is too chatty and fails silently when offline. |
| `telemetry.ts:71` | No `session_id` in the payload — events are not linked to a session. The team can't reconstruct user journeys. |
| `telemetry.ts:71` | No `timestamp` in the payload — relies on the backend to timestamp events. If the device clock is wrong, event timing is wrong. |
| `telemetry.ts:71` | No `user_id` (anonymized or hashed) in the payload — events are not linked to a user. Cohort analysis is impossible without user-level grouping. |
| Missing | No event deduplication — a double-fire produces two events. |
| Missing | No offline queue — events fired while offline are silently lost. |

### Creator analytics — `frontend/src/creator/creatorAnalytics.ts`

**Strengths:**
- `creatorAnalytics.ts:1-19` — typed event names: 18 specific creator events (session_start, layer_add, layer_remove, layer_duplicate, layer_reorder, layer_transform, undo, redo, draft_save, draft_load, publish_start, publish_success, publish_error, page_add, page_remove, capture_photo, capture_video, capture_boomerang) — granular taxonomy
- `creatorAnalytics.ts:21-30` — typed payload: documentType, layerType, pageCount, layerCount, durationMs, captureLatencyMs, errorMessage, publishedId — structured data
- `creatorAnalytics.ts:40-47` — handler pattern with silent failure ("analytics must not crash the editor") — correct resilience
- `creatorAnalytics.ts:51-60` — lazy import to avoid circular dependency — good module hygiene

### Seller analytics — `frontend/src/screens/SellerAnalyticsScreen.tsx` (25KB) + `CreatorAnalyticsDashboardScreen.tsx` (35KB)

**Strengths:**
- `SellerAnalyticsScreen.tsx` (25KB) — substantial seller analytics dashboard
- `CreatorAnalyticsDashboardScreen.tsx` (35KB) — creator analytics dashboard
- These are user-facing analytics surfaces (sellers/creators see their own performance), not product analytics (the team sees aggregate user behavior)

### Backend metrics — `backend/api/src/lib/metrics.ts`

**Strengths:**
- `metrics.ts:1` — `prom-client` (Prometheus client) — industry-standard server-side metrics
- `metrics.ts:7-9` — `collectDefaultMetrics` with `thryftverse_` prefix — default Node.js metrics
- `metrics.ts:11-17` — `httpRequestsTotal` Counter with method/route/status labels — HTTP request tracking
- `metrics.ts:19-27` — `httpRequestDurationSeconds` Histogram with latency buckets — request latency distribution
- `metrics.ts:29-35` — `paymentTransitionsTotal` Counter with channel/from/to/gateway labels — payment flow tracking
- `metrics.ts:37-41` — `auctionSettlementsTotal` Counter with result label — auction settlement tracking
- `pushDeliveriesTotal` Counter — push delivery tracking

**Defects:**
| Line (file) | Defect |
|---|---|
| Missing | No business metrics (GMV, listings created, orders completed, user signups) as Prometheus metrics — only infrastructure metrics. |
| Missing | No `/metrics` endpoint visible in the first 40 lines — need to verify the Prometheus metrics are exposed. |

### Analytics opt-out — `frontend/src/context/SettingsPreferencesContext.tsx` + `settingsPreferences.ts`

**Strengths:**
- `settingsPreferences.ts:28` — `analyticsOptOut: boolean` in settings preferences
- `settingsPreferences.ts:99` — default: `analyticsOptOut: false` (analytics on by default, opt-out available)
- `SettingsPreferencesContext.tsx` — syncs `analyticsOptOut` with `setAnalyticsOptOut` in telemetry
- `DataPrivacyScreen.tsx` — analytics opt-out toggle in the privacy UI

### Performance monitoring — `frontend/src/hooks/usePerformanceMonitor.ts`

**Strengths:**
- `usePerformanceMonitor.ts` (7.5KB) — performance monitoring hook
- `MotionTracker.ts` (15.4KB) — motion/animation performance tracking
- These are client-side performance monitoring utilities

### Missing analytics/experimentation infrastructure

| Item | Status |
|---|---|
| Feature flag system | **Missing** — no LaunchDarkly, Statsig, GrowthBook, or PostHog feature flags. Features are shipped to 100% of users with no gradual rollout. |
| A/B testing infrastructure | **Missing** — no experimentation platform. No variant assignment, no exposure tracking, no statistical significance testing. |
| Funnel analysis | **Partial** — `trackFunnelStep` exists in telemetry but no funnel visualization or analysis dashboard. |
| Retention cohorts | **Missing** — no cohort analysis. `trackScreenView` tracks screen views but no retention cohort dashboard. |
| Session replay (non-error) | **Missing** — Sentry replay is error-only (`replaysSessionSampleRate: 0.0`). No FullStory/LogRocket for non-error session replay. |
| Event batching | **Missing** — every event is a separate HTTP request. No batching, no offline queue. |
| Session ID | **Missing** — events are not linked to a session. |
| User ID (anonymized) | **Missing** — events are not linked to a user. Cohort analysis impossible. |
| Custom breadcrumbs | **Missing** — no breadcrumbs at key interaction points (add to cart, checkout, send message). |
| Sentry setUser | **Missing** — crash reports don't include user ID. |
| Business metrics (Prometheus) | **Missing** — no GMV, listings, orders, signups as Prometheus metrics. |
| Experimentation culture | **Missing** — no documented experimentation process, no hypothesis templates, no success metric definitions. |
| Privacy-preserving analytics | **Partial** — PII scrubbing and opt-out exist, but no Apple Privacy Preserving Ad Attribution, no aggregate-only mode. |
| North star metric | **Missing** — no defined north star metric (e.g., "weekly active buyers" or "GMV per week"). |

---

## 6. Micro Improvements (file-and-line-level)

### M1 — Add session_id and user_id to telemetry events

In `telemetry.ts:71-101`, add session and user context to every event:
```ts
const sessionId = getSessionId(); // generated on app launch, persisted for session
const userId = getAnonymizedUserId(); // hashed user ID, not raw

trackTelemetryEvent('screen_view', {
  screen: screenName,
  session_id: sessionId,
  user_id: userId,
  timestamp: Date.now(),
  ...params,
});
```

### M2 — Add event batching and offline queue

In `telemetry.ts`, replace per-event `fetchJson` with a batched queue:
```ts
const eventQueue: TelemetryEvent[] = [];
let flushTimer: NodeJS.Timeout | null = null;

function queueEvent(event: TelemetryEvent) {
  eventQueue.push(event);
  if (eventQueue.length >= 20 || !flushTimer) {
    flushQueue();
  }
}

async function flushQueue() {
  if (eventQueue.length === 0) return;
  const batch = eventQueue.splice(0, eventQueue.length);
  try {
    await fetchJson('/analytics/events/batch', { method: 'POST', body: JSON.stringify({ events: batch }) });
  } catch {
    // Re-queue on failure (offline)
    eventQueue.unshift(...batch);
  }
}
```

### M3 — Fix Sentry session replay text masking

In `sentry.ts:79`, change `maskAllText: false` to `maskAllText: true`:
```ts
realSentry.mobileReplayIntegration({
  maskAllText: true, // Privacy: mask all text in replays (chat, payment data)
  maskAllImages: true,
})
```

### M4 — Add Sentry setUser on login

After login, call:
```ts
Sentry.setUser({ id: hashedUserId, username: anonymizedUsername });
```
This correlates crashes to specific users for reproduction.

### M5 — Add custom breadcrumbs at key interaction points

At key actions (add to cart, initiate checkout, send message, list item), add breadcrumbs:
```ts
Sentry.addBreadcrumb({
  category: 'cart',
  message: 'Item added to cart',
  level: 'info',
  data: { itemId, price },
});
```

### M6 — Integrate PostHog for feature flags and A/B testing

Install `posthog-react-native` and initialize:
```ts
import PostHog from 'posthog-react-native';
await PostHog.setup('phc_xxx', { autocapture: false, captureScreenViews: false });
```

Use feature flags:
```tsx
import { useFeatureFlag } from 'posthog-react-native';
const newCheckoutEnabled = useFeatureFlag('new_checkout_flow');
```

Use experiment variants:
```tsx
import { useFeatureFlagVariantKey } from 'posthog-react-native';
const variant = useFeatureFlagVariantKey('checkout_experiment');
if (variant === 'test') { /* new checkout */ } else { /* control checkout */ }
```

### M7 — Add business metrics to Prometheus

In `backend/api/src/lib/metrics.ts`, add:
```ts
const gmvTotal = new Counter({ name: 'thryftverse_gmv_total', help: 'Gross merchandise value', labelNames: ['currency'] });
const listingsCreatedTotal = new Counter({ name: 'thryftverse_listings_created_total', help: 'Listings created' });
const ordersCompletedTotal = new Counter({ name: 'thryftverse_orders_completed_total', help: 'Orders completed' });
const userSignupsTotal = new Counter({ name: 'thryftverse_user_signups_total', help: 'User signups', labelNames: ['source'] });
```

### M8 — Define and track the north star metric

Define the north star metric (e.g., "weekly active buyers" — users who make at least one purchase per week). Track it in the telemetry pipeline and display it on a team dashboard. Every experiment should measure impact on the north star metric (or a proxy).

### M9 — Add funnel visualization

Build a funnel analysis dashboard (or use PostHog Funnels) for the key funnels:
- **Signup funnel:** install → open → signup form → email verification → first screen
- **Purchase funnel:** listing view → add to cart → checkout → payment → order confirmed
- **Listing funnel:** create listing → add photos → set price → publish → first sale

Track drop-off at each step and optimize the step with the highest drop-off.

### M10 — Add retention cohort tracking

Track Day 1, Day 7, Day 30 retention by signup cohort. Display as a cohort table (rows = signup week, columns = Day N retention). A cohort table reveals whether retention is improving over time.

### M11 — Add event deduplication

In `telemetry.ts`, deduplicate events within a 500ms window:
```ts
const recentEvents = new Map<string, number>();
function isDuplicate(eventName: string, payload: TelemetryPayload): boolean {
  const key = `${eventName}:${JSON.stringify(payload)}`;
  const now = Date.now();
  const lastTime = recentEvents.get(key);
  if (lastTime && now - lastTime < 500) return true;
  recentEvents.set(key, now);
  return false;
}
```

### M12 — Add Sentry breadcrumb for navigation

In the navigation container's `onStateChange`, add a breadcrumb:
```ts
Sentry.addBreadcrumb({
  category: 'navigation',
  message: currentRouteName,
  level: 'info',
});
```

---

## 7. Macro Improvements (structural/architectural)

### A1 — Experimentation as a product engineering culture

The root architectural shift is from "ship and hope" to "experiment and measure." Every feature has: (1) a hypothesis ("Changing X will improve Y by Z%"), (2) a feature flag for gradual rollout, (3) an A/B test with control and test variants, (4) a success metric (the primary metric that determines ship/kill), (5) guardrail metrics (metrics that must not regress), (6) a kill criterion ("If Y doesn't improve by W% in V days, revert"), and (7) a sample size calculation before the experiment starts. This is not a tool — it's a process that the team follows for every feature.

### A2 — PostHog as the unified analytics + experimentation platform

PostHog combines event tracking, feature flags, A/B testing, session replay, funnels, retention cohorts, and dashboards in one platform. For a React Native app, `posthog-react-native` provides native hooks (`useFeatureFlag`, `useFeatureFlagVariantKey`). The architecture:
1. **Event tracking:** Replace the custom `/analytics/events` endpoint with PostHog's SDK (or keep both for redundancy)
2. **Feature flags:** All new features behind PostHog feature flags with gradual rollout
3. **A/B testing:** Experiments run on top of feature flags; exposure tracked via `getFeatureFlag()`
4. **Funnels:** PostHog Funnels for signup, purchase, listing funnels
5. **Retention:** PostHog Retention for Day 1/7/30 cohort analysis
6. **Session replay:** PostHog Session Replay for non-error sessions (supplements Sentry error replay)

### A3 — Privacy-first analytics architecture

The architecture:
1. **PII scrubbing** (already exists in `telemetry.ts`) — extend to all analytics paths
2. **Analytics opt-out** (already exists) — ensure it applies to PostHog, Sentry, and any future analytics
3. **Anonymized user IDs** — hash user IDs before sending to analytics; never send raw user IDs
4. **Aggregate-only mode** — for sensitive metrics, aggregate on-device and send only the aggregate
5. **No cross-app tracking** — per ATT, no tracking without explicit consent
6. **GDPR/CCPA compliance** — data deletion extends to analytics data; user can request deletion of their analytics events

### A4 — Sentry as the crash + performance monitoring backbone

Sentry is already well-integrated. The architecture:
1. **Crash reporting** (exists) — native + JS crashes with OTA correlation
2. **Performance monitoring** (exists) — TTI, app start, slow/frozen frames, stall tracking
3. **Session replay on error** (exists) — with privacy masking
4. **Breadcrumbs** (missing) — add at key interaction points
5. **setUser** (missing) — set on login for crash-to-user correlation
6. **Release health** — track crash-free users per release; block release if crash rate exceeds threshold

### A5 — Prometheus + Grafana for server-side metrics

The backend already uses `prom-client`. The architecture:
1. **Infrastructure metrics** (exist) — HTTP requests, latency, payment transitions, auction settlements, push deliveries
2. **Business metrics** (missing) — GMV, listings, orders, signups as Prometheus metrics
3. **Grafana dashboards** — visualize infrastructure + business metrics
4. **Alerting** — alert on anomaly (crash rate spike, latency spike, GMV drop)

---

## 8. Flagship Acceptance Criteria

A flagship analytics/experimentation system must achieve:

- **Event tracking taxonomy** — standardized event names (`screen_view`, `funnel_step`, `feature_usage`, `button_tap`) with typed payloads
- **PII scrubbing** — 20+ PII key fragments stripped before any event leaves the client
- **Analytics opt-out** — user can opt out; opt-out applies to all analytics paths
- **Session ID + user ID** — every event includes session_id and anonymized user_id
- **Event batching** — events batched (20 per batch) with offline queue
- **Crash reporting** — Sentry with native + JS crash capture, OTA correlation, breadcrumbs, setUser
- **Performance monitoring** — TTI, app start, slow/frozen frames, stall tracking; 20% production sampling
- **Session replay on error** — with `maskAllText: true` and `maskAllImages: true`
- **Feature flag system** — PostHog or equivalent; all new features behind flags; gradual rollout (0% → 100%)
- **A/B testing** — PostHog Experiments or equivalent; frequentist (Welch's t-test, 95% confidence); exposure tracking via `getFeatureFlag()`
- **Funnel analysis** — signup, purchase, listing funnels with per-step drop-off
- **Retention cohorts** — Day 1/7/30 by signup cohort; cohort table visualization
- **North star metric** — defined, tracked, displayed on team dashboard
- **Business metrics** — GMV, listings, orders, signups as Prometheus metrics
- **Grafana dashboards** — infrastructure + business metrics
- **Alerting** — crash rate spike, latency spike, GMV drop alerts
- **Experimentation process** — every feature has hypothesis, success metric, guardrail metrics, kill criterion, sample size calculation
- **Privacy compliance** — GDPR/CCPA data deletion extends to analytics; ATT compliance; no cross-app tracking without consent

### Thumbnail test

A ThryftVerse analytics dashboard at 25% scale must show: the north star metric (weekly active buyers), the Day 1/7/30 retention curve, the signup funnel with per-step drop-off, and the current A/B tests with significance status. If the dashboard is a wall of vanity metrics (total downloads, total users), it is not done.

---

## 9. Priority & Sequencing

| Priority | Item | Why first | Risk | Unblocks |
|---|---|---|---|---|
| P0 | M3 — Fix Sentry text masking | `maskAllText: false` exposes PII in session replays; privacy violation | Low — change one boolean | Privacy compliance |
| P0 | M1 — Add session_id and user_id | Without session/user context, events can't be grouped into journeys or cohorts | Low — add to payload | Cohort analysis, funnels |
| P0 | M6 — Integrate PostHog for feature flags | Without feature flags, every release is 100% rollout with no kill switch | Medium — new SDK + setup | Safe releases, A/B testing |
| P1 | M2 — Event batching + offline queue | Per-event HTTP is too chatty and fails silently offline | Medium — batching logic | Analytics reliability |
| P1 | M4 — Sentry setUser on login | Crash-to-user correlation for reproduction | Low — one call after login | Crash reproduction |
| P1 | M5 — Custom breadcrumbs | Crash reports lack interaction context | Low — add breadcrumbs at key points | Crash diagnosis |
| P1 | M7 — Business metrics in Prometheus | Infrastructure metrics only; no business visibility | Low — add counters | Business dashboards |
| P1 | M8 — Define north star metric | Without a north star, experiments don't have a primary metric | Low — define + track | Experimentation process |
| P1 | M9 — Funnel visualization | Funnels identify the highest-leverage optimization target | Medium — dashboard or PostHog | Conversion optimization |
| P2 | M10 — Retention cohort tracking | Cohorts reveal whether retention is improving over time | Medium — cohort analysis | Retention optimization |
| P2 | M11 — Event deduplication | Double-fires produce duplicate events that skew metrics | Low — dedup logic | Data quality |
| P2 | M12 — Navigation breadcrumbs | Crash reports lack navigation context | Low — add to onStateChange | Crash diagnosis |
| P2 | A1 — Experimentation culture | Process for every feature: hypothesis, metric, kill criterion | High — organizational | Data-driven product |
| P2 | A2 — PostHog as unified platform | Replaces custom analytics endpoint with full platform | High — migration | Analytics + experimentation at scale |
| P3 | A3 — Privacy-first analytics architecture | Aggregate-only mode, Apple PPAA, GDPR data deletion for analytics | High — architecture | Privacy compliance at scale |
| P3 | A5 — Prometheus + Grafana + alerting | Full server-side observability with alerting | High — Grafana setup | Server-side monitoring at scale |

---

## 10. Token-level Spec

| Token | Value | Notes |
|---|---|---|
| `analytics.events.taxonomy` | screen_view, funnel_step, feature_usage, button_tap | Standardized names |
| `analytics.events.sessionId` | Generated on app launch, persisted for session | Journey reconstruction |
| `analytics.events.userId` | Hashed user ID (not raw) | Cohort analysis |
| `analytics.events.timestamp` | Client-side timestamp | Clock skew handling |
| `analytics.pii.scrubFragments` | 20+ (email, phone, address, name, username, password, token, avatar, bio, dob, birthdate, ssn, national, passport, device, ip, lat, lon, latitude, longitude) | Defence-in-depth |
| `analytics.optOut` | Boolean, synced with user preferences | GDPR/CCPA compliance |
| `analytics.batching.size` | 20 events per batch | Reduced HTTP chattiness |
| `analytics.batching.offlineQueue` | Re-queue on failure | No data loss offline |
| `analytics.deduplication.windowMs` | 500 | Prevents double-fires |
| `crash.sentry.tracesSampleRate` | 1.0 (dev), 0.2 (prod) | Performance monitoring |
| `crash.sentry.profilesSampleRate` | 1.0 (dev), 0.1 (prod) | Profiling |
| `crash.sentry.replaysOnErrorSampleRate` | 1.0 | Replay on every error |
| `crash.sentry.replaysSessionSampleRate` | 0.0 | No replay on normal sessions |
| `crash.sentry.maskAllText` | true | Privacy in replays |
| `crash.sentry.maskAllImages` | true | Privacy in replays |
| `crash.sentry.setUser` | On login (hashed user ID) | Crash-to-user correlation |
| `crash.sentry.breadcrumbs` | navigation, cart, checkout, message, listing | Interaction context |
| `crash.sentry.otaCorrelation` | dist = Updates.updateId | Crash-to-update correlation |
| `featureFlags.provider` | PostHog (or LaunchDarkly/Statsig/GrowthBook) | Server-side evaluation |
| `featureFlags.rollout` | 0% → 1% → 10% → 50% → 100% | Gradual rollout |
| `featureFlags.killSwitch` | Instant disable without release | Safety |
| `experiments.method` | Frequentist (Welch's t-test, 95% confidence) | Statistical rigor |
| `experiments.exposureTracking` | Via `getFeatureFlag()` only | Correct exposure |
| `experiments.sampleSize` | Calculated before experiment starts | Statistical power |
| `experiments.guardrailMetrics` | Defined per experiment | Prevent regressions |
| `experiments.killCriterion` | Defined before experiment starts | Early termination |
| `metrics.prometheus.prefix` | `thryftverse_` | Namespacing |
| `metrics.business` | gmv_total, listings_created_total, orders_completed_total, user_signups_total | Business visibility |
| `metrics.alerting` | Crash rate spike, latency spike, GMV drop | Proactive monitoring |
| `northStar.metric` | Weekly active buyers (or GMV per week) | Primary success metric |
| `funnels.list` | signup, purchase, listing | Key conversion funnels |
| `retention.cohorts` | Day 1, Day 7, Day 30 by signup week | Retention trend |
| `privacy.analyticsOptOut` | Applies to PostHog, Sentry, custom telemetry | Comprehensive |
| `privacy.gdpr.dataDeletion` | Extends to analytics events | GDPR compliance |
| `privacy.att` | No cross-app tracking without ATT consent | Apple compliance |

---

## 11. What "feels AI-made" here, and how to patch it

| AI tell in current state | Patch |
|---|---|
| `maskAllText: false` in Sentry replay (exposes PII) | `maskAllText: true` |
| No session_id in telemetry events | Add session_id to every event |
| No user_id in telemetry events | Add anonymized user_id to every event |
| No event batching (per-event HTTP) | Batch 20 events per request with offline queue |
| No event deduplication | 500ms dedup window |
| No feature flag system | Integrate PostHog feature flags |
| No A/B testing infrastructure | PostHog Experiments with frequentist analysis |
| No Sentry setUser on login | Set user ID on login for crash correlation |
| No custom breadcrumbs at key interactions | Add breadcrumbs at cart, checkout, message, listing |
| No business metrics in Prometheus | Add GMV, listings, orders, signups counters |
| No funnel visualization | PostHog Funnels or custom dashboard |
| No retention cohort tracking | PostHog Retention or custom cohort table |
| No north star metric | Define and track weekly active buyers |
| No experimentation process | Hypothesis → metric → flag → test → significance → ship/kill |

**What's already well-built (not AI-slop):**
- `sentry.ts` — comprehensive Sentry init with performance monitoring, OTA correlation, privacy filtering, defensive integration loading — genuinely senior engineering
- `telemetry.ts` — PII scrubbing (20 fragments), analytics opt-out, standardized tracking helpers (`trackScreenView`, `trackFunnelStep`, `trackFeatureUsage`, `trackButtonTap`) — well-structured
- `telemetry.test.ts` — test coverage for telemetry
- `creatorAnalytics.ts` — typed event names (18 specific events), typed payload, handler pattern with silent failure — granular and resilient
- `metrics.ts` — Prometheus client with HTTP, payment, auction, push counters — solid server-side foundation
- `SellerAnalyticsScreen.tsx` (25KB) + `CreatorAnalyticsDashboardScreen.tsx` (35KB) — substantial user-facing analytics surfaces
- `usePerformanceMonitor.ts` + `MotionTracker.ts` — client-side performance monitoring
- `analyticsOptOut` in settings preferences — user-controlled analytics privacy
- `DataPrivacyScreen.tsx` — analytics opt-out toggle in privacy UI

The analytics/experimentation foundation is strong — Sentry integration is genuinely senior, telemetry has PII scrubbing and opt-out, Prometheus metrics exist, creator analytics are granular. The defects are gaps (no feature flags, no A/B testing, no session/user ID, no event batching, no funnels, no retention cohorts, no north star metric, no business metrics, `maskAllText: false`) rather than foundational failures. The path to flagship is integrating PostHog for feature flags + A/B testing, fixing the Sentry text masking, adding session/user context to events, batching events, and building the experimentation culture (hypothesis → metric → test → significance → ship/kill).

---

*Generated 2026-08-18 by the ThryftVerse flagship research programme. Live 2026 web benchmark + production codebase audit + psychology + micro/macro prescription. Sources: PostHog docs (React Native, Experiments, Frequentist Statistics), Sentry docs, Prometheus docs, Netflix/Pinterest/Spotify experimentation case studies, GDPR/CCPA, Apple ATT.*
