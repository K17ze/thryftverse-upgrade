# Testing Guide — ThryftVerse Frontend

This document is the canonical reference for the ThryftVerse frontend testing
strategy. It covers every layer of the testing pyramid, how to run each layer,
and the production-readiness gates that depend on them (AGENTS.md §15).

---

## 1. Testing strategy

ThryftVerse uses a five-layer testing pyramid. Each layer catches a different
class of defect, and together they form the production-readiness gate.

```
        ┌─────────────────────────┐
        │  Visual regression      │  screenshot diffs (baseline)
        ├─────────────────────────┤
        │  E2E (Maestro)          │  real device/emulator flows
        ├─────────────────────────┤
        │  Runtime                │  platform capabilities, smoke
        ├─────────────────────────┤
        │  Contract               │  API ↔ serializer ↔ Zod schemas
        ├─────────────────────────┤
        │  Unit                   │  pure functions, hooks, reducers
        └─────────────────────────┘
```

| Layer | What it catches | Speed | Run on every PR? |
|-------|-----------------|-------|------------------|
| Unit | logic errors in pure functions, hooks, selectors | fast (<10s) | yes |
| Contract | API/schema drift, serializer mismatches | fast (<10s) | yes |
| Runtime | platform capability gaps, native module mocks | fast (<10s) | yes |
| E2E | real navigation, state, and render failures | slow (~2-5 min) | smoke subset |
| Visual regression | unintended UI changes, theme parity breaks | slow (~3-8 min) | on `main` + releases |

**Principle:** A defect should be caught at the lowest layer that can catch it.
Unit tests are cheapest; E2E is most realistic. Never duplicate a unit-testable
assertion in E2E — E2E is for journeys that span multiple layers.

---

## 2. Current coverage

| Metric | Value |
|--------|-------|
| Unit / contract / runtime tests | **1178** |
| Test files (`src/__tests__/*.test.ts`) | **55** (54 existing + 2 new plan files) |
| E2E tests (Maestro flows) | **5** (scaffolded) |
| Visual regression tests | **0 implemented** (105 planned via `it.todo`) |
| Test runner | Vitest 4.x (`environment: node`) |
| E2E runner | Maestro (CLI, not an npm dep) |

> The E2E and visual-regression layers are the P1 production-readiness gap.
> This guide and the scaffolded plan files (`visualRegressionPlan.test.ts`,
> `e2eSmokePlan.test.ts`) close the documentation gap; implementation is the
> next milestone.

---

## 3. How to run each test type

### Unit / contract / runtime tests (Vitest)

```bash
# Full suite
npm test
# or: vitest run --dir src

# Watch mode
npm run test:watch

# A single file
npx vitest run src/__tests__/smoke-flows.test.ts

# With coverage
npm run test:coverage
```

Configuration: `vitest.config.ts` (environment: `node`, setup:
`src/__tests__/setup.ts`). The setup file mocks `react-native`,
`react-native-reanimated`, `async-storage`, `expo-*` modules, and Sentry so
tests run in a pure Node environment without a native bridge.

### E2E tests (Maestro)

```bash
# All flows
npm run test:e2e

# Smoke subset (fast feedback for PRs)
npm run test:e2e:smoke

# A single flow
maestro test .maestro/app-launch.yml
```

See [`.maestro/README.md`](../.maestro/README.md) for installation, app ID
configuration, and CI integration.

### Visual regression tests (planned)

```bash
# Run the planned (todo) tests — they show as pending
npm run test:visual
```

Once a screenshot harness is wired in, `npm run test:visual` will capture
screenshots and diff them against baselines (see §5 below).

### Type checking

```bash
npm run typecheck
# or: tsc --noEmit
```

### Linting

```bash
npm run lint
npm run lint:fix
```

---

## 4. Maestro E2E setup

### Directory layout

```
frontend/.maestro/
├── README.md              # install + run + CI guide
├── app-launch.yml         # smoke: app boots and renders
├── onboarding-flow.yml    # first-run: age gate → slides → auth
├── navigation-flow.yml    # Home → Explore → Create → Inbox → Profile
├── search-flow.yml        # Explore → query "vintage denim" → results
└── item-detail-flow.yml   # Explore → Browse → first item → detail
```

### Key conventions

- **App ID** is parameterised as `${MAESTRO_APP_ID}` so the same flows work on
  iOS and Android. Set the env var before running
  (`com.thryftverse.app` for both platforms).
- **`clearState: true`** for first-run journeys (onboarding, launch);
  **`clearState: false`** for post-auth journeys (navigation, search, detail).
- Every flow captures **`takeScreenshot`** checkpoints. These double as
  visual-regression baselines.
- Flows target **accessibility labels** (`tapOn: label:`) rather than copy
  text, so they survive string changes.

### Test build preparation

Maestro drives an installed app, not Metro. Build a development client first:

```bash
npm run android   # or: npm run ios
```

For post-auth flows, complete onboarding + sign in once manually on the test
build (or seed the build) so `clearState: false` flows start on MainTabs.

---

## 5. Visual regression plan

### The plan

The full plan lives in
[`src/__tests__/visualRegressionPlan.test.ts`](../src/__tests__/visualRegressionPlan.test.ts).
It covers **21 screens** with **4-5 states each** (loading, populated, empty,
error, offline), scaffolded as `it.todo` so they appear as PENDING in CI.

### Implementing the harness

There are two complementary approaches:

#### A. Maestro screenshots (native-render baselines)

The `.maestro/*.yml` flows already capture screenshots via `takeScreenshot`.
To turn these into a regression gate:

1. Run the flows once on a fixed device + theme to capture baselines:
   ```bash
   maestro test .maestro/ --output .maestro/baselines
   ```
2. Commit the baselines.
3. On subsequent runs, diff the new screenshots against baselines. Maestro
   does not diff natively — pair with a tool like
   [`reg-suit`](https://github.com/reg-viz/reg-suit) or
   [`pixelmatch`](https://github.com/mapbox/pixelmatch):
   ```bash
   npx reg-suit --threshold 0.1 compare \
     --actual .maestro/screenshots \
     --expected .maestro/baselines
   ```
4. Fail the CI step if the diff exceeds 0.1% of pixels.

#### B. Component-level screenshot tests (`react-native-screenshot-test`)

For component-isolated diffs (no full app boot):

1. Install `react-native-screenshot-test` (or
   [`@testing-library/react-native` + `jest-native`](https://callstack.github.io/react-native-testing-library/)
   with snapshot serialization).
2. Render each screen in the states listed in the plan.
3. Capture a screenshot and compare against a committed baseline in
   `src/__tests__/__screenshots__/`.
4. Replace the corresponding `it.todo` with a real `it`.

#### Recommended

Use **both**: Maestro for end-to-end native render parity (catches layout
regressions that only appear on a real device), and component screenshot tests
for fast, isolated feedback during development.

### Theme parity

Per AGENTS.md §4, screenshots must be captured in **both light and dark mode**
to enforce "Light/dark parity — geometry, hierarchy and information density
remain identical across themes."

---

## 6. CI integration recommendations

### PR pipeline (fast, ~2 min)

```bash
npm run typecheck
npm run lint
npm test                    # unit + contract + runtime (1178 tests)
npm run test:e2e:smoke      # Maestro: app-launch + navigation
```

### Main / release pipeline (thorough, ~10 min)

```bash
npm run test:coverage       # unit + contract + runtime + coverage report
npm run test:e2e            # all Maestro flows
# visual regression (once implemented):
npm run test:visual
```

### GitHub Actions skeleton

```yaml
- name: Unit / contract / runtime
  run: cd frontend && npm ci && npm test

- name: E2E smoke (Android)
  env:
    MAESTRO_APP_ID: com.thryftverse.app
  run: |
    curl -Ls "https://get.maestro.mobile.dev" | bash
    export PATH="$HOME/.maestro/bin:$PATH"
    cd frontend && npm run android && npm run test:e2e:smoke

- name: Upload E2E screenshots
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: e2e-screenshots
    path: frontend/.maestro/screenshots/
```

### Coverage gate

Set a minimum coverage threshold in `vitest.config.ts` once a baseline is
established:

```ts
test: {
  coverage: {
    thresholds: { lines: 80, functions: 80, branches: 75 },
  },
}
```

---

## 7. Test data management

### Mock mode

The app runs in a **mock mode** when the backend is unavailable. The store
(`src/store/useStore.ts`) and `BackendDataContext` hydrate from
`src/data/mockData.ts` / `src/data/posters.ts` so screens render realistic
content without a live API. This is what the Maestro flows rely on for
deterministic results.

### Fixtures

- **Mock data:** `src/data/mockData.ts` (listings, users, conversations),
  `src/data/posters.ts` (poster stories).
- **Contract fixtures:** `src/__tests__/` contains serialised API responses
  used by contract tests to validate Zod schemas and serializers.
- **E2E fixtures:** Maestro flows use the mock-mode data, so queries like
  "vintage denim" must return results in mock mode. If a query returns empty
  in mock mode, add a matching listing to `mockData.ts` or pick a query that
  matches existing mock data.

### Adding test data

- For unit/contract tests: add a fixture next to the test file and import it.
- For E2E: ensure the data exists in `mockData.ts` so the flow is deterministic
  regardless of backend state.
- Never depend on a live backend for E2E — flows must pass in mock mode.

---

## 8. Production-readiness gate (AGENTS.md §15)

A release is production-ready only when **all** of the following are green:

1. `tsc --noEmit` — no type errors.
2. `npm test` — all 1178+ unit/contract/runtime tests pass.
3. `npm run test:e2e:smoke` — app launches and primary navigation works.
4. `npm run test:e2e` — all critical user journeys pass.
5. Visual regression — no unintended UI changes vs baselines (once implemented).
6. `npm run lint` — no lint errors.

The E2E and visual-regression layers (this guide) close the last gap.
