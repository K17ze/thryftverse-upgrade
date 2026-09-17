/**
 * VideoExportModule — graceful-fallback tests.
 *
 * These tests mock `react-native-nitro-modules` so that the native
 * `VideoExportModule` HybridObject is NOT registered (the module is not
 * linked). They assert the JS wiring degrades gracefully:
 *   - `isVideoExportAvailable()` → false
 *   - `getVideoExportModule()` → null
 *   - `exportVideoViaNative()` → rejects with `{ type: 'unsupported' }`
 *   - `exportVideo()` → rejects with `{ type: 'unsupported' }`, cancel is
 *     a safe no-op
 */
import { describe, it, expect, vi } from 'vitest';

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
  exportVideo,
  cancelVideoExport,
} from '../index';

describe('VideoExportModule (native module not linked)', () => {
  // No vi.resetModules() here: the bindings above were imported at file
  // scope, so a reset would not re-initialize them — it only provided false
  // confidence about test isolation. All cases assert the same unlinked
  // state, so a shared module instance is correct.

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

  it('exportVideo() rejects with { type: "unsupported" } and cancel is a no-op', async () => {
    const handle = exportVideo(
      { sourceUri: 'file:///tmp/source.mp4', sessionId: 'test-session' },
      vi.fn(),
    );
    expect(() => handle.cancel()).not.toThrow();
    await expect(handle.promise).rejects.toEqual({ type: 'unsupported' });
  });

  it('cancelVideoExport() is a safe no-op when unlinked', () => {
    expect(() => cancelVideoExport('test-session')).not.toThrow();
  });
});
