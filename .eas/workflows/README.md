# EAS Workflows

Expo EAS Workflow CI/CD pipelines for the ThryftVerse mobile application.

These workflows run on Expo's cloud runners — macOS for iOS builds, Linux for
Android builds and OTA updates — so there is no runner management, no Xcode
installer step, and no self-hosted infrastructure to maintain.

## Workflows

### 1. `build.yml` — Build

**Triggers on:** every push to `main`.

**What it does:**

1. **Typecheck** (Linux runner) — installs dependencies with `npm ci`, runs
   `tsc --noEmit`, then runs the test suite. Both downstream build jobs depend
   on this job, so a type or test failure short-circuits the pipeline.
2. **Android development build** — builds the `development` profile for Android
   (APK, internal distribution, `development` channel).
3. **iOS development build** — builds the `development` profile for iOS
   (simulator, internal distribution, `development` channel).

These are development-client builds distributed internally so engineers can
iterate against the latest `main` commit.

### 2. `preview.yml` — Preview OTA Update

**Triggers on:** every push to `main`.

**What it does:**

1. **Publish OTA update** (Linux runner) — installs dependencies and publishes
   an Expo Update to the `preview` channel with `eas update --auto`.

Devices subscribed to the `preview` channel receive the JavaScript bundle and
assets over the air without a new native binary. This is the staging surface
for QA before a production rollout.

### 3. `production.yml` — Production Deploy

**Triggers on:** every push to a `release/*` branch.

**What it does, in order:**

1. **Check fingerprint** — computes the native fingerprint for both platforms
   to determine whether the current release commit is compatible with an
   existing production build.
2. **Find compatible build** — searches EAS for an existing production build
   whose fingerprint matches. If one exists, the pipeline reuses it instead of
   rebuilding.
3. **Build if needed** — only runs when no compatible build was found. Produces
   a new production build for both platforms (`production` profile: AAB for
   Android, app archive for iOS).
4. **Submit to stores** — submits the production build to Google Play
   (internal track) and App Store Connect.
5. **Publish OTA update** — publishes a production OTA update to the
   `production` channel, initially rolled out to 1% of users
   (`--rollout-percentage=1`). The rollout can be increased from the Expo
   dashboard once the release is confirmed healthy.

This workflow implements a fingerprint-aware deploy: when only JavaScript
changes ship, no native rebuild or store submission is needed and the OTA
update goes out immediately. When native dependencies change, a new binary is
built and submitted before the OTA update is published.

## EAS credentials setup

Before these workflows can run, the following credentials must be configured
once per environment:

### Expo account

```bash
cd frontend
eas login
eas build:configure
```

This creates the project on Expo and links the `projectId` in
`app.json` / `app.config.js`.

### Apple (iOS)

- An Apple Developer account enrolled in the Apple Developer Program.
- App Store Connect app created with a matching Bundle Identifier.
- Run `eas credentials` to provision the app-specific password, signing key,
  and provisioning profile. The Apple ID, Team ID, and ASC App ID are stored
  in the `submit.production.ios` block of `eas.json`.

### Google (Android)

- A Google Play Console service account with the JSON key saved to
  `frontend/keys/google-play-service-account.json` (path referenced in
  `submit.production.android` of `eas.json`).
- The service account must be granted release management permissions for the
  app in the Play Console.

### FCM / push (if applicable)

- Configure Firebase project and download `google-services.json` into
  `frontend/` for Android push notifications.

## Monitoring workflow runs

Workflow runs can be monitored in three ways:

### Expo dashboard

Open the project on [expo.dev](https://expo.dev) → **Workflows** tab. Each run
shows the triggering branch, commit, job status, logs, artifacts, and
duration.

### EAS CLI

```bash
eas workflow:run        # trigger a workflow manually
eas workflow:list       # list recent runs
```

### Build artifacts

- Development and preview builds are distributed via the internal distribution
  link shown in the workflow run.
- Production builds appear under **Builds** in the Expo dashboard and are
  submitted to the stores automatically by the `submit` job.
- OTA updates appear under **Updates** and can be rolled back or throttled
  from the dashboard.
