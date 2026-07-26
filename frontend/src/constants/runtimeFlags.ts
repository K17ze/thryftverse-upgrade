const runtimeDevFlag = (globalThis as { __DEV__?: boolean }).__DEV__;
const isDevelopmentRuntime =
  typeof runtimeDevFlag === 'boolean'
    ? runtimeDevFlag
    : process.env.NODE_ENV !== 'production';

/**
 * Mock mode — explicit three-mode gate so dev mocks never silently contaminate
 * integration QA or production.
 *
 *   `fixture-design`     — mocks always on. Use for offline design work.
 *   `integration-truth`  — mocks OFF even in dev. Use for QA against a real
 *                          backend; empty API responses stay empty so backend
 *                          failures surface honestly.
 *   `production`         — mocks OFF. Default for production builds.
 *
 * Resolution order:
 *   1. `EXPO_PUBLIC_MOCK_MODE` env var (explicit override).
 *   2. `EXPO_PUBLIC_ENABLE_RUNTIME_MOCKS=true` legacy override → `fixture-design`.
 *   3. `EXPO_PUBLIC_ENABLE_RUNTIME_MOCKS=false` legacy override → `integration-truth` in dev / `production` in prod.
 *   4. Default: `fixture-design` in dev, `production` in prod.
 *
 * `ENABLE_RUNTIME_MOCKS` is retained as a derived boolean for existing call
 * sites, but new code should prefer `MOCK_MODE` / `isIntegrationTruthMode`.
 */
export type MockMode = 'fixture-design' | 'integration-truth' | 'production';

function resolveMockMode(): MockMode {
  const explicit = process.env.EXPO_PUBLIC_MOCK_MODE;
  if (explicit === 'fixture-design' || explicit === 'integration-truth' || explicit === 'production') {
    return explicit;
  }

  const legacyFlag = process.env.EXPO_PUBLIC_ENABLE_RUNTIME_MOCKS;
  if (legacyFlag === 'true') {
    return 'fixture-design';
  }
  if (legacyFlag === 'false') {
    return isDevelopmentRuntime ? 'integration-truth' : 'production';
  }

  return isDevelopmentRuntime ? 'fixture-design' : 'production';
}

export const MOCK_MODE: MockMode = resolveMockMode();

export const ENABLE_RUNTIME_MOCKS = MOCK_MODE === 'fixture-design';

/**
 * True when the runtime is intentionally exercising the real backend without
 * mock fallbacks. Used to surface honest empty/error states instead of
 * substituting demo data.
 */
export const IS_INTEGRATION_TRUTH_MODE = MOCK_MODE === 'integration-truth';

/**
 * Backend diagnostics are useful during an intentional integration session,
 * but they must never become part of the default product silhouette. Opt in
 * explicitly when the overlay is needed.
 */
export const SHOW_BACKEND_DIAGNOSTICS =
  isDevelopmentRuntime && process.env.EXPO_PUBLIC_SHOW_BACKEND_DIAGNOSTICS === 'true';
