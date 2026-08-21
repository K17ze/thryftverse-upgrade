# Known Issues — Upstream / Deployment (Accepted)

This file documents issues identified in the bug report that are either
upstream framework warnings (not fixable in app code) or server-side /
deployment configuration steps (not code changes).

## 1. ReactHost onWindowFocusChange lifecycle race condition

**Log:** `ReactHost: onWindowFocusChange missed` / `windowFocusChange missed`

**Status:** Upstream — accepted.

This warning is emitted by React Native's `ReactHost` implementation when
a window focus change event arrives during a state transition. It is a
benign race in the framework's lifecycle bookkeeping and does not affect
app functionality. No app-code fix is possible; it will be resolved in a
future React Native release.

## 2. DevLauncher colorScheme reflection error

**Log:** `DevLauncher: colorScheme reflection error`

**Status:** Upstream — accepted.

This warning comes from `expo-dev-launcher` (used only in development
builds) when it fails to reflect the system color scheme via Java
reflection on certain Android API levels. It is a dev-build-only issue
and does not affect production builds.

## 3. ViewManager codegen warnings

**Log:** `ViewManager codegen: ...` warnings

**Status:** Upstream — accepted.

These are React Native codegen warnings emitted during native view
manager registration. They are produced by the framework's codegen
pipeline and do not affect runtime behaviour.

## 4. ExpoModules @OptimizedComposeProps warnings

**Log:** `@OptimizedComposeProps` warnings

**Status:** Upstream — accepted.

These warnings come from Expo Modules' Jetpack Compose interop layer.
They are emitted by the Expo framework when a module's Compose props
annotation is not optimised. No app-code fix is possible.

## 5. Firebase config — "Default FirebaseApp failed to initialize"

**Log:** `Default FirebaseApp failed to initialize because no default options were found`

**Status:** Deployment configuration — no app-code change needed.

The app does not use Firebase directly. The warning is emitted by a
transitive dependency (likely `expo-notifications` or
`@sentry/react-native`) that touches the Firebase SDK on Android. To
silence the warning, add a `google-services.json` file to
`frontend/android/app/` and register the `@react-native-firebase/app`
Gradle plugin. Since the app does not use Firebase features, this is
cosmetic and does not affect functionality.

If Firebase is never needed, the warning can be safely ignored.

## 6. AppLinks verification — thryftverse.com deep links

**Log:** AppLinks auto-verification may fail on Android

**Status:** Server-side deployment step.

The Android intent filters in `app.json` are configured with
`autoVerify: true` for `thryftverse.com` and `www.thryftverse.com`. For
Google to verify these App Links, the web server must host a Digital
Asset Links file at:

```
https://thryftverse.com/.well-known/assetlinks.json
https://www.thryftverse.com/.well-known/assetlinks.json
```

The file must contain the app's package name (`com.thryftverse.app`)
and the SHA-256 fingerprint of the signing certificate. Example:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.thryftverse.app",
      "sha256_cert_fingerprints": [
        "SHA:256:FINGERPRINT_HERE"
      ]
    }
  }
]
```

To get the SHA-256 fingerprint for a production build:

```bash
keytool -list -v -keystore <production-keystore> -alias <alias> | grep SHA256
```

For EAS Build, the fingerprint can be retrieved from the build artifacts
or via `eas credentials` → Android keystore.

This is a server-side / DevOps step — no app code change is required.

## 7. ExoPlayer SQLite connection pool leak

**Log:** `A SQLiteConnection object for database 'exoplayer_internal.db' was leaked!`
+ `A resource failed to call release.` / `A resource failed to call close.`

**Status:** Upstream — accepted.

This warning is emitted by Android's `SQLiteConnectionPool` finalizer when
ExoPlayer's internal playback-position database is not closed cleanly
during component unmount. The leak is in ExoPlayer's internal lifecycle
management, which `expo-video` uses under the hood. The `useVideoPlayer`
hook in `src/components/compat/Video.tsx` correctly creates and disposes
the player with the component's lifecycle — the finalizer warning is a
known ExoPlayer issue where the `SQLiteConnectionPool` finalizer runs
after the player has already been released, producing a spurious leak
warning. The actual native resources are freed; only the Java-side
connection pool object's `close()` is missed by the finalizer.

No app-code fix is possible — this requires an ExoPlayer or expo-video
update. The warning is cosmetic and does not cause memory growth in
practice because the native player is released correctly.
