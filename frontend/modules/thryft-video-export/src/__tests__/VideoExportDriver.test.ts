/**
 * exportVideo driver tests — progress polling + cancellation over a
 * mocked native HybridObject.
 *
 * The mock `NitroModules` reports the module as registered and returns a
 * controllable fake implementing the `VideoExportModule` surface, so the
 * driver's poll/cancel plumbing can be exercised without a device.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeModule = {
  isAvailable: vi.fn(() => true),
  exportVideo: vi.fn(),
  cancelExport: vi.fn(),
  getExportProgress: vi.fn(() => 0),
};

vi.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    hasHybridObject: vi.fn(() => true),
    createHybridObject: vi.fn(() => fakeModule),
  },
}));

import { exportVideo } from '../index';

describe('exportVideo driver (native module linked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeModule.getExportProgress.mockReturnValue(0);
  });

  it('resolves with the native result and stops polling', async () => {
    const result = {
      uri: 'file:///tmp/out.mp4',
      width: 1080,
      height: 1920,
      durationMs: 5000,
      sizeBytes: 1024,
      mimeType: 'video/mp4',
    };
    fakeModule.exportVideo.mockResolvedValue(result);

    const onProgress = vi.fn();
    const handle = exportVideo(
      { sourceUri: 'file:///tmp/in.mp4', sessionId: 's1' },
      onProgress,
    );

    await expect(handle.promise).resolves.toEqual(result);
    expect(fakeModule.exportVideo).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1' }),
    );
  });

  it('polls progress on the module while exporting', async () => {
    fakeModule.exportVideo.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({}), 600)),
    );
    fakeModule.getExportProgress.mockReturnValue(0.5);

    const onProgress = vi.fn();
    vi.useFakeTimers();
    try {
      const handle = exportVideo(
        { sourceUri: 'file:///tmp/in.mp4', sessionId: 's2' },
        onProgress,
      );
      await vi.advanceTimersByTimeAsync(600);
      // Suppress the unhandled-finally path while timers are mocked.
      handle.promise.catch(() => {});
      expect(fakeModule.getExportProgress).toHaveBeenCalledWith('s2');
      expect(onProgress).toHaveBeenCalledWith(0.5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel() calls cancelExport with the session id', async () => {
    let rejectExport: (e: unknown) => void = () => {};
    fakeModule.exportVideo.mockImplementation(
      () => new Promise((_, reject) => { rejectExport = reject; }),
    );

    const handle = exportVideo({
      sourceUri: 'file:///tmp/in.mp4',
      sessionId: 's3',
    });
    handle.cancel();
    expect(fakeModule.cancelExport).toHaveBeenCalledWith('s3');

    // Simulate the native side rejecting with a tagged cancel error —
    // the JS driver must surface { type: 'cancelled' }.
    rejectExport(new Error('cancelled: Export was cancelled.'));
    await expect(handle.promise).rejects.toEqual({ type: 'cancelled' });
  });

  it('normalises tagged native error messages into the union', async () => {
    fakeModule.exportVideo.mockRejectedValue(
      new Error('render_failed: encoder crashed'),
    );
    const handle = exportVideo({
      sourceUri: 'file:///tmp/in.mp4',
      sessionId: 's4',
    });
    await expect(handle.promise).rejects.toEqual({
      type: 'render_failed',
      message: 'encoder crashed',
    });
  });
});
