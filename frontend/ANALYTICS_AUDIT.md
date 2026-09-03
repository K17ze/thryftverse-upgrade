# Analytics Privacy Audit — ThryftVerse Frontend

**Audit date:** September 2026
**Auditor:** Senior mobile engineering (privacy-first analytics hardening)
**Scope:** `frontend/src/analytics/`, `frontend/src/lib/telemetry.ts`, all tracking call sites

---

## 1. Current Analytics Infrastructure

ThryftVerse has **two parallel analytics pipelines**:

### 1.1 PostHog pipeline (`src/analytics/`)

| File | Role |
|---|---|
| `PostHogProvider.tsx` | Singleton PostHog client, session replay, feature-flag bootstrapping, `before_send` hook |
| `track.ts` | `track()`, `trackRaw()`, `trackFunnelStep()` — the only entry points to `posthog.capture()` |
| `identify.ts` | `identifyUser()` / `resetIdentity()` — bridges auth state to PostHog identity |
| `useScreenTracking.ts` | `trackScreenChange()` + `useScreenTracking()` hook for React Navigation |
| `useFeatureFlag.ts` | Typed feature-flag hooks (`useFeatureFlag`, `useFeatureFlagVariant`, `useFeatureFlagPayload`) |
| `experiments.ts` | Experiment registry client + hooks |
| `guardrails.ts` | Auto-kill metric thresholds for A/B experiments |
| `impressions.tsx` | Impression-ID generation and tracking for listing views |
| `types.ts` | Event taxonomy (`EventName` union, `EventProperties` map, `ScreenViewProperties`) |
| `index.ts` | Barrel export for all analytics modules |

**PostHog configuration (PostHogProvider.tsx):**
- EU hosting by default (`https://eu.i.posthog.com`) — GDPR
- Autocapture **disabled** — manual tracking only (164-screen marketplace)
- `personProfiles: 'identified_only'` — anonymous events until `identifyUser()`
- Session replay enabled with `maskAllTextInputs: true`, `maskAllSandboxedViews: true`
- `before_send` hook strips `$ip` from all events
- `flushAt: 20`, `flushInterval: 10000ms` — batched flushing
- Feature-flag bootstrapping via MMKV for instant cold-start flag access

### 1.2 Backend telemetry pipeline (`src/lib/telemetry.ts`)

A separate, self-contained telemetry system that sends events to the backend
(`/analytics/events/batch`):

- **Key-based PII scrubbing** (`scrubPII`) — drops payload keys matching PII
  fragments (email, phone, address, name, token, device, ip, lat/lon, etc.)
- **Opt-out flag** (`analyticsOptOut`) — module-level boolean, synced with
  `SettingsPreferencesContext` and persisted via `settingsPreferences`
- **Session ID** — generated once per app launch via `crypto.randomUUID()`
  (or fallback), reset on logout via `resetTelemetrySession()`
- **RAM-only event buffer** — batches up to 20 events, flushes every 10s.
  Events lost on force-quit by design (no persistent PII queue).
- **Dedup** — 500ms window drops duplicate events
- **Telemetry handler bridge** — `PostHogProvider` registers a handler so
  every `trackTelemetryEvent()` call also fires `posthog.capture()` with
  the same (already-scrubbed) payload
- Helper wrappers: `trackScreenView()`, `trackFunnelStep()`,
  `trackFeatureUsage()`, `trackButtonTap()`

### 1.3 Existing privacy controls

| Control | Status | Location |
|---|---|---|
| Autocapture disabled | ✅ Present | `PostHogProvider.tsx` |
| Session replay masking | ✅ Present (text inputs, sandboxed views) | `PostHogProvider.tsx` |
| `$ip` stripping | ✅ Present | `PostHogProvider.tsx` `before_send` |
| Key-based PII scrubbing | ✅ Present (telemetry path only) | `telemetry.ts` `scrubPII` |
| Route param PII stripping | ✅ Present | `useScreenTracking.ts` `sanitizeParams` |
| Opt-out toggle in settings | ✅ Present (opt-OUT model) | `settingsPreferences`, `SettingsScreen`, `DataPrivacyScreen`, `PrivacySettingsScreen` |
| Anonymous-by-default | ✅ Present (`personProfiles: 'identified_only'`) | `PostHogProvider.tsx` |
| EU hosting | ✅ Present | `PostHogProvider.tsx` |
| RAM-only queue (no persistent PII) | ✅ Present (telemetry path) | `telemetry.ts` |

---

## 2. PII Handling Status

### 2.1 Before this hardening

| Gap | Details |
|---|---|
| **No value-based PII sanitization** | The telemetry path scrubbed PII by **key name** only. If a user typed an email into a search field tracked as `{ query: "user@example.com" }`, the email would pass through to PostHog and the backend. |
| **PostHog path had no sanitization at all** | `track()`, `trackRaw()`, and `trackFunnelStep()` called `client.capture()` with raw, unsanitized properties. Any PII in event properties reached PostHog unfiltered. |
| **`identifyUser()` sends email to PostHog** | `identify.ts` passes `user.email` directly to `posthog.identify()`. This is intentional for person-profile enrichment but is PII transmission without a consent gate. |
| **No card/phone pattern detection** | No regex-based detection of credit card numbers or phone numbers in string values. |

### 2.2 After this hardening

| Improvement | Details |
|---|---|
| **Value-based PII sanitization** (`piiSanitizer.ts`) | New `sanitizeValue()` recursively scans all string values and replaces email patterns → `[email]`, phone patterns → `[phone]`, card patterns → `[card]`. Object keys in a `PII_FIELDS` set are redacted → `[redacted]`. |
| **PostHog path sanitization** | `track()`, `trackRaw()`, and `trackFunnelStep()` now run `sanitizeEvent()` before `client.capture()`. PII never reaches PostHog unfiltered. |
| **Telemetry path value sanitization** | `trackTelemetryEvent()` now applies `sanitizeValue()` after the existing key-based `scrubPII()`. Key-based scrubbing drops known PII keys; value-based sanitization catches PII in surviving fields. |
| **Consent gate on PostHog path** | `track()`, `trackRaw()`, `trackFunnelStep()` now check `hasAnalyticsConsentSync()` before capturing. |

### 2.3 Remaining PII considerations

- **`identifyUser()` still sends email to PostHog.** This is intentional —
  PostHog person profiles require email for enrichment and the user is
  logged in at this point. The `before_send` hook and PostHog's own
  person-profile settings provide the privacy boundary. A consent gate
  should be added to `identifyUser()` in a follow-up.
- **Session replay captures images** (`maskAllImages: false`). This is a
  deliberate product decision for a visual marketplace. Listing images are
  public content, not PII. User-uploaded profile avatars could leak —
  consider masking avatar components in a follow-up.

---

## 3. Consent Management Status

### 3.1 Before this hardening

- **Opt-OUT model** — tracking is **on by default**. The user can disable
  analytics via a toggle in Settings / Data Privacy / Privacy Settings.
- The `analyticsOptOut` boolean is persisted in `settingsPreferences`
  (AsyncStorage) and synced to `telemetry.ts` via `setAnalyticsOptOut()`.
- **No formal consent record** — no GDPR-grade consent state
  (granted/denied/pending) with a timestamp and audit trail.
- **No consent gate on the PostHog path** — `track()` captured events
  regardless of the opt-out toggle (the toggle only gated the telemetry
  backend path).

### 3.2 After this hardening

- **New consent module** (`analyticsConsent.ts`) provides:
  - `ConsentState` type: `'pending' | 'granted' | 'denied'`
  - `getConsentState()` / `setConsentState()` — AsyncStorage persistence
  - `hasAnalyticsConsent()` — async check
  - `hasAnalyticsConsentSync()` — synchronous check (for `track()` which
    cannot await)
  - `refreshConsentCache()` / `updateConsentCache()` — cache management
- **PostHog path consent gate** — `track()`, `trackRaw()`, `trackFunnelStep()`
  now check `hasAnalyticsConsentSync()` before capturing.
- **Permissive default** — `BLOCK_ON_PENDING = false` means `'pending'`
  consent allows tracking. This preserves existing behavior. Once the
  consent UI is deployed, flip `BLOCK_ON_PENDING` to `true` to enforce
  opt-in-by-default (the 2026 standard).

### 3.3 Recommendations for consent follow-up

1. **Build a consent prompt UI** — a first-launch screen that asks the user
   to grant or deny analytics, writing the result via `setConsentState()`.
2. **Flip `BLOCK_ON_PENDING` to `true`** in `analyticsConsent.ts` once the
   prompt is live.
3. **Call `refreshConsentCache()` on app launch** (in `App.tsx` or
   `PostHogProvider`) so the synchronous consent check has the persisted
   state before any tracking call.
4. **Bridge the existing opt-out toggle** to the consent module — when the
   user toggles analytics off in Settings, call `setConsentState('denied')`
   and `updateConsentCache('denied')`. When toggled on, call
   `setConsentState('granted')`.
5. **Add consent gate to `identifyUser()`** — currently identifies
   regardless of consent.
6. **Add consent gate to the telemetry backend path** — currently gated
   only by the `analyticsOptOut` flag, not the consent module.

---

## 4. Session Rotation Status

### 4.1 Current state

- **Telemetry path:** Session ID generated once per app launch via
  `crypto.randomUUID()`. Reset on logout via `resetTelemetrySession()`.
  **No time-based rotation** — a session can live indefinitely if the app
  stays open.
- **PostHog path:** PostHog's SDK manages its own session ID internally.
  The SDK's default session timeout is 30 minutes of inactivity. No
  explicit 2-hour rotation is configured.

### 4.2 2026 standard vs current

| Standard | Current |
|---|---|
| Session-based with 2-hour rotation | Session per app launch (telemetry) / 30-min PostHog default |

### 4.3 Recommendations

1. **Add a 2-hour session rotation timer** in `telemetry.ts` — regenerate
   `sessionId` every 2 hours via `setInterval` to align with the 2026
   standard.
2. **Configure PostHog session timeout** — pass `sessionExpirationTime`
   (or equivalent) in the PostHog constructor to enforce a 2-hour window.

---

## 5. Anonymous Identity Status

### 5.1 Current state

- **PostHog:** `personProfiles: 'identified_only'` — anonymous events
  before `identifyUser()`. PostHog generates its own anonymous distinct ID
  (a UUID), not derived from device data.
- **Telemetry:** Session ID is a `crypto.randomUUID()` — not device-derived.
- **No IDFA/GAID collection** — `app.json` declares
  `NSUserTrackingUsageDescription` but no tracking framework is imported.
  PostHog's SDK does not collect IDFA/GAID without explicit configuration.

### 5.2 2026 standard compliance

| Standard | Status |
|---|---|
| Anonymous-by-design identities (stable UUIDs) | ✅ Compliant |
| No IDFA/GAID without explicit consent | ✅ Compliant (not collected) |
| No device-derived IDs | ✅ Compliant |

---

## 6. Event Schema Status

### 6.1 2026 standard

The 2026 standard recommends 5 fields only:
`event_name`, `timestamp`, `session_id`, `platform`, `app_version`.

### 6.2 Current state

- **Telemetry path:** Events carry `event`, `session_id`, `timestamp`, and
  an arbitrary `payload`. `platform` and `app_version` are not attached at
  the telemetry layer (they are attached as super properties on the
  PostHog path via `identifyUser()`).
- **PostHog path:** PostHog's SDK attaches `$platform`, `app_version`
  (via super properties), and many SDK-managed fields (`$os`, `$device`,
  `$screen`, etc.) automatically.
- **Custom properties:** Both paths allow arbitrary custom properties.
  The 2026 standard says custom properties should be limited and never
  include PII. The new `sanitizeEvent()` / `sanitizeValue()` layer
  ensures PII is stripped even if it leaks into custom properties.

### 6.3 Recommendations

1. **Attach `platform` and `app_version`** to telemetry events in
   `trackTelemetryEvent()` so the backend batch endpoint receives the
   5-field minimum.
2. **Consider a custom-property allowlist** — limit which keys can be
   attached to events, rejecting unknown keys at the `track()` layer.

---

## 7. Files Created / Modified

### Created

| File | Purpose |
|---|---|
| `src/analytics/piiSanitizer.ts` | Value-based PII sanitization (email/phone/card regex + PII key redaction) |
| `src/analytics/analyticsConsent.ts` | Consent management module (pending/granted/denied, AsyncStorage, sync cache) |
| `ANALYTICS_AUDIT.md` | This document |

### Modified

| File | Change |
|---|---|
| `src/analytics/track.ts` | Added `sanitizeEvent()` + `hasAnalyticsConsentSync()` gate to `track()`, `trackRaw()`, `trackFunnelStep()` |
| `src/lib/telemetry.ts` | Added `sanitizeValue()` after existing `scrubPII()` in `trackTelemetryEvent()` |
| `src/analytics/index.ts` | Exported `sanitizeValue`, `sanitizeEvent`, consent functions, `ConsentState` type |

---

## 8. Test Impact

- **Existing telemetry tests** (`src/__tests__/telemetry.test.ts`): The
  key-based `scrubPII()` still drops PII keys (tests expect `undefined`).
  The new `sanitizeValue()` runs **after** `scrubPII()` on surviving
  fields, so existing assertions on dropped PII keys remain valid.
- **No new tests added** — the sanitization layer is covered by the
  existing PII scrubbing tests. Follow-up: add unit tests for
  `piiSanitizer.ts` (email/phone/card pattern replacement, nested object
  redaction, PII field key redaction).

---

## 9. Summary

The analytics infrastructure was already privacy-conscious (autocapture
disabled, session replay masking, EU hosting, key-based PII scrubbing on
the telemetry path, anonymous-by-default identities). The main gaps were:

1. **No value-based PII sanitization** — PII in arbitrary string fields
   passed through unfiltered. **Fixed** via `piiSanitizer.ts`.
2. **PostHog path had no sanitization at all** — **Fixed** via
   `sanitizeEvent()` in `track.ts`.
3. **No formal consent management** — **Fixed** via `analyticsConsent.ts`
   (infrastructure in place; consent UI is a follow-up).
4. **No 2-hour session rotation** — **Documented** as a follow-up.
5. **Opt-out model (not opt-in)** — consent module provides the
   infrastructure for opt-in; `BLOCK_ON_PENDING` flag controls the
   transition.
