# EAS Build Configuration — Production Launch Checklist

This document accompanies `eas.json`. JSON does not support comments, so every
value that MUST be replaced before a production build is documented here.

> **Do NOT put real secrets in `eas.json`.** Secrets are injected via EAS
> environment variables / the Expo dashboard, or via CI secrets. This file
> only records which keys are currently placeholders and what they must be
> replaced with.

---

## 1. `EXPO_PUBLIC_SENTRY_DSN` — REQUIRED before production build

**Current value in every profile:** `""` (empty string)

**What it must be:** the real Sentry DSN for the ThryftVerse project
(e.g. `https://<key>@o<org>.ingest.sentry.io/<project>`).

**Where to set it:**
- Preferred — as an EAS secret so it is never committed:
  ```bash
  eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value "<real DSN>"
  ```
  Then remove the literal `EXPO_PUBLIC_SENTRY_DSN` entry from `eas.json` env
  blocks (EAS injects secrets at build time).
- Alternatively — set it per-profile in the `env` block, but only with a
  non-sensitive DSN. The DSN is public-side, but keeping it in EAS secrets
  avoids accidental rotation churn in source control.

**Why it matters:** without a real DSN, the Sentry native integration
initialises with an empty DSN and silently drops every crash/error report.
Production crashes would be invisible. Per AGENTS.md §11 we do not claim
crash reporting is active when the DSN is empty.

**Profiles affected:** `development`, `preview`, `production`.

---

## 2. `ascAppId` — REQUIRED before iOS production submit

**Current value:** `"1234567890"` (placeholder)

**What it must be:** the real Apple App Store Connect App ID (the numeric ID
from App Store Connect → App Information → General App Information). It is a
9–10 digit number, NOT the bundle identifier.

**Where to set it:** `submit.production.ios.ascAppId` in `eas.json`.

**Why it matters:** EAS Submit uses this to target the correct app record in
App Store Connect. A wrong/placeholder value will cause the submit step to
fail or, worse, target the wrong app.

---

## 3. `appleTeamId` — REQUIRED before iOS production submit

**Current value:** `"ABCDE12345"` (placeholder)

**What it must be:** the real Apple Developer Team ID (10-character alphanumeric,
visible in the Apple Developer portal → Membership → Team ID).

**Where to set it:** `submit.production.ios.appleTeamId` in `eas.json`.

**Why it matters:** EAS Submit uses the Team ID to select the correct signing
identity / API key for authentication. A placeholder will fail the submit.

---

## 4. `appleId` — verify before submit

**Current value:** `"dev@thryftverse.com"`

**What it must be:** the Apple ID of an App Manager / Admin account that has
access to the ThryftVerse app record in App Store Connect. Verify this is the
correct production account (not a personal dev account).

---

## 5. `google-play-service-account.json` — verify before Android submit

**Current path:** `./keys/google-play-service-account.json`

**What it must be:** a real Google Play service account JSON key with
permissions to upload to the production track. The file must exist at that
path at submit time and must NOT be committed to source control (it is
already covered by `.gitignore` for the `keys/` directory — verify this).

---

## Summary of placeholders that MUST be replaced

| Key | Profile / path | Current placeholder | Action |
|-----|----------------|---------------------|--------|
| `EXPO_PUBLIC_SENTRY_DSN` | all build profiles | `""` | Set real DSN via EAS secret |
| `ascAppId` | `submit.production.ios` | `1234567890` | Replace with real App Store Connect ID |
| `appleTeamId` | `submit.production.ios` | `ABCDE12345` | Replace with real Apple Developer Team ID |
| `appleId` | `submit.production.ios` | `dev@thryftverse.com` | Verify correct production Apple ID |
| `google-play-service-account.json` | `submit.production.android` | path | Verify file exists & is gitignored |

A production build/submit MUST NOT proceed while any of the above are still
placeholders.
