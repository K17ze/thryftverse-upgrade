const runtimeDevFlag = (globalThis as { __DEV__?: boolean }).__DEV__;
const isDevelopmentRuntime =
  typeof runtimeDevFlag === 'boolean'
    ? runtimeDevFlag
    : process.env.NODE_ENV !== 'production';

export const ENABLE_RUNTIME_MOCKS =
  isDevelopmentRuntime || process.env.EXPO_PUBLIC_ENABLE_RUNTIME_MOCKS === 'true';

/**
 * Backend diagnostics are useful during an intentional integration session,
 * but they must never become part of the default product silhouette. Opt in
 * explicitly when the overlay is needed.
 */
export const SHOW_BACKEND_DIAGNOSTICS =
  isDevelopmentRuntime && process.env.EXPO_PUBLIC_SHOW_BACKEND_DIAGNOSTICS === 'true';
