# P2 #32 — Analytics, Experimentation & Feature Rollout: Research Report

> **Auditor:** Senior data/infrastructure engineer (FAANG-level analytics + experimentation platforms)
> **Policy:** Anti-AI-design — evidence-based, every claim tagged with a file:line reference
> **Date:** 2026-08-25
> **Repository:** thryftverse-upgrade

---

## 1. Executive Finding

ThryftVerse has a **mature, well-architected product-analytics foundation** — significantly beyond what the flagship research doc (written 2026-08-18, pre-PostHog integration) describes. PostHog is now fully integrated as the unified analytics + feature-flag + session-replay platform, with a typed event taxonomy (`EventName` union of 47 events), typed feature-flag keys (`FeatureFlagKey` union of 8 flags), PII scrubbing on both the telemetry and screen-tracking paths, analytics opt-out, EU hosting for GDPR, session replay with privacy masking, and bootstrap-flag caching for instant flag access on cold start. The backend has a durable append-only `analytics_events` ledger (migration 140, partitioned by month, UUID v7) plus a Redis capped-list for operational telemetry, and a sophisticated recommendation impression lineage system (migrations 141-142) with served/rendered/viewable status lifecycle, candidate-source lineage, and inverse-propensity-weighting (IPW) selection propensity for unbiased off-policy evaluation.

**However, the experimentation layer is absent.** There is no experiment assignment, no variant bucketing, no guardrail metrics, no staged-rollout mechanism, no kill-switch, and no rollback measurement. The `feature_flag_evaluated` event is declared in the taxonomy (`types.ts:134`) but is **never emitted** — the `useFeatureFlag` hooks call `getFeatureFlag()` but do not log an exposure event, so there is no impression lineage linking a flag evaluation to downstream user actions. PostHog's built-in `$feature_flag_called` events fire automatically, but there is no custom exposure logging tied to the app's own impression lineage. The backend has zero feature-flag or experiment infrastructure — no flag evaluation endpoint, no server-side assignment, no guardrail dashboard, no rollout percentage config. The recommendation decision system has policy versioning with shadow/active/retired/blocked status (`077_decision_system_observability.sql:8-21`), which is the closest thing to a rollout mechanism, but it is recommendation-specific, not a general-purpose feature-flag system.

**Verdict:** Analytics infrastructure is flagship-grade. Experimentation infrastructure does not exist. The gap is not "build vs buy" — PostHog is already bought and provides experiments, flags, and guardrails. The gap is **activation and instrumentation**: wire up PostHog Experiments, add exposure logging to `useFeatureFlag`, define guardrail metrics, and establish the experimentation process.

---

## 2. Evidence Table

| Layer | Path:Line | Assessment |
|---|---|---|
| **Analytics SDK** | `frontend/package.json:119` | `posthog-react-native: ^4.63.5` — PostHog is the unified analytics + flag + replay platform. No Mixpanel, Amplitude, Segment, Firebase Analytics, or LaunchDarkly. |
| **PostHog provider** | `frontend/src/analytics/PostHogProvider.tsx:13-15` | EU host default (`https://eu.i.posthog.com`), GDPR-compliant. API key via `EXPO_PUBLIC_POSTHOG_KEY`. |
| **PostHog provider** | `frontend/src/analytics/PostHogProvider.tsx:146-181` | Autocapture disabled (manual tracking), `personProfiles: 'identified_only'` (anonymous events 4x cheaper, GDPR-friendlier), `preloadFeatureFlags: true`, session replay with `maskAllTextInputs: true`, `maskAllSandboxedViews: true`, `flushAt: 20` (batching), `flushInterval: 10000`, `before_send` strips `$ip` (GDPR). |
| **PostHog provider** | `frontend/src/analytics/PostHogProvider.tsx:26-78` | Bootstrap-flag caching via MMKV — instant flag access on cold start, no flicker. `saveBootstrapFlags()` persists flags after first `/flags` response. |
| **PostHog provider** | `frontend/src/analytics/PostHogProvider.tsx:185-191` | Telemetry bridge: `setTelemetryHandler` routes `trackTelemetryEvent` calls to `posthog.capture()` — dual-path (PostHog + backend `/analytics/events`). PII scrubbing and opt-out applied before the handler fires. |
| **Typed track()** | `frontend/src/analytics/track.ts:80-87` | `track<E extends EventName>()` — compile-time type safety via overloaded function. No-op when PostHog unconfigured. Single entry point — doc forbids direct PostHog import (`track.ts:4-14`). |
| **trackRaw()** | `frontend/src/analytics/track.ts:113-120` | Escape hatch for dynamic event names (e.g. `experiment_${arm}`). No-op when unconfigured. |
| **trackFunnelStep()** | `frontend/src/analytics/track.ts:143-159` | Funnel progression tracking — emits named step events with `funnel` property for PostHog funnel analysis. |
| **Event taxonomy** | `frontend/src/analytics/types.ts:98-146` | `EventName` union — 47 typed events across 15 surfaces (navigation, item engagement, search, auctions, commerce, selling, account, messaging, wallet, security, onboarding, notifications, experiments, sharing, live shopping, looks/moodboards, trust & safety, screen capture). Central registry — not string-literalled inline. |
| **Event properties** | `frontend/src/analytics/types.ts:210-213` | `EventProperties` mapped type — per-event property shape. Only `screen_view` and `screenshot_taken` have specific shapes; 45 events fall through to `DefaultEventProperties`. **Gap:** most events lack typed property contracts. |
| **Feature-flag keys** | `frontend/src/analytics/types.ts:31-39` | `FeatureFlagKey` union — 8 typed flags (`new_home_feed`, `live_shopping_enabled`, `co_own_v2`, `ai_listing_assist`, `moodboard_beta`, `conversational_search`, `advanced_filters`, `seller_analytics_v2`). Compile-time typo prevention. |
| **useFeatureFlag** | `frontend/src/analytics/useFeatureFlag.ts:50-77` | Boolean flag hook — reactive via `onFeatureFlags`, bootstrap-cache fallback, safe default `false`. **No exposure logging** — calls `getFeatureFlag()` but never emits `feature_flag_evaluated`. |
| **useFeatureFlagVariant** | `frontend/src/analytics/useFeatureFlag.ts:102-128` | String variant hook for A/B tests — preserves variant string. **No exposure logging.** PostHog's `$feature_flag_called` fires automatically but is not custom-instrumented. |
| **useFeatureFlagPayload** | `frontend/src/analytics/useFeatureFlag.ts:162-187` | Typed JSON payload hook for complex flags (remote config). No runtime payload validation. |
| **Flag usage** | `frontend/src/screens/HomeScreen.tsx:237-238` | `useFeatureFlag('new_home_feed')`, `useFeatureFlag('live_shopping_enabled')` — flags gate real features. |
| **Flag usage** | `frontend/src/screens/GlobalSearchScreen.tsx:366` | `useFeatureFlag('conversational_search')` — flag gates a feature. |
| **Flag usage** | `frontend/src/screens/SellScreen.tsx:247` | `useFeatureFlag('ai_listing_assist')` — flag gates a feature. |
| **Flag usage** | `frontend/src/screens/SettingsScreen.tsx:85` | `useFeatureFlag(flagKey)` — settings UI iterates flags (debug/override surface). |
| **Screen tracking** | `frontend/src/analytics/useScreenTracking.ts:36-56` | PII sanitisation — 18 PII key fragments stripped from route params. Only string/number values retained; objects/arrays dropped. |
| **Screen tracking** | `frontend/src/analytics/useScreenTracking.ts:138-164` | `trackScreenChange()` — single integration point in `NavigationContainer.onStateChange`. Tracks `previous_screen` for flow analysis. Deduplicates param-only updates. |
| **Telemetry** | `frontend/src/lib/telemetry.ts:13-34` | PII scrubbing — 20 PII key fragments (adds `device` vs screen-tracking's 18). Defence-in-depth. |
| **Telemetry** | `frontend/src/lib/telemetry.ts:57-65` | `analyticsOptOut` — module-level flag, synced with user preferences via `setAnalyticsOptOut`. |
| **Telemetry** | `frontend/src/lib/telemetry.ts:71-101` | `trackTelemetryEvent` — opt-out check → PII scrub → handler (PostHog bridge) → dev log → backend POST `/analytics/events` (best-effort). **Gap:** no `session_id`, no `user_id`, no client-side `timestamp`, no batching, no offline queue, no deduplication. |
| **Telemetry** | `frontend/src/lib/telemetry.ts:94-100` | `fetchJson('/analytics/events', ...)` — per-event HTTP POST. No batching. Silent failure on offline. |
| **Identity** | `frontend/src/analytics/identify.ts:61-84` | `identifyUser()` — `posthog.identify(user.id, {email, username, plan})` + super properties (`app_version`, `platform`, `device_model`). `personProfiles: 'identified_only'` means profile created only here. |
| **Identity** | `frontend/src/analytics/identify.ts:107-110` | `resetIdentity()` — `posthog.reset()` on logout: new anonymous distinct ID, clears person/super properties and flag overrides. |
| **Backend ingestion** | `backend/api/src/routes/recommendations.ts:502-570` | `POST /analytics/events` — dual-write: Redis capped-list (last 1000, operational) + Postgres `analytics_events` (durable, fire-and-forget). Returns 202. Schema: `event`, `listingId`, `sectionKey`, `position`, `reasonCode`, `personalised`, `sessionId`, `surface`. **Gap:** no idempotency key, no PII scrubbing server-side, `sessionId` optional, no `user_id` in payload (uses `request.authUser?.userId`). |
| **Backend ingestion** | `backend/api/src/routes/recommendations.ts:130-141` | `analyticsSchema` — Zod validation. `event: z.string().min(1).max(100)`, no enum constraint (any string accepted). **Gap:** no server-side event-name validation against a registry. |
| **Durable ledger** | `backend/api/src/db/migrations/140_analytics_events.sql:25-38` | `analytics_events` table — partitioned by month, UUID v7 PK, `event_name`, `schema_version`, `event_time`, `ingested_at`, `actor_user_id`, `session_id`, `request_id`, `surface`, `properties JSONB`. Append-only. |
| **Durable ledger** | `backend/api/src/db/migrations/140_analytics_events.sql:67-78` | Comments confirm: "canonical training-data source", "Redis capped lists are operational telemetry only." |
| **Impression lineage** | `backend/api/src/db/migrations/141_recommendation_impression_status.sql:16-21` | `recommendation_impressions` status lifecycle: `served` → `rendered` → `viewable`. `rendered_at`, `viewable_at`, `viewability JSONB`. Forward-only advancement. |
| **Impression lineage** | `backend/api/src/db/migrations/142_recommendation_candidate_lineage.sql:24-30` | Candidate-source lineage: `candidate_source`, `source_rank`, `source_score`, `retrieval_version`, `selection_propensity` (IPW key for unbiased off-policy evaluation). Nullable for backward compatibility. |
| **Impression confirmation** | `backend/api/src/routes/recommendations.ts:576-599` | `POST /recommendations/impressions` — client confirms rendered/viewable status. Status advances forward; `rendered_at`/`viewable_at` preserved via COALESCE. |
| **Impression attribution** | `backend/api/src/routes/recommendations.ts:383-409` | Interaction attribution — joins `recommendation_impressions` to `recommendation_serves` on `request_id` to recover `score`, `policy`, `position`, `model`, `policy_version`. 422 if attribution doesn't match user+listing. |
| **Decision policy versioning** | `backend/api/src/db/migrations/077_decision_system_observability.sql:8-21` | `decision_policy_versions` — `status: shadow|active|retired|blocked`. Closest thing to a rollout mechanism, but recommendation-specific, not general-purpose. |
| **Backend telemetry** | `backend/api/src/telemetry.ts:1-44` | OpenTelemetry SDK — OTLP trace exporter, auto-instrumentations. Server-side distributed tracing, not analytics. |
| **Creator analytics** | `backend/api/src/index.ts:45297-45432` | `POST /creator/analytics/events`, `GET /creator/analytics/summary`, `GET /creator/analytics/timeline` — creator-facing analytics (views, likes, saves, comments, shares, product_clicks, profile_visits). Separate from product analytics. |
| **Feature-flag eval event** | `frontend/src/analytics/types.ts:134` | `feature_flag_evaluated` declared in `EventName` union. **Never emitted anywhere in the codebase** — dead taxonomy entry. |
| **Experiment infra** | (missing) | No experiment assignment, no variant bucketing, no guardrail metrics, no staged-rollout config, no kill-switch, no rollback measurement anywhere in frontend or backend. |
| **Backend flag eval** | (missing) | No server-side feature-flag endpoint. No flag evaluation in backend. All flags evaluated client-side via PostHog SDK. |

---

## 3. Current Analytics Capability Assessment

| Capability | Status | Evidence |
|---|---|---|
| Central event registry | **Strong** | `types.ts:98-146` — 47-event `EventName` union, typed `EventProperties` mapped type. Single entry point `track()` with compile-time safety. |
| Per-event property contracts | **Partial** | Only 2 of 47 events have typed property shapes (`screen_view`, `screenshot_taken`). 45 fall through to untyped `DefaultEventProperties`. |
| PII scrubbing (client) | **Strong** | `telemetry.ts:13-34` (20 fragments) + `useScreenTracking.ts:36-56` (18 fragments). Defence-in-depth, drops PII keys entirely. |
| PII scrubbing (server) | **Missing** | Backend `/analytics/events` accepts any `event: string` and any `properties` — no server-side PII scrubbing. Relies entirely on client. |
| Analytics opt-out | **Strong** | `telemetry.ts:57-65` — module-level flag, synced with user preferences. PostHog bridge respects it (handler fires after opt-out check). |
| Session replay | **Strong** | `PostHogProvider.tsx:160-167` — `maskAllTextInputs: true`, `maskAllSandboxedViews: true`, `maskAllImages: false` (marketplace is visual). `captureLog: false`, `captureNetworkTelemetry: true`. |
| Session ID | **Partial** | `analytics_events` table has `session_id` column (`140_analytics_events.sql:32`), `analyticsSchema` accepts `sessionId` (`recommendations.ts:137`), but frontend `trackTelemetryEvent` never sends it (`telemetry.ts:94-100`). PostHog manages its own session internally. |
| User identity | **Strong** | `identify.ts:61-84` — `posthog.identify(user.id, {email, username, plan})` + super properties. `personProfiles: 'identified_only'` — anonymous pre-login. |
| Event batching | **Strong (PostHog)** / **Missing (backend path)** | PostHog: `flushAt: 20`, `flushInterval: 10000` (`PostHogProvider.tsx:169-170`). Backend `/analytics/events` path: per-event HTTP, no batching (`telemetry.ts:94-100`). |
| Offline queue | **Strong (PostHog)** / **Missing (backend path)** | PostHog SDK queues offline. Backend path: silent failure, events lost (`telemetry.ts:98-100`). |
| Event deduplication | **Missing** | No dedup in `trackTelemetryEvent` or `track()`. `trackScreenChange` deduplicates param-only screen changes (`useScreenTracking.ts:150-152`) but not general events. |
| Durable ledger | **Strong** | `140_analytics_events.sql` — partitioned, UUID v7, append-only, `schema_version`, `event_time` vs `ingested_at` (clock skew handling). |
| Impression lineage (recommendations) | **Flagship-grade** | Migrations 141-142: served/rendered/viewable lifecycle, candidate-source lineage, IPW selection propensity. `POST /recommendations/impressions` for client confirmation. Interaction attribution joins impressions to serves. |
| Impression lineage (general) | **Missing** | No general impression-to-action lineage. Only recommendation impressions have it. No `impression_id` on general analytics events. |
| Funnel tracking | **Partial** | `trackFunnelStep()` exists in both `track.ts:143-159` and `telemetry.ts:125-135`. No funnel visualization dashboard (PostHog Funnels available but not configured). |
| Retention cohorts | **Missing** | No cohort analysis. PostHog Retention available but not configured. |
| Business metrics (Prometheus) | **Partial** | `backend/api/src/lib/metrics.ts` has infrastructure metrics (HTTP, payments, auctions, push). No business metrics (GMV, listings, orders, signups). |
| North star metric | **Missing** | No defined north star metric. |

---

## 4. Current Feature-Flag Capability Assessment

| Capability | Status | Evidence |
|---|---|---|
| Feature-flag SDK | **Strong** | PostHog `posthog-react-native: ^4.63.5` — boolean flags, string variants, JSON payloads. |
| Typed flag keys | **Strong** | `types.ts:31-39` — `FeatureFlagKey` union of 8 flags. Compile-time typo prevention. |
| Boolean flag hook | **Strong** | `useFeatureFlag.ts:50-77` — reactive, bootstrap fallback, safe default. |
| Variant hook (A/B) | **Strong** | `useFeatureFlag.ts:102-128` — preserves variant string for experiment arms. |
| Payload hook (remote config) | **Strong** | `useFeatureFlag.ts:162-187` — typed JSON payload. No runtime validation. |
| Bootstrap caching | **Strong** | `PostHogProvider.tsx:26-78` — MMKV synchronous cache, instant flag access on cold start, no flicker. |
| Flag persistence | **Strong** | `PostHogProvider.tsx:237-255` — `BootstrapFlagSaver` persists flags on every change. |
| Server-side evaluation | **Missing** | All flags evaluated client-side via PostHog SDK. No backend flag endpoint. |
| Staged rollout (0% → 1% → 10% → 50% → 100%) | **Missing** | No rollout percentage config in code. PostHog dashboard supports it but no evidence of staged rollout process. |
| Kill-switch | **Missing** | No kill-switch mechanism. PostHog flags can be toggled in dashboard, but no automated kill-switch triggered by guardrail metric breach. |
| Exposure logging | **Missing** | `feature_flag_evaluated` declared in taxonomy (`types.ts:134`) but never emitted. `useFeatureFlag` hooks call `getFeatureFlag()` but don't log exposure. PostHog's `$feature_flag_called` fires automatically but is not custom-instrumented or tied to impression lineage. |
| Flag override UI | **Partial** | `SettingsScreen.tsx:85` — `useFeatureFlag(flagKey)` in settings, suggesting a debug/override surface. |
| Backend flag awareness | **Missing** | Backend has no feature-flag infrastructure. No flag evaluation, no flag-aware routing, no flag-gated behaviour. |

---

## 5. Gaps vs Flagship

### 5.1 Impression lineage

**What flagship does:** Every user-visible element that could influence behaviour (a recommendation, a feature-flagged UI variant, a banner, a search result) gets an `impression_id` at render time. Downstream actions (tap, purchase, share) carry that `impression_id` so the team can attribute the action to the specific impression that caused it. This is the foundation of causal inference in product analytics.

**What ThryftVerse has:** Impression lineage exists **only for recommendations** — `recommendation_impressions` with served/rendered/viewable lifecycle, candidate-source lineage, and IPW selection propensity (migrations 141-142). This is flagship-grade for the recommendation surface.

**What's missing:** No general impression lineage. The `feature_flag_evaluated` event is declared but never emitted, so there is no impression record for feature-flag exposure. General analytics events in `analytics_events` have no `impression_id` column. The `SyncRetryBanner` component has a local `trackImpression` pattern (`SyncRetryBanner.tsx:20,35,42-55`) but it's component-local, not a general impression lineage system.

**Gap severity:** High. Without exposure-level impression lineage, A/B test results are invalid — you can't tell which users were actually exposed to a variant.

### 5.2 Experiment assignment

**What flagship does:** A server-side experiment assignment service buckets users into variants using a deterministic hash of (user_id, experiment_id). The assignment is sticky (same user always gets the same variant), consistent across devices, and logged as an exposure event. The assignment service supports mutual exclusion (experiments that can't overlap), layering (experiments that can overlap), and traffic allocation (0% → 100% rollout).

**What ThryftVerse has:** PostHog feature flags with variant support (`useFeatureFlagVariant`). PostHog handles bucketing server-side and exposure logging via `$feature_flag_called`. But there is no custom experiment assignment, no mutual exclusion, no layering, no traffic allocation config in the codebase. No experiment registry. No hypothesis or success-metric definitions.

**What's missing:** No experiment registry (experiment ID, hypothesis, primary metric, guardrail metrics, sample size, start/end date). No custom exposure logging tied to impression lineage. No guardrail metrics. No statistical significance testing configured (PostHog Experiments supports frequentist, but no experiments are set up).

**Gap severity:** High. The infrastructure (PostHog) exists but is not activated for experimentation.

### 5.3 Guardrails

**What flagship does:** Every experiment defines guardrail metrics — metrics that must not regress. Common guardrails: crash rate, latency, retention, revenue, support ticket volume. If a guardrail breaches a threshold during the experiment, the experiment auto-kills. Guardrails prevent Goodhart's Law: a feature that improves CTR but crashes the app is not a success.

**What ThryftVerse has:** Nothing. No guardrail metrics defined. No guardrail monitoring. No auto-kill mechanism.

**Gap severity:** High. Without guardrails, experiments can ship features that improve the primary metric but regress critical business metrics.

### 5.4 Rollout measurement

**What flagship does:** Staged rollout (0% → 1% → 10% → 50% → 100%) with measurement at each stage. At each stage, the team checks: (1) crash rate hasn't increased, (2) guardrail metrics are stable, (3) primary metric is trending in the right direction. If any check fails, rollout halts. The rollout is reversible — a kill-switch reverts to 0% instantly without a release.

**What ThryftVerse has:** PostHog flags can be toggled in the dashboard (manual rollout), and `BootstrapFlagSaver` persists flag changes. But there is no staged-rollout process, no automated measurement at each stage, no kill-switch triggered by metric breach. The recommendation decision system has `shadow|active|retired|blocked` status (`077_decision_system_observability.sql:14-15`), which is a shadow-mode rollout pattern, but it's recommendation-specific.

**Gap severity:** Medium-High. The flag infrastructure supports manual rollout, but there's no measurement or automation around it.

---

## 6. Proposed Architecture

### 6.1 Event contract registry

**Current:** `EventName` union in `types.ts:98-146` is the registry, but only 2 of 47 events have typed property contracts. The backend accepts any string as an event name (`recommendations.ts:131`).

**Proposed:**
1. **Tighten `EventProperties`** — add typed property interfaces for all 47 events. Every event should have a compile-time property contract, not just 2.
2. **Server-side event-name validation** — replace `z.string().min(1).max(100)` in `analyticsSchema` (`recommendations.ts:131`) with a `z.enum([...])` matching the frontend `EventName` union. Generate the enum from a shared contract file (JSON or TypeScript) consumed by both frontend and backend.
3. **Schema versioning** — `analytics_events.schema_version` exists (`140_analytics_events.sql:28`). Define a migration process for schema changes: bump `schema_version`, add a backward-compatible column, backfill.
4. **Contract tests** — add a test that asserts every `EventName` has an entry in `EventProperties` (no fallthrough to `DefaultEventProperties`).

### 6.2 Client SDK with impression/exposure logging

**Current:** `useFeatureFlag` hooks call `getFeatureFlag()` but don't log exposure. `feature_flag_evaluated` is dead taxonomy.

**Proposed:**
1. **Add exposure logging to `useFeatureFlag`** — when a flag is evaluated, emit `feature_flag_evaluated` with `{ flag_key, variant, enabled, reason }`. This is the impression event for feature-flag exposure.
2. **Add `impression_id` to analytics events** — generate a UUID v7 per impression (render of a flag-gated surface, recommendation cell, search result). Carry the `impression_id` on downstream action events (tap, purchase) to create impression-to-action lineage.
3. **Add `session_id` and client-side `timestamp` to `trackTelemetryEvent`** — generate session ID on app launch, persist for session. Add client-side timestamp for clock-skew handling.
4. **Add event batching to the backend path** — replace per-event `fetchJson('/analytics/events')` with a batched queue (20 events or 10s flush). Add offline queue with re-queue on failure.
5. **Add event deduplication** — deduplicate within a 500ms window on (event_name, payload hash).

### 6.3 Server-side experiment assignment + bucketing

**Current:** All flag evaluation is client-side via PostHog SDK. No backend experiment infrastructure.

**Proposed:**
1. **Use PostHog Experiments (buy, not build)** — PostHog already handles server-side bucketing, sticky assignment, and exposure logging. Activate PostHog Experiments on top of existing feature flags.
2. **Add a backend flag-evaluation endpoint** (optional, for backend-gated behaviour) — `GET /flags/evaluate?keys=new_home_feed,live_shopping_enabled` returns evaluated flags for the authenticated user. This enables backend-gated features (e.g. which recommendation model to use) and server-side exposure logging.
3. **Experiment registry** — a `experiments` table: `experiment_id`, `flag_key`, `hypothesis`, `primary_metric`, `guardrail_metrics JSONB`, `sample_size`, `start_date`, `end_date`, `status`. This is the process contract, not the assignment engine (PostHog does assignment).
4. **Mutual exclusion** — use PostHog's flag dependencies to prevent overlapping experiments on the same surface.

### 6.4 Guardrail dashboard

**Current:** No guardrail metrics. No dashboard.

**Proposed:**
1. **Define guardrail metrics** — crash rate (Sentry), app start time (Sentry Performance), Day 1/7/30 retention (PostHog), GMV (backend), support ticket volume (backend), push delivery rate (backend).
2. **Add business metrics to Prometheus** — `thryftverse_gmv_total`, `thryftverse_listings_created_total`, `thryftverse_orders_completed_total`, `thryftverse_user_signups_total` in `backend/api/src/lib/metrics.ts`.
3. **Guardrail dashboard** — Grafana or PostHog Dashboard showing each guardrail metric with the current threshold. Every experiment links to its guardrail dashboard.
4. **Auto-kill** — a scheduled job that checks guardrail metrics for each active experiment. If a metric breaches its threshold, the job sets the PostHog flag to 0% rollout and alerts the team.

### 6.5 Staged rollout + kill-switch

**Current:** Manual PostHog dashboard toggle. No staged process. No automated kill-switch.

**Proposed:**
1. **Staged rollout process** — define rollout stages (0% → 1% → 10% → 50% → 100%) with a measurement checkpoint at each stage. PostHog supports percentage rollout natively.
2. **Kill-switch** — a `POST /flags/kill` endpoint that sets a flag to 0% rollout. Triggered manually or by the guardrail auto-kill job. The `BootstrapFlagSaver` already persists flag changes, so clients get the kill on next flag refresh.
3. **Rollback measurement** — when a flag is killed, log a `flag_killed` event with `{ flag_key, reason, killed_by, guardrail_breaches }`. Measure the recovery: did guardrail metrics return to baseline after kill?

### 6.6 Build vs Buy recommendation

**Recommendation: Buy (PostHog). Already integrated.**

**Justification:**
- PostHog is already the analytics + flag + replay platform (`posthog-react-native: ^4.63.5`). Building a custom experiment platform would duplicate functionality already paid for and integrated.
- PostHog Experiments provides: frequentist statistics (Welch's t-test, 95% confidence), exposure tracking via `$feature_flag_called`, variant assignment, funnel analysis, and retention cohorts. This matches the 2026 industry standard cited in the flagship research doc.
- Statsig and GrowthBook are alternatives, but switching would mean migrating off PostHog's flag system (already wired into 8 typed flags across 7 screens) and re-implementing the bootstrap-cache pattern. Not worth the migration cost.
- LaunchDarkly is overkill for a single mobile app — it's an enterprise flag platform priced for large organisations.
- The gap is **activation, not platform selection**: wire up PostHog Experiments, add exposure logging, define guardrails, establish the process. This is instrumentation work, not platform work.

**What to build (custom):**
- Experiment registry table (process contract, not assignment engine).
- Guardrail auto-kill job (scheduled metric check + flag toggle).
- Backend flag-evaluation endpoint (for backend-gated behaviour).
- Impression ID generation and propagation (for general impression lineage, beyond recommendations).
- Business metrics in Prometheus.

---

## 7. Privacy Considerations

| Consideration | Current status | Evidence |
|---|---|---|
| PII scrubbing (client) | **Strong** | `telemetry.ts:13-34` (20 fragments), `useScreenTracking.ts:36-56` (18 fragments). Drops PII keys entirely. |
| PII scrubbing (server) | **Missing** | Backend accepts any `properties` JSONB. No server-side scrubbing. **Recommendation:** add server-side PII scrubbing as defence-in-depth. |
| Analytics opt-out | **Strong** | `telemetry.ts:57-65` — module-level flag, synced with user preferences. PostHog bridge respects it. |
| GDPR hosting | **Strong** | `PostHogProvider.tsx:14-15` — EU host default (`https://eu.i.posthog.com`). |
| IP stripping | **Strong** | `PostHogProvider.tsx:174-179` — `before_send` deletes `$ip` from event properties. |
| Person profiles | **Strong** | `PostHogProvider.tsx:150` — `personProfiles: 'identified_only'` — anonymous events pre-login, no PII in anonymous events. |
| Session replay masking | **Strong** | `PostHogProvider.tsx:162-164` — `maskAllTextInputs: true`, `maskAllSandboxedViews: true`. `maskAllImages: false` (marketplace is visual — acceptable trade-off). |
| Consent (ATT) | **Not verified** | No evidence of Apple App Tracking Transparency framework integration for cross-app tracking. PostHog is first-party (not cross-app), so ATT may not apply, but this should be verified. |
| Data retention | **Partial** | Redis capped-list: last 1000 entries, auto-evicted (`recommendations.ts:519`). Postgres `analytics_events`: no retention policy defined. **Recommendation:** define a retention period (e.g. 2 years) with a monthly partition-drop job. |
| Data deletion (GDPR) | **Missing** | No evidence of a "delete my analytics data" flow. `analytics_events.actor_user_id` is not FK-constrained (`140_analytics_events.sql:75-76`), so deletion by user ID is possible but not implemented. **Recommendation:** add a user-deletion endpoint that deletes from `analytics_events WHERE actor_user_id = $1`. |
| Anonymized user IDs | **Partial** | PostHog uses raw `user.id` as distinct ID (`identify.ts:73`). PostHog is first-party and GDPR-compliant, but for the backend `analytics_events` ledger, using raw user IDs means the durable training data contains identifiable references. **Recommendation:** consider hashing user IDs in the durable ledger if ML pipelines don't need the raw ID. |

---

## 8. Evidence Tags

- `[ANALYTICS-SDK]` `frontend/package.json:119` — PostHog as unified platform
- `[TAXONOMY]` `frontend/src/analytics/types.ts:98-146` — 47-event `EventName` union
- `[TAXONOMY-GAP]` `frontend/src/analytics/types.ts:210-213` — only 2 of 47 events have typed properties
- `[TRACK]` `frontend/src/analytics/track.ts:80-87` — typed `track()` with compile-time safety
- `[TRACK-RAW]` `frontend/src/analytics/track.ts:113-120` — escape hatch for dynamic event names
- `[FUNNEL]` `frontend/src/analytics/track.ts:143-159` — `trackFunnelStep()`
- `[FLAG-KEYS]` `frontend/src/analytics/types.ts:31-39` — 8 typed `FeatureFlagKey` union
- `[FLAG-BOOL]` `frontend/src/analytics/useFeatureFlag.ts:50-77` — `useFeatureFlag()` boolean hook
- `[FLAG-VARIANT]` `frontend/src/analytics/useFeatureFlag.ts:102-128` — `useFeatureFlagVariant()` for A/B arms
- `[FLAG-PAYLOAD]` `frontend/src/analytics/useFeatureFlag.ts:162-187` — `useFeatureFlagPayload()` remote config
- `[FLAG-BOOTSTRAP]` `frontend/src/analytics/PostHogProvider.tsx:26-78` — MMKV bootstrap-flag caching
- `[FLAG-USAGE]` `frontend/src/screens/HomeScreen.tsx:237-238` — flags gate real features
- `[FLAG-EXPOSURE-MISSING]` `frontend/src/analytics/types.ts:134` — `feature_flag_evaluated` declared but never emitted
- `[POSTHOG-CONFIG]` `frontend/src/analytics/PostHogProvider.tsx:146-181` — EU host, identified_only, session replay, batching, IP strip
- `[POSTHOG-BRIDGE]` `frontend/src/analytics/PostHogProvider.tsx:185-191` — telemetry-to-PostHog bridge
- `[PII-TELEMETRY]` `frontend/src/lib/telemetry.ts:13-34` — 20 PII fragments scrubbed
- `[PII-SCREEN]` `frontend/src/analytics/useScreenTracking.ts:36-56` — 18 PII fragments scrubbed from route params
- `[OPT-OUT]` `frontend/src/lib/telemetry.ts:57-65` — analytics opt-out flag
- `[TELEMETRY-GAP]` `frontend/src/lib/telemetry.ts:71-101` — no session_id, no user_id, no timestamp, no batching, no offline queue, no dedup
- `[TELEMETRY-HTTP]` `frontend/src/lib/telemetry.ts:94-100` — per-event HTTP POST, silent failure
- `[IDENTIFY]` `frontend/src/analytics/identify.ts:61-84` — `identifyUser()` with super properties
- `[RESET]` `frontend/src/analytics/identify.ts:107-110` — `resetIdentity()` on logout
- `[SCREEN-TRACKING]` `frontend/src/analytics/useScreenTracking.ts:138-164` — `trackScreenChange()` with previous_screen
- `[BACKEND-INGEST]` `backend/api/src/routes/recommendations.ts:502-570` — `POST /analytics/events` dual-write
- `[BACKEND-SCHEMA]` `backend/api/src/routes/recommendations.ts:130-141` — `analyticsSchema` accepts any string event name
- `[DURABLE-LEDGER]` `backend/api/src/db/migrations/140_analytics_events.sql:25-38` — partitioned append-only `analytics_events`
- `[IMPRESSION-STATUS]` `backend/api/src/db/migrations/141_recommendation_impression_status.sql:16-21` — served/rendered/viewable lifecycle
- `[IMPRESSION-LINEAGE]` `backend/api/src/db/migrations/142_recommendation_candidate_lineage.sql:24-30` — candidate-source lineage + IPW propensity
- `[IMPRESSION-CONFIRM]` `backend/api/src/routes/recommendations.ts:576-599` — client-confirmed viewability
- `[IMPRESSION-ATTRIBUTION]` `backend/api/src/routes/recommendations.ts:383-409` — interaction-to-impression attribution join
- `[DECISION-POLICY]` `backend/api/src/db/migrations/077_decision_system_observability.sql:8-21` — shadow/active/retired/blocked status
- `[CREATOR-ANALYTICS]` `backend/api/src/index.ts:45297-45432` — creator-facing analytics endpoints
- `[OTEL]` `backend/api/src/telemetry.ts:1-44` — OpenTelemetry server-side tracing
- `[EXPERIMENT-MISSING]` (no file) — no experiment assignment, guardrail, rollout, or kill-switch anywhere
- `[BACKEND-FLAG-MISSING]` (no file) — no server-side flag evaluation
- `[SERVER-PII-MISSING]` `backend/api/src/routes/recommendations.ts:130-141` — no server-side PII scrubbing
- `[RETENTION-MISSING]` (no file) — no data retention policy for `analytics_events`
- `[DELETION-MISSING]` (no file) — no GDPR data-deletion flow for analytics
