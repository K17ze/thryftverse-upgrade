import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * F19 — mock-mode resolution must fail closed in non-dev runtimes.
 * EXPO_PUBLIC_* env vars are baked into the bundle at build time, so a
 * misconfigured release env must never be able to select fixture mode
 * and serve mock data to real users.
 */

async function importRuntimeFlags() {
  return import('../constants/runtimeFlags');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('resolveMockMode fail-closed (F19)', () => {
  it('forces production in a non-dev runtime even when env selects fixture-design', async () => {
    vi.resetModules();
    vi.stubGlobal('__DEV__', false);
    vi.stubEnv('EXPO_PUBLIC_MOCK_MODE', 'fixture-design');
    const { MOCK_MODE, ENABLE_RUNTIME_MOCKS } = await importRuntimeFlags();
    expect(MOCK_MODE).toBe('production');
    expect(ENABLE_RUNTIME_MOCKS).toBe(false);
  });

  it('forces production in a non-dev runtime when the legacy mocks flag is true', async () => {
    vi.resetModules();
    vi.stubGlobal('__DEV__', false);
    vi.stubEnv('EXPO_PUBLIC_ENABLE_RUNTIME_MOCKS', 'true');
    const { MOCK_MODE, ENABLE_RUNTIME_MOCKS } = await importRuntimeFlags();
    expect(MOCK_MODE).toBe('production');
    expect(ENABLE_RUNTIME_MOCKS).toBe(false);
  });

  it('honours fixture-design in a dev runtime (screenshot/design builds keep working)', async () => {
    vi.resetModules();
    vi.stubGlobal('__DEV__', true);
    vi.stubEnv('EXPO_PUBLIC_MOCK_MODE', 'fixture-design');
    const { MOCK_MODE, ENABLE_RUNTIME_MOCKS } = await importRuntimeFlags();
    expect(MOCK_MODE).toBe('fixture-design');
    expect(ENABLE_RUNTIME_MOCKS).toBe(true);
  });
});
