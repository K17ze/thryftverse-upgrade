# 28 — Security & Privacy UX

> **Department:** Security UX, Privacy UX & Trust Engineering
> **Benchmark date:** 2026-08-18
> **Scope:** Biometric authentication (Face ID/Touch ID/BiometricPrompt), permission UX, GDPR/CCPA data deletion and export flows, Apple Privacy Manifest, Android Data Safety, App Tracking Transparency (ATT), 2FA/TOTP, Passkeys/WebAuthn, session management, active sessions, password reset, KYC/identity verification UX, privacy settings, data export, connected accounts, age verification, secure payment flows, fraud detection UX.
> **Charter references:** AGENTS.md §2 (deep system research, layer diagnosis), §4 (anti-AI-made design — "truthful UI", "stateless UI"), §6 (truthful UI — no fabricated success), §11 (truthful UI), §14 (state completeness); Design.md "Settings & Account", "Security", "Trust & Safety".
> **Primary benchmarks:** Apple system patterns (Face ID, Privacy Manifest, ATT), Google system patterns (BiometricPrompt, Data Safety), eBay (buyer protection, KYC, secure payments), Instagram (2FA, session management, privacy controls), Snapchat (privacy settings), fintech apps (Cash App, Stripe — biometric-gated payments, session revocation). Secondary: Depop, Vinted (marketplace trust patterns).

---

## 1. 2026 Competitor Benchmark

Security and privacy UX in 2026 is not a settings page buried three levels deep — it is a visible trust surface that users evaluate before they enter a credit card, list an item for sale, or share personal data. The apps that do this well (Apple, Google, eBay, Instagram, fintech apps) treat security as a product feature with its own design language, not an engineering afterthought.

### The 2026 security/privacy UX stack

| Layer | 2026 industry standard | Tooling |
|---|---|---|
| Biometric authentication | Face ID/BiometricPrompt as a usability layer on top of hardware-backed keys in Secure Enclave/Keystore; never as a standalone identity factor; re-authentication before sensitive actions (payments, withdrawals, account deletion) | `expo-local-authentication` (RN); Secure Enclave (iOS); Keystore (Android) |
| 2FA/MFA | TOTP (RFC 6238) preferred over SMS; Passkeys/WebAuthn as the 2026 default for new apps (iOS 17+, Android 14+); recovery codes; per-action re-auth for sensitive operations | TOTP libraries; FIDO2/WebAuthn; platform authenticators |
| Session management | Active sessions list with device/platform/location/last-active; revoke single session; revoke all other sessions; session timeout for sensitive apps (15 min for financial) | Server-side session store + client UI |
| Password security | Min 12 chars, no arbitrary composition rules (NIST SP 800-63B); breached password check (HaveIBeenPwned k-anonymity); Argon2id/bcrypt (cost ≥12) server-side; TLS 1.3; rate-limit + progressive delays | Server-side hashing; HIBP API |
| GDPR/CCPA | Data export (portability); data deletion (right to erasure) with cascade across all databases; granular consent per data type; 72-hour breach notification; privacy-by-design architecture | Server-side GDPR request pipeline |
| Apple Privacy Manifest | `PrivacyInfo.xcprivacy` declaring data collection, tracking domains, required-reason APIs; mandatory for App Store submission since Spring 2024 | Expo config plugin + manifest file |
| Android Data Safety | Data safety form in Play Console declaring data collection, sharing, encryption, deletion practices | Play Console form |
| ATT (App Tracking Transparency) | `NSUserTrackingUsageDescription` + ATT prompt before any cross-app tracking; iOS 14.5+ mandatory; most apps see 20-30% opt-in | `expo-tracking-transparency` |
| Permission UX | Contextual permission primacy (explain before asking); soft-ask pre-prompt; "Allow" / "Not now" (not "Allow" / "Don't Allow"); deep-link to system settings from in-app | Custom pre-prompt UI + OS permission |
| KYC/identity verification | Progressive KYC (tier 1: email+phone, tier 2: ID document, tier 3: proof of address); liveness check; verification status with clear next-steps; appeal flow | KYC provider (Stripe Identity, Onfido, Jumio) |
| Fraud detection | Device fingerprinting, behavioral biometrics, velocity checks, Stripe Radar for payment fraud; transparent fraud signals (not hidden from user) | Backend fraud engine + Stripe Radar |

Sources: [SecureCodingHub — Mobile App Authentication Best Practices 2026](https://www.securecodinghub.com/blog/mobile-app-authentication-best-practices-ios-android); [YuSMP — Mobile App Security & GDPR Compliance 2026](https://yusmpgroup.com/blog/mobile-app-security-gdpr-compliance-2026); [Frenchy Digital — Mobile App Security 2026](https://frenchydigital.com/blog/mobile-app-security-2026); [Android Developers — Secure User Authentication](https://developer.android.com/security/fraud-prevention/authentication); [OrtemTech — GDPR Compliant Mobile App Development 2026](https://ortemtech.com/blog/gdpr-compliant-mobile-app-development/).

### Apple — the privacy-first benchmark

Apple's privacy positioning is the benchmark for the industry. Face ID is presented as a premium, effortless security experience — not a friction point. The Privacy Manifest (`PrivacyInfo.xcprivacy`) is mandatory for App Store submission. ATT requires explicit consent before cross-app tracking, and Apple's own apps demonstrate the pattern: permission primacy (explain before asking), granular controls in Settings, and privacy labels on the App Store listing that read like nutrition labels. Apple's session management (Apple ID → Devices) shows every device with last-active, location, and a one-tap "Remove" button.

### eBay — marketplace trust and KYC

eBay's security UX is the benchmark for marketplace commerce. Seller verification is progressive: casual sellers need minimal KYC, while high-volume sellers get prompted for ID verification and business documentation. The buyer protection program is visible on every listing ("eBay Money Back Guarantee"), not buried in a help page. Session management shows active sessions with device and location. 2FA is offered via both SMS and authenticator app, with clear enrollment UX. eBay's data deletion flow is GDPR-compliant with a 30-day grace period.

### Instagram — 2FA and session management

Instagram's "Login Activity" screen (Settings → Security → Login Activity) is the benchmark for session management UX. Each active session shows device type, location (city/country), and "This was me" / "This wasn't me" buttons. A suspicious session triggers an in-app alert. 2FA enrollment offers SMS, authenticator app, and — as of 2024 — WhatsApp as a channel. Recovery codes are displayed with a clear "save these" instruction.

### Fintech apps — biometric-gated actions

Cash App, Stripe, and Revolut set the benchmark for biometric-gated financial actions. Every payment, withdrawal, and settings change requires Face ID/biometric re-authentication. The biometric prompt is contextual ("Verify Face ID to send $50 to @user"), not generic ("Authenticate"). Session timeout is aggressive (5-15 minutes for financial apps). Card details are masked by default with a "Show details" button that requires biometric.

### Converging principles

1. **Biometrics are a usability layer, not an identity factor.** Biometric prompts confirm the device's enrolled user is present — they do not authenticate against the identity provider. The correct pattern: password/MFA on first login → generate a per-device key in Secure Enclave/Keystore → biometric unlocks the key for subsequent sessions. Biometrics alone must never be the sole factor for account access ([Frenchy Digital — Mobile App Security 2026](https://frenchydigital.com/blog/mobile-app-security-2026)).
2. **Privacy by design, not privacy by policy.** GDPR Article 25 mandates "data protection by design and by default." This is an engineering requirement: data minimization at design time, pseudonymization for analytics, smallest data surface = smallest breach surface ([YuSMP — GDPR Compliance 2026](https://yusmpgroup.com/blog/mobile-app-security-gdpr-compliance-2026)).
3. **Permission primacy: explain before asking.** Never trigger an OS permission prompt without first explaining why the app needs it and what the user gets by granting it. The soft-ask pre-prompt preserves the one-shot OS prompt for conceptually-consented users.
4. **Session visibility = trust.** Users who can see and revoke their active sessions feel in control. Users who can't see their sessions feel vulnerable. Active sessions UI is a trust surface, not just a security feature.
5. **KYC is progressive, not all-at-once.** Asking for an ID document at signup creates a 40-60% drop-off. Progressive KYC (email → phone → ID document when selling high-value items) minimizes friction while maintaining compliance.
6. **Data deletion must cascade.** A GDPR erasure request that deletes the user row but leaves their messages, listings, and order history in other tables is not compliant. Deletion must cascade across every database, cache, and third-party system ([OrtemTech — GDPR 2026](https://ortemtech.com/blog/gdpr-compliant-mobile-app-development/)).
7. **Passkeys are the 2026 default.** iOS 17+ and Android 14+ support platform Passkeys (FIDO2/WebAuthn). New apps built in 2026 should default to Passkeys, not passwords. Passkeys are phishing-resistant, require no SMS, and use biometric unlock — they are strictly better than passwords + SMS 2FA.

---

## 2. Psychology & Principles

### Trust as a product feature

Trust is not an abstract quality — it is a perceptual surface that users evaluate in seconds. A user opening a marketplace app for the first time assesses: "Is this app safe enough for me to enter my credit card?" The answer is determined not by the privacy policy (which nobody reads) but by the visible trust signals: biometric gating, buyer protection badges, verification status, secure payment indicators, session management UI. A marketplace without visible trust signals is perceived as unsafe regardless of its actual security posture. eBay's "Money Back Guarantee" badge is not just a policy — it is a perceptual anchor that makes the user feel safe enough to transact.

### The privacy paradox

The privacy paradox: users say they care about privacy but behave as if they don't (they click "Accept all cookies" without reading, they grant all permissions without thinking). The resolution is not to give up on privacy UX — it is to make privacy-preserving choices the default. "Data protection by design and by default" (GDPR Article 25) means the user gets privacy without having to opt in. Analytics opt-out should be the default for sensitive data, not opt-in. Personalized ads should be off by default, not on. The user who wants to share more data can actively choose to; the user who does nothing gets the protective default.

### Friction-tuning for security

Security friction is a dial, not a switch. Too little friction (no 2FA, no biometric re-auth) makes the app vulnerable. Too much friction (2FA on every screen, biometric on every tap) makes the app unusable. The 2026 standard is contextual friction: biometric re-auth for payments and withdrawals (high friction, high stakes), no re-auth for browsing the feed (zero friction, zero stakes). The art is mapping the friction to the stakes. ThryftVerse's biometric gate on wallet/payments is correct; extending it to every settings screen would be over-friction.

### Progressive trust-building

Trust is built progressively, not demanded upfront. A user who just signed up is asked for minimal information (email, username). As they engage (listing an item, making a purchase), they are asked for more (phone number, address, payment method). When they sell a high-value item, they are asked for KYC (ID document). Each ask is contextual and justified by the action it enables. Asking for an ID document at signup — before the user has any investment in the app — produces a 40-60% drop-off. Progressive KYC minimizes friction at each stage while building trust incrementally.

### The "creepy" threshold

Users have a visceral, pre-verbal sense of when an app is "creepy" — when it knows something it shouldn't, or asks for something that feels irrelevant. Requesting location access for a marketplace that doesn't need location-based features feels creepy. Requesting contacts access to "find friends" when the real purpose is growth hacking feels creepy. The creepy threshold is crossed when the data requested exceeds the data needed for the stated purpose. Data minimization (GDPR Article 5) is not just a legal requirement — it is a trust requirement.

### Transparency as competitive advantage

In 2026, transparency is a competitive advantage. Apple built an entire brand positioning around privacy. Apps that are transparent about what data they collect, why they collect it, and how to delete it build trust. Apps that hide their data practices erode trust. The visible privacy surface (DataPrivacyScreen, privacy posture score, data export, data deletion) is not a compliance cost — it is a trust investment.

---

## 3. Architectural Issues & Engineering Flaws

Security/privacy UX debt blocks production in concrete, high-stakes ways:

### App Store / Play Store rejection

Apple rejects apps that: lack a Privacy Manifest, request ATT without a usage description, collect data without declaring it, or use required-reason APIs without justification. Google rejects apps that: don't fill out the Data Safety form, request unnecessary permissions, or handle personal data without adequate disclosure. A single missing privacy declaration can block an entire release.

### GDPR fines and legal exposure

GDPR fines reach up to €20M or 4% of global annual revenue, whichever is higher. In 2026, regulators verify compliance technically — they decompile apps, monitor network traffic, and check whether runtime behavior matches the privacy policy ([YuSMP — GDPR 2026](https://yusmpgroup.com/blog/mobile-app-security-gdpr-compliance-2026)). A privacy policy that says "we don't share your data" while the app sends data to a third-party analytics SDK is a compliance violation that regulators can detect automatically.

### User trust erosion = conversion collapse

A marketplace that doesn't show visible trust signals (buyer protection, verified seller badges, secure payment indicators) has lower conversion because users don't feel safe transacting. The trust surface is not optional — it directly impacts GMV. A user who doesn't trust the platform doesn't list items, doesn't buy items, and doesn't enter payment information.

### Payment fraud without visible protection

Without Stripe Radar integration, biometric-gated payments, and visible buyer protection, the marketplace is vulnerable to payment fraud (stolen cards, chargeback fraud) and the users are vulnerable to seller fraud (never-ship scams, counterfeit items). The fraud detection backend (`fraudDetection.ts`) is necessary but insufficient — the user-facing trust surface must also be present.

### Session hijacking without session management

Without visible active sessions and revocation UI, a user whose session token is compromised (via phishing, device theft, or session hijacking) has no way to detect or respond to the compromise. The attacker has access until the token expires. Active sessions UI is the user's detection and response surface.

### Credential stuffing without rate limiting

Without rate-limiting on login attempts and breached-password checks, the app is vulnerable to credential stuffing — automated attacks that test username/password pairs from data breaches. NIST SP 800-63B recommends blocking breached passwords using the HaveIBeenPwned k-anonymity API. Without this, users with breached passwords can use them unchanged, creating an easily exploitable attack surface.

---

## 4. AI Slop Diagnosis

AI-generated security/privacy UX has predictable failure modes:

### The "secured by 256-bit encryption" badge

AI models frequently generate security badges — "Secured by 256-bit SSL Encryption", "GDPR Compliant", "PCI DSS Certified" — that are decorative, not functional. These badges claim security without implementing it. A senior engineer shows security through behavior (biometric gating, visible session management, data deletion that works), not through badges.

### Copy-paste GDPR text

AI models generate GDPR compliance text by copying legal boilerplate from training data. The text is legally correct but UX-useless — it's a wall of jargon that no user reads. A senior engineer designs the privacy surface as a set of actionable controls (export, delete, toggle personalization) with brief, plain-language explanations, not a legal document.

### No actual biometric integration

AI models reference "Face ID" in comments and UI text but don't actually call `expo-local-authentication`. The biometric prompt is decorative — it shows a "Secured by Face ID" label but never triggers the native prompt. ThryftVerse avoids this — the `BiometricGate` and `useBiometricGate` hook are real, functional integrations.

### Permission requests on launch

AI models request all permissions on app launch (camera, location, contacts, notifications) because the training data shows permission requests early in the app lifecycle. This is the most effective way to get all permissions denied. A senior engineer requests permissions contextually, at the moment the user takes an action that requires the permission.

### No data deletion cascade

AI models implement a "Delete Account" button that deletes the user row from the `users` table and calls it done. The user's messages, listings, orders, reviews, and payment history remain in other tables. This is not GDPR-compliant and not secure. A senior engineer implements a cascade that deletes or anonymizes every trace of the user across every database, cache, and third-party system.

### Fake 2FA

AI models generate a "Enable 2FA" toggle that flips a boolean in local state but doesn't actually enroll a TOTP secret or verify a code. The 2FA appears enabled but provides no security. ThryftVerse avoids this — the `TwoFactorSetupScreen` has a real TOTP enrollment flow with QR code, code verification, and recovery codes.

---

## 5. Current ThryftVerse Audit (file:line defects)

### Biometric authentication — `frontend/src/components/security/BiometricGate.tsx` + `frontend/src/hooks/useBiometricGate.ts`

**Strengths (genuinely well-built):**
- `useBiometricGate.ts:45-134` — real `expo-local-authentication` integration with hardware probing, enrolled check, authenticate, reset, and error handling
- `useBiometricGate.ts:96-101` — `authenticateAsync` with `fallbackLabel: 'Use password'`, `disableDeviceFallback: false` — correct fallback chain
- `BiometricGate.tsx:142-163` — truthful "unavailable" state with warning banner (per AGENTS.md §11: "we never claim a biometric check passed when none ran")
- `BiometricGate.tsx:37-106` — `BiometricGatePrompt` with locked/pending states, retry, cancel — full state coverage
- OWASP Mobile Top 10 M5 reference in comments — security-aware engineering

**Defects:**
| Line (file) | Defect |
|---|---|
| `useBiometricGate.ts:82-86` | Web platform: `setStatus('authenticated'); return true` — biometric is "authenticated" on web with no actual check. This is a truthful-unavailable pattern on web, but the `authenticated` status is misleading. Should be `unavailable` on web, not `authenticated`. |
| `useBiometricGate.ts:128-131` | `reset()` resets to `locked` but there's no auto-lock on app blur/background — a user who authenticates and then backgrounds the app returns to an unlocked state. Financial apps should re-lock on background. |
| `BiometricGate.tsx:119-172` | `BiometricGate` wrapper auto-prompts on mount (`useEffect` line 127-131) — this is correct, but there's no session timeout. Once authenticated, the gate stays open for the screen's lifetime. A 5-minute timeout with re-auth is the fintech standard. |
| Usage | Biometric gate is applied to wallet/payments (correct), but NOT to: account deletion, password change, 2FA disable, connected accounts management. These are all sensitive actions that should be biometric-gated. |

### 2FA/TOTP — `frontend/src/screens/TwoFactorSetupScreen.tsx` + `backend/api/src/lib/totp.ts`

**Strengths:**
- `totp.ts:13-126` — full TOTP implementation: `generateTotpSecret`, `totp` (generate code), `verifyTotp` (with drift window), `createOtpauthUrl`, `generateRecoveryCodes` — RFC 6238 compliant
- `TwoFactorSetupScreen.tsx:32` — phases: `setup → verify → recovery → disable → disable-confirm` — complete 2FA lifecycle
- `TwoFactorSetupScreen.tsx:53` — recovery codes displayed with copy-to-clipboard
- `TwoFactorSetupScreen.tsx:27-28` — QR code generation via `qrcode` library, manual key display for users who can't scan

**Defects:**
| Line (file) | Defect |
|---|---|
| `TwoFactorSetupScreen.tsx` | No Passkey/WebAuthn support — the 2026 default for new apps. TOTP is good but Passkeys are phishing-resistant and require no manual code entry. |
| `TwoFactorSetupScreen.tsx` | No SMS 2FA option — some users don't have authenticator apps. SMS is less secure (SIM-swap risk) but better than no 2FA. |
| `totp.ts:83-101` | `verifyTotp` drift window is not visible in the first 60 lines — need to verify the drift is reasonable (±1 step = ±30s is standard; larger windows are vulnerable to replay). |
| Backend `index.ts:12014-12158` | TOTP factor storage and verification exists in the backend — good. But no rate-limiting on TOTP verification attempts visible — an attacker could brute-force 6-digit codes (1M possibilities) without lockout. |

### Session management — `frontend/src/screens/ActiveSessionsScreen.tsx`

**Strengths:**
- `ActiveSessionsScreen.tsx:14-19` — `fetchActiveSessions`, `revokeSession`, `revokeOtherSessions` — full session management API
- `ActiveSessionsScreen.tsx:24-37` — `formatLastActive` with "Active now", "Xm ago", "Xh ago", "Xd ago" — human-readable relative time
- `ActiveSessionsScreen.tsx:39-44` — platform-specific icons (iOS, Android, Web)
- `ActiveSessionsScreen.tsx:51-56` — loading, refreshing, error, revokingId, revokingOthers states — full state coverage
- Backend `index.ts:42-46` — `issueAuthSession`, `revokeAllUserSessions`, `revokeOtherUserSessions`, `revokeSessionByRefreshToken`, `rotateRefreshSession` — complete session lifecycle

**Defects:**
| Line (file) | Defect |
|---|---|
| `ActiveSessionsScreen.tsx:36` | `date.toLocaleDateString()` — hardcoded locale (no active-locale awareness, per Report #26 i18n findings) |
| Missing | No "Sign out everywhere" confirmation dialog with biometric gate — revoking all sessions is a high-stakes action that should require biometric re-auth |
| Missing | No "new login" push notification — when a new session is created from an unknown device, the user should get a push ("New login from iPhone 15 in London"). Instagram does this. |
| Missing | No suspicious session detection — a session from a new country or device should trigger an alert |

### Privacy settings — `frontend/src/screens/PrivacySettingsScreen.tsx`

**Strengths:**
- `PrivacySettingsScreen.tsx:33-41` — privacy posture score (Strong/Moderate/Basic/Open) with color-coded badge — excellent trust signal, gamifies privacy
- `PrivacySettingsScreen.tsx:34-38` — posture items: private profile, 2FA enabled, activity status hidden, search hidden — actionable items
- `PrivacySettingsScreen.tsx:51-72` — `handleActivityStatusToggle` and `handleSearchVisibilityToggle` with optimistic update + rollback on error — correct pattern
- `PrivacySettingsScreen.tsx:25` — `blockedUsers.length` — blocked users count is visible

**Defects:**
| Line (file) | Defect |
|---|---|
| `PrivacySettingsScreen.tsx:62-71` | `personalizedAds`, `recommendationPersonalization`, `thirdPartySharing` — local state only, not persisted to backend (line 61: "Local preference state — persisted to AsyncStorage in a real implementation"). These toggles don't actually control anything. |
| `DataPrivacyScreen.tsx:43` | `DATA_PRIVACY_DEMO_MODE = __DEV__` — privacy controls are demo-mode only in development. In production, they would be non-functional. This is a truthfulness gap. |
| `DataPrivacyScreen.tsx:62-64` | Same local-state-only pattern — toggles for personalizedAds, recommendationPersonalization, thirdPartySharing don't persist or control anything |

### Data export and deletion — `frontend/src/screens/DataExportScreen.tsx` + backend GDPR routes

**Strengths:**
- `DataExportScreen.tsx:26-35` — 8 data categories listed (Profile, Listings, Orders, Messages, Wallet, Reviews, Addresses, Payment methods) — transparent about what's exported
- `DataExportScreen.tsx:24` — export states: `idle → loading → success → error` — full state coverage
- `DataExportScreen.tsx:49-60` — `requestDataExport()` calls the backend API — real export, not a fake
- Backend `index.ts:18184-18355` — `gdpr_requests` table with `request_type` (export/erasure), `status`, `requested_at`, `completed_at` — GDPR-compliant request tracking
- Backend `index.ts:18236` — `INSERT INTO gdpr_requests` — creates audit trail
- Backend `index.ts:18346` — `eventType: 'gdpr.export.completed'` — notification on completion

**Defects:**
| Line (file) | Defect |
|---|---|
| Backend `index.ts:18184+` | Need to verify: does the erasure flow (`gdpr_erasure` at line 18381) cascade across all tables (messages, listings, orders, reviews, wallet transactions)? A partial cascade is not GDPR-compliant. |
| `DataExportScreen.tsx` | No "30-day grace period" messaging — GDPR erasure should have a grace period during which the user can cancel. The UI should communicate this. |
| `DataExportScreen.tsx` | No "what happens to your listings/orders" explanation — deleting an account with active orders or listings needs special handling. The UI should explain what happens to in-flight transactions. |
| Missing | No "Download your data" email delivery — the export should be delivered via email or in-app download, not just an API response. Need to verify the backend delivers the export asynchronously. |

### Apple Privacy Manifest — `frontend/PrivacyInfo.xcprivacy` + `frontend/plugins/withPrivacyManifest.js`

**Strengths:**
- `withPrivacyManifest.js:17-52` — Expo config plugin that copies `PrivacyInfo.xcprivacy` into the iOS project and registers it as a bundle resource — correct managed-workflow approach
- `PrivacyInfo.xcprivacy` — declares `NSPrivacyTracking: false`, `NSPrivacyTrackingDomains: []`, `NSPrivacyCollectedDataTypes` with purposes — Apple-compliant manifest
- `app.json:21` — `NSUserTrackingUsageDescription: "ThryftVerse does not track you across other companies's apps or websites."` — ATT usage description present
- `app.json:22` — `NSFaceIDUsageDescription: "ThryftVerse uses Face ID to protect your wallet, payments, and account settings."` — Face ID usage description present

**Defects:**
| Line (file) | Defect |
|---|---|
| `PrivacyInfo.xcprivacy` | Need to verify: are all required-reason APIs declared (e.g., `NSPrivacyAccessedAPITypes` for UserDefaults, file timestamp APIs)? Missing required-reason API declarations cause App Store rejection. |
| Missing | No ATT prompt implementation — `NSUserTrackingUsageDescription` is declared but no `expo-tracking-transparency` import or `requestTrackingPermissionsAsync()` call found. Since `NSPrivacyTracking: false`, ATT may not be needed, but if any SDK does tracking, the prompt must fire. |
| Missing | No Android Data Safety form content in the repo — this is a Play Console form, not a file, but the data declarations should be documented somewhere for the Play Store submission. |

### KYC / Identity verification — `frontend/src/screens/VerificationScreen.tsx` (42KB) + `KYCVerificationScreen.tsx` (50KB) + `SellerVerificationScreen.tsx`

**Strengths:**
- Three verification screens covering different KYC tiers — progressive verification is the correct pattern
- `VerificationScreen.tsx:183` — `Linking.canOpenURL(result.session.verificationUrl)` — real KYC provider integration (not fake)
- `VerificationStatusScreen.tsx:347` — links to verification info page
- `VerificationResponseScreen.tsx:261` — date formatting for verification response
- Backend `index.ts:202-203` — `createKycProviderSession`, `cancelKycProviderSession` — real KYC session management

**Defects:**
| Line (file) | Defect |
|---|---|
| `VerificationScreen.tsx` (42KB) | Screen is very large — likely has state machine complexity that should be reviewed for AI-slop patterns (over-scaffolding, duplicate states) |
| Missing | No verification status badge on profile/listings — a verified seller should have a visible badge that signals trust to buyers. `VerificationBadge.tsx` exists (3KB) but need to verify it's used on listing cards and profile. |
| Missing | No "Why verification?" explanation — the KYC flow should explain what verification means and why it's required before the user starts the flow, not just present the form. |

### Password security — `frontend/src/screens/ChangePasswordScreen.tsx` + `ForgotPasswordScreen.tsx` + `frontend/src/components/settings/PasswordStrengthBar.tsx`

**Strengths:**
- `PasswordStrengthBar.tsx` (5KB) — password strength indicator during password entry
- `ChangePasswordScreen.tsx` (12KB) — password change screen
- `ForgotPasswordScreen.tsx` (5.5KB) — password reset flow

**Defects:**
| Line (file) | Defect |
|---|---|
| Missing | No breached-password check (HaveIBeenPwned k-anonymity API) — NIST SP 800-63B recommends blocking passwords found in known data breaches |
| Missing | No Passkey support — the 2026 default for new apps. Passkeys are phishing-resistant and don't require password management. |
| `PasswordStrengthBar.tsx` | Need to verify: does the strength meter use zxcvbn (the industry standard) or a naive length+character-class check? Naive checks are an AI-slop pattern. |

### Connected accounts — `frontend/src/screens/ConnectedAccountsScreen.tsx`

**Strengths:**
- `ConnectedAccountsScreen.tsx:47` — `toLocaleDateString('en-GB', ...)` — date formatting for connected account authorization dates
- Backend `index.ts:15062-15063` — `DELETE /users/me/connected-accounts/:id` — unlink connected account

**Defects:**
| Line (file) | Defect |
|---|---|
| `ConnectedAccountsScreen.tsx:47` | Hardcoded `'en-GB'` locale (per Report #26 i18n findings) |
| Missing | No OAuth provider integration visible — "connected accounts" implies Google/Apple/Facebook login, but need to verify these are real integrations, not decorative rows |

### Age verification — `frontend/src/screens/AgeVerificationScreen.tsx`

**Strengths:**
- `AgeVerificationScreen.tsx` (9KB) — age verification screen exists, which is legally required for certain marketplace categories

**Defects:**
| Line (file) | Defect |
|---|---|
| Missing | Need to verify: is the age verification a simple "I am 18+" checkbox (easily bypassed, legally weak) or a real age estimation / ID-based verification? For a marketplace with high-value items and co-ownership trading, a checkbox is insufficient. |

### Security utilities — `frontend/src/utils/security.ts`

- `security.ts` (7.6KB) — security utility functions exist. Need to verify contents, but the existence of a dedicated security utils file is a positive signal.

---

## 6. Micro Improvements (file-and-line-level)

### M1 — Fix web biometric status

In `useBiometricGate.ts:82-86`, change web fallback from `authenticated` to `unavailable`:
```ts
if (Platform.OS === 'web') {
  setStatus('unavailable'); // not 'authenticated' — no biometric on web
  return false;
}
```

### M2 — Add auto-lock on app background

In `useBiometricGate.ts`, add an `AppState` listener that calls `reset()` when the app goes to background:
```ts
useEffect(() => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      reset();
    }
  });
  return () => subscription.remove();
}, [reset]);
```

### M3 — Add biometric timeout

In `useBiometricGate.ts`, add a 5-minute timeout after which the gate re-locks:
```ts
useEffect(() => {
  if (status !== 'authenticated') return;
  const timer = setTimeout(() => setStatus('locked'), 5 * 60 * 1000);
  return () => clearTimeout(timer);
}, [status]);
```

### M4 — Extend biometric gating to all sensitive actions

Apply `BiometricGate` to: account deletion, password change, 2FA disable, connected accounts management, data export, session revocation — not just wallet/payments.

### M5 — Wire privacy toggles to backend

In `DataPrivacyScreen.tsx:62-64` and `PrivacySettingsScreen.tsx`, replace local-state-only toggles with real API calls that persist to the backend. Remove `DATA_PRIVACY_DEMO_MODE` or make it control only the demo banner, not the actual persistence.

### M6 — Add breached-password check

In `ChangePasswordScreen.tsx` and signup, integrate the HaveIBeenPwned k-anonymity API:
```ts
async function isPasswordBreached(password: string): Promise<boolean> {
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const prefix = hex.slice(0, 5);
  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
  const suffixes = await response.text();
  return suffixes.includes(hex.slice(5));
}
```

### M7 — Add Passkey support

Integrate `expo-passkeys` or a FIDO2/WebAuthn library to offer Passkey enrollment as an alternative to passwords. Passkeys are the 2026 default for new apps and are strictly better than passwords + SMS 2FA.

### M8 — Add "new login" push notification

When a new session is created from an unrecognized device, send a push notification: "New login from iPhone 15 in London. Was this you?" with "Yes" / "No, secure my account" action buttons. If "No" is tapped, revoke the new session and force password change.

### M9 — Add rate-limiting on TOTP verification

In the backend TOTP verification endpoint, add rate-limiting: max 5 attempts per 5 minutes, then lockout for 15 minutes. This prevents brute-forcing 6-digit codes.

### M10 — Add verification badges to listing cards and profile

Ensure `VerificationBadge.tsx` is rendered on listing cards, profile headers, and seller rows — not just on the verification screen. A verified seller badge is a trust signal that directly impacts buyer conversion.

### M11 — Add "Why verification?" pre-flow explanation

Before the KYC verification flow, show a screen explaining: what verification means, why it's required, what data is collected, how long it's retained, and how to appeal a rejection. This reduces KYC drop-off by framing it as a trust-building step, not a bureaucratic hurdle.

### M12 — Add ATT prompt if any SDK tracks

If any third-party SDK performs cross-app tracking, implement the ATT prompt via `expo-tracking-transparency` before the SDK initializes. If no SDK tracks (per `NSPrivacyTracking: false`), document this clearly so future SDK additions trigger an ATT review.

---

## 7. Macro Improvements (structural/architectural)

### A1 — Security as a visible trust surface

The root architectural principle: security is not just implemented — it is *shown*. Users evaluate trust through visible signals, not through reading the privacy policy. The trust surface includes: biometric gating on sensitive actions, verification badges on profiles and listings, buyer protection badges on checkout, active sessions UI, privacy posture score, data export/delete controls. Every security feature that the user can't see is a trust investment that doesn't pay off. The architecture should ensure that every security feature has a visible user-facing representation.

### A2 — Progressive KYC architecture

KYC should be progressive, not all-at-once. Three tiers:
- **Tier 1 (signup):** Email + password + age confirmation
- **Tier 2 (first listing or first purchase):** Phone number verification
- **Tier 3 (high-value listing, co-ownership trading, withdrawals):** ID document verification via KYC provider

Each tier is triggered by a contextual prompt at the moment the user takes an action that requires it. This minimizes signup friction while maintaining compliance for high-stakes transactions.

### A3 — Privacy-by-design data architecture

Every data collection point should be: (1) minimized (collect only what's needed for the stated purpose), (2) consented (explicit opt-in for non-essential data), (3) deletable (cascade deletion across all stores), (4) transparent (visible in the DataPrivacyScreen with the purpose explained). The backend's `gdpr_requests` table is the foundation; the frontend's DataPrivacyScreen is the user-facing surface. The gap is the local-state-only privacy toggles that don't persist — these must be wired to real backend preferences.

### A4 — Biometric strategy as a product decision

Biometric gating is a product decision, not just an engineering one. The strategy should define: which actions require biometric re-auth (payments, withdrawals, account deletion, password change, 2FA disable, data export), what the timeout is (5 minutes for financial, session for others), what happens on background (re-lock), what happens when biometrics are unavailable (truthful warning + password fallback). This strategy should be documented and enforced consistently across all sensitive screens.

### A5 — Session management as a detection surface

Active sessions UI is not just a settings page — it is the user's detection and response surface for session compromise. The architecture should include: (1) new-login push notifications for unrecognized devices, (2) suspicious session detection (new country, new device class), (3) one-tap "revoke all other sessions" with biometric gate, (4) session revocation cascade (revoke refresh tokens, invalidate JWTs, clear device push tokens).

### A6 — Passkey-first authentication

The 2026 default for new apps is Passkeys, not passwords. The authentication architecture should offer Passkey enrollment at signup (with fallback to password for users who decline), and Passkey login as the primary login method. Passwords become the fallback, not the default. This is a structural shift, not a feature addition — it changes the auth flow from "email + password + 2FA" to "Passkey + biometric" with password as recovery.

---

## 8. Flagship Acceptance Criteria

A flagship security/privacy UX must achieve:

- **Biometric gating on all sensitive actions** — payments, withdrawals, account deletion, password change, 2FA disable, data export, session revocation — not just wallet
- **Biometric auto-lock on background** — re-lock when app goes to background; 5-minute timeout for financial screens
- **Truthful biometric fallback** — when biometrics are unavailable, show a warning and require password re-entry; never fabricate a biometric check
- **2FA via TOTP + Passkeys** — TOTP as the current standard, Passkeys as the 2026 default; SMS as a low-security fallback
- **Recovery codes with clear "save these" UX** — displayed, copyable, downloadable
- **TOTP rate-limiting** — max 5 attempts per 5 minutes, then 15-minute lockout
- **Active sessions UI** — device, platform, location, last-active; revoke single + revoke all others; biometric-gated "revoke all"
- **New-login push notification** — "New login from [device] in [location]. Was this you?"
- **Privacy posture score** — visible, gamified, actionable (Strong/Moderate/Basic/Open)
- **GDPR data export** — 8+ data categories, async delivery, completion notification
- **GDPR data deletion** — cascade across all tables, 30-day grace period, clear "what happens to your listings/orders" explanation
- **Privacy toggles wired to backend** — personalized ads, recommendation personalization, third-party sharing, analytics opt-out — all persist and control real behavior
- **Apple Privacy Manifest** — `PrivacyInfo.xcprivacy` with all data types and required-reason APIs declared
- **ATT prompt** — if any SDK tracks; `NSUserTrackingUsageDescription` present
- **Progressive KYC** — tier 1 at signup, tier 2 at first listing/purchase, tier 3 at high-value/co-ownership/withdrawal
- **Verification badges visible** — on profile, listing cards, seller rows, checkout
- **Breached-password check** — HIBP k-anonymity API at password creation and change
- **NIST SP 800-63B compliance** — min 12 chars, no arbitrary composition rules, breached-password block, TLS 1.3
- **Password strength meter** — zxcvbn-based, not naive length+character-class

### Thumbnail test

A ThryftVerse security/privacy surface at 25% scale must show: a privacy posture badge (Strong/Moderate/Basic), visible verification badges, biometric lock icon on sensitive actions, and a clear "Your data" section with export/delete controls. If the surface looks like a generic settings list with no visible trust signals, it is not done.

---

## 9. Priority & Sequencing

| Priority | Item | Why first | Risk | Unblocks |
|---|---|---|---|---|
| P0 | M5 — Wire privacy toggles to backend | Currently non-functional toggles are a truthfulness defect (AGENTS.md §6); must be fixed before launch | Low — API calls | GDPR compliance, truthful UI |
| P0 | M4 — Extend biometric gating to all sensitive actions | Account deletion, password change, 2FA disable without biometric is a security gap | Low — apply existing BiometricGate | Security posture |
| P0 | M9 — TOTP rate-limiting | Without rate-limiting, 6-digit codes can be brute-forced | Low — backend middleware | 2FA security |
| P1 | M2 — Auto-lock on background | Currently biometric gate stays open across app background; financial apps must re-lock | Low — AppState listener | Biometric security |
| P1 | M6 — Breached-password check | NIST SP 800-63B requirement; prevents credential stuffing | Low — HIBP API integration | Password security |
| P1 | M8 — New-login push notification | Session compromise detection; user's primary response surface | Medium — push + session detection | Session security |
| P1 | M10 — Verification badges on listing cards and profile | Trust signal that directly impacts buyer conversion | Low — wire existing component | Marketplace trust |
| P1 | A2 — Progressive KYC architecture | Reduces signup friction while maintaining compliance | Medium — tiered KYC flow | KYC UX |
| P2 | M3 — Biometric timeout | 5-minute timeout for financial screens | Low — setTimeout | Biometric security |
| P2 | M1 — Fix web biometric status | Truthful status on web platform | Low — status change | Truthful UI |
| P2 | M11 — "Why verification?" pre-flow | Reduces KYC drop-off | Low — new info screen | KYC conversion |
| P2 | M12 — ATT prompt if SDK tracks | App Store compliance if tracking SDKs are added | Low — conditional | App Store compliance |
| P2 | A5 — Session management as detection surface | Suspicious session detection + new-login alerts | Medium — detection logic | Session security |
| P3 | M7 — Passkey support | 2026 default for new apps; phishing-resistant | High — new auth flow | Passkey-first auth |
| P3 | A6 — Passkey-first authentication | Structural shift from password-default to Passkey-default | High — auth architecture change | Modern auth |
| P3 | A1 — Security as visible trust surface | Audit all security features for visible representation | Medium — design audit | Trust perception |

---

## 10. Token-level Spec

| Token | Value | Notes |
|---|---|---|
| `biometric.gateScreens` | wallet, payments, withdrawals, accountDeletion, passwordChange, 2faDisable, dataExport, sessionRevocation | All sensitive actions gated |
| `biometric.timeout` | 5 min (financial), session (others) | Auto-lock after timeout |
| `biometric.backgroundBehavior` | re-lock on `AppState: background/inactive` | Re-lock when app backgrounded |
| `biometric.unavailableBehavior` | truthful warning + password fallback | Never fabricate biometric check |
| `biometric.webStatus` | `unavailable` (not `authenticated`) | No biometric on web |
| `auth.2fa.methods` | TOTP (current), Passkeys (2026 default), SMS (fallback) | TOTP > SMS; Passkeys > all |
| `auth.2fa.totp.rateLimit` | 5 attempts / 5 min, then 15-min lockout | Prevents brute-force |
| `auth.2fa.recoveryCodes` | 8 codes, displayed, copyable, downloadable | Clear "save these" UX |
| `auth.password.minLength` | 12 | NIST SP 800-63B |
| `auth.password.compositionRules` | none (no arbitrary character-class requirements) | NIST SP 800-63B |
| `auth.password.breachedCheck` | HIBP k-anonymity API | Block breached passwords |
| `auth.password.strengthMeter` | zxcvbn | Industry standard, not naive |
| `auth.passkeys.default` | Offer at signup; primary login method | 2026 default for new apps |
| `session.timeout` | 15 min (financial actions), 7 days (general) | Contextual timeout |
| `session.activeSessionsUI` | device, platform, location, last-active, revoke | Full session management |
| `session.newLoginAlert` | push notification for unrecognized device | "Was this you?" with action buttons |
| `session.suspiciousDetection` | new country, new device class → alert | Behavioral detection |
| `session.revokeAllBiometric` | biometric-gated "revoke all other sessions" | High-stakes action protection |
| `privacy.postureScore` | Strong (3+), Moderate (2), Basic (1), Open (0) | Gamified privacy |
| `privacy.togglesPersisted` | personalizedAds, recommendationPersonalization, thirdPartySharing, analyticsOptOut — all backend-persisted | Not local-state-only |
| `privacy.dataExport` | 8+ categories, async, email/in-app delivery, completion notification | GDPR portability |
| `privacy.dataDeletion` | cascade across all tables, 30-day grace period, in-flight transaction handling | GDPR erasure |
| `privacy.manifest.ios` | `PrivacyInfo.xcprivacy` with all data types + required-reason APIs | App Store mandatory |
| `privacy.att.prompt` | if any SDK tracks; `NSUserTrackingUsageDescription` present | App Store compliance |
| `kyc.tiers` | T1: email+age, T2: phone, T3: ID document | Progressive KYC |
| `kyc.badges` | verified badge on profile, listing cards, seller rows, checkout | Visible trust signal |
| `kyc.preFlowExplanation` | "Why verification?" screen before KYC form | Reduces drop-off |
| `fraud.detection` | device fingerprint, velocity, Stripe Radar | Backend + visible signals |
| `buyerProtection.badge` | visible on checkout and listing detail | Trust signal |

---

## 11. What "feels AI-made" here, and how to patch it

| AI tell in current state | Patch |
|---|---|
| Privacy toggles are local-state-only (don't persist or control) | Wire to backend API; remove demo mode |
| `DATA_PRIVACY_DEMO_MODE = __DEV__` — privacy controls are demo-only in dev | Make controls functional in all environments |
| Web biometric returns `authenticated` with no check | Return `unavailable` on web |
| No biometric auto-lock on background | Add AppState listener → reset() |
| No biometric timeout (gate stays open for screen lifetime) | 5-min timeout for financial screens |
| Biometric only on wallet/payments, not on account deletion, password change, 2FA disable | Extend BiometricGate to all sensitive actions |
| No breached-password check | HIBP k-anonymity API |
| No Passkey support (2026 default) | Integrate expo-passkeys or FIDO2 |
| No new-login push notification | Push on unrecognized device login |
| No TOTP rate-limiting | 5 attempts / 5 min, then lockout |
| `toLocaleDateString('en-GB')` in ActiveSessionsScreen | Use active locale (per Report #26) |
| No "Why verification?" pre-flow explanation | Add info screen before KYC form |

**What's already well-built (not AI-slop):**
- BiometricGate with truthful unavailable state — genuinely senior engineering
- TOTP implementation (totp.ts) — RFC 6238 compliant with drift, recovery codes
- TwoFactorSetupScreen — full lifecycle with QR, manual key, recovery codes, disable flow
- ActiveSessionsScreen — session list with revoke single + revoke others
- Privacy posture score — gamified privacy, excellent trust signal
- DataExportScreen — 8 data categories, real API call
- Backend GDPR pipeline — gdpr_requests table with audit trail
- Apple Privacy Manifest + withPrivacyManifest plugin — App Store compliant
- KYC provider integration — real session creation, not fake

The security/privacy UX in ThryftVerse is significantly more mature than the i18n or push notification systems. The defects are gaps (missing biometric on some actions, non-functional toggles, no Passkeys) rather than foundational failures. The path to flagship is filling the gaps, not rebuilding the foundation.

---

*Generated 2026-08-18 by the ThryftVerse flagship research programme. Live 2026 web benchmark + production codebase audit + psychology + micro/macro prescription. Sources: SecureCodingHub, YuSMP, Frenchy Digital, Android Developers, OrtemTech, Apple Privacy Manifest docs, NIST SP 800-63B, OWASP Mobile Top 10 2024.*
