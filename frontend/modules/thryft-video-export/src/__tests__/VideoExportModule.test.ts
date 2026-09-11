/**
 * VideoExportModule — graceful-fallback tests.
 *
 * These tests mock `react-native-nitro-modules` so that the native
 * `VideoExportModule` HybridObject is NOT registered (the module is not
 * linked). They assert the JS wiring degrades gracefully:
 *   - `isVideoExportAvailable()` → false
 *   - `getVideoExportModule()` → null
 *   - `exportVideoViaNative()` → rejects with `{ type: 'unsupported' }`
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock react-native-nitro-modules BEFORE importing the module under test so
// the cached availability probe sees the unlinked state. `NitroModules` is
// the NitroModulesProxy; `hasHybridObject` returns false (module not
// registered) and `createHybridObject` throws if called.
vi.mock('react-native-nitro-modules', () => {
  return {
    NitroModules: {
      hasHybridObject: vi.fn(() => false),
      createHybridObject: vi.fn(() => {
        throw new Error('HybridObject "VideoExportModule" is not registered.');
      }),
    },
  };
});

// Import after the mock is in place.
import {
  isVideoExportAvailable,
  getVideoExportModule,
  exportVideoViaNative,
} from '../index';

describe('VideoExportModule (native module not linked)', () => {
  beforeEach(() => {
    // The module caches the availability probe; reset modules between tests
    // so each starts from a clean state.
    vi.resetModules();
  });

  it('isVideoExportAvailable() returns false', () => {
    expect(isVideoExportAvailable()).toBe(false);
  });

  it('getVideoExportModule() returns null', () => {
    expect(getVideoExportModule()).toBeNull();
  });

  it('exportVideoViaNative() rejects with { type: "unsupported" }', async () => {
    await expect(
      exportVideoViaNative({
        sourceUri: 'file:///tmp/source.mp4',
        sessionId: 'test-session',
      }),
    ).rejects.toEqual({ type: 'unsupported' });
  });
});
