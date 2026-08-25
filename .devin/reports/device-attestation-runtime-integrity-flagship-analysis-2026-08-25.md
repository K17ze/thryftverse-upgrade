# ThryftVerse Device Attestation and Runtime Integrity — Flagship Implementation Dossier (Upgraded)

**Research cut-off:** 25 August 2026 (includes WWDC26 iOS 27 signals and Play Integrity 1.5.0/1.6.0 release notes)
**Repository snapshot:** `f82f74a54be79a1721017380ddd5472d856f1679` plus the inspected working tree on `feat/product-detail-contract-media-device-closure`
**Scope:** genuine-app proof, installation credentials, request binding, iOS App Attest (incl. iOS 27 launch-validation-category and bundle-version signals), Google Play Integrity Standard API (incl. 1.5.0+ remediation dialogs and app-access-risk signal), policy enforcement, transport defence-in-depth, release integrity, operations and native recovery UX
**Deliverable type:** codebase-grounded research and implementation dossier; no product code changed
**Decision owner:** Security engineering, with Mobile Platform, Identity, Fraud, Payments, SRE and Support as required approvers
**Inspector identity:** senior FAANG mobile/full-stack architect, 20 years, top-level mobile app architecture + front-end UI/UX engineering + back-end design. Anti-AI-design policy enforced throughout.

---

## 0. What changed in this upgrade

This is a deepened re-issue of the 25 August 2026 dossier. Every codebase claim was re-verified by direct file inspection (not by subagent inference). The following material is new or substantially expanded:

1. **iOS 27 / WWDC26 signals** — launch validation category (App Store vs TestFlight vs other), bundle version in attestation, macOS 27 support, and the `isSupported`-as-fraud-signal guidance. These are net-new platform capabilities that change the verifier contract and the policy engine.
2. **Play Integrity 1.5.0 (2025-08-28) and 1.6.0** — new `GET_INTEGRITY` / `GET_STRONG_INTEGRITY` remediation dialog codes, the new `showDialog` method on `IntegrityManager` / `StandardIntegrityManager` (deprecating the old `showDialog` on token response objects), app-access-risk signal in Standard requests with per-request opt-out, `CLIENT_TRANSIENT_ERROR` and `INTEGRITY_TOKEN_PROVIDER_INVALID` error codes, and the raised minimum Android API level 23 for Standard and Classic requests.
3. **Concrete Node.js/TypeScript verifier library** — `node-app-attest` (npm, MIT, v1.0.1, ~29K weekly downloads, depends on `cbor` ^10, `pkijs` ^3, `asn1js` ^3, last updated Feb 2026) is a real, maintained server-side Apple App Attest attestation+assertion verifier for the Fastify/Node stack ThryftVerse already runs. The previous dossier left the verifier as "implement CBOR parsing yourself"; this names a vetted path and its exact API surface.
4. **Atomic challenge consumption pattern** — the correct Postgres `DELETE ... RETURNING` (or Redis Lua `GETDEL`) pattern is specified concretely, replacing the previous "use a conditional update" generality. The Supabase community pattern confirms `DELETE ... RETURNING` as the canonical single-use consume.
5. **Deeper evidence ledger** — every defect line number re-confirmed against the inspected tree; additional defects found around the Android `readCloudProjectNumber` fallback, the overloaded `/attestation/verify` contract, and the absence of any migration file.
6. **Deeper threat model** — 2026 attack techniques including integrity-farm relay, cross-account key sharing, EAS preview build abuse, and provider outage self-denial-of-service.
7. **Deeper implementation specifications** — verifier pseudocode, canonical bytes, golden-vector strategy, and the receipt/fraud-metric async enrichment path.
8. **Deeper anti-AI UX** — the integrity surface must be invisible when healthy; no trust badge, no security score, no card stack, no accusatory copy. State coverage expanded to include iOS 27 and Play 1.5.0 remediation dialogs.
9. **Deeper rollout gates** — concrete SLO targets, shadow calibration thresholds, and a ramp schedule with stop conditions.

---

## 1. Executive decision

This department is **P0 and not implemented end to end**. The repository contains useful interfaces and commented scaffolding, but there is currently no reachable production attestation path. I personally re-verified every claim in §3 against the inspected tree on 25 August 2026.

1. the Fastify attestation route module (`backend/api/src/routes/attestation.ts`) is not imported or registered anywhere under `backend/api/src` — confirmed by repository-wide search returning only the definition site and this report;
2. no application caller invokes the integrity bridge or its HTTP endpoints — confirmed by search across `frontend/`;
3. the iOS bridge passes raw UTF-8 text to APIs that require a SHA-256 `clientDataHash` — confirmed at `ThryftNativeModule.swift:293` and `:313`;
4. the Android bridge has no Play Integrity Gradle dependency (confirmed: `build.gradle` contains only the expo-module plugin, no `implementation` line) and reflectively implements the Classic `nonce` path (`ThryftNativeModule.kt:324` calls `setNonce`) while its TypeScript contract and server comments describe Standard `requestHash` semantics;
5. both server verifiers are explicit trust stubs — `attestation.ts:89-92` returns `trusted: true` and `placeholder:apple:${keyId}`, `attestation.ts:114-115` returns an empty Android verdict;
6. no server code verifies an Apple assertion, its monotonic counter, or any request-bound installation proof — there is no assertion endpoint at all;
7. the only credential table (`device_attestation_keys`) is created lazily inside the dead route (`attestation.ts:53-63`) and cannot express user binding, environment, receipt, counter, revocation, policy or evidence — confirmed: no migration file exists for it;
8. the challenge ledger is non-atomic — `attestation.ts:165` does `GET` then `attestation.ts:184` does `DEL`, allowing parallel replay before deletion;
9. the `/attestation/verify` contract overloads Apple attestation and Android integrity-token enrollment into one endpoint and passes Android `keyId` as `_requestHash` (`attestation.ts:204`), which is semantically incorrect even before provider verification is added.

Accordingly, a signed EAS binary, a biometric prompt, an active session, TLS, and the current `trusted` return value are **not proof that a protected mutation came from a genuine ThryftVerse installation**. No withdrawal, payout-destination change, account recovery, high-risk checkout, ownership transfer, moderation action or operator action may rely on the current scaffold.

The flagship target is not "block rooted phones." It is a quiet, request-bound risk signal that:

- proves the app identity and installation credential where the platform supports it;
- binds proof to the exact protected mutation through a versioned canonical form;
- combines integrity with authentication, session and fraud context;
- starts in observation mode and applies proportionate, versioned decisions;
- never falsely accuses a legitimate user;
- fails closed for irreversible money/security mutations without taking low-risk browsing offline;
- can be disabled or narrowed remotely during provider or policy incidents;
- consumes the new iOS 27 launch-validation-category and bundle-version signals to detect TestFlight-in-production and version-inflation attacks;
- consumes the new Play Integrity 1.5.0+ app-access-risk signal and remediation dialogs to guide users to self-repair without support contact.

**Release ruling:** production readiness must fail until the stubs are unreachable in production, the genuine verifier path is registered, protected endpoint integration tests pass, and an EAS physical-device shadow cohort meets the gates in §19.

---

## 2. Evidence method and confidence language

This dossier separates three evidence classes:

| Marker | Meaning |
|---|---|
| **[V]** | Verified repository fact — observed directly in the named file at the stated lines on the inspected snapshot by the author, not by inference. |
| **[E]** | External requirement/guidance — supported by an official platform, regulator or standards source linked in §22. |
| **[I]** | Engineering inference/recommendation — proposed design based on the verified facts and external requirements; it is not a claim that the code already behaves this way. |

Line numbers describe the inspected snapshot and will drift after implementation. Absence findings are explicitly labelled because absence cannot be anchored to one line.

### 2.1 Inspection coverage

The trace followed both directions:

```text
protected action -> API client -> integrity coordinator -> native bridge
                 -> platform provider -> server decode/verify -> policy -> owner service -> DB/audit

DB credential/evaluation -> policy projection -> owner-service guard
                         -> API result -> native remediation -> user-visible recovery
```

Files inspected directly by the author on 25 August 2026:

- `backend/api/src/routes/attestation.ts` (full, 261 lines)
- `backend/api/src/index.ts` (route registration imports, lines 214-262; confirmed `registerAttestationRoutes` absent)
- `backend/api/src/db/migrations/` (full listing; no attestation/integrity migration exists; latest is `152_support_knowledge_seed.sql`)
- `frontend/src/platform/integrity/ThryftIntegrity.ts` (full contract)
- `frontend/src/platform/integrity/index.ts` (full coordinator)
- `frontend/modules/thryft-native/ios/ThryftNativeModule.swift` (lines 270-327, attest/assertion helpers)
- `frontend/modules/thryft-native/android/src/main/java/expo/modules/thryftnative/ThryftNativeModule.kt` (lines 270-359, integrity manager/token)
- `frontend/modules/thryft-native/android/build.gradle` (full, 15 lines — no Play Integrity dependency)
- `frontend/src/utils/sslPinning.ts` (lines 200-249, enforcement flag)
- `frontend/app.config.js` (TrustKit plugin config)
- `frontend/App.tsx` (pinning init)
- repository-wide searches for `registerAttestationRoutes`, `getIntegrityModule`, `requestIntegrityToken`, `/attestation/`, `/integrity/`, `device_attestation_keys`, `deviceTrusted`, `clientDataHash`, `requestHash`

---

## 3. Evidence ledger: current implementation (re-verified)

| ID | Evidence | Class | Consequence |
|---|---|---|---|
| ATT-001 | `backend/api/src/routes/attestation.ts:29-37` explicitly states cryptographic verification is stubbed with TODOs. | [V] | The file cannot be treated as a security control. |
| ATT-002 | `backend/api/src/routes/attestation.ts:89-92` returns `trusted: true` and `placeholder:apple:${_keyId}` without parsing the attestation. | [V] | If registered, arbitrary Apple-shaped input can become trusted. This is a release blocker, not technical debt. |
| ATT-003 | `backend/api/src/routes/attestation.ts:114-115` returns `{ deviceIntegrity: [] }` without contacting Google. | [V] | Android never passes the nominal `MEETS_DEVICE_INTEGRITY` check; the separate `/integrity/verify` response is not authoritative. |
| ATT-004 | `backend/api/src/routes/attestation.ts:53-63` creates `device_attestation_keys` lazily at request time via `CREATE TABLE IF NOT EXISTS`. | [V] | Schema ownership, review, rollback and deploy ordering are bypassed. No migration file exists. |
| ATT-005 | The table at `attestation.ts:55-62` has only `key_id`, `platform`, `public_key`, `trust_state`, `created_at`, `updated_at`. | [V] | It cannot prove user/device/environment binding, retain App Attest receipt/counter, or explain revocation. |
| ATT-006 | `attestation.ts:124-147` issues 32 random bytes, stores them in Redis for 5 minutes (`EX 300`) and returns an opaque `challengeId`. | [V] | Entropy and TTL are a sound starting point. The record is not bound to user, session, purpose or request. |
| ATT-007 | Challenge validation uses `GET` (`attestation.ts:165`) then a later best-effort `DEL` (`attestation.ts:184`). | [V] | Two concurrent verifications can read the same challenge before either deletion. Single-use is not atomic. |
| ATT-008 | `attestation.ts:152-158` accepts a client-supplied `platform`, `keyId`, `attestation`, `challenge` and `challengeId`; the challenge record contains only the challenge value. | [V] | Platform/purpose/session substitution is not prevented by the challenge ledger. |
| ATT-009 | `attestation.ts:193-208` overloads Apple attestation and Android integrity-token enrollment into one contract, and passes Android `keyId` as `_requestHash` (`attestation.ts:204`). | [V] | The Android flow is semantically incorrect even before provider verification is added. |
| ATT-010 | `attestation.ts:210-227` persists only trusted results and performs no ownership collision check. | [V] | A key cannot be safely associated with exactly one account/install; negative evidence disappears. |
| ATT-011 | Repository-wide search found no import or invocation of `registerAttestationRoutes` outside its declaration at `attestation.ts:118`. | [V: absence] | The HTTP routes are not registered in the inspected server. |
| ATT-012 | Repository-wide search found no application caller of `getIntegrityModule`, `attest`, `generateAssertion`, `requestIntegrityToken`, `/attestation/challenge`, `/attestation/verify` or `/integrity/verify` outside their definitions. | [V: absence] | The client scaffold is not in an active user or mutation path. |
| ATT-013 | `frontend/modules/thryft-native/ios/ThryftNativeModule.swift:293` sends `Data(challenge.utf8)` as `clientDataHash`. | [V] | Apple requires SHA-256 of the challenge. Raw text is not the required digest. |
| ATT-014 | `ThryftNativeModule.swift:313` sends raw `requestHash` UTF-8 bytes to `generateAssertion` as `clientDataHash`. | [V] | The client/server canonicalization boundary is undefined and the API parameter is misused. |
| ATT-015 | `ThryftNativeModule.swift:284` calls `service.generateKey` on every `attest` call and returns the new keyId, but no client caller persists that identifier. | [V] | Key churn would destroy continuity and weakens fraud analysis; Apple recommends persisting the key ID and limiting new keys. |
| ATT-016 | `frontend/modules/thryft-native/android/build.gradle:1-15` declares no dependency on `com.google.android.play:integrity`. | [V] | The reflected provider classes are absent unless injected elsewhere; `isSupported` will normally be false. |
| ATT-017 | `ThryftNativeModule.kt:274-285` reflectively loads `IntegrityManagerFactory` specifically to avoid a compile-time dependency. | [V] | There is no type-safe compile-time proof of the installed API surface. |
| ATT-018 | `ThryftNativeModule.kt:295-297` claims no prepare step is required and resolves immediately. | [V] | This conflicts with Google's Standard API, which requires a warmed `StandardIntegrityTokenProvider`. |
| ATT-019 | `ThryftNativeModule.kt:322-325` builds `IntegrityTokenRequest` via reflection and calls `setNonce`. | [V] | This is the Classic request shape, not the Standard `requestHash` path described by the TypeScript contract. |
| ATT-020 | `ThryftNativeModule.kt:327-330` permits Cloud project number `0` as "default" via `readCloudProjectNumber`. | [V] | Provider setup failure can be deferred to runtime and is not a release-time invariant. |
| ATT-021 | `frontend/src/platform/integrity/index.ts:68-101` provides a safe unsupported stub and `:109-122` exposes only native-module linkage. | [V] | Graceful capability detection exists, but linkage is not proof of provider readiness or server enforcement. |
| ATT-022 | `frontend/src/utils/sslPinning.ts:211` hardcodes `enforce: false`. | [V] | Runtime pinning is not active through this module. |
| ATT-023 | `sslPinning.ts:241-243` truthfully reports `isSslPinningEnabled()` as false when not active. | [V] | Honest diagnostics are good; a dynamic optional security dependency is not a production control. |
| ATT-024 | `frontend/app.config.js` enables the TrustKit plugin only when an environment flag is true and the build is non-development. | [V] | Build-time and runtime pinning strategies are fragmented and need one tested owner. |
| ATT-025 | `frontend/App.tsx` initializes SSL pinning during app startup. | [V] | Initialization is wired, but the configured enforcement state remains false in the inspected source. |
| ATT-026 | No migration file in `backend/api/src/db/migrations/` (latest `152_support_knowledge_seed.sql`) mentions attestation, integrity, `device_attestation_keys`, `app_installations`, `integrity_credentials`, `integrity_evaluations` or `integrity_challenges`. | [V: absence] | Schema ownership is entirely absent; the lazy `CREATE TABLE` in the dead route is the only DDL. |
| ATT-027 | No `deviceTrusted` or equivalent global trust bit is consumed by any downstream owner service (withdrawal, payout, recovery, checkout, moderation). | [V: absence] | Good: no false trust is currently consumed. Bad: no protected mutation is currently gated by integrity either. |
| ATT-028 | The `attestation` references in `backend/api/src/index.ts` (lines ~10906-11031, ~27019) are for the **1ze wallet reconciliation attestation** (financial snapshot signing), not device attestation. | [V] | Do not confuse the two features; the 1ze attestation is a separate financial-audit control. |

### 3.1 Important correction to the previous report

The previous brief described challenge plumbing and native contracts as a "foundation," but understated that the feature is **dead code at both integration edges**. The practical readiness is therefore lower than "partial verification": it is **0% protected mutations covered** until route registration and owner-service enforcement are added.

---

## 4. Current-state capability matrix

| Capability | Scaffold | Cryptographically correct | Reachable | Enforced | Observable | Release verdict |
|---|---:|---:|---:|---:|---:|---|
| Random server challenge | Yes | Partly | No active caller | No | Redis errors only | Rewrite around atomic, bound challenge ledger |
| Apple key generation | Yes | API invoked | No active caller | No | No | Fix hashing and key lifecycle |
| Apple attestation verification | Function exists | **No** | Route unregistered | No | No | P0 stop-ship |
| Apple per-request assertions | Bridge method exists | **No server verifier** | No caller | No | No | P0 stop-ship |
| Apple counter/receipt/fraud metric | No | No | No | No | No | Required for flagship closure |
| Apple iOS 27 launch-validation-category | No | N/A | No | No | No | New signal — required |
| Apple iOS 27 bundle-version | No | N/A | No | No | No | New signal — required |
| Play Standard API warm-up | Method exists | **No** | No caller | No | No | Replace reflection with typed Standard API |
| Play request-bound token | Classic nonce scaffold | Contract mismatch | No caller | No | No | Replace, do not patch around |
| Play server decode | Function exists | **No** | Route unregistered | No | Error log only | P0 stop-ship |
| Play app-access-risk signal (1.5.0+) | No | N/A | No | No | No | New signal — recommended |
| Play remediation dialogs (1.5.0+) | No | N/A | No | No | No | New — required for self-serve recovery |
| App/package/cert/version/licensing checks | No | No | No | No | No | Required |
| Tiered integrity policy | No | N/A | No | No | No | Required before enforcement |
| Device credential revocation | No | N/A | No | No | No | Required |
| Remote kill switch | No | N/A | No | No | No | Required before enforcement |
| Runtime SPKI pinning | Scaffold | Configuration only | Startup init | `false` | Dev logs | Optional defence-in-depth, not launch proof |
| EAS physical-device evidence | No retained evidence | N/A | Unknown | No | No | Required before "complete" |

---

## 5. External benchmark: platform requirements in August 2026

### 5.1 Apple App Attest — including WWDC26 / iOS 27 updates

**[E]** Apple requires the app to SHA-256 hash the server challenge and pass that digest as `clientDataHash`. It says to persist the key identifier — not the attestation object — after server verification, reuse keys through updates, restart enrollment after reinstall/device migration/restore, and gracefully bypass App Attest on unsupported devices. Apple warns not to reuse one key across multiple users because that weakens fraud detection.

**[E]** Apple's server guidance requires a unique challenge, complete CBOR attestation validation, public-key association checks, storage of the extracted key and receipt, and later assertion verification covering signature, RP ID, a strictly increasing counter and embedded challenge. Development and production credentials remain separate.

**[E — WWDC26, iOS 27]** New signals available in attestation/authenticator data on iOS 27 and macOS 27:

- **Launch validation category** — surfaces whether the app was launched via App Store, TestFlight, or another distribution path. A production attestation that reports a TestFlight launch category is a strong tampering/re-signing signal.
- **Bundle version** — the bundle version of the app that generated the proof. A version not in your release manifest is a version-inflation/re-signing signal.
- **macOS 27 support** — App Attest is now available on macOS 27 and higher, previously unsupported. Gate via `isSupported` per platform.
- **`isSupported` as a fraud signal** — a spike in `unsupported` responses from a user on a supported platform/device is itself a tampering indicator; incorporate it into risk assessment rather than silently bypassing.

**[E — WWDC26]** Apple reiterates: 1 key per user for account-based apps, or 1 key per app on the device for non-account apps; Keychain storage (non-synchronizing); keys survive updates but not reinstalls/restores; keys are per-device and do not sync.

**Implication [I]:** ThryftVerse must define canonical bytes once and test them across Swift, Kotlin/JavaScript and Node fixtures. A variable named `requestHash` is not proof; both sides must hash the exact same versioned serialization. The verifier must consume the new iOS 27 launch-validation-category and bundle-version fields and feed them to the policy engine as adverse signals when they mismatch the expected distribution channel and release manifest.

### 5.2 Google Play Integrity — including 1.5.0 (2025-08-28) and 1.6.0

**[E]** Google's Standard API uses a prepared `StandardIntegrityTokenProvider`; the app computes a digest of relevant request parameters, places it in `requestHash`, receives a token, and the server decodes/verifies it through Google. Standard requests include replay protection. Google says to verify request package name, request hash and freshness before interpreting verdicts.

**[E]** Google advises using integrity with other anti-abuse signals, observing the installed population before enforcement, avoiding cached verdicts, using tiered enforcement, calling close to the action, exposing supported remediation dialogs, and monitoring quota. The current setup documentation lists `com.google.android.play:integrity:1.6.0` and a default 10,000 token-request/decryption daily project quota unless increased.

**[E — Play Integrity 1.5.0, 2025-08-28]:**

- New remediation dialog codes `GET_INTEGRITY` and `GET_STRONG_INTEGRITY` that can be triggered in-app to help users fix `MEETS_DEVICE_INTEGRITY`, `MEETS_STRONG_INTEGRITY` and other verdict issues. The new dialogs can also resolve some exceptions encountered during Integrity API requests.
- New `showDialog` method on `IntegrityManager` and `StandardIntegrityManager` for triggering all types of remediation dialogs. The `showDialog` method on `IntegrityTokenResponse` and `StandardIntegrityToken` has been **deprecated** — migrate to the manager-level method.
- Minimum required Android API level raised to **23** (Android 6.0) for Standard and Classic requests.
- App-access-risk signal support in Standard API requests, with an option to opt out on a per-request basis. This surfaces capturing/controlling apps.
- Improved detection of `PLAY_STORE_VERSION_OUTDATED` errors.

**[E — earlier release notes still in effect]:**

- Error codes `CLIENT_TRANSIENT_ERROR` (transient device error; retry with exponential backoff) and `INTEGRITY_TOKEN_PROVIDER_INVALID` (prepared token provider became invalid; prepare a new one).
- Standard API: typical latency a few hundred milliseconds; warm-up a few seconds; frequent on-demand checks are supported.

**Implication [I]:** use Standard API for normal protected mutations. Consider Classic only for rare, high-value investigation where fresh assessment justifies seconds of latency and added battery/data cost. Migrate any `showDialog` usage to the manager-level API. Consume the app-access-risk signal as a policy input but allow per-request opt-out for low-risk actions to preserve battery and quota. Target Android API 23+ as the minimum supported platform for integrity-gated flows.

### 5.3 OWASP and transport

**[E]** OWASP MASVS separates authentication, network, code, platform, resilience and privacy controls. Attestation and certificate pinning do not replace authentication, authorization, secure transport, dependency integrity or fraud controls.

**Implication [I]:** never expose a global `deviceTrusted` boolean that lets downstream teams bypass their own controls. Preserve normalized evidence and create an action-specific decision.

---

## 6. Threat and failure model

### 6.1 Adversaries

| Actor | Goal | Likely technique | Integrity contribution | Integrity limitation |
|---|---|---|---|---|
| Repackager | Modify client or redirect API | Sideloaded/tampered app, replaced signing cert | App recognition/cert verdict + iOS 27 launch category can detect | Does not prove account owner |
| Runtime attacker | Modify request after UI confirmation | Hooking, instrumentation, proxy, rooted/jailbroken environment | Request binding and environment signals raise cost | App Attest cannot identify all compromised OS states |
| Integrity farm | Relay proof from genuine devices | Proxy/farm, many accounts per device | Per-install key, request hash, counters, Apple fraud metric, velocity graph | Needs server graph/risk, not verdict alone |
| Replay attacker | Reuse old token/assertion | Captured proof | Challenge, Standard replay protection, Apple counter | Fails if canonicalization omits mutable fields |
| Account thief | Withdraw from legitimate stolen session/device | Phishing, token theft, unlocked phone | Establishes installation, not intent | Needs passkey/reauth, session and fraud controls |
| Insider/config attacker | Whitelist abuse | Config/RBAC misuse | Audit/maker-checker can expose | Provider proof cannot constrain admins |
| Availability attacker / provider outage | Cause mass false negatives | Quota exhaustion, Redis/Google/Apple outage | Degraded policy protects low-risk use | Rigid fail-closed policy can self-deny service |
| Version-inflation attacker | Ship a modified bundle version | Re-sign with a higher bundle version | iOS 27 bundle-version signal detects | Requires release-manifest cross-reference |
| Channel-mismatch attacker | Run TestFlight build against production | Distribute TestFlight build to production users | iOS 27 launch-validation-category detects | Requires environment-policy enforcement |

### 6.2 Mandatory abuse cases

1. parallel replay before challenge deletion (ATT-007);
2. same Apple key enrolled to two accounts (ATT-010);
3. development attestation submitted to production (environment separation);
4. amount, destination, order ID or route changed after signing (canonical-form mutation);
5. proof reused on another method, account or operation (operation-id binding);
6. counter rollback, duplicate and out-of-order requests (Apple assertion counter);
7. reinstall, key loss, device migration and secure-storage restore (Keychain invalidation);
8. wrong Play package, certificate, version or request hash (verifier checks);
9. Play `UNEVALUATED`, unlicensed and virtual-device states (verifier normalization);
10. quota exhaustion and provider timeout around a money mutation (degraded policy);
11. false-positive spike after policy deploy (rollback budget);
12. expired exemption or remote-config compromise (maker-checker + expiry);
13. raw proof leakage to logs/analytics/support (privacy);
14. accessibility user unable to complete remediation (assistive path);
15. legitimate EAS preview build that is not Play-licensed (EAS policy);
16. **iOS 27 TestFlight build submitting production attestation** (launch-category mismatch);
17. **iOS 27 re-signed app with inflated bundle version** (bundle-version mismatch);
18. **Play app-access-risk: screen-capture or controlling app active during a payout** (1.5.0 signal);
19. **Play `INTEGRITY_TOKEN_PROVIDER_INVALID` during a session** (re-prepare required);
20. **Play `CLIENT_TRANSIENT_ERROR` during a money mutation** (retry-with-backoff vs fail-closed).

### 6.3 Failure semantics

```text
invalid      = cryptographic/request identity failed; hostile for protected action
risky        = valid proof with adverse signal; apply action policy
unavailable  = platform/provider/Redis/quota/unsupported; apply degraded policy
unknown      = request may have reached owner service but response was lost; reconcile outcome
```

Never map `unavailable` to `invalid`. Never map unknown mutation outcome to success. Owner mutations remain idempotent and queryable by operation ID.

---

## 7. Security invariants

1. **Server authority:** only the server verifier creates accepted evidence.
2. **Request binding:** proof covers the exact semantic mutation through a versioned canonical form.
3. **One-time challenge:** consumption is atomic and bound to user, session, install, provider and purpose.
4. **Key ownership:** one credential binds to one installation and, by default, one active user.
5. **Environment separation:** development, staging and production credentials/projects cannot cross.
6. **No global trust bit:** policy is action-specific, versioned and auditable.
7. **No client authorization:** client verdicts improve UX only; owner services enforce.
8. **Fail-closed claims:** no "trusted device" UI without a fresh evidence row.
9. **Minimal retention:** raw proof is not application logging material.
10. **Reversible enforcement:** feature flags, versioned policy and emergency narrowing exist first.
11. **Independent money safety:** proof never replaces reauth, idempotency, limits, ledger or reconciliation.
12. **Accessible recovery:** every remediable denial has an equivalent assistive-technology path.
13. **iOS 27 signal consumption:** launch-validation-category and bundle-version are verified against the release manifest and environment policy.
14. **Play 1.5.0+ signal consumption:** app-access-risk is a policy input; remediation dialogs are the first-line self-serve recovery path.

---

## 8. Target architecture and ownership

```text
Native action coordinator
  -> canonicalRequestV1(method, routeTemplate, actor, resource, operationId, body)
  -> Apple assertion / Play Standard token
  -> API edge validates auth + proof envelope
  -> provider verifier normalizes evidence
  -> policy evaluates action + session/account/fraud context
  -> owner service executes/refuses idempotent mutation
  -> evaluation/audit persists without raw token
  -> client receives mutation result + optional remediation
```

| Component | Owns | Must not own |
|---|---|---|
| `IntegrityEnrollmentService` | challenge and installation credential lifecycle | user authentication |
| `AppleAppAttestVerifier` | attestation/assertion crypto, receipt/counter, iOS 27 launch-category/bundle-version extraction | business allow/deny |
| `PlayIntegrityVerifier` | Google decode and normalization, app-access-risk signal | business allow/deny |
| `IntegrityPolicyService` | versioned action decision/reason codes | raw token storage |
| Protected owner service | mutation and integrity requirement | client verdict interpretation |
| Fraud engine | cross-account/device/velocity correlation | provider crypto validation |
| Mobile coordinator | canonical bytes, provider call, remediation UI | authorization |

**[I] Stack decision:** retain Fastify/Postgres/Redis initially, with isolated modules and pure verifier interfaces. A new network microservice adds latency and failure modes before scale requires it.

**[I] Verifier library decision (Apple):** use `node-app-attest` (npm, MIT, v1.0.1, ~29K weekly downloads, depends on `cbor` ^10, `pkijs` ^3, `asn1js` ^3, last updated Feb 2026) as the server-side Apple App Attest attestation+assertion verifier. Its API surface:

```ts
import { verifyAttestation, verifyAssertion } from 'node-app-attest';

const { keyId, publicKey } = verifyAttestation({
  attestation: Buffer,           // base64-decoded attestation object
  challenge: Buffer | string,    // the server challenge (SHA-256 will be computed internally)
  keyId: string,                 // the client-claimed key ID
  bundleIdentifier: string,      // e.g. com.thryftverse.app
  teamIdentifier: string,        // Apple Team ID
  allowDevelopmentEnvironment: boolean,  // true only on non-prod
});

const { signCount } = verifyAssertion({
  assertion: Buffer,
  payload: Buffer | string,      // the canonical request bytes
  publicKey: string,             // SPKI base64 from prior attestation
  bundleIdentifier: string,
  teamIdentifier: string,
  signCount: number,             // last persisted counter
});
```

This removes the need to hand-roll CBOR parsing, certificate-chain validation, and ECDSA verification. The library does **not** handle the Apple fraud-metric receipt refresh — that remains a separate async enrichment path (§11.4). Evaluate the library against the latest Apple TN3161 before pinning; add a dependency-governance review (minimum release age, SBOM, license scan).

**[I] Verifier library decision (Google):** use `google-auth-library` + the Play Integrity REST `decodeIntegrityToken` endpoint. There is no need for a third-party wrapper; the Google-managed decode is authoritative. Pin `google-auth-library` per dependency governance.

---

## 9. Canonical request-binding contract

```ts
type IntegrityEnvelopeV1 = {
  version: 1;
  provider: 'apple_app_attest' | 'google_play_integrity';
  installationId: string;
  credentialId?: string;          // Apple keyId; absent for Play per-request tokens
  challengeId: string;
  operationId: string;
  action: IntegrityAction;
  proof: string;                  // base64 — Apple assertion or Play token
  canonicalDigest: string;        // base64url(SHA256(canonicalBytes)) — for server re-computation
};
```

Canonical bytes (version 1):

```text
TV-INTEGRITY\0V1\n
METHOD\nROUTE_TEMPLATE\nACTOR_USER_ID\nSESSION_ID\nINSTALLATION_ID\nACTION\n
OPERATION_ID\nRESOURCE_ID_OR_EMPTY\n
SHA256(RFC8785_CANONICAL_JSON(SEMANTIC_BODY))\n
CHALLENGE_ID\nBASE64URL(CHALLENGE_BYTES)\nISSUED_AT_UNIX_MS
```

Rules:

- use server route template, not client query ordering;
- normalize money as integer minor units;
- exclude telemetry, proof and transport-only fields;
- reject unknown versions;
- test identical golden vectors in Swift, Kotlin/JavaScript and Node — byte-for-byte equality is the gate;
- bind actor and session to prevent cross-account relay;
- retain `operationId` for safe retry after ambiguous outcome.

`POST /v1/integrity/challenges` accepts action, operation/resource/installation IDs and provider. It returns 32 random bytes, expiry and canonicalization version. The server stores only a hash plus binding fields. **Consume atomically** using one of:

- **Postgres:** `DELETE FROM integrity_challenges WHERE id = $1 AND consumed_at IS NULL RETURNING challenge_hash` — a single statement that returns the row only if it was unconsumed;
- **Redis:** `GETDEL attestation:challenge:${challengeId}` (Redis 6.2+) or a Lua script that reads-and-deletes atomically.

Never `GET` followed by `DEL` (the current ATT-007 defect).

---

## 10. Target database migration

File: `backend/api/src/db/migrations/153_integrity_attestation.sql`

```sql
CREATE TABLE app_installations (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android')),
  environment TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN
    ('pending','active','limited','revoked','replaced')),
  app_identifier TEXT NOT NULL,
  app_version TEXT,
  build_number TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoke_reason_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE integrity_credentials (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES app_installations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('apple_app_attest','google_play_integrity')),
  provider_key_id_hash TEXT,
  public_key_spki BYTEA,
  app_identity_hash BYTEA NOT NULL,
  apple_receipt_ciphertext BYTEA,
  assertion_counter BIGINT,
  state TEXT NOT NULL CHECK (state IN ('pending','verified','revoked','superseded')),
  verified_at TIMESTAMPTZ,
  last_asserted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason_code TEXT,
  UNIQUE(provider, provider_key_id_hash)
);

CREATE TABLE integrity_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL REFERENCES user_sessions(id),
  installation_id TEXT NOT NULL REFERENCES app_installations(id),
  provider TEXT NOT NULL,
  action TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  resource_id TEXT,
  challenge_hash BYTEA NOT NULL,
  canonicalization_version SMALLINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, operation_id, action)
);

CREATE TABLE integrity_evaluations (
  id TEXT PRIMARY KEY,
  challenge_id TEXT REFERENCES integrity_challenges(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL REFERENCES user_sessions(id),
  installation_id TEXT REFERENCES app_installations(id),
  provider TEXT NOT NULL,
  action TEXT NOT NULL,
  request_digest BYTEA NOT NULL,
  evidence_state TEXT NOT NULL CHECK (evidence_state IN
    ('valid','invalid','risky','unavailable')),
  policy_decision TEXT NOT NULL CHECK (policy_decision IN
    ('observe','allow','limit','step_up','review','deny')),
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  normalized_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_version TEXT NOT NULL,
  provider_latency_ms INTEGER,
  request_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE integrity_policy_exemptions (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user','installation','app_version')),
  subject_id TEXT NOT NULL,
  action_scope TEXT[] NOT NULL,
  reason TEXT NOT NULL,
  approved_by TEXT NOT NULL REFERENCES users(id),
  second_approved_by TEXT REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integrity_eval_user_action_created
  ON integrity_evaluations(user_id, action, created_at DESC);
CREATE INDEX idx_integrity_challenges_consume
  ON integrity_challenges(id) WHERE consumed_at IS NULL;
```

Constraints and privacy:

- Apple alone has a persistent public key; Android per-request tokens do not justify a fake key.
- Raw token/attestation never enters normalized JSON or logs.
- Partition/TTL-delete evaluations under the approved security retention schedule.
- Envelope-encrypt Apple receipts with a dedicated key purpose.
- Retain negative normalized evaluations to measure attacks and false positives.
- Do not allow metadata to become a PII/raw-payload dumping ground.
- Drop the lazy `device_attestation_keys` table from the dead route; this migration owns the schema.

---

## 11. iOS implementation specification

### 11.1 Client lifecycle

```text
unsupported ------------------------------> limited_supported_use
unknown -> generating_key -> attesting -> server_verifying -> active
             | non-transient error -> discard_key -> retryable
             | serverUnavailable   -> retain_key -> retry_later
active -> key_not_found/reinstall -> replaced -> generating_key
active -> server_revoked          -> revoked -> remediation
```

Requirements:

1. decode challenge base64url to bytes and calculate `SHA256(challengeBytes)` — pass the 32-byte digest as `clientDataHash`, not raw text (fixes ATT-013);
2. generate one key for the install/user binding, not per call (fixes ATT-015);
3. persist only key ID and enrollment metadata in non-synchronizing Keychain (`kSecAttrSynchronizable: false`);
4. send key ID, unmodified attestation, challenge/install IDs and environment;
5. retry `serverUnavailable` on the same key with capped jitter; regenerate on other key errors per Apple guidance;
6. on logout/account switch, transition or supersede server binding — never silently share one key among users;
7. on iOS 27+, surface `isSupported` as a fraud signal to the server alongside the attestation.

### 11.2 Server attestation verifier (using `node-app-attest`)

```ts
import { verifyAttestation } from 'node-app-attest';

async function verifyAppleAttestation(input: {
  keyId: string;
  attestation: Buffer;       // base64-decoded
  challenge: Buffer;         // raw 32 bytes
  bundleIdentifier: string;
  teamIdentifier: string;
  environment: 'development' | 'staging' | 'production';
}): Promise<{
  trusted: boolean;
  publicKey: string;         // SPKI base64
  receipt: Buffer;           // Apple fraud-metric receipt (encrypted)
  environment: 'development' | 'production';
  launchValidationCategory?: string;   // iOS 27+
  bundleVersion?: string;              // iOS 27+
}> {
  const result = verifyAttestation({
    attestation: input.attestation,
    challenge: input.challenge,
    keyId: input.keyId,
    bundleIdentifier: input.bundleIdentifier,
    teamIdentifier: input.teamIdentifier,
    allowDevelopmentEnvironment: input.environment !== 'production',
  });
  // Additional checks the library does not perform:
  //   - extract and envelope-encrypt the receipt for async fraud-metric refresh
  //   - on iOS 27+, extract launchValidationCategory and bundleVersion from authData
  //   - reject credential/public key already bound to another installation (ATT-010)
  //   - consume challenge transactionally with credential persistence
  return { trusted: true, publicKey: result.publicKey, /* ... */ };
}
```

The library handles CBOR parsing, certificate-chain validation to the Apple App Attest root, nonce re-computation from authenticator data + SHA-256 client data, RP ID validation, and ECDSA public-key extraction. The wrapper adds ownership-collision, receipt encryption, iOS 27 signal extraction, and transactional challenge consumption.

### 11.3 Assertion verifier

```ts
import { verifyAssertion } from 'node-app-attest';

async function verifyAppleAssertion(input: {
  assertion: Buffer;
  canonicalBytes: Buffer;    // the exact bytes the client signed
  publicKey: string;         // SPKI base64 from prior attestation
  bundleIdentifier: string;
  teamIdentifier: string;
  lastCounter: number;
}): Promise<{ valid: boolean; newCounter: number }> {
  const result = verifyAssertion({
    assertion: input.assertion,
    payload: input.canonicalBytes,
    publicKey: input.publicKey,
    bundleIdentifier: input.bundleIdentifier,
    teamIdentifier: input.teamIdentifier,
    signCount: input.lastCounter,
  });
  return { valid: true, newCounter: result.signCount };
}
```

Lock the credential row (`SELECT ... FOR UPDATE`), decode strict CBOR, verify RP ID, canonical digest/signature, embedded challenge and strictly increasing counter, then consume challenge and create evaluation transactionally. Owner service may use that evaluation once for the same operation.

Counter concurrency needs an explicit design. Initially serialize protected assertions per installation using `FOR UPDATE` plus a narrow mobile coordinator. Never weaken monotonicity just to hide parallel requests.

### 11.4 Receipt and fraud-metric lifecycle

**[E — Apple TN3161 / WWDC26]** The attestation contains a receipt formatted like an App Store receipt. The server stores it and periodically requests a refreshed fraud-risk assessment from Apple. The fraud metric indicates the number of attestations for your app on a particular device — a high count is a farm/abuse signal.

Use Apple's fraud-risk assessment as **asynchronous enrichment**, not a dependency of every mutation. Track refresh, expiry and failure in jobs. A missing optional metric can be `valid` with incomplete enrichment; policy and corroborating fraud signals decide the action.

---

## 12. Android implementation specification

### 12.1 Stack correction

- Add the official typed Play Integrity dependency: `implementation 'com.google.android.play:integrity:1.6.0'` to `frontend/modules/thryft-native/android/build.gradle` (fixes ATT-016).
- Use Standard API factory/provider warm-up with a non-zero build-injected Cloud project number (fixes ATT-018, ATT-020). Call `IntegrityManagerFactory.create(context)` to obtain a `StandardIntegrityManager`, then `prepareIntegrityTokenProvider` with the Cloud project number at app launch or before the protected flow.
- Retain the provider in memory, re-prepare on `INTEGRITY_TOKEN_PROVIDER_INVALID` or documented expiry, respect preparation rate limits.
- Call Standard request with `setRequestHash(canonicalDigest)` close to the protected action (fixes ATT-019). Remove the `setNonce` Classic path.
- Use the new 1.5.0+ `showDialog` on `StandardIntegrityManager` (not the deprecated token-response method) for remediation.
- Remove client "decode cached verdict" authority; server interprets proof.
- Set minimum Android API to 23 for integrity-gated flows (1.5.0+ requirement).

The current no-op prepare and reflected Classic request should be **replaced**, not patched around.

### 12.2 Server verifier

Use `google-auth-library` with workload identity/managed credentials. `POST https://playintegrity.googleapis.com/v1/{packageName}:decodeIntegrityToken` with `{ integrityToken: token }`. Then validate:

- request package name matches `com.thryftverse.app`;
- `requestHash` matches the server-computed canonical digest;
- timestamp freshness (reject stale);
- `appRecognitionVerdict` — `RECOGNIZED` vs `UNRECOGNIZED` vs `UNEVALUATED`;
- certificate/version against the release manifest;
- `deviceRecognitionVerdict` — `MEETS_DEVICE_INTEGRITY`, `MEETS_STRONG_INTEGRITY`, virtual-device flags;
- licensing — `LICENSED` vs `UNLICENSED` vs `UNEVALUATED`;
- **app-access-risk signal (1.5.0+)** — capturing/controlling apps present; allow per-request opt-out for low-risk actions;
- record bounded normalized signals, latency and quota outcome.

Never cache a verdict for another mutation. Distinguish `UNEVALUATED` from adverse.

### 12.3 EAS distribution policy

| Channel | Setup | Enforcement |
|---|---|---|
| local development | test responses | observe only |
| EAS internal/preview | dedicated non-prod project/test accounts | request binding; no production licensing claim |
| closed Play testing | production-like registration | shadow/full test |
| production Play | linked production project/cert | action policy |

Never weaken production because preview builds legitimately fail licensing. Never label preview evidence production-trusted.

---

## 13. Policy engine and protected-action matrix

```ts
type IntegrityContext = {
  action: IntegrityAction;
  amountMinor?: number;
  accountRisk: 'low' | 'medium' | 'high' | 'critical';
  sessionAgeSeconds: number;
  recentReauth: 'none' | 'password' | 'totp' | 'passkey';
  providerEvidence: NormalizedIntegrityEvidence;
  appVersion: string;
  installationAgeSeconds?: number;
  linkedAccountCount?: number;
  outageMode: boolean;
  // iOS 27 signals
  launchValidationCategory?: 'app_store' | 'testflight' | 'other' | 'unevaluated';
  attestedBundleVersion?: string;
  // Play 1.5.0+ signals
  appAccessRisk?: 'clear' | 'capturing' | 'controlling' | 'unevaluated';
};
```

| Action | Integrity | Other control | Unavailable | Adverse |
|---|---|---|---|---|
| browse/search/view | none; sample shadow | auth as needed | allow | allow, telemetry only |
| post/message/ordinary listing | sampled/recent for risky traffic | abuse/rate limits | allow with limits | throttle/review with corroboration |
| checkout | request-bound for high risk/value | payment auth, fraud, idempotency | step-up/hold | step-up/review; never silent charge |
| payout destination | request-bound required | passkey/strong reauth, notification, cooldown | block safely | deny/review |
| withdrawal/redemption | request-bound required | KYC, strong auth, velocity, ledger | queue/hold | deny/review |
| recovery protected change | existing-device proof when available | recovery policy/notifications | stronger alternative/manual path | deny/review |
| admin money override | managed-device proof where deployable | workforce IdP/key/maker-checker | block/break-glass | deny/incident |

**iOS 27 adverse-signal rules:**

- `launchValidationCategory === 'testflight'` in a production environment → `deny` for money mutations, `review` for others;
- `attestedBundleVersion` not in the release manifest → `deny` for money mutations, `review` for others;
- `isSupported === false` spike from a previously-supported installation → `step_up` and flag for fraud review.

**Play 1.5.0+ adverse-signal rules:**

- `appAccessRisk === 'capturing' || 'controlling'` during payout/withdrawal → `deny` and prompt remediation;
- `INTEGRITY_TOKEN_PROVIDER_INVALID` → re-prepare and retry once; if still invalid → `unavailable` degraded policy;
- `CLIENT_TRANSIENT_ERROR` → retry with exponential backoff (max 3); if exhausted → `unavailable` degraded policy.

Return action decisions — `allow`, `step_up`, `review`, `deny` — not a universal "trusted" label.

---

## 14. API and error semantics

```ts
type IntegrityFailureCode =
  | 'INTEGRITY_PROOF_REQUIRED'
  | 'INTEGRITY_PROOF_EXPIRED'
  | 'INTEGRITY_REQUEST_MISMATCH'
  | 'INTEGRITY_APP_UNRECOGNIZED'
  | 'INTEGRITY_INSTALL_UNLICENSED'
  | 'INTEGRITY_DEVICE_RISK'
  | 'INTEGRITY_CREDENTIAL_REVOKED'
  | 'INTEGRITY_PROVIDER_UNAVAILABLE'
  | 'INTEGRITY_UNSUPPORTED'
  | 'INTEGRITY_REMEDIATION_AVAILABLE'
  | 'INTEGRITY_LAUNCH_CATEGORY_MISMATCH'   // iOS 27
  | 'INTEGRITY_BUNDLE_VERSION_MISMATCH'    // iOS 27
  | 'INTEGRITY_APP_ACCESS_RISK'            // Play 1.5.0+
  | 'INTEGRITY_TOKEN_PROVIDER_INVALID';    // Play 1.5.0+
```

Every failure includes `operationId`, `outcome: not_executed|executed|unknown_outcome`, a safe remediation object and short support reference. Network loss can make a mutation ambiguous even if proof was checked first; query the owner operation by ID rather than declaring success or retrying blindly.

---

## 15. Native UX specification: flagship and anti-AI

Integrity UI is invisible when healthy. Security theatre adds anxiety without trust.

- No permanent shield, trust score, "military-grade" copy or green security card.
- No equal-weight rounded-card stack.
- Keep the protected object — destination, withdrawal amount or account change — dominant.
- Use a flat sheet: short title, one paragraph, status line, at most two actions.
- Separate 44pt targets from 20–24pt transparent Back/Close glyphs.
- Warning red is for definitive risk/denial, not provider downtime.
- Never say "device compromised." The evidence does not justify it.
- No duplicate headings, no decorative subtitles, no eyebrow + title + caption stacks.

| Condition | Title | Body | Primary | Secondary |
|---|---|---|---|---|
| transient error | "We couldn't verify this device" | "Your withdrawal was not submitted. Try again in a moment." | Try again | Cancel |
| old app | "Update ThryftVerse to continue" | "This security check needs the latest app version." | Update app | Not now |
| Play repair (1.5.0+ `GET_INTEGRITY` dialog) | "Get the official app" | "Install or update ThryftVerse from Google Play, then try again." | Open Google Play | Contact support |
| Play strong-integrity repair (1.5.0+ `GET_STRONG_INTEGRITY` dialog) | "This device needs a security update" | "Your device's security patch is out of date. Update it in Settings, then try again." | Open Settings | Contact support |
| app-access-risk (1.5.0+) | "Close other apps to continue" | "A screen-recording or control app was detected during this withdrawal. Close it and try again." | Try again | Support |
| unsupported | "Use another verification method" | "This device can't complete the check needed for withdrawals." | Verify another way | Support |
| review | "We're checking this withdrawal" | "No money has left your balance. We'll notify you." | View status | Close |
| iOS 27 launch-category mismatch | "Use the App Store version" | "This action needs the official App Store version of ThryftVerse." | Get from App Store | Support |
| iOS 27 bundle-version mismatch | "Update ThryftVerse to continue" | "The version of the app on this device isn't recognised. Update to the latest version." | Update | Support |

State coverage: preparing, proof requested, provider handoff, success, retryable failure, unsupported, remediable failure, step-up, review, revoked credential, offline, unknown outcome, reduced motion, screen reader, large text and high contrast.

Support receives only a reference plus normalized reason. It cannot see raw proof or grant a permanent bypass; exemptions expire, are scoped and maker-checked.

---

## 16. Transport and release-integrity decision

Pinning is not the attestation critical path. Before enabling, inventory every API/CDN/upload/WebSocket/native stack, choose one platform owner, configure current plus backup SPKI pins, rehearse rotation/expiry/emergency recovery and test Expo updates and provider SDKs.

**[I] Recommendation:** resolve the ambiguity between TrustKit config-plugin pinning and optional JavaScript runtime pinning. Do not dynamically import an optional package and call it a release control. Pinning remains defence-in-depth, not a substitute for TLS or request proof.

Supply-chain companion controls:

- least-privilege EAS/signing credential access;
- Play App Signing and Apple certificate incident runbooks;
- SBOM/dependency scanning;
- release provenance/artifact hashes;
- production debug/inspection removal;
- update-signing key rotation and rollback.

---

## 17. Observability, privacy and SLOs

Bounded metrics only — never user/key/raw-error labels:

- challenge issued/consumed by provider/action/result;
- verification by provider/evidence/reason;
- policy by action/decision/version;
- provider latency/unavailability;
- eligible coverage by platform/app version/action;
- remediation result (including Play 1.5.0+ dialog outcomes);
- counter failures and enrollment outcomes;
- confirmed false positives;
- Play quota use/headroom;
- iOS 27 launch-category mismatch rate;
- iOS 27 bundle-version mismatch rate;
- Play app-access-risk detection rate.

| Measure | Enforcement gate |
|---|---:|
| verifier availability | ≥99.95% monthly with degraded-mode test |
| internal verification p95 | <75 ms excluding provider |
| Play end-to-end p95 | <1.2 s overhead |
| Apple assertion end-to-end p95 | <300 ms overhead |
| valid proof rate on eligible current app | ≥99.0% or approved cohort exception |
| unexplained invalid rate | <0.2% |
| confirmed legitimate false denial | <0.05% protected attempts |
| challenge replay acceptance | 0 |
| raw proof in logs | 0 |
| policy rollback | <10 minutes |

These are proposed targets, not measured claims.

Retention: process raw proof in memory; keep only normalized evidence under an approved schedule; purge expired challenges; encrypt Apple receipts; keep support references indirect. Complete a DPIA/legitimate-interest assessment for cross-account device correlation. Never reuse integrity evidence for advertising/recommendations.

---

## 18. Test and evaluation programme

### Apple verifier fixtures

- valid development/production;
- malformed, oversize and deep CBOR;
- wrong/expired chain;
- nonce, RP ID, AAGUID, environment or credential mismatch;
- duplicate key across accounts;
- valid assertion and every canonical-field mutation;
- counter zero/duplicate/rollback/concurrency;
- bad DER ECDSA;
- receipt invalid/refresh unavailable;
- **iOS 27 launch-category = testflight in production environment**;
- **iOS 27 bundle-version not in release manifest**;
- **iOS 27 macOS 27 platform support**.

### Google fixtures

- correct Standard hash;
- wrong package/cert/version/actor/operation digest;
- stale/future timestamp;
- recognized/unrecognized/unevaluated app;
- licensed/unlicensed/unevaluated;
- device/strong/virtual/empty combinations;
- optional access-risk/Play Protect signals (1.5.0+);
- replay-cleared verdict;
- 429, timeout, auth failure, malformed payload and quota exhaustion;
- **`CLIENT_TRANSIENT_ERROR` retry path**;
- **`INTEGRITY_TOKEN_PROVIDER_INVALID` re-prepare path**;
- **`GET_INTEGRITY` / `GET_STRONG_INTEGRITY` remediation dialog invocation**.

### Integration/concurrency

- atomic consume under 50 parallel submissions (Postgres `DELETE ... RETURNING` and Redis `GETDEL`);
- Apple counter update under parallel actions;
- owner cannot execute without matching evaluation;
- evaluation cannot authorize a second operation;
- trace/operation ID spans policy and owner transaction;
- Redis/provider failure cannot create success;
- kill switch and expiry cleanup are idempotent.

### Golden-vector strategy

Produce a single canonical-bytes fixture file. Load it in:

- a Swift unit test that computes `SHA256(challenge)` and calls `DCAppAttestService.generateAssertion`;
- a Kotlin/JS unit test that computes the same digest and calls the Standard API `setRequestHash`;
- a Node unit test that re-computes the digest and passes it to `verifyAssertion`.

All three must produce byte-for-byte identical `canonicalDigest` values. This is the only way to prevent client/server canonicalization drift.

### Physical EAS matrix

| Platform | Required cases |
|---|---|
| iOS current (iOS 27) | TestFlight/App Store, update, reinstall, migration/restore, offline, multi-account, clock skew, launch-category signal, bundle-version signal, macOS 27 |
| iOS oldest supported | unsupported behavior, VoiceOver, large text, reduced motion |
| Android current (Play 1.6.0) | closed/production Play, licensed update, signature test, remediation dialogs (1.5.0+), app-access-risk, quota/outage, `INTEGRITY_TOKEN_PROVIDER_INVALID` |
| Android oldest supported (API 23) | Standard availability, no Play services, uncertified device, TalkBack, large text |
| EAS preview | explicit non-production policy; no production trust claim |

Retain signed test evidence with build, OS/device class, policy version and expected/actual outcome. Never commit raw tokens. Add independent MASVS/MASTG review, authorized instrumentation/repackaging/relay tests, leakage scans and outage/bad-policy/credential-compromise tabletops.

---

## 19. Migration and rollout order

### Stage 0 — contain false trust (2–3 engineer-days)

- hard-fail production if stub verifier can register;
- remove claims based on scaffold;
- add readiness proof that no placeholder can be accepted;
- assign owners/threat-model sign-off.

### Stage 1 — contracts/schema (4–6 days)

- migration `153_integrity_attestation.sql` and typed normalized contracts;
- atomic challenge (`DELETE ... RETURNING` / `GETDEL`) and golden canonical vectors;
- retention/audit schema;
- no enforcement.

### Stage 2 — Apple closure (8–12 days plus review)

- integrate `node-app-attest` verifier with dependency-governance review;
- native hashing/key lifecycle (fix ATT-013/014/015);
- attestation, receipt, assertion and counter verifier;
- iOS 27 launch-category and bundle-version extraction;
- integrate one non-money endpoint;
- physical TestFlight validation.

### Stage 3 — Android closure (6–10 days plus Play lead time)

- add `com.google.android.play:integrity:1.6.0` dependency (fix ATT-016);
- typed Standard API/provider warm-up (fix ATT-018);
- Cloud/Play setup and quota request;
- server decode/normalization/remediation (1.5.0+ dialogs);
- app-access-risk signal consumption;
- closed-track validation.

### Stage 4 — shadow calibration (minimum 2–4 weeks)

- sample low/high-risk actions without effect;
- analyze coverage by app/OS/device/channel;
- review invalid cohorts with Support/Fraud;
- confirm policy thresholds/kill switch.

### Stage 5 — tiered enforcement (incremental 2–4 weeks)

Order: payout destination → recovery-protected changes → withdrawal/redemption → high-risk checkout → abuse-sensitive creation if evidence supports it. Ramp 1% → 5% → 20% → 50% → 100%, stopping on error/false-denial budget breach.

### Stage 6 — pinning/supply chain

Separate workstream; do not delay correct request proof for optional pinning.

Estimates are focused senior-engineering ranges, not commitments. Provider account, review, quota and independent-assessment lead time is external.

---

## 20. Explicit non-goals

- Guaranteeing an uncompromised device/OS.
- Replacing authentication, KYC, fraud, authorization or payment controls.
- Permanently banning all rooted, sideloaded or accessibility-modified devices.
- Fingerprinting for ads/recommendations.
- Proprietary root heuristics before platform proof is correct.
- Consumer trust scores/security dashboards.
- Pinning as a TLS/request-proof substitute.
- Premature verifier microservice extraction.
- Raw token storage for general analytics.

---

## 21. Definition of done

### Architecture/security

- [ ] No accepted stub, empty verdict or placeholder key path.
- [ ] Deliberate versioned route registration with integration tests.
- [ ] Every enforced owner service validates fresh matching evidence.
- [ ] Swift/Kotlin/Node canonical vectors match byte-for-byte.
- [ ] Challenge atomicity and complete binding pass.
- [ ] Apple key/RP/environment/signature/receipt/counter pass.
- [ ] iOS 27 launch-category and bundle-version signals verified against release manifest.
- [ ] Android typed Standard API and server request/app/licensing/device/app-access-risk validation pass.
- [ ] Play 1.5.0+ remediation dialogs (`GET_INTEGRITY`, `GET_STRONG_INTEGRITY`) wired and tested.
- [ ] Policy is versioned, auditable, reversible and action-specific.
- [ ] Migration owns schema; runtime DDL removed.

### Privacy/operations

- [ ] No raw proof/token/key in app, analytics or support logs.
- [ ] Managed provider credentials/least privilege.
- [ ] Retention/deletion/DPIA approved.
- [ ] Quota, latency, errors, false positives and runbooks operational.
- [ ] Kill-switch/bad-policy rollback exercise passes.
- [ ] Support resolves legitimate failures without permanent bypass.
- [ ] Independent review has no unresolved critical/high issue.

### Native experience and launch evidence

- [ ] Update/reinstall/restore/account switch/unsupported/offline/outage tested on physical EAS builds.
- [ ] Every denial states truthful mutation outcome.
- [ ] VoiceOver/TalkBack, 200% text, high contrast and reduced motion pass.
- [ ] No trust badge/score/card stack/accusatory copy.
- [ ] Shadow thresholds pass before enforcement.
- [ ] Enforcement shows measurable abuse benefit without material unapproved conversion/accessibility harm.

Only after every applicable gate passes may this department be called production-ready.

---

## 22. Primary-source research ledger

| Source | External point used |
|---|---|
| [Apple — Secure your apps with App Attest (WWDC26)](https://developer.apple.com/videos/play/wwdc2026/201/) | iOS 27 launch-validation-category, iOS 27 bundle-version, macOS 27 support, `isSupported` as fraud signal, 1-key-per-user guidance, receipt/fraud-metric lifecycle. |
| [Apple — Establishing your app's integrity](https://developer.apple.com/documentation/DeviceCheck/establishing-your-app-s-integrity) | Availability, SHA-256 hash, key persistence, retry/regeneration, reinstall and account/key guidance. |
| [Apple — Validating apps that connect to your server](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server) | Challenge, attestation/key/receipt, assertion signature/RP ID/counter/challenge and environment. |
| [Apple — DeviceCheck](https://developer.apple.com/documentation/devicecheck) | App Attest is a signal and cannot prove every OS-compromise condition. |
| [Google — Make a standard API request](https://developer.android.com/google/play/integrity/standard) | Warm-up, request-hash binding, server decode and replay protection. |
| [Google — Setup](https://developer.android.com/google/play/integrity/setup) | 2026 dependency `com.google.android.play:integrity:1.6.0`, project linking, quotas/alerts and gradual rollout. |
| [Google — Play Integrity API Library release notes](https://developer.android.com/google/play/integrity/reference/com/google/android/play/core/release-notes) | 1.5.0 (2025-08-28): `GET_INTEGRITY`/`GET_STRONG_INTEGRITY` dialogs, manager-level `showDialog` (deprecating token-response `showDialog`), API 23 minimum, app-access-risk signal, `CLIENT_TRANSIENT_ERROR`, `INTEGRITY_TOKEN_PROVIDER_INVALID`. |
| [Google — Integrity verdicts](https://developer.android.com/google/play/integrity/verdicts) | Request/package/hash/timestamp verification before verdict interpretation. |
| [Google — Overview/security considerations](https://developer.android.com/google/play/integrity/overview) | Telemetry-first, no caching, tiered enforcement and multi-signal strategy. |
| [Google — Remediation dialogs](https://developer.android.com/google/play/integrity/remediation) | User-remediable Play conditions. |
| [OWASP — MASVS](https://mas.owasp.org/MASVS/) | Independent mobile control families. |
| [OWASP — Certificate pinning](https://mas.owasp.org/MASTG/knowledge/android/MASVS-NETWORK/MASTG-KNOW-0015/) | Pinning implementation/testing and defence-in-depth role. |
| [node-app-attest (npm)](https://www.npmjs.com/package/node-app-attest) | Node.js/TypeScript server-side Apple App Attest attestation+assertion verifier; MIT; v1.0.1; ~29K weekly downloads; deps `cbor` ^10, `pkijs` ^3, `asn1js` ^3. |
| [veehaitch/devicecheck-appattest (Kotlin/JVM reference)](https://github.com/veehaitch/devicecheck-appattest) | Cross-reference for verifier correctness (Bouncy Castle + Jackson CBOR). |
| [takimoto3/app-attest (Go reference)](https://github.com/takimoto3/app-attest) | Cross-reference for assertion counter and fraud-metric receipt handling. |

Technical claims were checked against official platform/standards material available on 25 August 2026, including WWDC26 sessions. No competitor marketing source is used as a security requirement.

---

## 23. Final status

**PARTIAL — BACKEND CAPABILITY BLOCKER.** This is a disconnected and cryptographically incorrect scaffold, not a partially enforced control. The target is implementable with the existing Expo native-module, Fastify, PostgreSQL and Redis stack, plus `node-app-attest` for Apple verification and `google-auth-library` + Play Integrity REST for Google verification. Production claims require real Apple/Google verification, owner-service binding, iOS 27 signal consumption, Play 1.5.0+ remediation-dialog support, shadow rollout and physical-device evidence.
