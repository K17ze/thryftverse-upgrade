/**
 * mockGate — Safely resolve mock data fallbacks.
 *
 * Mock fallbacks are gated by the explicit `MOCK_MODE`:
 *   - `fixture-design`: mock data is allowed (design work without backend).
 *   - `integration-truth`: mock data is suppressed even in dev so empty API
 *     responses surface honestly during QA.
 *   - `production`: mock data is suppressed.
 *
 * This prevents mock data from leaking into production builds or contaminating
 * integration sessions while keeping the design-time experience smooth.
 */
import { ENABLE_RUNTIME_MOCKS, IS_INTEGRATION_TRUTH_MODE } from '../constants/runtimeFlags';

/**
 * Returns the mock array if mock fallbacks are enabled, otherwise [].
 */
export function mockArrayOrEmpty<T>(mockArray: T[]): T[] {
  return ENABLE_RUNTIME_MOCKS ? mockArray : [];
}

/**
 * Looks up an item in a mock array when mock fallbacks are enabled.
 * Returns `undefined` otherwise, even if a match exists.
 */
export function mockFind<T>(
  mockArray: T[],
  predicate: (item: T) => boolean,
): T | undefined {
  if (!ENABLE_RUNTIME_MOCKS) {
    return undefined;
  }

  return mockArray.find(predicate);
}

/**
 * Returns the fallback value if `primary` is undefined and mock fallbacks
 * are enabled. Otherwise returns only the primary value.
 */
export function mockFallback<T>(primary: T | undefined | null, mockValue: T): T | undefined {
  if (primary !== undefined && primary !== null) {
    return primary;
  }

  return ENABLE_RUNTIME_MOCKS ? mockValue : undefined;
}

/**
 * Logs a truthful warning when a mock fallback would have been used but is
 * suppressed by `integration-truth` mode. Helps QA recognise that an empty
 * result is a real backend signal, not a missing feature.
 *
 * Returns `false` so callers can write `if (!warnIfMockSuppressed(...)) return [];`
 */
export function warnIfMockSuppressed(context: string, error: unknown): false {
  if (IS_INTEGRATION_TRUTH_MODE) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[mockGate] integration-truth mode: mock fallback suppressed for ${context}. ` +
        `Backend signal honoured (error: ${message}).`,
    );
  }
  return false;
}
