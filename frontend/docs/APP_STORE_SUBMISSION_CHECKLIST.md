# App Store Submission Checklist

This document lists every credential, asset, and configuration value that must be
provided **before** submitting ThryftVerse to the App Store and Google Play.

The `eas.json` `submit.production` section currently contains placeholder values.
None of the real credentials are committed to the repository. Each item below
must be obtained and filled in before running `eas submit --profile production`.

---

## 1. App Store Connect App ID (`ascAppId`)

**Current placeholder:** `"1234567890"`

**What it is:** The numeric App ID that App Store Connect uses to identify your
app. EAS Submit needs this to know which app record to upload the build to.

**How to find it:**

1. Sign in to [App Store Connect](https://appstoreconnect.apple.com).
2. Go to **My Apps** and select (or create) the ThryftVerse app.
3. Go to **App Information** → **General Information**.
4. The **Apple ID** field shows the numeric App ID (e.g. `1571234567`).
5. Alternatively, open the app in App Store Connect and read the numeric ID
   from the URL: `https://appstoreconnect.apple.com/apps/{ascAppId}`.

**Where to set it:** `frontend/eas.json` → `submit.production.ios.ascAppId`

---

## 2. Apple Team ID (`appleTeamId`)

**Current placeholder:** `"ABCDE12345"`

**What it is:** Your Apple Developer Program Team ID — a 10-character alphanumeric
string that identifies your development team. EAS Submit uses it to associate the
build with the correct signing team.

**How to find it:**

1. Sign in to the [Apple Developer Member Center](https://developer.apple.com/account).
2. Go to **Membership** → **Membership Details**.
3. The **Team ID** is listed there (e.g. `A1B2C3D4E5`).
4. If you belong to multiple teams, use the team that owns the ThryftVerse app
   record in App Store Connect.

**Where to set it:** `frontend/eas.json` → `submit.production.ios.appleTeamId`

---

## 3. Apple ID (`appleId`)

**Current placeholder:** `"dev@thryftverse.com"`

**What it is:** The email address of the Apple Developer account that has access
to the ThryftVerse app in App Store Connect. EAS Submit uses this for
authentication (app-specific password or 2FA flow).

**How to obtain it:**

1. Use the email address registered to the Apple Developer account that owns
   or has access to the ThryftVerse app.
2. Ensure the account has **App Manager** or **Admin** role in App Store Connect.
3. Generate an **app-specific password** for EAS Submit:
   - Sign in to [appleid.apple.com](https://appleid.apple.com).
   - Go to **Sign-In and Security** → **App-Specific Passwords**.
   - Generate a password labeled "EAS Submit".
   - EAS will prompt for this password on first submit, or set it via
     `eas credentials` / environment variables.

**Where to set it:** `frontend/eas.json` → `submit.production.ios.appleId`

---

## 4. Google Play Service Account JSON (`serviceAccountKeyPath`)

**Current placeholder path:** `"./keys/google-play-service-account.json"`

**What it is:** A JSON key file for a Google Cloud service account that has been
granted permission to manage your app on Google Play. EAS Submit uses this to
authenticate with the Google Play Developer API.

**How to create it:**

1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Select or create the project associated with your Google Play Developer account.
3. Go to **IAM & Admin** → **Service Accounts** → **Create Service Account**.
4. Name it (e.g. `eas-submit-thryftverse`) and click **Create and Continue**.
5. Skip role assignment for now, click **Done**.
6. Click the new service account → **Keys** tab → **Add Key** → **Create new key**.
7. Choose **JSON** format and click **Create**. The JSON file downloads.
8. Store this file securely at `frontend/keys/google-play-service-account.json`
   (add `keys/` to `.gitignore` — it must never be committed).
9. Grant the service account access in Google Play Console:
   - Go to [Google Play Console](https://play.google.com/console).
   - **Users and permissions** → **Invite new users**.
   - Enter the service account email (found in the JSON as `client_email`).
   - Grant **Admin** (or at minimum, release management) permissions for the app.
10. Ensure the Google Play Developer API is enabled in the Google Cloud project.

**Where to set it:** `frontend/eas.json` → `submit.production.android.serviceAccountKeyPath`

---

## 5. App Store Icon (1024×1024)

**Current file:** `frontend/assets/icon.png`

**Requirement:** The App Store icon must be exactly **1024×1024 pixels**, PNG,
without alpha (no transparency), without rounded corners (Apple applies the mask
automatically), and without any badge or text overlay.

**Verification steps:**

1. Verify dimensions:
   ```bash
   # On macOS:
   sips -g pixelWidth -g pixelHeight frontend/assets/icon.png
   # Or use any image inspection tool.
   ```
2. If the dimensions are not 1024×1024, regenerate the icon at the correct size.
3. Ensure the icon has no transparency (flatten onto a solid background if needed).
4. The same `icon.png` is referenced by `app.json` → `expo.icon` and is used
   for both the App Store listing and the in-app icon.

**Status:** `icon.png` exists (393,493 bytes). Dimensions must be verified to be
exactly 1024×1024 before submission.

---

## 6. Launch Screen / Splash Icon Asset

**Current file:** `frontend/assets/splash-icon.png`

**Requirement:** Expo's `expo-splash-screen` plugin uses this image. For best
results it should be a high-resolution PNG (recommended 1242×2436 or at minimum
1024×1024) with `resizeMode: "contain"` so it scales correctly across all device
sizes.

**Verification steps:**

1. Confirm `splash-icon.png` exists in `frontend/assets/` — **CONFIRMED PRESENT**.
2. Verify the image is high-resolution and renders cleanly on a white background
   (the splash `backgroundColor` is set to `#ffffff` in `app.json`).
3. Ensure the icon has adequate padding so it is not clipped on notched devices.

**Status:** `splash-icon.png` exists (17,547 bytes). Verify visual quality on
real devices before submission.

---

## 7. Privacy Policy Live URL

**Requirement:** Both Apple App Store and Google Play require a live, publicly
accessible privacy policy URL before submission.

**Steps:**

1. Draft the privacy policy covering:
   - Data collected (account info, photos, listings, analytics)
   - How data is used
   - Third-party services (Sentry, Expo, etc.)
   - User rights and data deletion
   - Contact information
2. Publish it at a stable URL, e.g. `https://thryftverse.com/privacy-policy`.
3. Enter the URL in:
   - **App Store Connect:** App Information → Privacy Policy URL
   - **Google Play Console:** App content → Privacy Policy
4. Also reference it in the app's in-app settings/legal screen.

**Status:** Must be created and published before submission.

---

## 8. Terms of Service Live URL

**Requirement:** Apple and Google both expect a live terms of service URL.

**Steps:**

1. Draft the terms of service covering:
   - Acceptable use
   - Listing and transaction rules
   - Intellectual property
   - Liability and disclaimers
   - Account termination
2. Publish it at a stable URL, e.g. `https://thryftverse.com/terms-of-service`.
3. Enter the URL in App Store Connect and Google Play Console where applicable.
4. Reference it in the app's in-app settings/legal screen.

**Status:** Must be created and published before submission.

---

## 9. Account Deletion URL

**Requirement:** Apple App Store Review Guideline 5.1.1(v) requires that any app
which allows account creation must also provide a way to initiate account
deletion from within the app and from the web. Google Play has a similar
requirement.

**Steps:**

1. Implement an account deletion endpoint in the backend.
2. Provide a web-accessible URL, e.g.
   `https://thryftverse.com/account/delete` or
   `https://api.thryftverse.com/account/deletion`.
3. Implement an in-app account deletion flow (Settings → Account → Delete
   Account) that calls the backend and confirms deletion.
4. Enter the URL in:
   - **App Store Connect:** App Information → Account Deletion URL (if
     applicable to your configuration)
   - **Google Play Console:** App content → Data safety → Account deletion
5. Ensure the flow genuinely deletes the account and associated data (not just
   a local sign-out). See AGENTS.md §11 Truthful UI.

**Status:** Must be implemented and live before submission.

---

## 10. Sign in with Apple Configuration

**Requirement:** If ThryftVerse offers any third-party or social sign-in option
(e.g. Google Sign-In, email/password), Apple App Store Review Guideline
4.8 requires that **Sign in with Apple** is also offered as an equivalent option.

**Steps:**

1. Determine whether any social/third-party sign-in is offered in the app.
2. If yes:
   - Enable the **Sign in with Apple** capability in App Store Connect:
     **Certificates, Identifiers & Profiles** → your App ID → **Sign in with
     Apple**.
   - Configure the service ID and key for Sign in with Apple.
   - Implement the Sign in with Apple flow in the app using
     `expo-apple-authentication`.
   - Ensure the backend can validate the Apple identity token.
3. If no third-party sign-in is offered (only email/password), Sign in with
   Apple is not strictly required, but is recommended for best UX.
4. Document the decision in this checklist.

**Status:** Verify whether social sign-in is offered. If so, Sign in with Apple
must be configured and implemented before submission.

---

## Summary Table

| # | Item | Current Status | Action Required |
|---|------|---------------|-----------------|
| 1 | App Store Connect App ID | Placeholder `1234567890` | Find real ASC App ID and set in `eas.json` |
| 2 | Apple Team ID | Placeholder `ABCDE12345` | Find real Team ID and set in `eas.json` |
| 3 | Apple ID | Placeholder `dev@thryftverse.com` | Set real developer account email |
| 4 | Google Play service account JSON | Placeholder path | Create service account, download JSON, store in `keys/` |
| 5 | 1024×1024 App Store icon | `icon.png` exists | Verify dimensions are exactly 1024×1024 |
| 6 | Splash icon | `splash-icon.png` exists | Verify visual quality on devices |
| 7 | Privacy policy URL | Not created | Draft, publish, and register URL |
| 8 | Terms of service URL | Not created | Draft, publish, and register URL |
| 9 | Account deletion URL | Not created | Implement backend + in-app flow, publish URL |
| 10 | Sign in with Apple | Not configured | Required if other social sign-in is offered |

---

## Submission Command (after all items are resolved)

```bash
# iOS
eas submit --platform ios --profile production

# Android
eas submit --platform android --profile production
```

> **Note:** The `track` in `eas.json` has been set to `"production"` (correct
> for launch). The previous value `"internal"` would have published to the
> internal testing track only.
