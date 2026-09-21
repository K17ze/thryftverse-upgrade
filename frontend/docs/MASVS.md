# OWASP MASVS Assessment — ThryftVerse Mobile App

Self-assessment against OWASP MASVS v2 control groups. Every "Implemented"
row cites the code that enforces it — a claim without a code citation is a
gap, not a control.

Scope: the Expo/React Native app under `frontend/` plus the API contract it
relies on (`backend/api/`). Levels: we target **MASVS-L2** (defence-in-depth)
for auth, storage, and network controls because the app moves money.

## MASVS-STORAGE — protected storage of sensitive data

| Control | Status | Evidence |
|---|---|---|
| Credentials/tokens in hardware-backed storage | Implemented | `src/lib/apiClient.ts` — auth session in `expo-secure-store` (Keychain / Keystore); `AuthSecureStoreUnavailableError` + Sentry report on production refusal instead of silent downgrade |
| No secrets in logs | Implemented | `reportSecureStoreRefusal` logs a redacted reason string only; backend logger redaction covered by `backend/api/docs/SECRETS_AUDIT.md` |
| Non-secret local state | Implemented | `src/storage/mmkv.ts` — MMKV for non-sensitive caches only |
| Privacy manifest accuracy | Implemented | `src/platform/compliance/PrivacyManifest.tsx` |

## MASVS-NETWORK — secure network communication

| Control | Status | Evidence |
|---|---|---|
| TLS everywhere | Implemented | All API/base URLs are HTTPS; no `cleartextTraffic` escape |
| Public-key pinning | Implemented | `src/utils/sslPinning.ts`, `plugins/withTrustKit.js` (iOS), `plugins/withAndroidSecurityXml.js` (Android), runtime pin enforcement via `react-native-ssl-public-key-pinning` |
| Pin freshness guard | Implemented | `scripts/validate-ssl-pins.mjs` fails production builds on placeholder pins; CI job "SSL pin validation" (`frontend-ci.yml`) |
| Pin material provenance | **Gap** | Committed pins are LOCAL DEV self-signed hashes — must be replaced with production SPKI hashes before store submission (see `SSL_PINNING_SETUP.md`) |

## MASVS-RESILIENCE — integrity & anti-tamper

| Control | Status | Evidence |
|---|---|---|
| Device/app integrity attestation | Implemented (contract) | `src/platform/integrity/ThryftIntegrity.ts` — App Attest (iOS) + Play Integrity (Android) native-module contract, verified server-side |
| OTA payload authenticity | Implemented | EAS Update code signing: `keys/update-certificate.pem` committed (public), `private-key.pem` never committed; all publish workflows sign via `--private-key-path` and fail closed without it |
| Production residue hygiene | Implemented | CI jobs "Production residue check", "MockData import boundary" block debug/mock leakage into release builds |
| Runtime jailbreak/root refusal | Partial | Integrity token attestation exists server-side; no additional client-side jailbreak heuristics — acceptable at L2 given server-verified attestation |

## MASVS-AUTH — authentication & session

| Control | Status | Evidence |
|---|---|---|
| Server-side session authority | Implemented | Tokens are server-issued; refresh flow in `src/services/` + `backend/api` token rotation |
| Re-auth for destructive ops | Implemented | Account deletion requires password re-authentication (`backend/api/src/index.ts` GDPR erasure route — a stolen session alone cannot erase) |
| Token storage | Implemented | SecureStore (see STORAGE) |

## MASVS-PRIVACY — user data minimisation & control

| Control | Status | Evidence |
|---|---|---|
| Account deletion (in-app) | Implemented | Settings → Account → Delete account → `backend/api` GDPR erasure (`src/lib/userErasure.ts`, vendor propagation via `src/lib/vendorDeletion.ts`) |
| Account deletion (external URL) | Implemented | `GET /compliance/account-deletion` — public page required by Play "Data deletion" policy |
| Data-category disclosure | Implemented | `GET /compliance/data-categories`, `GET /compliance/privacy-policy` |
| Age gating | Implemented | `src/screens/AgeVerificationScreen.tsx` |

## Known gaps to close before submission

1. **Production SPKI pins** — swap LOCAL DEV hashes for real pins (blocks release; enforced by the build guard, not by this document).
2. **OTA private key material** — `EXPO_OTA_CODE_SIGNING_PRIVATE_KEY` secret must exist in the release environment; all publish paths already fail closed without it.
3. **Secret scanning** — `secret-scan.yml` (gitleaks) must stay green; findings are remediated before merge, never suppressed.
4. **MASVS-CODE platform tests** — binary-level checks (PIE, stack canaries, symbols stripped) are verified by the EAS production profile, not asserted in-repo.
