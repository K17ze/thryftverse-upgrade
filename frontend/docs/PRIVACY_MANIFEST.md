# Apple Privacy Manifest (`PrivacyInfo.xcprivacy`)

This document explains the Apple Privacy Manifest shipped with ThryftVerse,
how it is wired into the Expo build, and how to maintain it as the app evolves.

---

## 1. What is `PrivacyInfo.xcprivacy`?

`PrivacyInfo.xcprivacy` is an Apple-required property list that declares the
data your app collects and the "Required Reason" APIs it accesses. As of the
2026 App Store review guidelines, any app that ships third-party SDKs from
Apple's "commonly used SDK" list **must** include this manifest in its bundle.

The manifest has four top-level sections:

| Key | Purpose |
| --- | --- |
| `NSPrivacyTracking` | Whether the app tracks users per App Tracking Transparency. `false` for ThryftVerse — no ad tracking. |
| `NSPrivacyTrackingDomains` | Domains used for tracking. Empty — ThryftVerse does not track. |
| `NSPrivacyCollectedDataTypes` | The categories of user data the app collects, whether each is linked to the user's identity, and the purposes. |
| `NSPrivacyAccessedAPITypes` | "Required Reason" APIs the app (or its SDKs) touch, each with an approved reason code. |

The file lives at `frontend/PrivacyInfo.xcprivacy` and is copied into the
generated iOS project at prebuild time by the `withPrivacyManifest` config
plugin (see §3).

---

## 2. Feature → declared data type mapping

Every entry in `NSPrivacyCollectedDataTypes` maps to a real ThryftVerse
feature. When you add a feature that collects new data, add the corresponding
entry here.

| Data type | Linked | Purposes | Source feature |
| --- | --- | --- | --- |
| `NSPrivacyCollectedDataTypeEmailAddress` | yes | App Functionality | Account creation, auth, support contact |
| `NSPrivacyCollectedDataTypeName` | yes | App Functionality | User profile display name |
| `NSPrivacyCollectedDataTypePhotosorVideos` | yes | App Functionality | User-generated listing/poster media |
| `NSPrivacyCollectedDataTypePurchaseHistory` | yes | App Functionality | Marketplace transactions & order history |
| `NSPrivacyCollectedDataTypeCrashData` | no | App Functionality, Analytics | Sentry crash reporting |
| `NSPrivacyCollectedDataTypePerformanceData` | no | App Functionality, Analytics | EAS Obobserve / performance monitoring |
| `NSPrivacyCollectedDataTypeDeviceID` | no | App Functionality | Push notifications (Expo Notifications token) |

### Required Reason APIs declared

| API category | Reason code | Meaning |
| --- | --- | --- |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1` | Displaying file timestamps to the user (listing media metadata) |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | App functionality (preferences, auth session persistence) |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1` | App functionality (media cache management) |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` | App functionality (timing/telemetry) |

> Reason codes must match Apple's published approved reasons. See
> <https://developer.apple.com/documentation/bundleresources/privacy_manifest/describing_required_reasons>.

---

## 3. How it is wired into the build

ThryftVerse uses the Expo managed workflow. The manifest is injected via a
custom config plugin rather than a bare native project file.

### Plugin

`frontend/plugins/withPrivacyManifest.js`:

- Uses `withXcodeProject` from `@expo/config-plugins`.
- Copies `frontend/PrivacyInfo.xcprivacy` into the generated iOS project
  directory during `expo prebuild`.
- Adds the file to the app target's `PBXResourcesBuildPhase` so it is bundled
  into the final `.app`.

### Registration

The plugin is registered in `frontend/app.json` under `expo.plugins`:

```json
"plugins": [
  "./plugins/withPrivacyManifest",
  // ...other plugins
]
```

No `infoPlist` entry is required — the manifest is a bundled resource, not an
Info.plist key. Apple detects it by filename inside the app bundle.

---

## 4. Updating the manifest

When you add a new data collection or a new third-party SDK:

1. Identify the data category(ies) the feature collects.
2. Add a `<dict>` entry to the `NSPrivacyCollectedDataTypes` array with:
   - `NSPrivacyCollectedDataType` — the Apple constant
   - `NSPrivacyCollectedDataTypeLinked` — `true` if linked to user identity
   - `NSPrivacyCollectedDataTypeTracking` — `false` unless it contributes to
     ad tracking (ThryftVerse does not track)
   - `NSPrivacyCollectedDataTypePurposes` — one or more approved purpose strings
3. If the feature touches a new Required Reason API, add an entry to
   `NSPrivacyAccessedAPITypes` with the correct reason code.
4. Update the table in §2 of this document.
5. Validate the plist syntax (see §5).
6. Run `npx tsc --noEmit` and `expo prebuild --clean` to confirm the build
   still succeeds.

---

## 5. Verifying the manifest

### Validate XML plist syntax

```bash
python -c "import plistlib; plistlib.load(open('frontend/PrivacyInfo.xcprivacy', 'rb'))"
```

A successful run prints nothing and exits 0.

### Confirm it lands in the build

After `expo prebuild` (or an EAS build), inspect the generated native project:

```bash
ls ios/PrivacyInfo.xcprivacy
```

The file should also appear in the app bundle after building:

```bash
find ios/build -name "PrivacyInfo.xcprivacy"
```

### App Store Connect validation

When submitting via EAS Submit, App Store Connect will parse the manifest
automatically. If a Required Reason API is used but not declared, the upload
will be rejected with a clear list of missing declarations.

---

## 6. Google Play Data Safety form

`store.config.json` (EAS Metadata) carries the Google Play listing, but the
Data Safety form is submitted in the Play Console. The data types declared in
`PrivacyInfo.xcprivacy` should be mirrored in the Play Console Data Safety
form to keep both stores consistent.

| Apple data type | Play Console equivalent |
| --- | --- |
| Email address | Personal → Email |
| Name | Personal → Name |
| Photos and videos | Personal → Photos and videos |
| Purchase history | Financial → Purchase history |
| Crash data | App activity → App information |
| Performance data | App activity → App information |
| Device ID | Device or other IDs → Device or other IDs |
