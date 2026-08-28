# Thryftverse — Full Production & Deployment Readiness Audit

**Branch:** `feat/product-detail-contract-media-device-closure`  
**Audited tip:** `0a116f0808d839a7a6b86e6b8c45ea26a377a09e`  
**Audit date:** 26 August 2026  
**Decision:** **PUBLIC PRODUCTION — NO-GO**  
**Current public-production readiness:** **~60%**  
**Architecture/foundation maturity:** **~8/10**

## Executive decision

The latest branch is materially stronger than the earlier August snapshots. Thryftverse is no longer a basic Expo/React Native prototype: it now has React Native 0.86 + Expo 57, Skia/VisionCamera, op-sqlite with migrations and offline sync/outbox work, Fastify/Postgres/Redis/BullMQ, a real server media pipeline, native Swift/Kotlin platform code, recommendation/fraud infrastructure, observability, retention and broad CI/release tooling.

The remaining problem is **release closure**. Several systems are now present in source but fail their clean-build, cryptographic-verification, production-container, visual-regression, dependency-health, or signed-device proof gates.

Do **not** start another broad feature or UI-elevation wave before closing these vertical production gates.

## Scorecard

| Department | Score | Status |
|---|---:|---|
| Product/UI architecture | 8.0/10 | Broad and mature |
| Mobile stack | 8.2/10 | Modern 2026 RN/Expo/Skia stack |
| Frontend type safety | 9.0/10 | Current typecheck passes |
| Frontend tests | 7.0/10 | ~2350 pass, 15 fail |
| Visual regression | 4.5/10 | 23 P0 findings; screenshot baselines empty |
| Expo/CNG build health | 6.5/10 | Clean prebuild passes; Expo Doctor red |
| Signed native artifact proof | 5.0/10 | Workflow exists; production artifact not proven |
| Creator/camera foundation | 8.2/10 | Strong |
| Client native media export | 4.5/10 | Contract/wrapper exists; native exporter source not found |
| Server media platform | 7.0/10 design | Real code, broken deploy image |
| Offline/local data | 8.0/10 | Real op-sqlite + outbox/sync |
| Backend domain/API | 7.8/10 | Broad production-oriented surface |
| Backend clean build | 4.0/10 | Missing `sharp` dependency breaks typecheck |
| Security architecture | 7.0/10 | Good design |
| Security release closure | 4.0/10 | Attestation verifier stub + dev TLS pins |
| Production Compose/infra | 4.5/10 | Critical runtime/config defects |
| Observability/ops | 8.0/10 | Strong foundations |
| Payments/commerce | 7.0/10 | Needs provider-stage proof |
| **Overall public-production readiness** | **~60%** | **NO-GO** |

## What is genuinely strong now

### 1. Mobile stack

The current dependency contract is credible for a high-end cross-platform app:

- Expo SDK 57
- React Native 0.86.2
- React 19.2.3
- Reanimated 4.5.x
- Worklets 0.10.x
- VisionCamera 5.2.3
- VisionCamera Skia + Worklets
- React Native Skia 2.6.2
- FlashList 2
- op-sqlite
- MMKV
- TanStack Query
- Zustand
- Sentry/PostHog
- LiveKit
- Stripe

There is no architectural reason to rewrite the whole app into Swift/Kotlin.

### 2. Local database/offline

`frontend/src/storage/db.ts` is real implementation:

- JSI-direct op-sqlite;
- WAL;
- migrations;
- process-wide singleton;
- structured local store separated from MMKV;
- sync/outbox modules.

This closes one of the earlier major flagship gaps.

### 3. Native platform code

`frontend/modules/thryft-native` contains actual Swift and Kotlin. The iOS module includes:

- DeviceCheck/App Attest API calls;
- MetricKit;
- `os_signpost`;
- surface/camera performance markers.

This proves the product is no longer limited to Expo Go-style capabilities.

### 4. Server media platform

`backend/api/src/lib/media/pipeline.ts` is substantial implementation:

- S3 source retrieval;
- signature/content detection;
- ffprobe;
- sharp image derivatives;
- FFmpeg;
- HLS renditions;
- thumbnails/posters;
- manifests;
- checksums;
- derivative upload.

This is a major improvement over the earlier architecture.

### 5. Production readiness validator

The backend has a strong fail-closed validator for production:

- secrets;
- DB/Redis/key service;
- S3/CDN;
- FX;
- KYC;
- moderation;
- payment provider;
- shipping provider;
- media gates;
- alerts;
- HTTPS URLs;
- anti-mock checks.

The problem is that the documented root production Compose currently allows the API to remain in development mode, bypassing this check.

---

# P0 release blockers

## P0-1 — Backend clean build is red

Production code imports `sharp` in multiple paths, but `backend/api/package.json` does not declare it. Latest CI fails TypeScript with three missing-`sharp` errors.

**Required:** add a compatible direct dependency and make clean `npm ci` + typecheck + Docker build green.

## P0-2 — Media worker image lacks FFmpeg/ffprobe

The media pipeline shells out to FFmpeg/ffprobe, but `backend/api/Dockerfile` only uses `node:20-alpine` + `npm ci`; it does not install those binaries.

The worker uses that Dockerfile.

**Required:** dedicated/pinned media worker image with FFmpeg/ffprobe + sharp, then container-level media E2E tests.

## P0-3 — Root production API stays in `NODE_ENV=development`

The documented production command merges root `docker-compose.yml` with `docker-compose.prod.yml`.

The base API hard-codes:

`NODE_ENV: development`

and the production override does not replace it.

The backend production validator only enforces when `NODE_ENV === production`.

**Required:** explicitly set `NODE_ENV: production` in the production API and verify the rendered Compose configuration in CI.

## P0-4 — API/worker production networking prevents external egress

The production API/worker are attached only to networks marked `internal: true`.

They need outbound internet access for payment providers, email, KYC, shipping, moderation, OpenAI if enabled, Expo push, etc.

**Required:** attach API/worker to a controlled non-internal egress network while keeping DB/Redis/storage internal.

## P0-5 — App Attest server verification is a deliberate stub

The backend route explicitly says cryptographic verification is TODO. Current Apple verification returns `trusted: true` and a placeholder key without validating Apple’s chain/authenticator/nonce/App-ID/key. Android Play Integrity verification is also stubbed.

**Required:** implement real Apple and Google server-side verification before treating integrity as a security boundary.

## P0-6 — iOS App Attest client hash contract is wrong

The Swift module passes UTF-8 bytes of strings directly as `clientDataHash`. Apple expects a SHA-256 hash of the one-time challenge/client data.

**Required:** use CryptoKit SHA256 and define the exact server/client canonical request-hash contract.

## P0-7 — SSL pins are explicitly local-development pins

`withTrustKit.js` labels the embedded API/CDN hashes as local-dev only and says they must be replaced before production.

**Required:** real active + backup production SPKI pins, rotation runbook, signed-device verification and CI protection against dev pins.

## P0-8 — Frontend suite has 15 failing tests

Latest observed suite:

- 8 test files failing;
- 15 tests failing;
- ~2350 tests passing.

Known failures include `VideoManager` pool utilization and `PlaybackClock` timing/rate behavior.

**Required:** zero failures on release candidate.

## P0-9 — Strict visual gate has 23 P0 findings

The release gate currently reports 23 P0 visual findings. The committed screenshot baseline directory exists but contains no real images.

**Required:** real approved iOS/Android golden screenshots, 0 P0 release findings and diff artifacts.

## P0-10 — Expo Doctor is red

Latest Doctor:

- 18/20 checks pass;
- invalid Android Expo config properties;
- 13 Expo SDK patch-level mismatches.

Clean prebuild passing is a positive, but production release should have Doctor green or formally reviewed waivers.

## P0-11 — Frontend dependency graph reports 5 high vulnerabilities

Current install summary reports 3 low, 14 moderate and 5 high issues. These may include dev/transitive dependencies, but each high must have a production-reachability disposition or fix.

## P0-12 — Key-service dependency audit is red

The key-service CI reports a high-severity Hono advisory in its dependency graph.

A cryptographic boundary should not release with an unresolved high advisory without strong evidence/waiver.

## P0-13 — `thryft-media-export` native implementation is not found

The package and JS wrapper describe AVFoundation/Media3 native backends, but the module directory currently contains the Nitro TS specification/wrapper only. No corresponding Swift/Kotlin exporter implementation was found.

**Required:** implement and physical-device-test the actual native export pipeline and preview/export parity.

## P0-14 — Signed production artifacts are not proven

EAS workflow and prebuild verification exist, but this audit did not find proof of:

- signed production iOS archive installed through TestFlight;
- signed Android AAB installed from Play internal track;
- physical-device native media/database/integrity smoke matrix.

## P0-15 — Production deployment definitions have drift

There are two production Compose approaches. They are not equivalent. The standalone backend production file contains service naming drift around Redis.

**Required:** one canonical production stack, validated with `docker compose config` and a real staging boot.

---

# P1 production-quality gates

Before calling the app “flagship production,” also prove:

1. Pristine DB -> current migration.
2. Previous release -> current migration.
3. Encrypted backup restore.
4. Payment authorize/capture/refund/dispute/webhook idempotency.
5. Payout.
6. Shipping label + carrier webhook.
7. KYC success/failure/manual-review paths.
8. Non-mock moderation.
9. Auction end/concurrency races.
10. Co-own order/ledger concurrency.
11. Redis restart/recovery.
12. DB pool exhaustion/failure behavior.
13. S3/provider timeout behavior.
14. Large-media upload/worker saturation.
15. Low-end Android memory/jank.
16. iPhone camera/export/HDR behavior.
17. OTA staged rollout and rollback.
18. Alert routing and incident runbook.
19. Android 16 KB native-page-size compatibility.
20. Store submission metadata/privacy/data-safety validation.

---

# Store compliance — August 2026

## Android

The project targets API 36, which is correct for Google Play’s requirement starting 31 August 2026 for new apps and updates.

Still prove the signed AAB and native-library behavior.

## iOS

Since 28 April 2026 Apple requires App Store Connect submissions built with Xcode 26+ and an iOS 26 SDK.

The EAS production build must prove the actual Xcode/SDK used.

---

# README truth review

## Well supported now

- React Native/Expo architecture.
- op-sqlite/offline storage.
- Fastify/Postgres/Redis/BullMQ.
- creator Skia/VisionCamera stack.
- real media-processing code.
- native performance module.
- retention/outbox/sync work.
- broad CI/release tooling.

## Claims that should be softened until P0 closure

### “SSL public-key pinning”
Use: **“SSL pinning infrastructure — production pins/runtime verification pending.”**

### “app integrity”
Use: **“App Attest / Play Integrity plumbing — server cryptographic enforcement pending.”**

### “full editing engine”
Use: **“advanced creator editing engine — native video export closure pending.”**

### “production hardening”
Use: **“production hardening under release validation.”**

The README should not convert file presence into production proof.

---

# Deployment decision by environment

| Environment | Decision |
|---|---|
| Local development | **YES** |
| Shared engineering dev | **YES**, after `sharp` closure |
| Staging | **CONDITIONAL** after Compose/media/security configuration fixes |
| TestFlight / Play internal | **CONDITIONAL** after mobile CI and signed-build proof |
| Closed beta with money-sensitive functionality | **NO for now** |
| Public marketplace launch | **NO** |
| Instagram/Pinterest/Snapchat/eBay operational parity | **Not yet** |

---

# Exact release order

## Gate A — clean code/build
- `sharp`
- backend typecheck green
- key-service audit green
- frontend tests green
- Expo Doctor green
- dependency high-risk disposition

## Gate B — production runtime
- canonical Compose
- NODE_ENV production
- controlled egress
- complete worker env
- FFmpeg/ffprobe/sharp worker
- deep health green

## Gate C — security
- real SSL pins
- TrustKit runtime proof
- SHA256 App Attest client
- real Apple server verification
- real Play Integrity verification
- request binding/replay protection

## Gate D — mobile visual/native
- real screenshot baselines
- 0 visual P0
- signed iOS/Android builds
- physical-device smoke/a11y/perf

## Gate E — media
- actual native iOS/Android exporter
- media-worker E2E
- HLS playback
- large/background upload
- corruption/failure tests
- preview/export parity

## Gate F — commerce/providers
- payment lifecycle
- payout
- shipping
- KYC
- moderation
- auctions/co-own race tests
- ledger reconciliation

## Gate G — operations
- backup restore
- load/chaos
- alerts
- OTA rollback
- incident runbook

---

# Final assessment

Thryftverse is now a **serious pre-production platform**, not an underdeveloped TypeScript app.

The architecture is around **8/10**. The public release state is only around **60%** because production readiness is not an average of features: one hard failure can invalidate a launch.

Individually, any of these is enough for a no-go:

- backend cannot clean-build;
- media worker cannot run FFmpeg;
- API can boot in development mode under the production command;
- production worker/API cannot reach external providers;
- App Attest verifier trusts unverified attestations;
- TLS pins are local-dev pins;
- release tests and visual gates are red.

Once all P0 items are fixed and the exact signed binaries pass staging/provider/device/restore/load rehearsals, the product can move rapidly into the **80–85% range for a controlled limited public launch**.

The next audit should require evidence in this order:

**source -> clean install -> type/build -> migration -> production container -> staging provider -> signed native artifact -> physical device -> load/failure -> rollback**

Do not mark a capability complete before that chain is satisfied.
