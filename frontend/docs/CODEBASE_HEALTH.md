# Codebase Health

This document records the current tooling, rationale, and forward plans for
keeping the ThryftVerse frontend codebase healthy. It is a living reference —
update it as tooling is added and as metrics improve.

---

## 1. ESLint configuration

**Config file:** `frontend/.eslintrc.cjs`

The codebase ships with `@typescript-eslint/eslint-plugin`,
`@typescript-eslint/parser`, and `eslint-plugin-react-hooks` installed, but
previously had no ESLint config. This pass introduces a pragmatic legacy-format
config that surfaces issues without blocking development on a large existing
codebase.

### Rationale

- **`@typescript-eslint/no-explicit-any`: `warn` (not `error`)**
  There are 131 existing `any` occurrences across the codebase. Promoting this
  to `error` would immediately break development for every engineer and every
  automated build. `warn` keeps the issue visible in editor squiggles and CI
  output while allowing incremental reduction. See the type-escape reduction
  plan below for the sprint target.

- **`@typescript-eslint/no-unused-vars`: `warn` with `^_` ignore patterns**
  Catches dead code and accidental unused imports without erroring on
  intentionally unused parameters (a common pattern in callback signatures and
  event handlers where the first arg is required by shape but unused).

- **`react-hooks/rules-of-hooks`: `error`**
  Hook correctness is non-negotiable. Violating the rules of hooks produces
  runtime crashes and subtle state corruption that is extremely hard to trace.
  This stays `error`.

- **`react-hooks/exhaustive-deps`: `warn`**
  Missing dependencies are a common source of stale-closure bugs, but the
  rule is also known to produce false positives in complex animation and
  gesture scenarios (common in this Reanimated-heavy codebase). `warn` keeps
  the signal without blocking legitimate intentional omissions.

- **`@typescript-eslint/ban-types`: `off`**
  The rule is deprecated in v8 and extremely noisy on existing code (flags
  `Function`, `Object`, `{}` patterns that are widespread). Revisit after the
  type-escape reduction pass.

- **`@typescript-eslint/no-var-requires`: `off`**
  Expo, Metro, and several entry-point files legitimately use `require()`.
  Disabling avoids false positives on valid framework patterns.

- **`no-console`: `off`**
  Console calls are stripped in production by
  `babel-plugin-transform-remove-console` (already in devDependencies and wired
  into the Babel preset for production builds). Linting against `console` would
  produce noise with no production benefit.

### Ignore patterns

`node_modules/`, `dist/`, `.expo/`, `coverage/`, `*.config.js`,
`babel.config.js`, `metro.config.js`, `scripts/`, `polyfills/` are excluded.
These are generated, config, or build-tooling files that are not part of the
application source and would produce false positives.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run lint` | Lint `src/` for `.ts` and `.tsx` files (report only) |
| `npm run lint:fix` | Lint `src/` and auto-fix safe rules |

---

## 2. Prettier configuration

**Config file:** `frontend/.prettierrc`
**Ignore file:** `frontend/.prettierignore`

### Rationale

- **`printWidth: 100`** — balances readability on modern widescreen monitors
  with comfortable review on split-pane editors. Wide enough to avoid excessive
  wrapping of typical React/TypeScript expressions, narrow enough to avoid
  horizontal scrolling in most review tools.
- **`tabWidth: 2` / `useTabs: false`** — matches the existing indentation
  convention across the codebase and ensures consistent rendering in all
  editors and review tools regardless of tab-width settings.
- **`semi: true`** — preserves the existing style; ASI hazards are not worth
  the risk in a large codebase.
- **`singleQuote: true`** — matches the dominant existing quote style and
  reduces visual noise.
- **`trailingComma: "all"`** — produces cleaner git diffs (adding/removing a
  final item touches only one line) and is supported by all target runtimes.
- **`bracketSpacing: true`** — standard, matches existing style.
- **`arrowParens: "always"`** — consistent and avoids the single-arg special
  case that produces noisy diffs when a second param is added.
- **`endOfLine: "lf"`** — enforces consistent line endings across Windows,
  macOS, and Linux contributors; prevents CRLF/LF churn in git.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run format` | Format all `src/**/*.{ts,tsx,json,md}` in place |
| `npm run format:check` | Verify formatting without writing (for CI) |

### Ignore rationale

`node_modules/`, `dist/`, `.expo/`, `coverage/`, lockfiles, native `android/`
and `ios/` directories, and `assets/` are excluded. These are generated,
vendored, or binary-heavy and should not be reformatted.

---

## 3. Pre-commit hook plan (future pass)

**Status:** Not yet implemented. Planned for a follow-up pass.

### Goal

Prevent formatting and lint regressions from entering the repository by
running checks automatically on staged files before each commit.

### Planned stack

- **husky** — manages git hooks as tracked repo files under `.husky/`.
- **lint-staged** — runs commands only on staged files, keeping pre-commit
  fast even on a large codebase.

### Planned configuration

```jsonc
// package.json (devDependencies to add)
"husky": "^9.x",
"lint-staged": "^15.x"

// package.json (lint-staged config)
"lint-staged": {
  "src/**/*.{ts,tsx}": [
    "eslint --fix",
    "prettier --write"
  ],
  "src/**/*.{json,md}": [
    "prettier --write"
  ]
}
```

### Why deferred

Adding husky and lint-staged requires `npm install` of new packages, which
modifies `package-lock.json`. This pass intentionally avoids lockfile changes.
The hooks and config will be added in a dedicated pass that also runs a full
`npm install` and verifies the hook fires correctly on a test commit.

### Rollout steps (future)

1. `npm install -D husky lint-staged`
2. `npx husky init`
3. Create `.husky/pre-commit` running `npx lint-staged`
4. Add `lint-staged` config to `package.json`
5. Verify with a test commit that touches a `.tsx` file
6. Document in this file and in the repo README

---

## 4. Type escape reduction plan

**Current state:** 179 type escapes (`any`, `as unknown as`, unchecked casts)
across the frontend source.

**Target:** Reduce by 50% (to ~90 or fewer) by the end of the next sprint.

### Strategy

1. **Triage by file.** Group occurrences by file and rank by how often the
   file is touched (hot files first). Hot files with `any` are the highest
   risk because they change frequently and the `any` hides regressions.
2. **Start at the data layer.** Replace `any` in API response types, service
   return types, and store state shapes first. These are the root-of-truth
   types; fixing them cascades correct types into hooks and components.
3. **Use Zod for runtime boundaries.** The codebase already depends on `zod`.
   Where `any` guards an API or parsed-JSON boundary, replace with a Zod schema
   and infer the TypeScript type from it. This removes both the `any` and the
   silent runtime crash risk.
4. **Prefer `unknown` over `any`.** Where a type is genuinely dynamic, `unknown`
   forces a narrowing check at the use site and is strictly safer.
5. **Do not mass-rewrite.** Each replacement must be verified by `tsc --noEmit`
   and, where the file has tests, by the test suite. A blind find-and-replace
   of `any` produces worse type safety than the original `any` because it
   introduces incorrect concrete types.

### Tracking

- Baseline: 179 occurrences (measured at config introduction).
- Sprint target: ≤ 90 occurrences.
- Progress will be tracked via `npm run lint` warning count for
  `@typescript-eslint/no-explicit-any` and a periodic grep audit.

---

## 5. Test coverage plan

**Current state:**
- Frontend: ~20% coverage.
- Backend: ~29% coverage.

**Target:** 50% coverage for critical paths.

### Critical paths (must be covered first)

1. **Auth flow** — sign in, sign up, token refresh, session restore, logout.
2. **Payment / checkout** — Stripe integration, order creation, payment
   confirmation, failure handling.
3. **Navigation core** — deep linking, back behaviour, modal/push presentation
   correctness, route param validation.
4. **Data layer** — API client error handling, retry, offline queue, cache
   invalidation (React Query key management).
5. **Form validation** — Zod schema validation for all user-input forms
   (shipping, payment, profile, listing creation).

### Strategy

- Prioritise integration-style tests over pure unit tests for the critical
  paths. A test that exercises the full hook → service → mock-API path catches
  real regressions; a test that mocks everything except one pure function
  rarely does.
- Use the existing `vitest` + `@testing-library/react-native` setup. No new
  test runner is required.
- Add a coverage threshold to `vitest.config` once frontend reaches 30%, then
  ratchet upward. Setting a threshold above current coverage immediately would
  fail CI and block all PRs.

### Tracking

- Baseline: ~20% frontend, ~29% backend.
- Milestone 1: 30% frontend (critical-path files only).
- Milestone 2: 40% frontend.
- Target: 50% frontend for critical paths.

---

## 6. Reanimated worklet optimization plan

**Context:** The app uses `react-native-reanimated` 4.x extensively for
gesture-driven animation and scroll-linked effects. Worklets run on the UI
thread and have different performance characteristics than JS-thread code.

### Known risks

- **Worklets that close over large JS objects** cause serialization overhead on
  every frame the worklet runs. This is the most common source of jank in
  Reanimated-heavy screens.
- **Shared values created in render without `useSharedValue`** (or recreated
  every render) defeat the purpose of shared values and trigger unnecessary
  re-renders.
- **`useAnimatedStyle` with heavy computation** blocks the UI thread. Move
  computation to `useDerivedValue` or precompute on the JS thread.
- **`runOnJS` overuse** — each bridge hop is expensive. Batch worklet-to-JS
  calls and avoid calling `runOnJS` inside `useFrameCallback` hot paths.

### Plan

1. **Audit.** Grep for `useAnimatedStyle`, `useFrameCallback`,
   `runOnJS`, and `useDerivedValue` across `src/`. Rank screens by worklet
   density.
2. **Profile.** Use the Reanimated devtools and on-device profiling to identify
   worklets that exceed the 16ms frame budget.
3. **Optimise closures.** For each hot worklet, minimise the captured scope.
   Pass only primitives or shared values into the worklet; never capture whole
   objects or arrays.
4. **Hoist shared values.** Ensure every animated value is created via
   `useSharedValue` exactly once per component instance and is not recreated
   on prop changes.
5. **Verify.** Re-run the `check:animated-scroll` and
   `premium-form-primitives` tests after each optimisation pass to confirm no
   regression in scroll-linked behaviour.

### Tracking

- The existing `npm run check:animated-scroll` script already guards against
  incorrect `Animated.ScrollView` usage. Extend this with a worklet-closure
  lint check in a future pass.
