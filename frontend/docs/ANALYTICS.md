# Thryftverse Analytics — Privacy-First User Behaviour Tracking

This document describes the in-house, privacy-first analytics system used by the
Thryftverse mobile app. It covers what is tracked, what is **not** tracked, how a
user can opt out, and how to add new tracking events.

## Principles

1. **Privacy-first.** No personally identifiable information (PII) is ever
   collected, transmitted, or stored. The telemetry module strips PII keys
   defensively before any event is dispatched.
2. **In-house only.** No third-party analytics SDKs (Google Analytics, Mixpanel,
   Amplitude, etc.) are used. All events flow through the existing
   `trackTelemetryEvent` function and are sent to the Thryftverse backend
   `/analytics/events` endpoint.
3. **Opt-out capable.** The user can disable analytics at any time from
   **Settings → Privacy & safety → Data & analytics → Analytics opt-out**.
   When opt-out is active, no event is dispatched or transmitted.
4. **Resilient.** Analytics must never crash the app. All handler and network
   calls are wrapped in best-effort try/catch blocks.

## Architecture

```
trackScreenView / trackFunnelStep / trackFeatureUsage / trackButtonTap
        │
        ▼
trackTelemetryEvent(eventName, payload)
        │
        ├── 1. Check analyticsOptOut flag → return early if opted out
        ├── 2. Scrub PII keys from payload
        ├── 3. Dispatch to registered telemetry handler (in-process)
        └── 4. POST to /analytics/events (best-effort, fire-and-forget)
```

The opt-out flag lives in the `SettingsPreferencesContext` and is synced to the
telemetry module's module-level flag via `setAnalyticsOptOut()` so that it is
respected even before the first React re-render commits.

## Events Tracked

| Event name          | Helper                  | Payload                                                |
| ------------------- | ----------------------- | ------------------------------------------------------ |
| `screen_view`       | `trackScreenView`       | `{ screen, ...nonPIIParams }`                          |
| `funnel_step`       | `trackFunnelStep`       | `{ funnel, step, step_number }`                        |
| `feature_usage`     | `trackFeatureUsage`     | `{ feature, action }`                                  |
| `button_tap`        | `trackButtonTap`        | `{ action, ...context }`                               |
| `item_detail_view`  | `ProductAnalytics.itemView` | `{ listingId, sessionId }`                         |
| `item_media_view`   | `ProductAnalytics.mediaView` | `{ listingId, position, sessionId }`              |
| `item_media_zoom`   | `ProductAnalytics.mediaZoom` | `{ listingId, sessionId }`                         |
| `item_save`         | `ProductAnalytics.itemSave` | `{ listingId, sessionId }`                          |
| `commerce_routing_failure` | (internal)        | `{ commerce_mode, listing_id, failure_reason }`       |

Screen views are wired into the navigation container's `onStateChange`
callback in `App.tsx`, so every route transition is recorded automatically.

## What is NOT captured

The following categories of data are **never** collected:

- **Email addresses**
- **Phone numbers**
- **Names** (display name, username, real name)
- **Physical addresses**
- **Passwords or tokens**
- **Avatar images or bios**
- **Dates of birth**
- **Government IDs** (SSN, passport, national ID)
- **Device fingerprints** (device ID, IP, precise location)
- **Precise geolocation** (latitude/longitude)

The telemetry module maintains a `PII_KEY_FRAGMENTS` list and strips any
payload key whose name (case-insensitive) contains one of these fragments.
This is a defence-in-depth measure — callers should never intentionally pass
PII into a telemetry event.

## How to opt out

1. Open **Settings**.
2. Navigate to **Privacy & safety**.
3. Under **Data & analytics**, toggle **Analytics opt-out** on.

When opt-out is enabled:

- No telemetry events are dispatched to handlers.
- No events are sent to the backend.
- The preference is persisted to `AsyncStorage` and restored on next launch.
- The opt-out is applied synchronously at the module level, so even events
  fired during app boot are suppressed.

## How to add a new tracking event

1. **Prefer a helper.** If the event fits one of the existing categories
   (screen view, funnel step, feature usage, button tap), use the
   corresponding helper from `src/lib/telemetry.ts`:

   ```ts
   import { trackFeatureUsage } from '../lib/telemetry';

   trackFeatureUsage('style_quiz', 'completed');
   ```

2. **For a new event shape**, add a dedicated helper in `telemetry.ts`:

   ```ts
   export function trackWishlistAdd(listingId: string): void {
     trackTelemetryEvent('wishlist_add', { listing_id: listingId });
   }
   ```

3. **Never pass PII.** Only pass opaque IDs (listing IDs, category IDs) and
   enum-like strings. The scrubber is a safety net, not a licence to pass PII.

4. **Use stable event names.** Event names are part of the analytics contract
   with the backend. Use `snake_case` and document the event in the table
   above.

5. **Test the opt-out.** Ensure your new call site works correctly when the
   user has opted out — the event should silently no-op.

## Privacy considerations

- **No user IDs in payloads.** Events are anonymous. The backend may
  correlate events using the authenticated session, but the client does not
  embed user identifiers in the payload.
- **No device fingerprinting.** The app does not collect device IDs,
  advertising identifiers, IP addresses, or precise location for analytics.
- **No third-party SDKs.** All data stays within the Thryftverse backend.
- **Best-effort transmission.** Analytics network failures are silently
  swallowed and never surface to the user.
- **Dev-only logging.** In `__DEV__`, events are logged to the console for
  debugging. In production, only the network call is made.

## Source files

| File | Purpose |
| ---- | ------- |
| `src/lib/telemetry.ts` | Core telemetry module, helpers, opt-out, PII scrubbing |
| `src/preferences/settingsPreferences.ts` | `analyticsOptOut` preference type, default, persistence |
| `src/context/SettingsPreferencesContext.tsx` | React context exposing `analyticsOptOut` + setters, syncs to telemetry module |
| `src/screens/PrivacySettingsScreen.tsx` | User-facing opt-out toggle |
| `App.tsx` | Navigation `onStateChange` → `trackScreenView` wiring |
| `src/platform/product/productAnalytics.ts` | Product-specific analytics (item views, media, saves) |
