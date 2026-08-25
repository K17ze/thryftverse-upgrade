# ThryftVerse Identity, KYC, Age Assurance and Account Recovery — Flagship Implementation Dossier (Upgraded)

**Research cut-off:** 25 August 2026 (includes UK government under-16 social media ban announcement 15 June 2026, Ofcom Use of Age Assurance Report 16 July 2026, Ofcom rapid assessment of over-16 age assurance due end of October 2026, NIST SP 800-63B-4 final July 2025, Stripe Identity redaction API and `identity.verification_session.redacted` webhook, Stripe API version 2026-01-28 Clover, ICO Children's Code Strategy update August 2026, HMRC ongoing CDD monitoring July 2026, FCA CDD findings 2026)
**Repository snapshot:** `f82f74a54be79a1721017380ddd5472d856f1679` plus the inspected working tree on `feat/product-detail-contract-media-device-closure`
**Scope:** account authentication, identity proofing, KYC/AML projection, seller/trader/business verification, age assurance, authenticators, sessions, recovery, protected account changes, privacy and native UX
**Deliverable type:** codebase-grounded research and implementation dossier; no product code changed
**Decision owners:** Identity/Security and Compliance; Legal must determine regulatory perimeter before financial-market launch
**Inspector identity:** senior FAANG mobile/full-stack architect, 20 years, top-level mobile app architecture + front-end UI/UX engineering + back-end design. Anti-AI-design policy enforced throughout.

---

## 0. What changed in this upgrade

This is a deepened re-issue of the 25 August 2026 dossier. Every codebase claim was re-verified by direct file inspection. The following material is new or substantially expanded:

1. **UK government under-16 social media ban — 15 June 2026** — the government announced a ban on social media platforms offering services to under-16s, following Australia's model. The ban covers user-to-user platforms (Snapchat, TikTok, YouTube, Instagram, Facebook, X) but not messaging services (WhatsApp, Signal). Harmful functionalities (livestreaming, stranger communication) will be restricted for under-16s across a wider range of services including gaming. Restrictions will be on by default for 16-17 year-olds. The first set of regulations will be laid before the end of the year, with implementation expected Spring 2027. This is the most significant UK online-safety regulatory change since the Online Safety Act and directly affects ThryftVerse's age-assurance perimeter.
2. **Ofcom Use of Age Assurance Report — 16 July 2026** — Ofcom's first statutory report on age assurance, based on the first six months of protection-of-children duties. 69 million age checks completed across 32 services (July–December 2025). Ofcom identified three areas for improvement: follow HEAA guidance in full, conduct regular due diligence on age-assurance providers, and implement specific technical improvements. Ofcom will deliver to Parliament by end of October 2026 a rapid assessment of highly effective age assurance for determining over-16 status. **Ofcom has explicitly ruled out age inference as highly effective age assurance** for porn sites and other services required to prevent child access.
3. **NIST SP 800-63B-4 — final July 2025** — the finalized Digital Identity Guidelines: Authentication and Authenticator Management, approved by the NIST Editorial Review Board on 2025-05-30. Supersedes SP 800-63B (June 2017, updated March 2020). Defines three authentication assurance levels (AAL1/AAL2/AAL3), phishing-resistant authenticators, syncable authenticators, account recovery as distinct from normal authentication, ≥64-bit saved recovery codes, and forged-media/injection controls.
4. **Stripe Identity redaction lifecycle** — the redaction API (`POST /v1/identity/verification_sessions/:id/redact`) is available for sessions in `requires_input` or `verified` status. Redaction is irreversible, may take up to four days, sets `redaction.status` to `processing` then `redacted`, and emits the `identity.verification_session.redacted` webhook. Redacted objects have PII replaced with `[redacted]` placeholders and metadata erased. The current ThryftVerse implementation does not handle this webhook or track redaction status.
5. **Stripe API version 2026-01-28 Clover** — the current Stripe API version for Identity endpoints. The ThryftVerse Stripe adapter must be pinned to a tested API version and the redaction webhook must be handled.
6. **Deeper age-assurance regulatory analysis** — the under-16 ban creates a new age band (`16_plus`) that ThryftVerse must support if it falls under the regulations. Ofcom's ruling out of age inference means facial age estimation alone is insufficient for restricted services. The rapid assessment of over-16 age assurance (due October 2026) will define acceptable methods. Credit card checks work for over-18 but not for 16-17 year-olds, so alternative methods are needed for the under-16 ban.
7. **Deeper recovery-code entropy analysis** — the 32-bit recovery codes (4 random bytes) at `totp.ts:126-134` are below NIST SP 800-63B-4's minimum of 64 random bits for saved recovery codes. With 32 bits, a brute-force attack against a known account with 1000 attempts/second would succeed in ~50% of cases within 25 days. With 64 bits, the same attack would take ~585 billion years. This is not a theoretical concern.
8. **Deeper BOLA/IDOR analysis** — the compliance routes at `index.ts:12289-12317`, `14610-14816`, and `15249-15297` accept arbitrary `userId` parameters without owner/admin authorization checks. These expose legal name, DOB, KYC status, cases, and verification events to any authenticated caller. This is a P0 privacy/security defect that must be fixed before any production deployment.
9. **Deeper passkey/WebAuthn gap analysis** — repository-wide search found no passkey/WebAuthn credential, ceremony, or native route. The UK government's age-assurance requirements will likely benefit from passkey-based age verification (where a verified age assertion is bound to a passkey). The absence of passkeys also means no phishing-resistant primary authentication, which NIST SP 800-63B-4 recommends for AAL2+.

---

## 1. Executive decision

This department is **P0 and not production-ready**. The repository contains a genuine Stripe Identity adapter, a substantive compliance schema, hashed/rotated sessions, TOTP, recovery codes and a visible KYC journey. Those assets are undermined by contradictory active paths and security defects:

1. the mobile KYC screen calls `/compliance/kyc-session`, which only writes `pending` and returns a fabricated-looking local session ID with no provider URL;
2. a separate `/compliance/kyc/sessions` endpoint does create a Stripe VerificationSession, but the mobile service does not call it and its response contract differs;
3. the KYC screen captures identity documents and a selfie into local URIs, yet submits only name, DOB and country; the captured evidence never reaches Stripe or any backend upload;
4. the screen requires `DD/MM/YYYY`, while its active endpoint requires `YYYY-MM-DD`, so valid visible input fails the backend schema;
5. the UI says documents are deleted after review and promises review within 24 hours without an implemented retention/redaction lifecycle or SLA evidence;
6. several compliance routes accept arbitrary user IDs without an owner/admin authorization check, exposing or mutating highly sensitive compliance data;
7. age gating is an unauthenticated local boolean, with a second unused local age-gate implementation that uses a different minimum age and storage mechanism;
8. password-reset request creates a database token but never calls the existing email service; no reset-password screen/route was found in navigation;
9. password reset is non-atomic, leaves other reset tokens active, and can be raced/reused across outstanding links;
10. magic-link and email-OTP login issue a session without enforcing an enabled TOTP factor;
11. starting TOTP enrollment overwrites/disables an existing factor with bearer-session authentication only;
12. generated recovery codes contain 32 random bits each, below NIST SP 800-63B-4’s 64-bit minimum for saved recovery codes;
13. no passkey/WebAuthn implementation was found, so phishing-resistant authentication and a flagship recovery model are absent.

This is more than a KYC integration gap. It is an assurance-boundary problem: the system conflates **declared**, **pending**, **provider-verified**, **age-banded**, **authenticated** and **authorized** states.

**Immediate release ruling:** do not unlock payout, withdrawal, co-own issuance/redemption, high-value seller capability or a public verification badge from `pending`, local age state, client store state or the current fallback-provider response. Correct authorization and authentication bypasses before expanding features.

---

## 2. Evidence method

| Marker | Meaning |
|---|---|
| **[V] Verified repository fact** | Direct code/schema observation at the cited path/line on the inspected snapshot. |
| **[E] External requirement/guidance** | Official provider, regulator or standards material in §24. |
| **[I] Engineering recommendation** | Proposed target, not a claim of current behavior or legal obligation. |

Line numbers will move after implementation. Repository-wide absence searches are labelled as such.

### 2.1 End-to-end trace

```text
purpose/action -> server assurance policy -> provider session -> native/provider capture
               -> signed webhook inbox -> verification case -> assurance projection
               -> server authorization guard -> native status/recovery

authenticator -> authentication ceremony -> session -> protected change/recovery
              -> notifications/cooldown -> money capability restoration
```

Inspected surfaces include:

- `backend/api/src/index.ts` compliance, sessions, erasure and fallback routes;
- `backend/api/src/lib/kycProvider.ts` and `kycProviders.ts`;
- migrations `006_auth_identity.sql`, `009_compliance_regulatory_foundation.sql`, `057_kyc_provider_events.sql`;
- `backend/api/src/routes/auth.ts`, `lib/auth.ts`, `lib/authEmail.ts`, `lib/totp.ts`;
- `frontend/src/screens/KYCVerificationScreen.tsx` and `services/complianceApi.ts`;
- `frontend/src/screens/AgeVerificationScreen.tsx` and `platform/compliance/AgeGate.tsx`;
- Login, Forgot Password, Two Factor, Biometric Login, Active Sessions and Change Password surfaces;
- route/navigation and repository-wide passkey/WebAuthn references.

---

## 3. Assurance taxonomy: never use one `verified` boolean

| Domain | Question answered | Example authority | Must not imply |
|---|---|---|---|
| Account authentication | Does this claimant control an authenticator bound to the account now? | password, TOTP, passkey, federation | real-world identity, age or suitability |
| Session assurance | How and when was this session authenticated? | auth event + session record | current user intent forever |
| Identity proofing | Which real-world identity attributes were validated and at what assurance? | Stripe Identity/manual process | sanctions clear, trader eligibility, age policy complete |
| Age assurance | Is the user in a required age band with proportionate confidence? | tokenized third-party proof, validated identity output | public DOB or complete KYC |
| Seller/trader verification | Is a seller/person/business traceable for the applicable market? | identity + business/beneficial-owner checks | regulated investment suitability |
| AML/KYC status | Are required CDD/sanctions/PEP/risk controls current for a regulated purpose? | compliance decision with freshness | fraud-free or permanently clear |
| Recovery assurance | Is account control being restored through an approved risk path? | remaining authenticator, recovery codes, reproving/manual review | immediate permission to move money |
| Public reputation badge | What verified fact may other users see? | fail-closed projection | internal risk tier, DOB or raw KYC result |

Use distinct names and records. The word `verified` without a noun, authority, level and expiry is prohibited in contracts and UX.

---

## 4. Evidence ledger: KYC and compliance

| ID | Evidence | Class | Consequence |
|---|---|---|---|
| IDV-001 | `backend/api/src/db/migrations/009_compliance_regulatory_foundation.sql:6-39` models profile KYC, document/liveness, sanctions, PEP, AML tier and trading capability. | [V] | A meaningful data foundation exists, but its projection needs stronger authority/freshness semantics. |
| IDV-002 | The same migration at `:47-100` creates KYC cases and verification events; migration `057_kyc_provider_events.sql:1-10` adds unique provider event IDs. | [V] | Case/event and webhook idempotency primitives are worth preserving. |
| IDV-003 | `backend/api/src/index.ts:12543-12602` implements active `/compliance/kyc-session` by setting profile `pending`, returning `kyc_pending_${userId}`, `verificationUrl: null`, and never calling a provider. | [V] | This is not a verification session and creates a false pending authority. P0 truthful-UI defect. |
| IDV-004 | `frontend/src/services/complianceApi.ts:54-66` calls the placeholder singular endpoint and expects `{ session }`. | [V] | The shipping client is wired to the non-provider path. |
| IDV-005 | `backend/api/src/index.ts:14610-14816` separately implements a real Stripe-backed plural endpoint returning `{ kycSession }`. | [V] | Two canonical paths and incompatible response envelopes exist. |
| IDV-006 | The real endpoint accepts body `userId` (`:14611-14622`) but performs no visible owner/admin authorization comparison before creating a provider session (`:14651-14662`). | [V] | Any authenticated caller may be able to create costly/sensitive verification sessions for another user. Confirm global middleware behavior, then close as P0 BOLA/IDOR. |
| IDV-007 | `backend/api/src/index.ts:12289-12317` GETs and PATCHes `/compliance/profile/:userId` without a visible owner/admin authorization check. | [V] | Authenticated horizontal read/write access to legal name, DOB and compliance state is a potential P0 privacy/security issue. |
| IDV-008 | `backend/api/src/index.ts:15249-15297` reads any user’s KYC profile/cases; no owner/admin check appears before querying. | [V] | KYC status, reasons and payload risk horizontal exposure. |
| IDV-009 | The client validates DOB as `DD/MM/YYYY` at `frontend/src/screens/KYCVerificationScreen.tsx:83-96`, then sends that exact string at `:212-217`. | [V] | Active server schema requires `YYYY-MM-DD` at `backend/api/src/index.ts:12553-12558`; normal UI input fails. |
| IDV-010 | The KYC screen captures front/back document and selfie to local URIs (`KYCVerificationScreen.tsx:63-69,157-189`) but submit sends only legal name, DOB and country (`:212-217`). | [V] | Evidence shown in review is never uploaded or provided to Stripe. “Uploading documents securely” is untrue. |
| IDV-011 | The screen says “Documents are ... deleted after review” at `KYCVerificationScreen.tsx:289-306`; no client upload or provider-redaction invocation is in the flow. | [V] | Unsubstantiated privacy claim. It must be replaced by approved provider/retention-specific copy. |
| IDV-012 | Submit success promises “review within 24 hours” at `KYCVerificationScreen.tsx:230-231`. | [V] | No code/SLO evidence supports this commitment. |
| IDV-013 | `backend/api/src/lib/kycProvider.ts:40-75` creates a real Stripe document session with optional matching selfie and metadata. | [V] | Preferred foundation for a canonical provider-owned capture flow. |
| IDV-014 | Provider webhook verification uses Stripe’s signature library and maps signed metadata at `kycProvider.ts:101-136`. | [V] | Sound direction; event coverage and lifecycle semantics remain incomplete. |
| IDV-015 | Webhook transaction deduplicates event IDs and updates case/profile at `backend/api/src/index.ts:14872-14981`. | [V] | Strong foundation; ordering/projection and sanctions dependencies need formal state rules. |
| IDV-016 | Stripe `requires_input` is mapped to profile `pending`, document `rejected` and liveness `failed` at `backend/api/src/index.ts:14847-14870`. | [V] | A recoverable provider state is collapsed into adverse sub-state; UI/API reason and retry session behavior need explicit semantics. |
| IDV-017 | Profile `trading_enabled` after Stripe webhook requires KYC verified plus sanctions and PEP clear (`backend/api/src/index.ts:14950-14978`). | [V] | Good fail-closed projection. The real session endpoint does not itself run sanctions, so the user can remain verified but disabled without an authored next step. |
| IDV-018 | `backend/api/src/lib/kycProviders.ts:42-55` chooses provider by country and availability in code, but the canonical real route rejects every vendor except Stripe at `index.ts:14624-14631`. | [V] | “Multi-provider fallback” is not a canonical operational capability. |
| IDV-019 | `/users/:userId/kyc-fallback` returns Persona/Onfido values at `backend/api/src/index.ts:28597-28670` but does not persist a KYC case/event or add a provider webhook lifecycle in that route. | [V] | Fallback can produce an orphan provider inquiry and cannot authorize assurance. |
| IDV-020 | Onfido fallback encodes its SDK token inside `onfido-sdk:${token}` at `kycProviders.ts:140-165`. | [V] | Sensitive SDK material is disguised as a redirect URL rather than delivered through a typed native contract. |
| IDV-021 | Persona signature comparison and Onfido token comparison use direct string equality at `kycProviders.ts:169-194`. | [V] | Provider-specific signature formats, timestamp/replay rules and constant-time comparison are not demonstrated; do not enable these adapters. |

---

## 5. Evidence ledger: age assurance

| ID | Evidence | Class | Consequence |
|---|---|---|---|
| AGE-001 | Active navigation imports `isAgeVerified` and chooses `AgeVerification` before auth at `frontend/src/navigation/AppNavigator.tsx:12,71-79,106-107,188`. | [V] | The authoritative product gate is device-local and pre-account. |
| AGE-002 | `AgeVerificationScreen.tsx:22-52` stores only `age_verification_confirmed=confirmed_18_plus` in secure storage. | [V] | This is a local self-declaration, not a verified age assurance; reinstall/new device/account switching bypasses continuity. |
| AGE-003 | `AgeVerificationScreen.tsx:101-105` accepts one button tap, with no server record or account binding. | [V] | It is unsuitable for a higher-risk service if children may access it. |
| AGE-004 | `AgeVerificationScreen.tsx:170-178` accurately says only a local 18+ confirmation is stored. | [V] | The privacy copy is honest, but the assurance strength is insufficient for high-risk restrictions. |
| AGE-005 | A second `platform/compliance/AgeGate.tsx` stores local state in MMKV, defaults to age 13, offers soft/hard modes and rechecks at 30 days (`:1-12,34-47,87-129`). | [V] | Two incompatible age policies/storage authorities exist. Repository search found no production consumer of this second component. |
| AGE-006 | ICO’s current guidance says self-declaration alone is unlikely appropriate where risk is high and requires proportionate certainty, minimization, transparency, challenge and non-discrimination. | [E] | Age policy must be risk-based and independently validated; do not simply collect every user’s ID. |
| AGE-007 | Ofcom’s July 2026 report documents active highly effective age-assurance duties for covered services/content under the Online Safety Act. | [E] | Legal must map ThryftVerse features/content to actual duties; an “18+” label alone is not a compliance analysis. |

---

## 6. Evidence ledger: authentication, sessions and recovery

| ID | Evidence | Class | Consequence |
|---|---|---|---|
| AUTH-001 | Password login enforces enabled TOTP/recovery code at `backend/api/src/routes/auth.ts:695-786`. | [V] | Correct direction for that one entry route. |
| AUTH-002 | Magic-link consumption locks/consumes the token, then issues a session directly at `auth.ts:1250-1382`, without evaluating `two_factor_enabled`. | [V] | Passwordless login bypasses the TOTP policy enforced by password login. Decide whether email link is an approved authenticator; do not silently downgrade. |
| AUTH-003 | Email OTP similarly issues a session directly at `auth.ts:1583-1648` without TOTP. | [V] | A second TOTP bypass exists. |
| AUTH-004 | TOTP enrollment requires only a current bearer session and overwrites the factor while setting account 2FA false at `auth.ts:810-866`. | [V] | A stolen session can reset an existing factor. Require recent strong reauth and current-factor confirmation or recovery case. |
| AUTH-005 | TOTP secret is encrypted with a named key-service context at `auth.ts:839-856`; verification uses a ±1 time step at `:218-257`. | [V] | Useful cryptographic foundation. Add replay/rate/event controls and strong reauth policy. |
| AUTH-006 | Recovery-code lookup is row-locked and marks consumption transactionally at `auth.ts:261-308`. | [V] | Single-use handling is good. |
| AUTH-007 | `backend/api/src/lib/totp.ts:126-134` generates each recovery code from four random bytes (32 bits). | [V] | NIST SP 800-63B-4 specifies at least 64 random bits for a saved recovery code; replace and rotate existing codes. |
| AUTH-008 | Password reset request creates a hashed token at `auth.ts:1874-1918` but never calls `sendAuthEmail`, although `lib/authEmail.ts:20-57` exists and magic-link request uses it. | [V] | Production response says a link was issued when none is delivered. Truthful-UI P0 defect. |
| AUTH-009 | `ForgotPasswordScreen.tsx:49-52,107-130` presents “sent” and “resent” success after that endpoint. | [V] | The client fabricates delivery success from token creation. |
| AUTH-010 | Repository search found no Reset Password screen or deep-link route to call `/auth/password-reset/confirm`. | [V: absence search] | Even a manually delivered reset URL lacks a complete native journey. |
| AUTH-011 | Reset confirm reads token without `FOR UPDATE` at `auth.ts:1931-1953`, then updates password and token later in a transaction at `:1955-1982`. | [V] | Concurrent requests can both pass the pre-transaction check. Consumption is not atomic. |
| AUTH-012 | Reset confirm marks only the selected token used and does not revoke other outstanding reset tokens (`auth.ts:1973-1980`). | [V] | An older stolen link can reset the newly changed password. |
| AUTH-013 | Password reset revokes all sessions after commit (`auth.ts:1990-1995`). | [V] | Good containment, but failure between commit and revocation is not transactional/outbox-backed. |
| AUTH-014 | Change password revokes other sessions at `auth.ts:1803-1870`. | [V] | Good baseline; add authentication event and protected-change notifications. |
| AUTH-015 | Session schema stores hashed refresh tokens and session IDs (`migration 006_auth_identity.sql:28-61`), and the user can list/revoke sessions (`index.ts:12907-13095`). | [V] | Strong foundation for account control and compromise response. |
| AUTH-016 | Active-session device labels are heuristically parsed from User-Agent at `index.ts:12933-12990`. | [V] | Treat labels as approximate, never verified device identity. |
| AUTH-017 | Repository-wide search found no passkey/WebAuthn credential, ceremony or native route. | [V: absence search] | No phishing-resistant primary/step-up authenticator. |
| AUTH-018 | `lib/auth.ts:202-207` uses configured-cost bcrypt; input schemas accept eight-character new passwords. No compromised-password blocklist was found. | [V] | Retain hashing after calibrated cost review; align policy with current NIST guidance and breach screening without arbitrary composition rules. |

---

## 7. Current-state capability matrix

| Capability | Data model | Provider/crypto | Active client | Server enforcement | Status |
|---|---:|---:|---:|---:|---|
| Stripe identity session | Yes | Yes, separate route | **No** | Partial | Disconnected |
| Signed Stripe webhook | Yes | Yes | Status fetch only | Partial | Preserve/harden |
| Mobile document/selfie | Local state | No upload | Yes | No | Misleading; replace with provider capture |
| Persona/Onfido fallback | No durable lifecycle | Partial helpers | No canonical client | No | Disabled until complete |
| KYC status projection | Yes | Webhook/manual | Yes | Used by compliance | Fragmented |
| Compliance route authorization | N/A | N/A | N/A | **Potential BOLA** | P0 |
| Age self-declaration | Local only | None | Active | No | Not assurance |
| Strong age proof/token | No | No | No | No | Missing |
| Password login + TOTP | Yes | Yes | Yes | Yes | Good baseline |
| Magic link/OTP + TOTP policy | Yes | Email | Yes | **Bypassed** | P0 |
| Recovery codes | Yes | 32-bit random | Yes | Yes | Rotate to ≥64-bit |
| Password reset delivery | Token table | No email call | Misleading success | Confirm endpoint only | Broken |
| Password reset atomicity | Yes | Hash | No complete UI | Race/old tokens | P0 |
| Passkeys | No | No | No | No | Missing |
| Session inventory/revocation | Yes | Hashed refresh | Yes | Yes | Strong foundation |
| Risk-based recovery/cooldown | No | No | No | No | Missing |

---

## 8. Regulatory and standards interpretation

### 8.1 NIST SP 800-63 Revision 4

**[E]** Finalized in July 2025, Revision 4 separates identity proofing, authentication and federation; adds continuous evaluation metrics, forged-media/injection controls, syncable authenticators and redress requirements. SP 800-63B-4 treats account recovery as distinct from normal authentication, requires notification after recovery, and describes saved/issued codes, recovery contacts and repeated identity proofing. Saved recovery codes require at least 64 random bits. It recommends multiple bound authenticators to reduce recovery need and recognizes passkeys/WebAuthn-style cryptographic authenticators as phishing resistant when correctly configured.

**[I] Applicability:** NIST is a high-quality engineering benchmark, not automatically a legal mandate for this UK consumer service. ThryftVerse should use an internal assurance profile inspired by IAL/AAL rather than falsely claiming formal NIST conformance without full assessment.

### 8.2 Identity/KYC/AML perimeter

**[E]** FATF’s digital-identity guidance uses a risk-based assessment of whether digital ID technology provides sufficiently reliable and independent evidence for customer due diligence. UK official guidance requires covered businesses to identify/verify customers and beneficial owners, maintain records and perform risk-based ongoing monitoring. HMRC’s July 2026 guidance explicitly calls for keeping CDD current, including expired documents and beneficial ownership.

**Legal caveat:** whether each ThryftVerse commerce, wallet or co-own activity is regulated, who is the regulated entity, whether a provider is relying on a third party, and what CDD/sanctions/record-retention duties apply depend on the final legal, custody, payments and asset structure. Engineering must not call a product “KYC compliant,” “escrow,” or “investment verified” based solely on Stripe Identity. Obtain specialist UK/EU and launch-jurisdiction advice.

### 8.3 Stripe Identity

**[E]** Stripe VerificationSessions are asynchronous and authoritative through signed events such as `verified` and `requires_input`. Stripe documents failure codes and retry paths, user transparency, biometric consent/alternative-method considerations, and explicit redaction APIs. Redaction can take up to four days and is not automatic merely because the user asks ThryftVerse.

**[E — Stripe API 2026-01-28 Clover]** The Stripe Identity redaction API (`POST /v1/identity/verification_sessions/:id/redact`) is available for sessions in `requires_input` or `verified` status. Key behaviour:

- Redaction is **irreversible** — redacted objects are still accessible via the API but all PII fields are replaced with `[redacted]` placeholders and `metadata` is erased.
- The `redaction.status` field transitions from `processing` to `redacted`.
- The **`identity.verification_session.redacted` webhook** is emitted when redaction completes (up to 4 days).
- Redacted objects cannot be updated or used for any purpose.
- Redacting a session in `requires_action` state automatically cancels it.

**Implication [I]:** The current ThryftVerse implementation handles `verified` and `requires_input` webhooks but does not handle `identity.verification_session.redacted`. The compliance schema has no `redaction_status` column on `kyc_cases`. The KYC screen promises "documents are deleted after review" without invoking the Stripe redaction API or tracking the redaction webhook. This is a P0 truthful-UI and privacy defect. The target implementation must:

1. Call the Stripe redaction API when a user requests deletion or when a retention policy triggers;
2. Track `redaction_status` (`not_requested`, `processing`, `redacted`) on the KYC case;
3. Handle the `identity.verification_session.redacted` webhook to update the case;
4. Never promise immediate deletion — state the provider's up-to-4-day redaction timeline accurately;
5. Purge any locally stored provider output after redaction confirmation;
6. Retain only the minimal audit fact (case ID, redaction timestamp, reason) after redaction.

**Implication [I — original]:** provider-hosted/native capture is preferable to generic ThryftVerse media upload. Store the minimum outputs needed for policy. Implement a real redaction workflow and never promise immediate deletion unless both ThryftVerse and provider schedules support it.

### 8.4 Age assurance — deepened with 2026 regulatory changes

**[E — ICO]** ICO guidance requires proportionality, data minimization, transparency, accuracy, challenge/redress, non-discrimination and provider due diligence. It says self-declaration alone is unlikely appropriate for high-risk processing. The ICO's May/August 2026 material reflects active enforcement pressure and continuing changes under the Data (Use and Access) Act 2025.

**[E — Ofcom, 16 July 2026]** Ofcom published its first statutory Report on the Use of Age Assurance on 16 July 2026, based on evidence from the first six months of the protection-of-children duties being in force (July–December 2025). Key findings:

- **69 million age checks** were completed across a sample of 32 services in six months — a generational shift toward a more age-aware internet.
- Ofcom identified **three areas for improvement**: (a) follow HEAA (Highly Effective Age Assurance) guidance in full; (b) conduct regular due diligence on any age-assurance providers; (c) implement specific technical improvements.
- **Ofcom has explicitly ruled out age inference as highly effective age assurance** for porn sites and other services required to prevent child access. This means facial age estimation alone is insufficient.
- Ofcom will deliver to Parliament by **end of October 2026** a rapid assessment of what highly effective age assurance looks like for determining whether someone is **over 16**.
- **Credit card checks will not work for 16-17 year-olds** — firms will need other methods for the under-16 ban.
- A statutory app store report will be published by January 2027.

**[E — UK Government, 15 June 2026]** The UK government announced a ban on social media platforms offering services to under-16s, following Australia's model. Key details:

- The ban covers **user-to-user platforms** whose purpose is to enable social interaction and which allow users to post material (Snapchat, TikTok, YouTube, Instagram, Facebook, X). **Messaging services** (WhatsApp, Signal) are not included.
- **Harmful functionalities** — livestreaming and stranger communication with children — will be restricted for under-16s across a **wider range of services, including gaming sites**.
- These restrictions will be **on by default for 16- and 17-year-olds** to prevent a cliff-edge at 16.
- The government is also looking at **overnight curfews and breaks in infinite scrolling** for under-18s.
- **AI chatbots** must prevent children under 18 from accessing features designed for sexually explicit interaction.
- The first set of **Regulations will be laid before the end of the year**, with changes **implemented in Spring 2027**.
- Adults may not all need new age checks — accounts open more than 16 years, with credit cards, or linked to age-verified email addresses may be grandfathered. Facial recognition for over-18s is mentioned as a simple option.

**[E — Ofcom, 15 June 2026]** Ofcom wrote to Facebook, Instagram, Roblox, Snapchat, TikTok and YouTube requiring them to prove commitment to protecting children, with a deadline of 30 April to report back. Ofcom is investigating nearly 100 services and has taken enforcement action.

**Implication [I]:** ThryftVerse must determine whether it falls under the Online Safety Act's protection-of-children duties and/or the forthcoming under-16 ban. If ThryftVerse is classified as a user-to-user platform (it likely is, given buyer-seller messaging, reviews, and listings), the under-16 ban could apply. Even if ThryftVerse is not classified as social media, the harmful-functionality restrictions (livestreaming, stranger communication) may apply across a wider range of services including gaming and marketplace platforms. The current local self-declaration age gate (AGE-001 through AGE-005) is explicitly insufficient — Ofcom has ruled out self-declaration and age inference for restricted services. ThryftVerse must:

1. Map product features to the Online Safety Act duties and the forthcoming under-16 regulations;
2. Determine which age bands apply (`13_plus`, `16_plus`, `18_plus`) and for which features;
3. Select age-assurance methods that Ofcom considers highly effective for each band;
4. Plan for the over-16 rapid assessment (October 2026) and the regulations (end of 2026, implementation Spring 2027);
5. Implement server-side age-assurance binding, not local storage;
6. Ensure age-assurance data is not used for advertising, recommendations, or any purpose beyond safety compliance;
7. Conduct a DPIA specifically for age assurance, covering bias, accessibility, and non-discrimination.

**Implication [I — original]:** do not jump from one local checkbox to universal passport collection. First map product/content risk, legal duties and age bands. Use the least intrusive method that meets the verified risk; apply protective defaults when age is uncertain.

---

## 9. Target assurance policy

```ts
type AssuranceDecision = {
  action: ProtectedAction;
  jurisdiction: string;
  required: {
    identityLevel: 'none' | 'account' | 'document' | 'enhanced';
    ageBand?: '13_plus' | '16_plus' | '18_plus';
    ageMethodClass?: 'declared' | 'estimated' | 'verified';
    sellerType?: 'private' | 'trader' | 'business';
    sanctionsFreshWithinHours?: number;
    authStrength: 'session' | 'password_or_totp' | 'phishing_resistant';
    reauthWithinSeconds?: number;
  };
  result: 'allow' | 'step_up' | 'review' | 'deny';
  policyVersion: string;
  reasonCodes: string[];
};
```

Initial policy examples (subject to Legal/Compliance):

| Action | Identity | Age | Authentication | Other |
|---|---|---|---|---|
| public browse | none | protective defaults if uncertain | none/session | safety content policy |
| post/message/list ordinary item | account/email | applicable risk-based band | active session | abuse/device/rate controls |
| private seller first payout | document proof | 18+ where required | passkey or password+TOTP recent | sanctions/PEP, payout ownership |
| business/trader selling | document + business/beneficial owner | adult authorized person | strong reauth | trader traceability/tax rules |
| payout destination change | current KYC state | current band | phishing-resistant preferred | device proof, notification, cooldown |
| withdrawal | current KYC + sanctions freshness | adult where required | phishing-resistant/2FA | fraud, velocity, ledger hold |
| co-own issue/redeem/transfer | enhanced policy | adult | phishing-resistant | jurisdiction/product-specific legal controls |
| identity/recovery appeal | only evidence necessary | not public | recovery session | trained reviewer, redress |

All authorization is server-side in the owner service. UI may preflight but cannot unlock capability from Zustand/local storage.

---

## 10. Canonical provider architecture

```ts
interface IdentityVerificationProvider {
  capabilities(country: string, purpose: VerificationPurpose): ProviderCapabilities;
  createAttempt(input: CreateAttempt): Promise<ProviderAttempt>;
  retrieveAttempt(providerRef: string): Promise<ProviderSnapshot>;
  cancelAttempt(providerRef: string): Promise<void>;
  requestRedaction(providerRef: string): Promise<RedactionReceipt>;
  verifyWebhook(rawBody: Buffer, headers: Headers): ProviderEvent;
  normalize(event: ProviderEvent): NormalizedVerificationEvent;
}
```

Provider selection is policy/configuration, not hardcoded country marketing. Each enabled adapter must have:

- capability/country/document matrix;
- approved DPA/subprocessor/data residency and biometric position;
- native/browser SDK return flow;
- correct signature timestamp/replay validation;
- case persistence before user handoff;
- idempotent signed-event inbox;
- status and failure normalization;
- cancellation/redaction;
- outage and migration runbook;
- conformance fixtures.

Enable Stripe first. Keep Persona/Entrust(Onfido) behind disabled production flags until the entire contract passes. “Fallback” must not automatically send the same person’s biometrics to a second provider after a partial attempt; obtain purpose/legal approval and user transparency.

---

## 11. Target data model and migrations

Preserve `user_compliance_profiles`, `kyc_cases` and `kyc_verification_events`, but tighten them. Do not create a second competing KYC store.

### 11.1 Migration A — authorization-safe verification attempts

```sql
ALTER TABLE kyc_cases
  ADD COLUMN purpose TEXT,
  ADD COLUMN idempotency_key TEXT,
  ADD COLUMN provider_status TEXT,
  ADD COLUMN provider_status_version TEXT,
  ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN superseded_by_case_id TEXT REFERENCES kyc_cases(id),
  ADD COLUMN redaction_status TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN redaction_requested_at TIMESTAMPTZ,
  ADD COLUMN redacted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX kyc_case_active_idempotency_idx
  ON kyc_cases(user_id, purpose, idempotency_key);
```

Do not store provider client secrets, SDK tokens, raw documents or selfies in `payload`.

### 11.2 Migration B — durable provider inbox

```sql
CREATE TABLE identity_provider_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_ciphertext BYTEA,
  payload_hash BYTEA NOT NULL,
  signature_verified_at TIMESTAMPTZ NOT NULL,
  processing_state TEXT NOT NULL CHECK (processing_state IN
    ('received','processing','applied','ignored','failed','quarantined')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  last_error_code TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE(provider, provider_event_id)
);
```

ACK provider after durable insert. Process asynchronously and transactionally. Projection compares provider event creation/version so stale out-of-order events cannot regress `verified` to `pending`.

### 11.3 Migration C — assurance facts and requirements

```sql
CREATE TABLE user_assurances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assurance_type TEXT NOT NULL CHECK (assurance_type IN
    ('identity','age','seller','business','sanctions','pep')),
  level TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN
    ('pending','active','needs_action','review','rejected','expired','revoked')),
  authority TEXT NOT NULL,
  source_case_id TEXT REFERENCES kyc_cases(id),
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_version TEXT NOT NULL,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  reason_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`facts` contains minimal non-public projections such as `ageBand: 18_plus`, not document images. Public badge projections must reference an active, non-expired assurance and explicitly approved badge tier.

### 11.4 Migration D — passkeys/authentication events

```sql
CREATE TABLE webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id BYTEA NOT NULL UNIQUE,
  public_key_cose BYTEA NOT NULL,
  sign_count BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  backup_eligible BOOLEAN,
  backup_state BOOLEAN,
  friendly_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE authentication_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  session_id TEXT REFERENCES user_sessions(id),
  ceremony TEXT NOT NULL,
  authenticator_class TEXT,
  assurance_level TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason_code TEXT,
  risk_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Challenges reside in Redis plus a durable audit of outcome; registration/authentication challenge consumption is atomic and origin/RP/user-bound.

### 11.5 Migration E — recovery and protected changes

```sql
CREATE TABLE account_recovery_cases (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN
    ('started','challenging','proofing','review','cooldown','completed','cancelled','denied','expired')),
  target_assurance TEXT NOT NULL,
  selected_methods TEXT[] NOT NULL,
  risk_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  restrictions JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewer_user_id TEXT REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE protected_account_changes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  change_type TEXT NOT NULL,
  old_value_hash BYTEA,
  new_value_ciphertext BYTEA,
  state TEXT NOT NULL CHECK (state IN
    ('requested','cooldown','applied','cancelled','expired')),
  requested_from_session_id TEXT REFERENCES user_sessions(id),
  required_auth_event_id TEXT REFERENCES authentication_events(id),
  apply_after TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 11.6 Migration ordering

1. add columns/tables without changing reads;
2. backfill current KYC facts conservatively—unknown stays unknown;
3. dual-write provider events and compare projections;
4. migrate client to canonical v1 endpoints;
5. remove singular placeholder endpoint after telemetry shows no callers;
6. rotate recovery codes and require re-enrollment for unsafe factors;
7. enable server guards in shadow/log mode, then enforcement;
8. drop deprecated status/metadata paths only after retention export and rollback window.

---

## 12. Canonical KYC/identity state machines

### 12.1 Verification attempt

```text
created -> provider_ready -> user_started -> processing -> verified
   |           |                |              |-> needs_action -> user_started
   |           |                |              |-> manual_review -> verified|rejected
   |           |                |-> abandoned/expired
   |           |-> provider_unavailable
   |-> cancelled/superseded
verified -> expired|revoked|redaction_requested -> redacted
```

Illegal transitions are rejected. `requires_input` means `needs_action`, not terminal rejection. Provider event time/version prevents regression. Manual override requires reason, trained role, and maker-checker for money capability.

### 12.2 Current assurance projection

```text
none -> pending -> active
          |-> needs_action -> pending
          |-> review -> active|rejected
active -> expired -> pending/new proof
active -> revoked -> review/new proof
```

`trading_enabled` is derived from active required facts (identity, sanctions, PEP, jurisdiction, limits), never independently hand-toggled without a recorded override.

### 12.3 Age assurance

```text
unknown -> declared -> sufficient_for_low_risk
unknown|declared -> proof_requested -> age_band_active
proof_requested -> needs_action|review|unable_to_establish
age_band_active -> expired|policy_changed -> proof_requested/unknown
```

The result is an age band, method class, jurisdiction and expiry. Public/product consumers do not receive DOB, confidence scalar, face image or provider raw output.

---

## 13. Canonical API contracts

### 13.1 Start verification

`POST /v1/me/identity-verifications`

```json
{
  "purpose": "seller_first_payout",
  "idempotencyKey": "uuid",
  "country": "GB"
}
```

The server derives user ID, required checks, level and vendor. The client cannot request another user or downgrade checks.

```json
{
  "verification": {
    "id": "kyc_case_...",
    "state": "user_action_required",
    "provider": "stripe_identity",
    "handoff": { "kind": "hosted_url", "url": "https://verify.stripe.com/..." },
    "expiresAt": "..."
  }
}
```

Never return a client secret/SDK token inside a fake URL. Mark responses `Cache-Control: no-store`.

### 13.2 Status

`GET /v1/me/identity-verifications/{caseId}` returns only user-safe state, next action, timestamps and reason code. `GET /v1/me/assurance` returns capabilities and requirements, not raw cases/provider payload.

### 13.3 Webhook

`POST /v1/webhooks/identity/stripe` receives raw bytes, verifies signature before parsing business fields, inserts unique event, ACKs, and processes asynchronously. Unmatched case/user/provider metadata enters quarantine and alert; it never creates an arbitrary user authority.

### 13.4 Age assurance

- `POST /v1/me/age-assurance/sessions` takes a policy purpose, not a requested pass result.
- `GET /v1/me/age-assurance` returns band/method class/expiry and next action.
- provider callback creates an active band assertion only from signed/verified evidence.
- local self-declaration may be submitted as `method=declared` but server policy decides where it is sufficient.

### 13.5 Passkeys

- `POST /v1/auth/passkeys/registration/options`
- `POST /v1/auth/passkeys/registration/verify`
- `POST /v1/auth/passkeys/authentication/options`
- `POST /v1/auth/passkeys/authentication/verify`
- `GET /v1/me/authenticators`
- `DELETE /v1/me/authenticators/{id}` with recent strong reauth

Use a mature server WebAuthn library and platform credential APIs; do not implement CBOR/COSE ceremonies from scratch.

### 13.6 Recovery

- `POST /v1/account-recovery/cases` always returns an enumeration-safe response;
- `POST /cases/{id}/challenges/{method}`;
- `POST /cases/{id}/verify`;
- `GET /cases/{id}`;
- `POST /cases/{id}/cancel` from an established session/notification link;
- `POST /cases/{id}/complete` binds new authenticators transactionally;
- `GET /v1/me/protected-changes` and cancellation endpoints.

Every mutation uses an idempotency key and explicit `not_executed|executed|unknown_outcome` semantics.

---

## 14. Account authentication target

### 14.1 Authenticator hierarchy

1. passkey as preferred primary/step-up;
2. password + TOTP as supported AAL2-like fallback;
3. email magic link/OTP as a declared lower-assurance path unless combined with another factor;
4. recovery codes only for recovery/second-factor fallback, not routine display;
5. manual recovery/reproof for lost-all-authenticator cases.

Do not call a local biometric prompt a server authentication factor. It can activate a device-held passkey/key or protect a restored local session, but the backend needs cryptographic ceremony/recent auth evidence for sensitive actions.

### 14.2 Immediate fixes

- Define one authentication policy applied to password, magic-link, OTP and social routes.
- If `two_factor_enabled`, magic-link/OTP must enter a pending second-factor transaction rather than issuing a full session, unless product/security deliberately treats that channel as an alternative authenticator at a defined strength.
- Starting TOTP enrollment on an already protected account requires current TOTP/passkey or an approved recovery case.
- Rotate 32-bit recovery codes to ≥64-bit random codes; show once, hash at rest, support regeneration and notify on regeneration.
- Add breached-password blocklist, permit password managers/paste, no arbitrary composition rules, and align length with the chosen assurance profile. NIST’s current single-factor benchmark is 15 characters; eight may remain only where password is always part of MFA under the documented profile.

### 14.3 Sessions

Retain hashed rotating refresh tokens and user revocation. Add:

- authentication strength/method/time to session;
- passkey credential ID reference;
- coarse geo/ASN risk—not a public precise location;
- device/install label as unverified unless attested;
- last-seen update throttling;
- new-login notification;
- family/refresh-token reuse response;
- step-up token scoped to action and short TTL;
- session quarantine after high-risk recovery.

---

## 15. Account recovery target

### 15.1 Recovery policy

Recovery must match account value. NIST recovery methods inform the policy:

| Account condition | Required recovery |
|---|---|
| ordinary account, passkey remains | existing passkey + bind replacement |
| password+TOTP, recovery code remains | valid ≥64-bit code + email notification + bind new factor |
| two independent authenticators remain | use both, immediate rebind permitted |
| identity-proofed money account, all factors lost | repeat approved proofing/manual specialist review + cooldown |
| suspicious device/traffic/payout change | enhanced review, deny self-service fast path |

### 15.2 Recovery state machine

```text
started -> method_selected -> challenging -> proof_satisfied
   |              |              |-> retryable (bounded)
   |              |              |-> review -> approved|denied
   |              |-> expired
proof_satisfied -> bind_new_authenticator -> cooldown -> completed
any pre-complete -> cancelled
```

On completion:

- atomically invalidate old authenticators selected by policy;
- revoke/quarantine sessions;
- invalidate every password/magic/recovery token used or issued before recovery start;
- notify all previously validated channels;
- create visible security event and “This wasn’t me” path;
- hold payout-destination changes and withdrawals for risk-based cooldown;
- require fresh KYC only where policy/legal analysis requires it, not as a generic punishment.

### 15.3 Repair password reset now

1. Build reset email content and call `sendAuthEmail`; preserve enumeration-safe outward response while recording delivery acceptance/failure internally.
2. Add signed universal/app link and native Reset Password screen.
3. Start a DB transaction before lookup, `SELECT ... FOR UPDATE`, then conditional consume.
4. Revoke every outstanding reset token for that user in the same transaction.
5. Write password/authentication event and outbox notification transactionally.
6. Revoke sessions via transactional/outbox worker with retries.
7. If 2FA remains enabled, return user to a complete second-factor/recovery flow rather than stranding them.
8. Rate limit by normalized account, IP/network risk and device without leaking existence.

---

## 16. Age-assurance target

### 16.1 Policy before vendor

Legal/Product/Safety must create an age-risk register:

- which content/features may be accessed by children;
- whether ThryftVerse is truly adult-only or should support protected teen use;
- risks in messaging, recommender systems, live content, auctions, payments and co-own;
- jurisdiction-specific bands and effective dates;
- whether self-declaration is sufficient for low-risk areas;
- what proportionate stronger method is required for restricted actions;
- challenge/appeal and false-positive strategy;
- DPIA and Equality Act/non-discrimination testing.

### 16.2 Privacy-preserving design

- Ask the server for the required band; do not ask every user for a passport.
- Prefer a reusable/tokenized `over 18` result where acceptable.
- Separate age assurance from public profile and recommendation signals.
- Do not retain face images, DOB or confidence score when an active band is enough.
- Never use age-inference data for ads or discovery ranking.
- Provide a non-biometric alternative/manual route where policy/legal advice requires it.
- Apply child-protective defaults when age is unknown and the service remains likely to be accessed by children.

### 16.3 Consolidation

Remove the unused 13+ MMKV gate after confirming no consumer. Keep one native entry screen driven by server policy. Until stronger proof launches, label the existing result internally as `declared_18_plus`, bind it to account when authenticated, and do not use it for server authorization above its documented strength.

---

## 17. Seller, trader and business verification

Identity proof of a person is insufficient for a robust marketplace. Add purpose-specific facts:

- private seller vs trader/business classification;
- legal business name, registration/jurisdiction and verified representative authority;
- beneficial owners/controllers where legally required;
- verified payout-account ownership and name match;
- tax/DAC7 facts with their own source/status;
- business/trader disclosures and contact projection where required;
- suspension/reverification after material changes;
- record of why a seller badge is rendered.

Do not put all of this into one `enhanced` string. Policy facts and public projection must be explicit. A public badge should say only what is evidenced (“Identity checked”, “Registered business”) and link to a concise explanation—not “Trusted seller.”

---

## 18. Native UX and anti-AI design specification

### 18.1 Verification entry

The first viewport answers only:

1. what action needs verification;
2. why now;
3. what Stripe/selected provider will check;
4. approximate path, not an invented completion time;
5. privacy and alternative-method links.

Use one dominant action (`Verify identity`) and a restrained `Not now`. Do not show five equal pill steps, a giant shield illustration, generic “bank-grade” reassurance or a card for every fact.

### 18.2 Provider capture

Use provider-hosted/native capture so framing, document type, liveness, consent and retry stay consistent with the verified provider contract. The ThryftVerse shell should not duplicate fake document/selfie steps before launching Stripe. If a provider handoff is used:

- preserve state across background/return;
- verify universal-link origin;
- refetch server status on focus;
- do not infer success from redirect;
- show `Checking your details` until signed webhook authority;
- explain camera denial and provide Settings/alternative path.

### 18.3 Status composition

One dominant state, not a dashboard:

| State | Headline | Next action |
|---|---|---|
| action required | “Verify your identity to receive payouts” | Continue verification |
| processing | “Checking your details” | Leave safely; notify later |
| needs input | provider-safe reason | Retry the specific step |
| manual review | “Your verification is under review” | View expected range only if backed by SLO |
| active | “Identity checked” | Done; show expiry only if relevant |
| expired | “Verify again to continue” | Start new attempt |
| rejected/denied | clear non-accusatory reason class | Appeal or alternative method |
| provider outage | “Verification is temporarily unavailable” | Try later; no fake pending state |

Completed steps recede into a compact timeline. Real action/status dominates; utility chrome is transparent. Use no more than three type sizes, two radii and one visible non-media panel above the fold.

### 18.4 Recovery UX

- “Recover your account” is a focused sequence, not a settings dashboard.
- Show available methods without revealing hidden account data.
- State when money actions are temporarily held and why.
- Send notifications to old channels and show `This wasn’t me` prominently in those messages.
- Never say “Account secured” until sessions/authenticators/restrictions are authoritative.
- Provide case/reference and human escalation without exposing internal risk scores.

### 18.5 Accessibility and privacy

- 44pt hit targets with restrained visible glyphs;
- screen-reader order follows step/state/action;
- large text must not truncate failure reason or recovery method;
- provider SDK must pass VoiceOver/TalkBack/camera-permission flows;
- screenshots/background snapshots obscured on raw evidence/recovery-code screens;
- no DOB, document number, face image or recovery code in analytics, crash logs or clipboard by default;
- recovery codes offered as accessible copy/download/print with a warning and one-time view.

---

## 19. Privacy, retention and redress

Create a data map before launch:

| Data | Controller/processor role | Storage | Access | Retention trigger | Deletion/redaction |
|---|---|---|---|---|---|
| provider raw document/selfie | provider-defined + ThryftVerse role | provider | tightly restricted | legal/purpose schedule | provider redaction workflow |
| verified attributes | ThryftVerse | encrypted DB | compliance service | assurance/legal retention | field deletion/anonymization as permitted |
| DOB | ThryftVerse if retained | encrypted/column access | least privilege | purpose/legal | delete when no longer needed |
| age band token | ThryftVerse | assurance row | product policy | expiry | delete/expire |
| provider event | encrypted inbox | restricted worker | event processing/audit | short raw retention | purge ciphertext; keep minimal audit |
| recovery evidence | restricted case | recovery specialists | case/legal | short schedule | purge/minimize |
| auth events | normalized | security | security schedule | schedule | pseudonymize/delete per policy |

Required controls:

- DPIA for identity/biometric and age assurance;
- record of processing and lawful basis;
- provider DPA/subprocessor/data-location review;
- purpose limitation and no recommender/ad reuse;
- data-subject access/correction/deletion routes;
- provider redaction request, status and completion webhook;
- human appeal/redress with reason and SLA;
- bias/accessibility evaluation by document, skin tone where lawfully tested, device, disability and jurisdiction;
- strict operator roles, view audit, just-in-time access and no general support access to documents.

Do not promise “deleted after review.” Publish the approved schedule and explain provider processing accurately.

---

## 20. Observability and SLOs

### 20.1 Metrics

- verification creation by purpose/provider/country/result;
- handoff start/return/abandonment;
- webhook signature/duplicate/quarantine/process latency;
- state transition and out-of-order rejection;
- provider failure code (bounded taxonomy);
- completion and retry rate by platform/accessibility path;
- false rejection/appeal overturn;
- redaction requested/completed/age;
- assurance expiration/reverification;
- auth by method/strength/outcome;
- factor enrollment/removal and recovery start/complete/denied;
- password reset delivery accepted/bounced/consumed;
- protected-change cancellation and unauthorized-recovery reports.

Never label metrics with email, name, DOB, provider session ID, document type where too sparse, or raw reason.

### 20.2 Proposed SLOs

| Measure | Target/gate |
|---|---:|
| canonical session-create availability | ≥99.95% monthly |
| provider webhook durable ACK p95 | <500 ms after signature verification |
| received-to-projection p95 | <30 s; alert at 5 min |
| duplicate webhook state corruption | 0 |
| horizontal KYC access acceptance | 0 |
| local/pending state unlocking protected action | 0 |
| password reset delivery acceptance (configured addresses) | ≥99%, with bounce visibility |
| reset token double consumption | 0 |
| recovery notification issuance | 100% completed recoveries |
| raw document/selfie/recovery code in logs | 0 |
| provider redaction completion | within provider/legal schedule; Stripe may take up to 4 days |
| user-facing time promise | only when observed percentile supports it |

These are targets, not current measurements. Compliance must set legally required case/redress timelines.

---

## 21. Test and evaluation matrix

### 21.1 Authorization/security tests

- every compliance/profile/case/status route: anonymous, self, other user, moderator, compliance admin;
- attempt to create/retrieve/cancel another user’s session;
- mass-assignment of vendor, level, checks, status and trading flag;
- provider metadata mismatch/unmatched case;
- raw webhook body/signature alteration, stale/replay and duplicate/out-of-order events;
- secret/SDK token in logs, response caches and analytics;
- fallback provider remains disabled unless conformance suite passes.

### 21.2 KYC state tests

- create idempotently, repeat active attempt, supersede expired attempt;
- verified, processing, requires input, cancellation, expiry, redaction;
- user abandons/browser closes/app restarts;
- signed return without webhook, webhook without return;
- provider outage before/after case persistence;
- sanctions unknown/watchlist/clear with KYC verified;
- changed legal name/country/document expiry;
- manual review/appeal and maker-checker override;
- no protected unlock until projection active.

### 21.3 Authentication/recovery tests

- every login method honors account authentication policy;
- enabled TOTP cannot be bypassed through magic link/OTP/social fallback;
- TOTP enrollment/replacement/removal requires correct recent proof;
- ≥64-bit code, one-time consumption, rotation and old-code rejection;
- password reset delivery failure is not shown as delivered;
- concurrent reset confirmation yields one winner;
- all other reset tokens invalid after success;
- sessions/factor/recovery tokens invalidated through reliable outbox;
- passkey origin/RP/challenge/user-verification/sign-count cases;
- recovery cancel from established session;
- high-risk recovery applies money hold and multi-channel notification;
- enumeration and rate-limit testing.

### 21.4 Age assurance evaluation

- declaration is insufficient where policy requires stronger method;
- server binding across reinstall/new device/account switch;
- provider false positive/negative and appeal;
- token replay/cross-account use/expiry/policy-version change;
- uncertain age gets protective defaults;
- data minimization and no downstream recommender/ad reuse;
- equality/bias/accessibility review with documented lawful test design.

### 21.5 Physical native matrix

| Surface | iOS/Android cases |
|---|---|
| provider handoff | camera granted/denied/limited, app background/kill, universal link, provider cancel, offline return |
| status | delayed webhook, retry, manual review, expiry, outage |
| passkey | create/use/sync/new device/no screen lock/cancel/fallback |
| recovery | email client handoff, link consumed elsewhere, old device cancellation, cooldown |
| accessibility | VoiceOver/TalkBack, 200% text, Switch Access, high contrast, reduced motion |
| privacy | app switcher snapshot, screenshot policy, clipboard, crash/analytics logs |

Retain evidence by build/OS/device/policy/provider version. Do not commit IDs, faces, documents or secrets.

---

## 22. Delivery plan, sequencing and estimates

### Phase 0 — containment (3–5 engineer-days)

- add owner/admin authorization to every compliance user-addressed route;
- disable/remove singular placeholder session and false KYC/privacy/SLA claims;
- block provider fallback in production;
- close magic-link/OTP TOTP bypass and TOTP overwrite path;
- make password-reset UI truthful until delivery exists;
- classify local age result as declaration only.

### Phase 1 — canonical Stripe lifecycle (7–12 days)

- one `/v1/me/identity-verifications` contract;
- server-derived user/purpose/checks;
- migration, idempotency and provider-event inbox;
- provider handoff, on-focus status and authored failure states;
- redaction and retention workflow;
- authorization/webhook/concurrency tests.

### Phase 2 — recovery closure (7–12 days)

- reset email/deep link/native screen;
- atomic token consume/all-token revocation/outbox;
- rotate recovery codes;
- unified authentication policy;
- recovery case, notifications, cooldown/restrictions;
- support specialist workflow.

### Phase 3 — passkeys and strong step-up (8–15 days)

- server WebAuthn library/data model;
- iOS/Android credential APIs through maintained Expo/native module;
- registration/authentication/revocation UI;
- protected-action short-lived step-up;
- physical-device and phishing/relay review.

### Phase 4 — age assurance (policy/legal lead time plus 8–15 engineering days)

- age-risk/DPIA and vendor evaluation;
- server assurance/token lifecycle;
- one policy-driven entry UX and protective defaults;
- alternative/appeal, bias and accessibility evaluation;
- remove duplicate local gate.

### Phase 5 — seller/business and ongoing compliance (10–20 days plus integrations)

- seller/trader/business/representative/beneficial-owner facts;
- payout ownership/name match;
- sanctions/PEP refresh and document expiry;
- DAC7/business projection alignment;
- operator review with least privilege/maker-checker.

### Phase 6 — rollout/evidence (minimum 2–4 weeks)

- shadow server guards;
- migrate cohort and compare old/new projection;
- 1% -> 5% -> 20% -> 50% -> 100%;
- monitor failure, conversion, support, appeal and fraud;
- remove old endpoints only after no traffic and rollback window.

Estimates are focused senior-engineering ranges, not commitments. Legal analysis, provider contracting, app review and manual-ops staffing are external critical-path items.

---

## 23. Explicit non-goals

- Treating identity proof as proof of honesty, item authenticity or creditworthiness.
- Calling Stripe Identity alone complete KYC/AML compliance.
- Collecting passport/selfie from every user “for safety.”
- Using DOB, biometric or age inference for advertising/recommendations.
- Publishing KYC level, internal risk or DOB.
- Security questions or SMS-only recovery for money-bearing accounts.
- Treating local biometrics as server-side reauthentication without a cryptographic authenticator.
- Enabling multiple KYC vendors merely for redundancy before privacy/contract/event closure.
- Building document OCR/liveness in-house before provider flow is correct.
- Generic verification dashboards, decorative trust shields or “AI-powered safety” copy.

---

## 24. Primary-source research ledger

| Source | External point used |
|---|---|
| [NIST — SP 800-63 Revision 4](https://pages.nist.gov/800-63-4/) | Final 2025 assurance separation, continuous metrics, forged-media controls, syncable authenticators and redress. |
| [NIST — SP 800-63B-4 (final, July 2025)](https://csrc.nist.gov/pubs/sp/800/63/b/4/final) | Finalized Authentication and Authenticator Management, AAL1-3, phishing-resistant authenticators, syncable authenticators, account recovery, ≥64-bit saved recovery codes, forged-media/injection controls. Supersedes SP 800-63B (2017/2020). |
| [NIST — SP 800-63B-4 PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63b-4.pdf) | Full technical requirements for authentication assurance levels. |
| [NIST — SP 800-63A-4 identity proofing](https://pages.nist.gov/800-63-4/sp800-63a/ial/) | Proofing controls, notifications, privacy/retention and multiple bound authenticators. |
| [Stripe — Verification Sessions](https://docs.stripe.com/identity/verification-sessions) | Session lifecycle, cancellation/redaction and provider data behavior. |
| [Stripe — Redact a VerificationSession (API 2026-01-28 Clover)](https://docs.stripe.com/api/identity/verification_sessions/redact) | Redaction API, `redaction.status` field, `identity.verification_session.redacted` webhook, up to 4 days, irreversible, PII replaced with `[redacted]`. |
| [Stripe — Verification Sessions API](https://docs.stripe.com/api/identity/verification_sessions) | Create/update/retrieve/redact endpoints, event types including `redacted`. |
| [Stripe — Handle verification outcomes](https://docs.stripe.com/identity/handle-verification-outcomes) | Asynchronous signed events, `verified`, `requires_input`, failure reasons and retry. |
| [Stripe — Explain Identity to customers](https://docs.stripe.com/identity/explaining-identity) | Transparency, biometric use/consent, alternative methods and deletion/redaction responsibilities. |
| [FATF — Guidance on Digital Identity](https://www.fatf-gafi.org/content/dam/fatf-gafi/guidance/Guidance-on-Digital-Identity.pdf.coredownload.pdf) | Risk-based reliability/independence assessment for digital ID in CDD. |
| [GOV.UK — Money-laundering responsibilities](https://www.gov.uk/guidance/money-laundering-regulations-your-responsibilities) | Customer/beneficial-owner verification, records and ongoing monitoring for covered businesses. |
| [HMRC — Ongoing monitoring, July 2026](https://www.gov.uk/hmrc-internal-manuals/anti-money-laundering-guidance-for-supervised-businesses/amlg11411) | Current CDD/document/beneficial-owner review and risk triggers. |
| [FCA — CDD processes and controls findings, 2026](https://www.fca.org.uk/publications/good-and-poor-practice/firms-customer-due-diligence-processes-and-controls-our-findings) | Detailed risk-based operational procedures, not checkbox compliance. |
| [ICO — Age assurance guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/how-to-use-our-guidance-for-standard-one-best-interests-of-the-child/best-interests-framework/age-assurance/) | Proportionality, method options, minimization, accuracy, challenge, provider diligence and non-discrimination. |
| [ICO — Common age-assurance principles](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/joint-statement-on-a-common-international-approach-to-age-assurance/principles/) | Self-declaration limits for high risk, privacy and accountability. |
| [ICO — Children and UK GDPR, updated May 2026](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr/) | Current UK children's-data context after the Data (Use and Access) Act 2025. |
| [ICO — Children's Code Strategy update, August 2026](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/children-s-code-strategy-progress-update-august-2026/our-work-with-smps-and-vsps/) | Active regulatory expectation to strengthen proportionate/effective age assurance. |
| [Ofcom — Use of Age Assurance Report 2026, 16 July 2026](https://www.ofcom.org.uk/online-safety/protecting-children/use-of-age-assurance-report-2026) | First statutory report: 69M checks in 6 months, three improvement areas, age inference ruled out, over-16 rapid assessment due October 2026, app store report due January 2027. |
| [Ofcom — Report on the use of age assurance (PDF)](https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/age-assurance-report-2026/report-on-the-use-of-age-assurance.pdf) | Full statutory report to Secretary of State, pornography/social media/dating sectors, HEAA guidance. |
| [UK Government — Social media to be banned for under-16s, 15 June 2026](https://www.gov.uk/government/news/social-media-to-be-banned-for-under-16s-in-landmark-government-move-to-give-kids-their-childhood-back) | Under-16 social media ban, Australia model, harmful functionality restrictions, AI chatbot restrictions, regulations by end of year, implementation Spring 2027. |
| [UK Government — Fact sheet: New rules to protect children online](https://www.gov.uk/government/publications/fact-sheet-new-rules-to-protect-children-online/fact-sheet-new-rules-to-protect-children-online) | Detailed fact sheet: ban scope, age-assurance methods, 16-17 default restrictions, implementation timeline. |
| [UK Government — Growing up in the online world: progress statement, June 2026](https://www.gov.uk/government/consultations/growing-up-in-the-online-world-a-national-consultation/outcome/growing-up-in-the-online-world-progress-statement) | 116,000 consultation responses, 90% parent support for minimum age 16, effective age assurance requirements. |
| [Ofcom — Keep underage children off your platforms, 15 June 2026](https://www.ofcom.org.uk/online-safety/protecting-children/keep-underage-children-off-your-platforms-ofcom-tells-tech-firms) | Ofcom letters to major platforms, 100 investigations, enforcement action, four demands. |
| [Ofcom — Experiences of Age Assurance research, May 2026](https://www.ofcom.org.uk/online-safety/protecting-children/experiences-of-age-assurance-use-of-vpns-and-attitudes-to-the-protection-of-children-measures) | Four-wave tracker survey, VPN use by children, parent perceptions, families' attitudes. |
| [Ofcom — Roadmap to regulation](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/roadmap-to-regulation) | Implementation status: illegal harms in force ~1 year, protection of children ~9 months, HEAA guidance completed, further consultation on livestreaming/automated moderation/NCII. |

No source above decides ThryftVerse’s regulatory perimeter. Specialist counsel and provider contracts must translate law into the action policy.

---

## 25. Definition of done

### P0 security/correctness

- [ ] Every user-addressed compliance route has tested owner/admin authorization.
- [ ] Exactly one canonical KYC creation/status contract remains.
- [ ] Client cannot choose another user, vendor, required level or authority state.
- [ ] Local/pending/client state can never unlock protected server capability.
- [ ] Captured evidence is provider-owned or truthfully omitted; no fake upload UI.
- [ ] DOB format/validation/canonical representation match end to end.
- [ ] Magic-link, OTP, password and social entry all enforce the declared authentication policy.
- [ ] Existing TOTP cannot be replaced from bearer session alone.
- [ ] Recovery codes meet entropy requirement and old codes are rotated.
- [ ] Reset email, deep link, native confirm, atomic consume and all-token invalidation pass.

### Provider/compliance

- [ ] Signed webhook is durably inserted, idempotent and out-of-order safe.
- [ ] `needs_action`, processing, review, verified, expired, cancelled, redacted and provider outage are distinct.
- [ ] Sanctions/PEP/current assurance derive server capabilities fail-closed.
- [ ] Provider redaction, data access/correction and human appeal are operational.
- [ ] Fallback provider cannot launch without full adapter conformance and privacy approval.
- [ ] Legal/regulatory perimeter and action policy are approved by named owners.

### Recovery/authentication

- [ ] At least two authenticator/recovery paths are encouraged; passkey is available.
- [ ] Recovery strength scales with account value and proofing state.
- [ ] Recovery notifications, session quarantine/revocation, cooldown and money restrictions are authoritative.
- [ ] Every protected change has recent-auth evidence and cancel path.
- [ ] No account enumeration or generic success claim hides actual delivery failure internally.

### Native quality/privacy/accessibility

- [ ] Provider handoff and recovery are validated on physical iOS/Android EAS builds.
- [ ] Camera denial, background/kill, delayed webhook, offline and app-return states pass.
- [ ] VoiceOver/TalkBack, 200% text, Switch Access, contrast and reduced motion pass.
- [ ] No raw document, selfie, DOB, provider token or recovery code appears in logs/analytics/app switcher.
- [ ] No unsupported deletion/SLA/security copy remains.
- [ ] Thumbnail/squint test shows one dominant current action, not a generic card/checklist dashboard.

### Operations/evidence

- [ ] SLO dashboards, alerts, runbooks and provider-outage exercises exist.
- [ ] Operator evidence access is just-in-time, least privilege and audited.
- [ ] Appeals, redactions and recovery cases have staffed queues and measured completion.
- [ ] Shadow/migration cohort has no unexplained capability divergence before enforcement.

Only after every applicable gate passes may this department be described as production-ready.

---

## 26. Final status

**PARTIAL — INTERACTION FAILURES AND BACKEND CAPABILITY BLOCKERS REMAIN.** The repository has valuable provider, event, session and TOTP foundations, but active KYC, age and recovery experiences are contradictory and several routes/authentication paths create P0 authorization or factor-bypass risk. Correct containment and canonicalization must precede visual polish or additional vendors.

### 26.1 Upgraded status (25 August 2026)

**RESEARCH DEEPENED — IMPLEMENTATION BLOCKERS UNCHANGED.** The UK regulatory landscape has shifted significantly since the original report:

- The **UK government's 15 June 2026 under-16 social media ban** creates a new age-band requirement (`16_plus`) that ThryftVerse must support if it falls under the regulations (implementation Spring 2027, regulations laid by end of 2026).
- **Ofcom's 16 July 2026 statutory report** confirmed 69M age checks in 6 months, ruled out age inference as highly effective, and committed to an over-16 rapid assessment by October 2026.
- **NIST SP 800-63B-4** is final (July 2025) — the 32-bit recovery codes are definitively non-compliant with the ≥64-bit minimum.
- **Stripe's redaction webhook** (`identity.verification_session.redacted`) is not handled, and the KYC screen's "deleted after review" promise has no implementation backing.

The codebase defects (IDV-003 placeholder session, IDV-006/007/008 BOLA, IDV-009/010 DOB format mismatch and missing upload, AUTH-002/003 TOTP bypass, AUTH-007 32-bit recovery codes, AUTH-008/009/010/011/012 broken password reset, AUTH-017 no passkeys) remain unchanged. No real-money, payout, withdrawal, co-own issuance/redemption, high-value seller capability, or public verification badge may unlock from `pending`, local age state, client store state, or the current fallback-provider response. The under-16 ban and Ofcom's age-assurance requirements add a new regulatory dimension that must be mapped before launch.
