# Maestro E2E Tests — ThryftVerse

This directory contains [Maestro](https://maestro.mobile.dev) E2E flow files
for the ThryftVerse React Native app. Maestro is the modern, YAML-driven E2E
framework for React Native / iOS / Android.

> **Status:** Scaffolding. These flows define the critical user journeys that
> must pass before a production release. They are the E2E layer of the testing
> pyramid described in `docs/TESTING_GUIDE.md`.

---

## 1. Install Maestro

Maestro is a **CLI tool**, not an npm dependency. Do **not** add it to
`package.json`. Install it on your machine (and CI runners) directly.

### macOS (recommended)

```bash
# Homebrew (easiest)
brew install maestro

# OR the official installer (works on Linux too)
curl -Ls "https://get.maestro.mobile.dev" | bash
```

### Linux

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
# Then add ~/.maestro/bin to your PATH
export PATH="$HOME/.maestro/bin:$PATH"
```

### Windows

Maestro runs inside WSL2 on Windows. Install WSL2, then use the Linux
installer above from inside the WSL shell. Native Windows is **not** supported.

Verify the install:

```bash
maestro --version
```

### Prerequisites

- **Android:** Android Studio + an emulator (API 30+) or a physical device
  with USB debugging enabled.
- **iOS:** Xcode + a Simulator booted (`xcrun simctl boot "iPhone 15"`), or a
  physical device with a development build installed.

---

## 2. App ID configuration

Every flow uses the `${MAESTRO_APP_ID}` environment variable so the same flow
files work on both platforms without editing:

```yaml
appId: ${MAESTRO_APP_ID}
```

Set the variable before running. The ThryftVerse app IDs (from `app.json`) are:

| Platform | App ID |
|----------|--------|
| iOS      | `com.thryftverse.app` |
| Android  | `com.thryftverse.app` |

```bash
# macOS / Linux
export MAESTRO_APP_ID=com.thryftverse.app

# PowerShell
$env:MAESTRO_APP_ID = "com.thryftverse.app"
```

---

## 3. Test build preparation

Maestro drives a **real installed app**, not the Metro bundler. Build and
install a development or EAS build first:

```bash
# Android (development build on a booted emulator / device)
npm run android
# or: eas build --profile development --platform android

# iOS (Simulator)
npm run ios
# or: eas build --profile development --platform ios
```

For the **navigation**, **search**, and **item-detail** flows the app must
already be past onboarding and auth. Either:

1. Run `onboarding-flow.yml` first (it completes onboarding), then sign in
   manually once, **or**
2. Use a build with onboarding + auth pre-seeded (recommended for CI).

The `app-launch.yml` and `onboarding-flow.yml` flows use `clearState: true` so
they always boot into the first-run state.

---

## 4. Running the flows

### Run a single flow

```bash
maestro test .maestro/app-launch.yml
```

### Run all flows

```bash
npm run test:e2e
# equivalent to: maestro test .maestro/
```

### Run the smoke subset (fast feedback)

```bash
npm run test:e2e:smoke
# equivalent to: maestro test .maestro/app-launch.yml .maestro/navigation-flow.yml
```

### Run on a specific device

```bash
maestro test --device "iPhone 15" .maestro/app-launch.yml
maestro test --device "Pixel_7_API_33" .maestro/app-launch.yml
```

### Screenshots

Every flow captures screenshots via `takeScreenshot`. They are written to the
current directory (or `--output` folder) and can be used as the baseline for
the visual-regression plan in `src/__tests__/visualRegressionPlan.test.ts`.

```bash
maestro test .maestro/ --output .maestro/screenshots
```

---

## 5. Flow inventory

| Flow | File | What it covers | `clearState` |
|------|------|----------------|--------------|
| App launch | `app-launch.yml` | App boots and renders within 5s | `true` |
| Onboarding | `onboarding-flow.yml` | Age gate → 4 slides → AuthLanding | `true` |
| Navigation | `navigation-flow.yml` | Home → Explore → Create → Inbox → Profile | `false` |
| Search | `search-flow.yml` | Explore → type "vintage denim" → results | `false` |
| Item detail | `item-detail-flow.yml` | Explore → Browse → first item → detail | `false` |

---

## 6. CI integration

Maestro runs headless on CI runners with an Android emulator. iOS Simulator
works on macOS runners.

### GitHub Actions — Android smoke (Linux runner)

```yaml
name: E2E (Android)
on: [pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    env:
      MAESTRO_APP_ID: com.thryftverse.app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 33
          script: |
            curl -Ls "https://get.maestro.mobile.dev" | bash
            export PATH="$HOME/.maestro/bin:$PATH"
            cd frontend
            npm run android
            npm run test:e2e:smoke
```

### GitHub Actions — iOS (macOS runner)

```yaml
name: E2E (iOS)
on: [pull_request]
jobs:
  e2e:
    runs-on: macos-14
    env:
      MAESTRO_APP_ID: com.thryftverse.app
    steps:
      - uses: actions/checkout@v4
      - run: brew install maestro
      - run: cd frontend && npm run ios
      - run: cd frontend && npm run test:e2e:smoke
```

### Recommendations

- Run `test:e2e:smoke` on every PR (fast, ~2 min).
- Run the full `test:e2e` suite on `main` and on release branches.
- Upload the `.maestro/screenshots` directory as a CI artifact so regressions
  can be reviewed visually.
- Gate production releases on a green E2E smoke run (see AGENTS.md §15
  Production Readiness).

---

## 7. Adding a new flow

1. Copy `app-launch.yml` as a template.
2. Keep `appId: ${MAESTRO_APP_ID}` as the first document.
3. Use `clearState: true` for first-run journeys, `false` for post-auth ones.
4. Add a `takeScreenshot` step at every meaningful checkpoint — these double
   as visual-regression baselines.
5. Prefer `tapOn: label:` (accessibility labels) over `tapOn: text:` so the
   flow survives copy changes.
6. Add the flow to the inventory table above and to `test:e2e:smoke` if it is
   a critical journey.
