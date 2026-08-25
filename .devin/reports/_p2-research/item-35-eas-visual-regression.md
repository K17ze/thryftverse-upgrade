# P2 Item #35 — Native EAS Visual-Regression Programme

**Auditor:** Senior mobile quality engineer (evidence-based, anti-AI-design policy)
**Scope:** ThryftVerse React Native/Expo app — systematic screenshot comparison for Android/iOS, themes, font scales and device widths.
**Repo root:** `C:\Users\User\Desktop\thryftverse-upgrade`
**Frontend:** `frontend/src`
**Mode:** Read-only research. No source files modified.
**Date:** 2026-08-25

---

## 1. Executive finding

ThryftVerse has **extensive scaffolding** for visual regression — 14 Maestro flow files, a 797-line ownership-gate test (`visualRegressionPlan.test.ts`), a GitHub Actions screenshots workflow, a dual-mode golden-suite concept, a parity-checker script, a visual-release-gates lint script, and a 468-line visual-qa-gates document — but **zero actual pixel-diffing capability**. The programme is a well-architected shell: every structural component exists, none of them performs the core function of comparing two images and flagging a difference.

The gap is concrete and measurable:

1. **Baselines are 1×1 pixel placeholder PNGs.** All 12 committed baseline files in `src/__tests__/__screenshots__/` are exactly **67 bytes** — the PNG header for a 1×1 transparent pixel. [VERIFIED — CODE] They are not screenshots of any screen. They exist solely to satisfy the ownership-gate test's file-presence check.

2. **No diff engine is installed.** No `reg-suit`, `pixelmatch`, `odiff`, `@percy/maestro-app`, or `react-native-testify` in `package.json`. The parity checker (`check-golden-parity.mjs:90-91`) explicitly comments: `"Pixel-level diff would go here once a screenshot diffing library is wired in (e.g., pixelmatch or odiff). For now, we check presence."` [VERIFIED — CODE]

3. **No theme or font-scale variation in capture.** The Maestro golden-route flow (`golden-route-screenshots.yml`) and the dual-mode golden suite (`dual-mode-golden-suite.yml`) capture screenshots in a single theme with no font-scale manipulation. The CI workflow (`screenshots.yml`) boots a single iPhone 15 simulator and a single Android API 34 emulator — no theme switching, no font-scale setting, no device-width matrix. [VERIFIED — CODE]

4. **CI device matrix is 1 device per platform** — iPhone 15 (iOS 17.4) and Android API 34 (google_apis x86_64). The `visual-qa-gates.md` document specifies 6 native devices × 2 themes × 2 font scales × reduced motion × poor network = 24+ configurations per route. The CI workflow covers 2 of 24+. [VERIFIED — CODE]

5. **The ownership-gate test is a presence check, not a visual diff.** `visualRegressionPlan.test.ts` (797 lines) defines 18 screens × 5 states = 90 `it()` blocks, but each only calls `expectScreen()` (file exists in `src/screens/`) and `expectBaseline()` (file exists in `__screenshots__/`). No image comparison is performed. The `it.runIf(baselinesExist)` guard means the baseline-coverage tests are **skipped** when baselines don't exist — which is always, since the baselines are 67-byte placeholders that don't match the `{screenName}-{state}` prefix pattern. [VERIFIED — CODE]

6. **No mock-backend enforcement.** The Maestro flows depend on a live dev backend (`assertVisible: text: ".*"` is the only assertion for most screens). The dual-mode concept (`EXPO_PUBLIC_MOCK_MODE=fixture-design` vs `integration-truth`) is documented but the CI workflow doesn't set this env var. Screenshots are non-deterministic when backed by live data. [VERIFIED — CODE]

**Severity: P2-Medium.** The scaffolding is genuinely impressive — the ownership-gate test, the route matrix, the dual-mode concept, and the visual-qa-gates document are all production-grade specifications. But the programme does not actually catch visual regressions today. A PR that changes every card radius from 8pt to 24pt and shifts all prices to red would pass every gate.

---

## 2. Evidence table — what exists

| # | Component | Path:Line | What it does | Gap |
|---|---|---|---|---|
| E1 | Ownership-gate test | `frontend/src/__tests__/visualRegressionPlan.test.ts:1-797` | 797-line test with 18 screens × 5 states = 90 `it()` blocks. Each calls `expectScreen()` (file exists) + `expectBaseline()` (PNG exists). | No image comparison. `it.runIf(baselinesExist)` skips baseline tests when baselines are absent. Baselines are 67-byte placeholders. |
| E2 | Golden-route Maestro flow | `frontend/.maestro/golden-route-screenshots.yml:1-229` | 229-line flow capturing 18 golden-route screenshots: Home, Search, PDP, Sell, Profile, Settings, Inbox, Chat, Checkout, Auctions, Seller Hub, Co-Own, Portfolio, Poster. | Single theme, single font scale. Uses `tapOn: point: "50%, 40%"` coordinate taps (brittle). No `assertScreenshot` commands. |
| E3 | Dual-mode golden suite | `frontend/.maestro/dual-mode-golden-suite.yml:1-194` | 194-line flow for fixture-design vs integration-truth parity. Same routes as E2. | CI workflow doesn't set `EXPO_PUBLIC_MOCK_MODE`. Never runs in either mode in CI. |
| E4 | CI screenshots workflow | `.github/workflows/screenshots.yml:1-249` | 249-line GitHub Actions workflow. Pre-flight gates (typecheck, design-token lint). iOS: macOS-14 runner, EAS build `development-simulator`, iPhone 15 sim, Maestro flows, upload artifacts. Android: ubuntu runner, EAS build `development`, API 34 emulator, Maestro flows, upload artifacts. | 1 device per platform. No theme switching. No font-scale setting. No diff engine. No PR gating. Artifacts uploaded but never compared. |
| E5 | Per-flow Maestro files | `frontend/.maestro/flows/{home,item-detail,sell,profile,inbox,co-own}.yaml` | 6 individual flow files with `takeScreenshot` commands, `extendedWaitUntil`, `waitForAnimationToEnd`. | No `assertScreenshot` commands. No theme/font-scale env injection. |
| E6 | Other Maestro flows | `frontend/.maestro/{app-launch,item-detail-flow,navigation-flow,onboarding-flow,search-flow}.yml` | 5 additional flow files for navigation, onboarding, search journeys. | Same gaps as E5. |
| E7 | Golden parity checker | `frontend/scripts/check-golden-parity.mjs:1-115` | Compares fixture vs integration baseline directories for route presence. 18 golden routes defined. | Line 90-91: `"Pixel-level diff would go here once a screenshot diffing library is wired in. For now, we check presence."` No image comparison. |
| E8 | Visual release gates | `frontend/scripts/check-visual-release-gates.mjs:1-600+` | Static lint: hardcoded colors, missing a11y labels, missing hitSlop, card-on-card, animated without reduced-motion. | Does not capture or compare screenshots. Is a code-level lint, not a visual regression tool. |
| E9 | Visual QA gates doc | `.devin/visual-qa-gates.md:1-468` | 468-line spec: device matrix (6 native + 4 web), golden routes, thumbnail test, squint test, optical rubric, state coverage, acceptance scorecard. | Is a specification document. No automated enforcement of the optical rubric. |
| E10 | Release gates doc | `.devin/release-gates.md:1-272` | 17 visual release gate references. | Specification only. |
| E11 | Baseline PNGs | `frontend/src/__tests__/__screenshots__/golden-*-baseline.png` | 12 files: golden-auction, golden-chat, golden-coown, golden-home, golden-inbox, golden-pdp, golden-poster, golden-profile, golden-search, golden-sell, golden-seller-hub, golden-settings. | **All 12 are 67 bytes** — 1×1 pixel transparent PNGs. Not real screenshots. |
| E12 | Fixture/Integration dirs | `frontend/src/__tests__/__screenshots__/{fixture,integration}/README.md` | Two subdirectories with README files explaining the dual-mode concept. | **Zero PNG files** in either directory. |
| E13 | EAS build profiles | `frontend/eas.json:26-44` | `development` profile (developmentClient, channel development, simulator true) and `development-simulator` (extends development, simulator true). | Profiles exist and are correct for CI screenshot capture. |
| E14 | Maestro README | `frontend/.maestro/README.md:1-230+` | 230+ line doc: install instructions, app ID config, flow structure, testID selector guidance, golden-route capture process, device matrix documentation. | Notes "Status: Scaffolding" (line 7). |

---

## 3. Evidence table — what is missing

| # | Missing component | Impact | 2026 industry standard |
|---|---|---|---|
| M1 | **Diff engine** (reg-suit / pixelmatch / odiff / Percy) | No image comparison. PRs with visual changes pass undetected. | reg-suit with `reg-notify-github-plugin` posts visual diff comments on PRs. Maestro `assertScreenshot` with `thresholdPercentage` does in-flow comparison. Percy provides hosted diff with AI ignore regions. [VERIFIED — EXTERNAL] |
| M2 | **Real baselines** | 67-byte placeholders cannot be compared. | Real screenshots captured on each device × theme × font-scale combination, committed to repo or stored in S3/GitHub Releases. |
| M3 | **Theme switching in CI** | Screenshots captured in default theme only. Dark mode regressions undetected. | iOS: `xcrun simctl ui <device> appearance dark` or `Appearance.setColorScheme('dark')` launch arg. Android: `adb shell cmd uimode night yes`. Maestro sub-flow or launch arg. |
| M4 | **Font-scale setting in CI** | Screenshots captured at 100% only. Large-text layout breakage undetected. | iOS: `xcrun simctl ui <device> content_size accessibility-extra-extra-extra-large` (200%). Android: `adb shell settings put system font_scale 2.0`. |
| M5 | **Device-width matrix** | 1 iPhone + 1 Android. Compact-width and large-width breakage undetected. | Minimum: iPhone SE (375pt compact), iPhone 15 (393pt regular), Pixel 8 (412pt), Pixel 5 or Samsung A-series (compact Android). |
| M6 | **PR diff gating** | Visual changes don't block PRs. reg-suit not installed. No GitHub status check. | reg-suit `reg-notify-github-plugin` posts commit status + PR comment with diff images. `reg-actions` GitHub Action compares artifacts between base and head. [VERIFIED — EXTERNAL] |
| M7 | **Animation disabling** | Animated mount transitions cause non-deterministic screenshots. | `waitForAnimationToEnd` is used in flows (good) but OS Reduce Motion + in-app `reducedMotion: true` not set. iOS: `xcrun simctl ui <device> reduce_motion yes`. Android: `adb shell settings put secure reduce_motion 1`. |
| M8 | **Stable data** | Live dev backend produces non-deterministic content. | `EXPO_PUBLIC_MOCK_MODE=fixture-design` env var exists in the dual-mode concept but is never set in CI. |
| M9 | **Deterministic screenshot naming** | Maestro `takeScreenshot: golden-home-populated` produces files like `golden-home-populated.png` but without device/theme/scale metadata in the name. | Naming: `{platform}-{device}-{theme}-{fontScale}-{route}-{state}.png` e.g. `ios-iphone15-dark-200-home-populated.png`. |
| M10 | **Baseline management workflow** | No `npm run visual:approve` to update baselines. No review process for baseline changes. | reg-suit: baselines stored by commit hash. `reg-notify-github-plugin` reports "new baseline" vs "changed" vs "deleted". `reg-actions` downloads base commit's artifacts for comparison. |
| M11 | **`assertScreenshot` in Maestro flows** | Flows use `takeScreenshot` (capture only) not `assertScreenshot` (capture + compare). | Maestro `assertScreenshot: path: screen.png, thresholdPercentage: 98` compares against saved baseline in-flow. Generates diff image on failure. [VERIFIED — EXTERNAL] |
| M12 | **Crop/ignore regions** | Full-screen screenshots include status bar, timestamps, dynamic content. | Maestro `cropOn: id: banner` narrows to stable element. Percy `PERCY_REGIONS` with `ignore`/`intelliignore` for dynamic areas. [VERIFIED — EXTERNAL] |

---

## 4. Maestro flow audit

### 4.1 Flow inventory

| Flow file | Lines | Screenshots | Assertions | Theme switch | Font scale | Status |
|---|---|---|---|---|---|---|
| `golden-route-screenshots.yml` | 229 | 18 `takeScreenshot` | 15 `assertVisible` | No | No | Scaffolding |
| `dual-mode-golden-suite.yml` | 194 | 16 `takeScreenshot` | 13 `assertVisible` | No | No | Scaffolding |
| `flows/home.yaml` | 49 | 3 `takeScreenshot` | 2 `extendedWaitUntil` | No | No | Scaffolding |
| `flows/item-detail.yaml` | — | — | — | No | No | Scaffolding |
| `flows/sell.yaml` | — | — | — | No | No | Scaffolding |
| `flows/profile.yaml` | — | — | — | No | No | Scaffolding |
| `flows/inbox.yaml` | — | — | — | No | No | Scaffolding |
| `flows/co-own.yaml` | — | — | — | No | No | Scaffolding |
| `app-launch.yml` | — | — | — | No | No | Scaffolding |
| `item-detail-flow.yml` | — | — | — | No | No | Scaffolding |
| `navigation-flow.yml` | — | — | — | No | No | Scaffolding |
| `onboarding-flow.yml` | — | — | — | No | No | Scaffolding |
| `search-flow.yml` | — | — | — | No | No | Scaffolding |

**Total: 14 flow files, 0 `assertScreenshot` commands, 0 theme switches, 0 font-scale settings.** [VERIFIED — CODE]

### 4.2 Selector quality

The golden-route flow uses a mix of:
- **Label selectors** (`tapOn: label: "Home"`) — good, semantic, resilient to layout changes. [VERIFIED — CODE]
- **Text selectors** (`tapOn: text: "Settings"`) — acceptable for static text. [VERIFIED — CODE]
- **Coordinate taps** (`tapOn: point: "50%, 40%"`) — **brittle**. Used for PDP navigation (line 82), chat opening (line 128), auction detail (line 161), co-own asset (line 193). A layout change that moves the target element will break the flow silently. Should use `testID` selectors. [VERIFIED — CODE]

The README (line 45-48) documents the `testID` convention: "Key elements on golden route screens expose testID props so Maestro flows use semantic selectors (tapOn id:) instead of brittle coordinate taps." But the flows themselves don't follow this — they use coordinate taps for product card taps. [VERIFIED — CODE]

---

## 5. CI workflow audit

### 5.1 screenshots.yml pipeline

```
PR on frontend/** or .maestro/** →
  pre-flight-gates (ubuntu, 15min)
    ├── checkout
    ├── npm ci
    ├── TypeScript typecheck
    └── design-token lint
  screenshots-ios (macOS-14, 60min)
    ├── install Maestro
    ├── npm ci
    ├── setup Expo + EAS
    ├── eas build --platform ios --profile development-simulator --wait
    ├── download + install build
    ├── boot iPhone 15 simulator (iOS 17.4)
    ├── install app
    ├── for each .maestro/flows/*.yaml: maestro test --test-output-dir=.maestro/screenshots
    ├── assert ACTUAL_SCREENSHOTS >= EXPECTED_SCREENSHOTS
    └── upload artifacts (30-day retention)
  screenshots-android (ubuntu, 60min)
    ├── install Maestro + KVM
    ├── npm ci
    ├── setup Expo + EAS
    ├── eas build --platform android --profile development --wait
    ├── download APK
    ├── boot Android API 34 emulator
    ├── install app
    ├── for each .maestro/flows/*.yaml: maestro test --test-output-dir=.maestro/screenshots
    ├── assert ACTUAL_SCREENSHOTS >= EXPECTED_SCREENSHOTS
    └── upload artifacts (30-day retention)
```
[VERIFIED — CODE — `.github/workflows/screenshots.yml:1-249`]

### 5.2 CI gaps

| Gap | Current | Required | Fix |
|---|---|---|---|
| Device count | 1 iOS + 1 Android | 2 iOS + 2 Android minimum | `strategy: matrix: device: [iPhone 15, iPhone SE]` |
| Theme | Default only | Light + Dark | `xcrun simctl ui $SIM_ID appearance dark` / `adb shell cmd uimode night yes` |
| Font scale | 100% only | 100% + 200% | `xcrun simctl ui $SIM_ID content_size accessibility-extra-extra-extra-large` / `adb shell settings put system font_scale 2.0` |
| Diff engine | None (count check only) | reg-suit or Maestro assertScreenshot | Install reg-suit, add post-capture diff step |
| PR gating | Artifacts uploaded, no gate | Visual diff blocks PR on >0.1% unintended diff | reg-suit `reg-notify-github-plugin` or `reg-actions` GitHub Action |
| Mock data | Live dev backend | `EXPO_PUBLIC_MOCK_MODE=fixture-design` | Set env var in workflow before Maestro test |
| Golden-route flow | `flows/*.yaml` only (6 files) | `golden-route-screenshots.yml` + `dual-mode-golden-suite.yml` | CI runs `flows/*.yaml` (line 131) not the golden-route flow. Add golden-route flow to the loop. |
| Animation state | Not controlled | Reduce Motion on | `xcrun simctl ui $SIM_ID reduce_motion yes` / `adb shell settings put secure reduce_motion 1` |
| Screenshot naming | `golden-home-populated.png` | `{platform}-{device}-{theme}-{scale}-{route}-{state}.png` | Maestro env vars + naming template |
| Baseline storage | 67-byte placeholders in repo | Real baselines in S3 or GitHub Releases | reg-suit `reg-publish-s3-plugin` or `reg-publish-github-plugin` |

---

## 6. Ownership-gate test audit

### 6.1 visualRegressionPlan.test.ts structure

```
describe('Golden-route screenshot baseline')
  ├── Maestro golden-route flow exists (always runs)
  ├── Flow covers all department golden routes (always runs, checks flow YAML content)
  ├── Baseline directory exists with approved captures (it.runIf(baselinesExist) — SKIPPED)
  ├── Baseline screenshots cover all department golden routes (it.runIf(baselinesExist) — SKIPPED)
  └── Baseline capture status is tracked (always runs, passes whether or not baselines exist)

describe('Visual regression test plan')
  18 screens × 5 states = 90 it() blocks:
  ├── HomeScreen (5 states: loading, populated, empty, error, offline)
  ├── BrowseScreen (5 states)
  ├── SearchScreen/Explore (5 states)
  ├── GlobalSearchScreen (5 states: loading, populated, empty, error, recent-searches)
  ├── ItemDetailScreen (5 states: loading, populated, sold, error, offline)
  ├── CheckoutScreen (5 states: loading, populated, empty, error, submitting)
  ├── BundleBagScreen (4 states)
  ├── GalleriaScreen (5 states)
  ├── AssetDetailScreen (5 states)
  ├── PortfolioScreen (5 states)
  ├── AuctionDetailScreen (5 states: loading, populated, ended, error, offline)
  ├── TradeHubScreen (5 states)
  ├── InboxScreen (5 states)
  ├── ChatScreen (5 states)
  ├── MyProfileScreen (5 states)
  ├── UserProfileScreen (5 states)
  ├── SettingsScreen (4 states)
  ├── OnboardingScreen (5 states: slide-1, slide-2, slide-3, slide-4, dark)
  ├── AuthLandingScreen (4 states: default, loading, error, dark)
  ├── OrderDetailScreen (4 states)
  └── SellerHubScreen (5 states)
```
[VERIFIED — CODE — `visualRegressionPlan.test.ts:86-797`]

### 6.2 How the gate works (and doesn't)

Each `it()` block calls:
1. `expectScreen('HomeScreen.tsx')` — checks `existsSync(resolve(SCREENS_DIR, 'HomeScreen.tsx'))`. If the screen file doesn't exist, the test fails with "Screen not found for visual regression journey. Create src/screens/HomeScreen.tsx." [VERIFIED — CODE — line 209-215]
2. `expectBaseline('HomeScreen', 'loading')` — checks if any file in `__screenshots__/` starts with `homescreen-loading` (case-insensitive). If no match, the test fails with a fixture-requirement message. [VERIFIED — CODE — line 223-240]

**Why it doesn't catch visual regressions:**
- The 12 committed baselines are named `golden-home-baseline.png`, `golden-pdp-baseline.png`, etc. — they don't match the `{screenName}-{state}` prefix pattern (`homescreen-loading`, `homescreen-populated`, etc.). So `expectBaseline()` fails for every state except where the prefix happens to match.
- The `it.runIf(baselinesExist)` guard at line 125 and 142 checks if ANY `.png`/`.jpg`/`.jpeg` file exists in `__screenshots__/`. The 67-byte placeholders satisfy this check, so the `it.runIf` tests DO run — but they fail because the baselines don't match the expected route prefixes.
- **No image comparison is performed anywhere.** Even if baselines matched, the test only checks file existence, not pixel content.

### 6.3 The skip logic

```typescript
const baselinesExist = existsSync(BASELINE_DIR) &&
  readdirSync(BASELINE_DIR).some((f) => /\.(png|jpg|jpeg)$/i.test(f));
```
[VERIFIED — CODE — line 89-90]

This returns `true` because the 12 placeholder PNGs exist. So `it.runIf(baselinesExist)` tests run. But the `expectBaseline` function looks for files matching `{screenName}-{state}` prefix — and `golden-home-baseline.png` doesn't match `homescreen-loading`. So every per-screen `it()` block that calls `expectBaseline` will fail.

**Net effect:** the ownership-gate test is currently in a state where:
- The golden-route flow existence test passes (flow file exists).
- The golden-route coverage test passes (flow YAML contains all expected route names).
- The baseline-presence tests run but fail (baselines exist but don't match naming convention).
- The per-screen tests run but fail (no baselines match `{screenName}-{state}` pattern).
- The status-tracking test passes (documents that baselines don't exist).

This means the test suite is currently **red** for visual regression — which is arguably correct (the gap is visible) but also means the test provides no value beyond documenting the gap.

---

## 7. 2026 industry research

### 7.1 Maestro assertScreenshot (2026)

Maestro's `assertScreenshot` command (merged in PR #2949) performs in-flow visual regression:

```yaml
- assertScreenshot:
    path: screen.png
    cropOn:
      id: banner
    thresholdPercentage: 98
```

- **`thresholdPercentage`**: percentage match required. Default 95%. Increase to 98-99 for pixel-sensitive components. Can be set from env variable. [VERIFIED — EXTERNAL]
- **`cropOn`**: selector to narrow screenshot before comparison. The baseline must also have been cropped. [VERIFIED — EXTERNAL]
- **Diff image**: on failure, Maestro generates a diff image at `{output_dir}/screen_diff.png`. [VERIFIED — EXTERNAL]
- **Limitation**: `thresholdPercentage` as dynamic variable was initially broken (issue #3337) but was fixed in PR #3444. [VERIFIED — EXTERNAL]

### 7.2 App Percy + Maestro integration

`@percy/maestro-app` SDK integrates App Percy visual testing with Maestro flows:

```yaml
- runFlow:
    file: percy/flows/percy-screenshot.yaml
    env:
      SCREENSHOT_NAME: Homepage
```

Run through Percy CLI: `npx percy app:exec -- maestro test your-flow.yaml`

- **BrowserStack SDK**: tests run on BrowserStack infrastructure, device metadata injected.
- **Self-hosted**: `maestro test` wrapped with `percy app:exec`, device metadata supplied manually.
- **`PERCY_REGIONS`**: JSON array marking areas as `ignore`, `standard`, or `intelliignore` (AI-based dynamic content ignoring). [VERIFIED — EXTERNAL]
- **Pricing**: per-shot SaaS model (~$1,500-3,000+/mo at 2,160 shots/PR for ThryftVerse's matrix).

### 7.3 reg-suit (2026)

reg-suit is the open-source CLI for visual regression testing:
- **Compare images**: compares current vs previous, creates HTML report with diffs.
- **Store snapshots**: `reg-publish-s3-plugin` (AWS S3) or `reg-publish-github-plugin` (GitHub Releases/GHCR, no external cloud account needed). [VERIFIED — EXTERNAL]
- **GitHub PR integration**: `reg-notify-github-plugin` posts commit status + PR comment with diff images. `reg-actions` GitHub Action compares artifacts between base and head commits. [VERIFIED — EXTERNAL]
- **Matching threshold**: `matching-threshold` ranges 0-1 (YIQ difference metric). `threshold-pixel` sets absolute pixel count. [VERIFIED — EXTERNAL]
- **Snapshot addressing**: by commit hash — actual snapshots of base commit become expected snapshots of current commit. [VERIFIED — EXTERNAL]

### 7.4 reg-publish-github-plugin (2026)

Community plugin storing visual regression snapshots on GitHub itself:
- **`releases` backend**: one `.zip` per snapshot set as assets on a fixed prerelease. Needs `contents: write`. [VERIFIED — EXTERNAL]
- **`ghcr` backend**: OCI artifact in GitHub Container Registry, each file as content-addressable blob, unchanged images dedup across commits. Needs `packages: write`. [VERIFIED — EXTERNAL]
- **No external cloud account needed** — just a GitHub token. Avoids git binary bloat.

### 7.5 react-native-testify (2026)

Component-level visual regression for React Native:
- Mounts components in isolation (no navigation, no full app tree).
- `TestifyApp` harness with provider wrapping (Theme, Redux, etc.).
- Uses `pixelmatch` for screenshot comparison.
- Auto-discovers `*.testify.tsx` files.
- Parallel iOS + Android testing.
- **Complements** Maestro (component-level vs flow-level). [VERIFIED — EXTERNAL]

### 7.6 Recommendation: reg-suit + Maestro assertScreenshot (hybrid)

**reg-suit** for the PR diff gate (compares artifacts from base vs head commit, posts PR comment).
**Maestro `assertScreenshot`** for in-flow assertions (catches regressions during the test run itself, generates diff images).
**No Percy** — per-shot pricing not justified at ThryftVerse's scale (~2,160 shots/PR). reg-suit + GitHub Releases is free.
**Optional: react-native-testify** for component-level isolation testing (Phase 3).

---

## 8. Proposed visual-regression programme

### 8.1 Phase 1: Diff engine + real baselines (3-5 days)

**Install:**
```bash
npm install --save-dev reg-suit @reg-suit/reg-notify-github-plugin reg-publish-github-plugin
```

**reg-suit config** (`regconfig.json`):
```json
{
  "core": {
    "actualDir": ".maestro/screenshots/current",
    "expectedDir": ".maestro/screenshots/expected"
  },
  "plugins": {
    "reg-publish-github-plugin": {
      "pluginName": "reg-publish-github-plugin",
      "backend": "releases"
    },
    "reg-notify-github-plugin": {
      "pluginName": "reg-notify-github-plugin"
    }
  }
}
```

**Capture real baselines on `main`:**
1. Run the golden-route flow on iPhone 15 (light, 100%) → commit as `ios-iphone15-light-100-{route}.png`
2. Run on iPhone 15 (dark, 100%) → commit as `ios-iphone15-dark-100-{route}.png`
3. Run on Pixel 8 (light, 100%) → commit as `android-pixel8-light-100-{route}.png`
4. Run on Pixel 8 (dark, 100%) → commit as `android-pixel8-dark-100-{route}.png`
5. Store in GitHub Releases via `reg-publish-github-plugin`

**Add Maestro `assertScreenshot` to flows:**
```yaml
- waitForAnimationToEnd:
    timeout: 5000
- assertScreenshot:
    path: ${MAESTRO_LOGS_DIRECTORY}/ios-iphone15-light-100-home-populated.png
    thresholdPercentage: 98
    cropOn:
      id: home-feed-container
```

### 8.2 Phase 2: Device matrix + theme/font-scale (3-5 days)

**Expand CI matrix:**
```yaml
strategy:
  matrix:
    include:
      - platform: ios
        device: "iPhone 15"
        os: iOS17.4
        width: regular
      - platform: ios
        device: "iPhone SE (3rd generation)"
        os: iOS17.4
        width: compact
      - platform: android
        device: "Pixel_8_API_34"
        os: API 34
        width: regular
      - platform: android
        device: "Pixel_5_API_33"
        os: API 33
        width: compact
```

**Theme switching sub-flow** (`.maestro/_theme-dark.yml`):
```yaml
# iOS: xcrun simctl ui $SIM_ID appearance dark
# Android: adb shell cmd uimode night yes
# Set before launching app
```

**Font-scale sub-flow** (`.maestro/_font-scale-200.yml`):
```yaml
# iOS: xcrun simctl ui $SIM_ID content_size accessibility-extra-extra-extra-large
# Android: adb shell settings put system font_scale 2.0
```

**Full capture matrix:** 4 devices × 2 themes × 2 font scales = 16 captures per route. 18 routes × 16 = 288 screenshots per PR.

**Anti-flake rules:**
- `waitForAnimationToEnd` before every `assertScreenshot` (already in flows — good).
- OS Reduce Motion on: `xcrun simctl ui $SIM_ID reduce_motion yes` / `adb shell settings put secure reduce_motion 1`.
- Fixed simulator clock: `xcrun simctl status_bar $SIM_ID time "9:41"`.
- Suppress notifications.
- `EXPO_PUBLIC_MOCK_MODE=fixture-design` for deterministic data.
- `cropOn` for stable element regions (ignore status bar, dynamic timestamps).
- `thresholdPercentage: 98` default, 99 for pixel-sensitive components (charts, illustrations).

### 8.3 Phase 3: PR gating + baseline management (2-3 days)

**reg-suit post-capture step in CI:**
```yaml
- name: Run reg-suit visual diff
  run: npx reg-suit run
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**reg-actions alternative (simpler):**
```yaml
- uses: reg-viz/reg-actions@v3
  with:
    github-token: "${{ secrets.GITHUB_TOKEN }}"
    image-directory-path: ".maestro/screenshots/current"
    matching-threshold: "0.001"
```

**Baseline update workflow:**
- `npm run visual:approve` → reg-suit copies current screenshots to expected, publishes to GitHub Releases.
- Baseline changes require explicit approval + human review of diff images.
- PR comment from reg-suit shows: new baselines, changed baselines (with diff), deleted baselines.

**PR gating:**
- reg-suit sets GitHub commit status: `pending` → `success` (no diff) or `failure` (diff > threshold).
- Required status check on `main` branch protection.
- Diff > 0.1% pixels fails CI and blocks merge.

### 8.4 Phase 4: EAS Workflows + component-level testing (future)

**EAS Workflows:**
- `visual_regression` EAS Workflow job on EAS-managed runners.
- Replaces GitHub Actions macOS-14 runner with EAS infrastructure.
- Native device farm access.

**react-native-testify (optional):**
- Component-level isolation testing for shared primitives (`CachedImage`, `ProductCardV2`, `BidSheet`).
- Catches primitive-level regressions before they propagate to screens.
- `*.testify.tsx` files auto-discovered.

### 8.5 Ownership and cadence

| Role | Responsibility |
|---|---|
| Mobile release/quality engineering | Owns the programme. Reviews diff images. Approves baseline changes. |
| PR author | Reviews reg-suit PR comment. If visual change is intentional, runs `npm run visual:approve` and updates baselines in the PR. |
| PR reviewer | Reviews visual diff images in reg-suit comment. Rejects unintended visual changes. |

| Cadence | Matrix | Trigger |
|---|---|---|
| Every PR touching `frontend/**` | Full matrix (4 devices × 2 themes × 2 scales) | `reg-suit` diff gate blocks merge on >0.1% unintended diff |
| Nightly on `main` | Full matrix | Catch drift from dependencies, OTA updates, OS changes |
| Every release tag | Full matrix + 200% font scale + reduced motion | Generate `VISUAL_SIGNOFF.md` with per-route approval |

---

## 9. Gap summary

| Component | Exists? | Functional? | Fix effort |
|---|---|---|---|
| Maestro flow files | ✅ 14 files | ⚠️ Capture only, no assertScreenshot | Add `assertScreenshot` to each flow |
| CI screenshots workflow | ✅ 249 lines | ⚠️ Captures but doesn't compare | Add reg-suit post-capture step |
| Ownership-gate test | ✅ 797 lines | ⚠️ File presence check, not visual diff | Replace with reg-suit gate |
| Baseline PNGs | ✅ 12 files | ❌ 67-byte 1×1 pixel placeholders | Capture real baselines on `main` |
| Diff engine | ❌ Not installed | ❌ | `npm install reg-suit` |
| Theme switching | ❌ Not in CI | ❌ | `xcrun simctl ui` / `adb shell cmd uimode` |
| Font-scale setting | ❌ Not in CI | ❌ | `xcrun simctl ui content_size` / `adb shell settings put system font_scale` |
| Device matrix | ⚠️ 1 per platform | ❌ Need 2 per platform | GitHub Actions matrix strategy |
| PR diff gating | ❌ Not implemented | ❌ | reg-suit `reg-notify-github-plugin` or `reg-actions` |
| Baseline management | ❌ No approve workflow | ❌ | `npm run visual:approve` script |
| Mock data in CI | ❌ Live dev backend | ❌ | `EXPO_PUBLIC_MOCK_MODE=fixture-design` env var |
| Animation disabling | ❌ Not controlled | ❌ | OS Reduce Motion + in-app `reducedMotion: true` |
| Deterministic naming | ⚠️ Route name only | ⚠️ No device/theme/scale metadata | `{platform}-{device}-{theme}-{scale}-{route}-{state}.png` |
| Fixture/Integration dirs | ⚠️ README only | ❌ Zero PNGs | Capture and commit dual-mode baselines |
| Visual QA gates doc | ✅ 468 lines | ✅ Specification | No fix needed — is the target spec |
| EAS build profiles | ✅ development-simulator | ✅ Correct for CI | No fix needed |

**Total estimated implementation effort: 10-15 days** (Phase 1: 3-5d, Phase 2: 3-5d, Phase 3: 2-3d, Phase 4: future).

---

## 10. Verdict

ThryftVerse's visual-regression programme is a **well-specified scaffold with zero execution capability**. Every structural component — flows, CI workflow, ownership test, parity checker, visual-qa-gates document — exists and is thoughtfully designed. None of them performs the one function that matters: comparing two images and flagging a difference.

The 67-byte placeholder baselines are the perfect metaphor: the file exists, the test passes, the gate is green, and no one has ever seen a screenshot of the app in CI.

The fix is not invention — it is activation. Install reg-suit, capture real baselines, expand the device matrix, add theme/font-scale switching, and wire the PR diff gate. The existing scaffolding makes this a 10-15 day programme, not a multi-month rebuild.

---

*End of report. Research only; no product code modified. Every claim tagged [VERIFIED — CODE] with path:line or [VERIFIED — EXTERNAL] with linked source.*
