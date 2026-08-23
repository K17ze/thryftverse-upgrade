# ThryftVerse Flagship Parity Gap Report — August 2026

## Executive Summary

ThryftVerse is a React Native (Expo) marketplace app with a mature, well-architected codebase spanning ~164 screens, a double-entry ledger payments system, escrow with buyer-protection, realtime WebSocket infrastructure, and comprehensive compliance tooling (GDPR, CCPA, COPPA, EU AI Act Article 50, DAC7).

**Overall assessment: B+** — Strong engineering foundation with production-grade infrastructure in many areas, but critical integration gaps where well-built modules are never wired into the app, and several flagship-standard capabilities are entirely missing or demo-mode only.

**Gap count: ~180 gaps across 14 domains**
- **P1 Critical: ~45** (blocks flagship parity or store submission)
- **P2 Important: ~70** (visible quality gap vs flagship)
- **P3 Enhancement: ~65** (polish for excellence)

---

## Domain Grades

| Domain | Grade | P1 | P2 | P3 | Key Strength | Key Gap |
|--------|-------|----|----|----|--------------|---------|
| Accessibility (WCAG 2.2 AA) | B | 5 | 5 | 4 | Mature a11y foundation | Dynamic type, touch targets, focus management |
| Testing & QA | C+ | 5 | 6 | 4 | 700+ tests exist | No coverage, no E2E in CI, no visual regression |
| Full-Stack Security | B | 5 | 7 | 5 | SecureStore, 2FA, biometric gates | SSL pinning inactive, no DB encryption, no screen capture protection |
| Media Pipeline | B- | 3 | 4 | 3 | EXIF stripping, background uploads | resizeForUpload() never called, no WebP/HEIC, no video moderation |
| Payment/Checkout/Escrow | A- | 4 | 7 | 11 | Double-entry ledger, escrow, reconciliation | No tax calc, no guest checkout, no express checkout |
| Push/Analytics/Experimentation | C+ | 15 | 8 | 5 | Contextual soft-ask, PostHog provider | PostHog identifyUser never called, no A/B testing, no rich notifications |
| Onboarding & Auth | B+ | 4 | 5 | 4 | 5 auth methods, session management | No passkeys, no biometric login, no guest browse, no onboarding personalization |
| Creator/Camera Pipeline | B | 3 | 4 | 3 | ML Kit, effect processor | No real-time AR, demo-mode AI, local-only drafts, no GIF stickers |
| Search/Discovery/Recommendation | C+ | 10 | 19 | 10 | Decision service architecture, truthful UI | Heuristic-only recs, no ML, no visual search ML, no synonyms, demo conversational search |
| App Store Readiness & Ops | B- | 15 | 23 | 27 | CI/CD pipeline, DR runbook, compliance tooling | Placeholder credentials, missing screenshots, Sentry DSN empty, no crash-free target |
| Chat/Messaging & Realtime Bidding | B+ | 2 | 5 | 4 | WebSocket with gap replay, typing indicators, reactions, replies | No anti-sniping, no message search, no read receipt delivery via realtime |
| i18n/Localization | C+ | 3 | 5 | 3 | i18next + react-i18next + expo-localization | ~7% string coverage, 4 locales only, no RTL locales, backend not localized |

---

## P1 CRITICAL GAPS (45 items — blocks flagship parity or store submission)

### Security (5)
1. **SSL pinning scaffolded but not enforced** — TrustKit configured with `REPLACE_WITH_*` SPKI hash placeholders (`plugins/withTrustKit.js:57-69`)
2. **No local database encryption** — SQLite/AsyncStorage data at rest is unencrypted
3. **No screen capture protection** — Sensitive screens (wallet, payments) don't block screenshots/recordings
4. **No app integrity/tamper detection** — No root/jailbreak detection, no Play Integrity API
5. **No certificate transparency monitoring** — ATS has CT requirement but no violation alerting

### Testing & QA (5)
6. **No coverage measurement or thresholds** — Tests run but coverage is not measured or gated
7. **`@testing-library/react-native` installed but unused** — Component tests don't use RTL patterns
8. **Zero E2E tests in CI** — Maestro flows exist but no `type: maestro` EAS Workflow job
9. **No pixel-diff visual regression** — `visualRegressionPlan.test.ts` exists but no committed baselines
10. **No AppErrorBoundary testing** — Error boundary paths untested

### Accessibility (5)
11. **Dynamic type not integrated with OS font scale** — Text doesn't scale with system font settings
12. **Text components lack `maxFontSizeMultiplier`** — Large font settings can break layouts
13. **Critical text contrast failures** — Some text/background combinations fail WCAG AA 4.5:1
14. **Sub-24px touch targets exist** — Some interactive elements below 44pt minimum
15. **No focus trap/restore for modals** — Screen reader focus escapes modal boundaries

### Media Pipeline (3)
16. **`resizeForUpload()` defined but never called** — Full-resolution images uploaded (bandwidth + storage waste)
17. **No client-side WebP/HEIC conversion** — JPEG/PNG uploaded at full size
18. **No server-side video moderation** — Video content not scanned for prohibited content

### Payment/Checkout (4)
19. **No tax/VAT calculation at checkout** — No Stripe Tax integration, no tax line item displayed
20. **No guest checkout** — Users must sign in before purchasing (19% abandon rate)
21. **No express checkout on item detail** — No Apple Pay/Google Pay "Buy Now" button
22. **No ML-based fraud scoring** — Rule-based only, Stripe Radar not aggressively used

### Push/Analytics (15)
23. **No `setNotificationHandler`** — Foreground notifications have no configured presentation
24. **No push receipt checking** — Delivery failures to APNs/FCM are invisible
25. **No token cleanup** — `DeviceNotRegistered` errors don't deactivate stale tokens
26. **No push batching** — One HTTP request per device instead of `expo-server-sdk-node`
27. **No images in push notifications** — `imageUrl` stored but never sent in push payload
28. **No action buttons** — Notifications only support tap-to-open
29. **Missing notification types** — No `new_follower`, `price_drop`, `new_listing_from_followed_seller`
30. **PostHog `identifyUser()` never called** — All PostHog events are anonymous
31. **PostHog `track()` barely used** — Only 2 of 41 defined events sent to PostHog
32. **Dual disconnected analytics pipelines** — PostHog and telemetry.ts not bridged
33. **Feature flag hooks never used** — 8 flags defined, zero consumed
34. **No A/B testing infrastructure** — No experiments, variants, or conversion tracking
35. **No notification open/CTR tracking** — `push_notification_tapped` defined but never fired
36. **No funnel tracking** — `trackFunnelStep` exists but never called
37. **Preference category mapping incomplete** — Auction events bypass user preferences

### Onboarding & Auth (4)
38. **No guest/browse mode before signup** — User must create account before seeing any value
39. **No personalization during onboarding** — StyleQuiz exists but is post-auth, opt-in, buried
40. **No passkey support** — The strongest 2026 passwordless method is missing
41. **No biometric login for returning users** — Biometric is only for sensitive action gating

### Creator/Camera (3)
42. **No real-time AR/face-tracking effects** — Camera effects are post-capture filters only
43. **AI photo enhancement is demo-mode only** — No actual AI enhancement pipeline
44. **Drafts are local-only with no cross-device sync** — Drafts lost on device change

### Search/Discovery (10)
45. **No ML-powered recommendation ranking** — `trained_model: false`, heuristic baseline only
46. **No visual search ML** — `visualMatching: false`, filter-based results
47. **No LLM conversational search** — Demo mode, keyword matching only
48. **No "similar items" / item-to-item recommendation** — No co-interaction or embedding similarity
49. **No synonym expansion in search** — Zero-result rates likely 12-20%
50. **Meilisearch hybrid search likely not deployed** — In-memory TF-IDF fallback is default
51. **Your Algorithm is demo/mock** — Topic preferences not wired to recommendation engine
52. **Onboarding preferences not connected to recommendations** — PersonalisationScreen collects but doesn't send to `/recommendations`
53. **No item cold-start handling** — New listings get freshness boost but no exploration
54. **Backend search filters incomplete** — No brand/color/location filters at API level

### App Store Readiness (15)
55. **No Xcode 26 SDK pin** — Apple requires iOS 26 SDK builds from April 2026
56. **SPKI hash placeholders in SSL pinning** — Will fail or be inert in production
57. **No store screenshots** — Apple requires screenshots for all required device sizes
58. **No app preview video** — Apple allows up to 3 app previews
59. **Missing data types in PrivacyInfo.xcprivacy** — Financial, Geolocation, UserID missing
60. **No Android Data Safety form** — Google requires all apps to complete it
61. **Submit credentials are placeholders** — `ascAppId=1234567890`, `appleTeamId=ABCDE12345`
62. **No `appleTeamId` in submit profile** — EAS Submit needs team ID
63. **No lint step in CI** — `lint` script exists but not in workflow
64. **No bundle size check in CI** — `check-bundle-size.mjs` exists but not wired
65. **OTA code signing key not set** — Updates are unsigned
66. **Sentry DSN empty by default** — All production crashes invisible if not set
67. **No crash-free rate target** — No documented target (flagship: ≥99.5%)
68. **No data retention enforcement** — Policy documented but no automated purge job
69. **No Xcode 26 image pin (duplicate)** — Same as #55

### Chat/Messaging & Realtime Bidding (2)
70. **No anti-sniping (auction extension)** — No bid-time extension when bids arrive near auction end
71. **No message read receipt delivery via realtime** — `readReceiptsEnabled` toggle exists but read state not synced via WebSocket

### i18n/Localization (3)
72. **~7% i18n string coverage** — Only 86 `t()` calls across 163 screen files (~1037 hardcoded text matches)
73. **Only 4 locales (en, es, fr, de)** — Flagship apps support 20-40+ languages; no Asian/Middle Eastern coverage
74. **No RTL language support in practice** — RTL_LOCALES defined but no actual RTL locale translations exist

---

## P2 IMPORTANT GAPS (70 items — visible quality gap vs flagship)

### Security (7)
- No key rotation strategy for encrypted storage
- No API rate limiting on sensitive endpoints (beyond fraud velocity)
- No CSP for any webview surfaces
- No nonce-based request signing for critical API calls
- Sentry/PostHog PII scrubbing incomplete for some data shapes
- No automated secret scanning in CI (gitleaks/trufflehog)
- No SBOM generation in CI

### Testing (6)
- Maestro flows use `optional: true` assertions (non-blocking)
- No `type: maestro` EAS Workflow job wired
- No committed visual baselines
- Tests don't mock native modules consistently
- No performance regression testing
- No memory leak detection in CI

### Accessibility (5)
- No drag alternative for drag-only interactions
- Accessibility automation not wired into CI
- No screen reader announcement testing
- No reduced-motion testing
- No color-blindness simulation testing

### Media (4)
- No EXIF GPS location stripping verification
- No progressive image loading (blurhash/LQIP)
- No video thumbnail generation
- No image CDN with on-the-fly resizing

### Payment (7)
- No seller-initiated refunds (admin-only)
- No bank-level reconciliation (three-way)
- Commerce checkout is GBP-only (no presentment currency)
- No instant payout option
- IP blacklist is empty (no threat-intel feed)
- No behavioral biometrics for fraud
- No multi-item cart checkout

### Push/Analytics (8)
- No `expo-server-sdk-node` (raw fetch misses throttling)
- No priority queue for transactional notifications
- No notification aggregation/coalescing
- No notification A/B testing
- No onboarding flow A/B testing
- Session replay has no sampling rate (100%)
- `sendFeatureFlagEvent` not configured
- No retention cohort analysis

### Onboarding (5)
- Onboarding slides are feature-tour, not job-first
- StyleQuiz doesn't visibly change the immediate experience
- New user's first HomeScreen may be empty with no guided first win
- 2FA enrollment not offered during signup
- Boolean age verification may not satisfy emerging 2026 regulations

### Creator/Camera (4)
- No GIF stickers
- No virtual try-on
- No cross-device draft sync
- No AI-powered auto-tagging from image recognition

### Search/Discovery (19)
- No trending searches surface (backend exists, unwired)
- No color/location/date-posted/seller-rating filters
- No "Did you mean?" spell correction
- No zero-result page with guidance
- No multi-source candidate generation
- No feed diversity/re-ranking layer
- No editorial + algorithmic blending
- No real-time signal processing pipeline
- No implicit signal tracking (dwell, scroll, zoom)
- No negative signals (skip, dismiss)
- No inline "more/less like this" feed controls
- No server-driven editorial schema
- Pulse feed is client-side derived
- Search uses offset pagination (should be cursor)
- `/feed/home` and recommendations have no pagination
- No behavioral reranking
- No exploration policy active
- Candidate pool limited to 500 recent listings
- No user sequence modeling (capped at 200)

### App Store/Ops (23)
- No build number strategy
- Missing location permission string
- Privacy URL inconsistency (two domains)
- No age rating configuration
- No localized metadata
- No promotional text field
- Third-party SDK privacy manifests not verified
- CrashData/PerformanceData linking status may be inaccurate
- No credentials configuration
- No TestFlight/closed-track submit profile
- No visual release gates in CI
- No security scan in CI
- No Maestro E2E in CI
- No production-residue check in CI
- No auto-rollback on crash spike
- No EAS Observe gate between rollout stages
- No PagerDuty/on-call integration
- No mobile crash-rate alerting
- No error budget tracking
- No log aggregation
- No automated restore testing
- No secrets manager integration
- No consent management platform

### Chat/Messaging (5)
- No message search within conversations
- No message editing
- No message deletion with "message deleted" tombstone
- No voice messages
- No file attachments beyond images/video

### i18n (5)
- No backend error message localization
- No email template localization
- No push notification text localization
- No pluralization in most translation calls
- No locale-aware number/currency formatting via i18n

---

## P3 ENHANCEMENT GAPS (65 items — polish for excellence)

*(Summary counts by domain — full details in individual Wave 2 reports)*

- Security: 5 items (CT monitoring, key rotation automation, etc.)
- Testing: 4 items (pairwise flag testing, error fingerprinting, etc.)
- Accessibility: 4 items (color-blindness testing, reduced-motion testing, etc.)
- Media: 3 items (progressive loading, video thumbnails, etc.)
- Payment: 11 items (Stripe API version, FX, multi-currency payout, etc.)
- Push/Analytics: 5 items (send-time optimization, per-category frequency, etc.)
- Onboarding: 4 items (consolidate slides, camera priming, preview data, etc.)
- Creator/Camera: 3 items (AR face filters, virtual try-on, auto-tagging)
- Search/Discovery: 10 items (autocomplete previews, query intent, etc.)
- App Store/Ops: 27 items (CPPs, keyword optimization, status page, etc.)
- Chat/Messaging: 4 items (voice messages, file attachments, message editing, etc.)
- i18n: 3 items (locale-aware date formatting, RTL layout testing, app store localization)

---

## KEY ARCHITECTURAL OBSERVATIONS

### 1. The "Built But Never Wired" Pattern
The most impactful finding across the entire audit: **multiple production-grade modules are fully implemented but never integrated into the app's runtime flows.** This is the single highest-leverage improvement area:

| Module | Lines | Status | Integration Gap |
|--------|-------|--------|-----------------|
| PostHog analytics | 287 | Full provider with EU hosting, session replay, flag bootstrapping | `identifyUser()` and `track()` never imported |
| Feature flag hooks | 187 | 3 typed hooks (boolean, variant, payload) | Never imported by any component |
| 41-event taxonomy | 215 | Compile-time typed `EventName` union | Only `screen_view` and `share_attempt` used |
| `trackFunnelStep` | — | Defined in telemetry.ts | Never called |
| `useFeatureFlagPayload` | — | Remote config hook | Never called |
| Push soft-ask contexts | — | `checkout`, `price_alert`, `follow` contexts defined | Never triggered |
| `resizeForUpload()` | — | Image resize utility | Never called — full-res images uploaded |
| `getHotQueries` | — | Backend trending search infrastructure | Not wired to any frontend surface |
| `getBroadenedSuggestions` | — | Zero-result guidance function | Exists but not rendered on zero results |
| Your Algorithm screen | 200+ | Full UI with topic weights | Demo mode — not wired to recommendation engine |
| PersonalisationScreen | 310 | Functional preference collection | Not sent to `/recommendations` endpoint |
| Conversational search | 565+ | Full chat UI with trust signals | Demo mode — keyword matching, no LLM |

**Recommendation:** The highest-ROI work is **connecting existing modules**, not building new ones. Start with PostHog identifyUser, feature flag consumption, and resizeForUpload.

### 2. The "Truthful UI" Differentiator
ThryftVerse honestly labels demo/mock features (`visualMatching: false`, "Demo Mode" banners, text-only editorial breaks). This is a **genuine differentiator** — many apps overclaim AI capabilities. This principle should be preserved even as ML features are added.

### 3. The "Heuristic Baseline" Ceiling
The recommendation and search systems are at `heuristic_baseline` capability. The infrastructure (decision service, circuit breaker, policy versioning, attribution) is production-grade, but the model is a weighted formula, not a trained model. The gap to flagship is primarily in ML, not architecture.

### 4. The "Placeholder Credentials" Blocker
Multiple production-critical values are placeholders: Sentry DSN, SPKI hashes, Apple Team ID, ASC App ID, OTA code signing key. These must be replaced before any production submission.

---

## RECOMMENDED IMPLEMENTATION ORDER

### Phase 1: Unblock Production (P1 blockers, ~2-3 weeks)
1. Replace all placeholder credentials (Sentry DSN, SPKI hashes, Apple Team ID, ASC App ID)
2. Add `setNotificationHandler` at app root
3. Wire `identifyUser()` into `useStore.login()` alongside `setSentryUser`
4. Call `resizeForUpload()` in the upload pipeline
5. Add lint + bundle size check to CI
6. Generate store screenshots
7. Complete PrivacyInfo.xcprivacy with all data types
8. Set OTA code signing key
9. Pin Xcode 26 SDK in EAS build profile
10. Add crash-free rate target + alerting

### Phase 2: Wire Existing Modules (highest ROI, ~1-2 weeks)
1. Bridge telemetry.ts → PostHog (single analytics pipeline)
2. Wire feature flags into components (at minimum `new_home_feed`, `conversational_search`)
3. Fire `push_notification_tapped` on notification open
4. Call `trackFunnelStep` at key funnel points (signup, first listing view, checkout, purchase)
5. Wire PersonalisationScreen → `/recommendations` endpoint
6. Wire `getHotQueries` → GlobalSearchScreen trending surface
7. Render `getBroadenedSuggestions` on zero-result pages
8. Add push receipt checking + token cleanup
9. Add push batching via `expo-server-sdk-node`
10. Add images to push notification payloads

### Phase 3: Close Critical UX Gaps (~3-4 weeks)
1. Add guest browse mode (listings visible before auth)
2. Move StyleQuiz into onboarding flow
3. Add passkey support (`react-native-passkey`)
4. Add biometric login for returning users
5. Add express checkout (Apple Pay/Google Pay) on item detail
6. Integrate Stripe Tax for checkout
7. Add anti-sniping (auction timer extension)
8. Deploy Meilisearch with hybrid search + synonym dictionary
9. Add "similar items" recommendation on item detail
10. Add screen capture protection on sensitive screens

### Phase 4: ML & Advanced Features (~4-6 weeks)
1. Integrate ML fraud scoring (or aggressively use Stripe Radar scores)
2. Add image embeddings for visual search
3. Wire LLM for conversational search (replace demo mode)
4. Wire Your Algorithm topics to recommendation features
5. Add multi-source candidate generation for recommendations
6. Add real-time signal processing pipeline
7. Add rich notifications (action buttons, iOS service extension)
8. Add A/B testing infrastructure via PostHog experiments

### Phase 5: i18n & Localization (~2-3 weeks)
1. Extract all hardcoded strings to translation keys
2. Add Asian locale support (ja, ko, zh)
3. Localize backend error messages
4. Localize email templates and push notification text
5. Add RTL locale (ar) with full layout testing
6. Localize app store metadata

---

## FLAGSHIP BENCHMARK COMPARISON

| Metric | ThryftVerse Current | Flagship Standard | Gap |
|--------|-------------------|-------------------|-----|
| Crash-free sessions | No target | ≥99.5% | P1 |
| i18n string coverage | ~7% | 100% | P1 |
| Supported locales | 4 (en, es, fr, de) | 20-40+ | P1 |
| Auth methods | 5 (Apple, Google, email, magic link, OTP) | 2-3 + passkeys | Missing passkeys |
| Biometric login | ❌ (action gating only) | 2026 default | P1 |
| Push notification types | 17 defined, 3 missing | 15-25 | Missing follower, price_drop, new_listing |
| PostHog events tracked | 2 of 41 | All defined events | P1 |
| Feature flags consumed | 0 of 8 | All active flags | P1 |
| A/B tests | 0 | Continuous | P1 |
| Recommendation model | Heuristic baseline | Trained ML model | P1 |
| Visual search | Filter-based | CLIP/vision embeddings | P1 |
| Tax calculation at checkout | ❌ | Stripe Tax / TaxJar | P1 |
| Guest checkout | ❌ | Standard | P1 |
| Express checkout | ❌ (in PaymentSheet only) | On item detail | P1 |
| Anti-sniping | ❌ | Standard for auctions | P1 |
| SSL pinning | Scaffolded, inactive | Enforced | P1 |
| Local DB encryption | ❌ | SQLCipher / encrypted store | P1 |
| Screen capture protection | ❌ | On sensitive screens | P1 |
| E2E tests in CI | ❌ | Maestro/Detox | P1 |
| Visual regression | Plan exists, no baselines | Pixel-diff in CI | P1 |
| Coverage measurement | ❌ | ≥70% threshold | P1 |
| Store screenshots | ❌ | All device sizes | P1 |
| Privacy manifest completeness | 7 of ~12 types | All data types | P1 |
| Crash-free rate alerting | ❌ | <99.5% → page | P1 |
| On-call/PagerDuty | Referenced, not configured | Escalation policies | P2 |
| Error budgets | ❌ | SLO-based | P2 |
| Log aggregation | Docker json-files (30MB) | Centralized (ELK/Loki) | P2 |
| Secrets manager | All "UNTRACKED" | AWS SM / Vault / Doppler | P2 |
| Session management | ✅ SecureStore + silent refresh | Same | ✅ Exceeds |
| Escrow | ✅ Ledger-based with buyer protection | Same | ✅ Exceeds |
| Reconciliation | ✅ Per-intent + daily | Same | ✅ Exceeds |
| Idempotency | ✅ Double-layered (app + Stripe) | Same | ✅ Exceeds |
| Push permission sequencing | ✅ Contextual soft-ask | Same | ✅ Exceeds |
| Permission sequencing | ✅ Just-in-time, contextual | Same | ✅ Exceeds |
| 2FA | ✅ TOTP + recovery codes | Same | ✅ Meets |
| PCI compliance | ✅ SAQ-A (PaymentSheet only) | Same | ✅ Meets |
| EU AI Act Article 50 | ✅ Disclosure component ready | Aug 2, 2026 | ✅ Meets |
| GDPR/CCPA | ✅ Export, deletion, opt-out | Same | ✅ Meets |

---

## CONCLUSION

ThryftVerse has a **genuinely impressive engineering foundation** — the double-entry ledger, escrow system, realtime WebSocket with gap replay, decision service architecture, and compliance tooling are all production-grade. The codebase demonstrates awareness of 2026 best practices throughout.

The gap to flagship is primarily in three areas:
1. **Integration** — Well-built modules that are never wired in (PostHog, feature flags, analytics events, resizeForUpload, trending searches, Your Algorithm)
2. **ML/AI** — Heuristic baseline recommendations, filter-based visual search, demo-mode conversational search (the infrastructure is ready, the models are not)
3. **Store readiness** — Placeholder credentials, missing screenshots, incomplete privacy manifest, empty Sentry DSN

The highest-ROI work is **Phase 2: Wire Existing Modules** — connecting the infrastructure that's already built. This requires relatively little new code but unlocks significant functionality.
