import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * P0-4: explicit mock modes must suppress mock fallbacks in
 * `integration-truth` and `production` modes while preserving them in
 * `fixture-design`. The legacy `ENABLE_RUNTIME_MOCKS` boolean must remain
 * backward-compatible with existing call sites and tests.
 */

async function importMockGate(mode: 'fixture-design' | 'integration-truth' | 'production') {
  vi.resetModules();
  vi.doMock('../constants/runtimeFlags', () => ({
    MOCK_MODE: mode,
    ENABLE_RUNTIME_MOCKS: mode === 'fixture-design',
    IS_INTEGRATION_TRUTH_MODE: mode === 'integration-truth',
    SHOW_BACKEND_DIAGNOSTICS: false,
  }));
  return import('../utils/mockGate');
}

const SAMPLE = [{ id: 'a' }, { id: 'b' }];

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.doUnmock('../constants/runtimeFlags');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('mockGate modes', () => {
  it('returns mock data in fixture-design mode', async () => {
    const { mockArrayOrEmpty, mockFind, mockFallback } = await importMockGate('fixture-design');
    expect(mockArrayOrEmpty(SAMPLE)).toEqual(SAMPLE);
    expect(mockFind(SAMPLE, (x) => x.id === 'a')).toEqual({ id: 'a' });
    expect(mockFallback(undefined, { id: 'a' })).toEqual({ id: 'a' });
  });

  it('suppresses mock data in integration-truth mode and warns on suppressed fallbacks', async () => {
    const { mockArrayOrEmpty, mockFind, mockFallback, warnIfMockSuppressed } =
      await importMockGate('integration-truth');
    expect(mockArrayOrEmpty(SAMPLE)).toEqual([]);
    expect(mockFind(SAMPLE, (x) => x.id === 'a')).toBeUndefined();
    expect(mockFallback(undefined, { id: 'a' })).toBeUndefined();
    expect(warnIfMockSuppressed('ctx', new Error('boom'))).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('suppresses mock data in production mode without warnIfMockSuppressed logging', async () => {
    const { mockArrayOrEmpty, mockFind, mockFallback, warnIfMockSuppressed } =
      await importMockGate('production');
    expect(mockArrayOrEmpty(SAMPLE)).toEqual([]);
    expect(mockFind(SAMPLE, (x) => x.id === 'a')).toBeUndefined();
    expect(mockFallback(undefined, { id: 'a' })).toBeUndefined();
    expect(warnIfMockSuppressed('ctx', new Error('boom'))).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
