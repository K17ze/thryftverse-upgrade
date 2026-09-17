import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, fetchJson } from '../../../../lib/apiClient';
import { waitForPublishableMedia } from '../../../../services/mediaUpload';
import { MultipartUploader, UploadContractError } from '../MultipartUploader';
import { UploadJobStore } from '../UploadJobStore';
import { UploadManager } from '../UploadManager';
import type { UploadJob, UploadJobStatus, UploadSession } from '../UploadTypes';

vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(async () => 'AA=='),
  EncodingType: { Base64: 'base64' },
}));
vi.mock('expo-media-library/legacy', () => ({
  getAssetInfoAsync: vi.fn(async () => { throw new Error('not a library asset'); }),
}));
vi.mock('../../../../platform/media/nativeUploadTransport', () => ({
  putFile: vi.fn(),
  isAbortError: (error: Error) => error.name === 'AbortError',
  createAbortError: () => Object.assign(new Error('Aborted'), { name: 'AbortError' }),
}));
vi.mock('../../../../lib/apiClient', () => ({
  fetchJson: vi.fn(),
  ApiRequestError: class extends Error {
    constructor(message: string, public status?: number) { super(message); }
  },
}));

const key = 'upload-recovery-test';
const canonicalUrl = 'https://cdn.example.test/asset/master.m3u8';
const managers: UploadManager[] = [];
let storage: Map<string, string>;

function session(): UploadSession {
  return {
    sessionId: 'session-1', uploadId: 's3-1', key: 'looks/user/video.mp4',
    totalBytes: 15 * 1024 * 1024, uploadedBytes: 0,
    initiatedAt: Date.now(), expiresAt: Date.now() + 600_000,
    mimeType: 'video/mp4', assetId: 'asset-1',
    parts: [1, 2, 3].map((partNumber) => ({
      partNumber, startByte: (partNumber - 1) * 5 * 1024 * 1024,
      endByte: partNumber * 5 * 1024 * 1024 - 1,
      sizeBytes: 5 * 1024 * 1024, status: 'pending', retries: 0,
    })),
  };
}

function job(id = 'job-1', status: UploadJobStatus = 'queued'): UploadJob {
  return {
    id, projectId: 'project-1', assetId: 'asset-1', localPath: 'file:///video.mp4',
    fileName: 'video.mp4', mimeType: 'video/mp4', sizeBytes: 15 * 1024 * 1024,
    folder: 'looks', progress: 0, status, retries: 0, maxRetries: 3,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

function seed(jobs: UploadJob[]): UploadJobStore {
  storage.set(key, JSON.stringify(jobs));
  return new UploadJobStore(key);
}

function createManager(store: UploadJobStore): UploadManager {
  const manager = new UploadManager(store);
  managers.push(manager);
  return manager;
}

async function finish(manager: UploadManager): Promise<UploadJob> {
  await manager.processQueue();
  await vi.advanceTimersByTimeAsync(10_000);
  const jobs = await manager.getJobs('project-1');
  return jobs[0];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  storage = new Map();
  vi.mocked(AsyncStorage.getItem).mockImplementation(async (k) => storage.get(k) ?? null);
  vi.mocked(AsyncStorage.setItem).mockImplementation(async (k, value) => { storage.set(k, value); });
  vi.mocked(fetchJson).mockResolvedValue({
    asset: { id: 'media-1', status: 'published', canonicalUrl },
  });
});

afterEach(() => {
  managers.splice(0).forEach((manager) => manager.dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('upload crash recovery', () => {
  it('rehydrates confirming and stalled jobs without losing checkpoints', async () => {
    const confirming = { ...job('confirming', 'confirming'), session: session(), progress: 1 };
    const uploadedObject = {
      uploadIntentId: 'intent-1', bucket: 'media', key: 'looks/user/photo.jpg',
      publicUrl: 'https://cdn.example.test/photo.jpg', contentType: 'image/jpeg',
      sizeBytes: 1024, expiresAt: new Date(Date.now() + 600_000).toISOString(),
    };
    const store = seed([confirming, { ...job('stalled', 'stalled'), uploadedObject }]);
    expect(await store.loadJobs()).toEqual([
      { ...confirming, status: 'queued' },
      { ...job('stalled', 'stalled'), uploadedObject, status: 'queued' },
    ]);
  });

  it.each(['reconcileOnStartup', 'resumePendingJobs'] as const)(
    '%s recovers confirming jobs even when a store returns raw states', async (method) => {
      const confirming = { ...job('confirming', 'confirming'), session: session() };
      const store = seed([confirming]);
      vi.spyOn(store, 'loadJobs').mockResolvedValue([confirming]);
      const manager = createManager(store);
      manager.setOnline(false);
      await manager[method]();
      expect((await manager.getJobs('project-1'))[0]).toMatchObject({
        status: 'queued', session: confirming.session,
      });
    },
  );

  it.each(['add', 'update', 'remove'] as const)(
    '%s does not apply restart normalization to other live jobs', async (operation) => {
      const live = [job('uploading', 'uploading'), job('confirming', 'confirming')];
      const store = seed([...live, job('other')]);
      if (operation === 'add') await store.addJob(job('new'));
      if (operation === 'update') await store.updateJob('other', { progress: 0.5 });
      if (operation === 'remove') await store.removeJob('other');
      const persisted = JSON.parse(storage.get(key)!) as UploadJob[];
      expect(persisted.slice(0, 2)).toEqual(live);
    },
  );

  it('recovers previously completed receipt-only jobs from disk and from the live cache', async () => {
    const broken = { ...job('job-1', 'completed'), finalizationId: 'fin-1', session: session() };
    const store = seed([broken]);
    expect((await store.loadJobs())[0]).toMatchObject({ status: 'queued', session: broken.session });
    vi.spyOn(store, 'loadJobs').mockResolvedValue([broken]);
    const manager = createManager(store);
    manager.setOnline(false);
    expect(await manager.queueUpload({
      projectId: broken.projectId, assetId: broken.assetId, localPath: broken.localPath, folder: broken.folder,
    })).toBe(broken.id);
    expect((await manager.getJobs('project-1'))[0]).toMatchObject({ status: 'queued', session: broken.session });
  });

  it('leaves paused and trusted terminal jobs unchanged', async () => {
    const jobs = [job('paused', 'paused'), job('failed', 'failed'), {
      ...job('completed', 'completed'), finalizationId: 'fin-1', remoteUrl: canonicalUrl,
    }];
    expect(await seed(jobs).loadJobs()).toEqual(jobs);
  });
});

describe('upload attempt recovery', () => {
  it('reuses a checkpointed multipart session and ETags on an in-run retry', async () => {
    const initiate = vi.spyOn(MultipartUploader.prototype, 'initiate')
      .mockImplementation(async () => session());
    const resumed: UploadSession[] = [];
    vi.spyOn(MultipartUploader.prototype, 'resume').mockImplementation(
      async (current, _path, _progress, _signal, onPartComplete) => {
        resumed.push(structuredClone(current));
        if (resumed.length === 1) {
          current.parts[0].status = 'completed';
          current.parts[0].etag = 'etag-1';
          onPartComplete?.(current.parts[0]);
          throw new Error('Network unavailable');
        }
        return { publicUrl: 'https://cdn.example.test/video.mp4', finalizationId: 'fin-1', mediaAssetId: 'media-1' };
      },
    );
    const result = await finish(createManager(seed([job()])));
    expect(result).toMatchObject({ status: 'completed', remoteUrl: canonicalUrl, finalizationId: 'fin-1' });
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(resumed[1]).toMatchObject({ sessionId: 'session-1', parts: [
      expect.objectContaining({ status: 'completed', etag: 'etag-1' }),
      expect.anything(), expect.anything(),
    ] });
  });

  it.each([400, 401, 403, 404, 410, 422])('does not retry permanent HTTP %i', async (status) => {
    const initiate = vi.spyOn(MultipartUploader.prototype, 'initiate')
      .mockRejectedValue(new ApiRequestError('Request rejected', status));
    const result = await finish(createManager(seed([job()])));
    expect(result).toMatchObject({ status: 'failed', error: 'Request rejected', retries: 0 });
    expect(initiate).toHaveBeenCalledTimes(1);
  });

  it.each([408, 429, 503, undefined])('retries transient HTTP %s and network errors', async (status) => {
    const initiate = vi.spyOn(MultipartUploader.prototype, 'initiate')
      .mockRejectedValueOnce(status ? new ApiRequestError('Transient', status) : new Error('Network'))
      .mockResolvedValue(session());
    vi.spyOn(MultipartUploader.prototype, 'resume').mockResolvedValue({
      publicUrl: 'https://cdn.example.test/video.mp4', finalizationId: 'fin-1', mediaAssetId: 'media-1',
    });
    expect(await finish(createManager(seed([job()])))).toMatchObject({ status: 'completed', remoteUrl: canonicalUrl });
    expect(initiate).toHaveBeenCalledTimes(2);
  });

  it('does not burn retries on a malformed successful completion receipt', async () => {
    vi.spyOn(MultipartUploader.prototype, 'initiate').mockResolvedValue(session());
    const resume = vi.spyOn(MultipartUploader.prototype, 'resume')
      .mockRejectedValue(new UploadContractError('Upload completion response is missing the finalized media reference'));
    const result = await finish(createManager(seed([job()])));
    expect(result).toMatchObject({ status: 'failed', retries: 0 });
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('does not retry terminal media rejection or lose actionable copy', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ asset: { status: 'quarantined', failureReason: 'Choose a different file' } });
    vi.spyOn(MultipartUploader.prototype, 'initiate').mockResolvedValue(session());
    const resume = vi.spyOn(MultipartUploader.prototype, 'resume').mockResolvedValue({
      publicUrl: 'https://cdn.example.test/video.mp4', finalizationId: 'fin-1', mediaAssetId: 'media-1',
    });
    expect(await finish(createManager(seed([job()])))).toMatchObject({ status: 'failed', error: 'Choose a different file' });
    expect(resume).toHaveBeenCalledTimes(1);
    await expect(waitForPublishableMedia('media-1')).rejects.toMatchObject({
      name: 'MediaProcessingError', status: 'quarantined', message: 'Choose a different file',
    });
  });
});

describe('multipart URL expiry', () => {
  it('keeps the server session deadline separate from refreshed part URL deadlines', async () => {
    vi.stubGlobal('XMLHttpRequest', class {
      status = 200;
      upload = {};
      onload?: () => void;
      open() {}
      setRequestHeader() {}
      getResponseHeader() { return 'etag-1'; }
      send() { this.onload?.(); }
      abort() {}
    });
    const current = session();
    current.expiresAt = Date.now() - 1;
    const deadline = Date.now() + 6 * 24 * 60 * 60 * 1000;
    vi.mocked(fetchJson).mockResolvedValue({
      ok: true, expiresAt: new Date(deadline).toISOString(),
      presignedParts: current.parts.map((part) => ({
        partNumber: part.partNumber, url: 'https://storage.example.test/part', expiresInSeconds: 600,
      })),
    });
    await new MultipartUploader().uploadPart(current, current.parts[0], 'file:///video.mp4', () => {}, new AbortController().signal);
    expect(current.expiresAt).toBe(deadline);
    expect(current.parts[0].presignedUrlExpiresAt).toBe(Date.now() + 600_000);
    expect(current.parts[0]).toMatchObject({ status: 'completed', etag: 'etag-1' });
  });
});

describe('multipart completion contract', () => {
  function completeSession() {
    const current = session();
    current.parts.forEach((part) => { part.status = 'completed'; part.etag = `etag-${part.partNumber}`; });
    return current;
  }

  it('rejects a receipt-only duplicate response without declaring completion', async () => {
    const current = completeSession();
    vi.mocked(fetchJson).mockResolvedValue({ ok: true, finalizationId: 'fin-1', duplicate: true });
    await expect(new MultipartUploader().complete(current)).rejects.toThrow('finalized media reference');
    expect(current.finalizationId).toBeUndefined();
  });

  it('retains all fields from a full replay response', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      ok: true, finalizationId: 'fin-1', objectKey: 'looks/user/video.mp4',
      publicUrl: 'https://cdn.example.test/video.mp4', duplicate: true,
      mediaAsset: { id: 'media-1', status: 'integrity_verified' },
    });
    await expect(new MultipartUploader().complete(completeSession())).resolves.toEqual({
      publicUrl: 'https://cdn.example.test/video.mp4', finalizationId: 'fin-1', mediaAssetId: 'media-1',
    });
  });
});

describe('lifecycle races', () => {
  it('resumeJob does not double-drive or re-queue a live attempt', async () => {
    vi.spyOn(MultipartUploader.prototype, 'initiate').mockResolvedValue(session());
    let resumeCalls = 0;
    let unblock: (() => void) | undefined;
    vi.spyOn(MultipartUploader.prototype, 'resume').mockImplementation(
      () => new Promise((resolve) => {
        resumeCalls += 1;
        unblock = () => resolve({
          publicUrl: 'https://cdn.example.test/video.mp4',
          finalizationId: 'fin-1',
          mediaAssetId: 'media-1',
        });
      }),
    );
    const manager = createManager(seed([job()]));
    void manager.processQueue();
    // Flush microtasks so initiate+resume are in flight before the resume call.
    await vi.advanceTimersByTimeAsync(0);
    expect(resumeCalls).toBe(1);

    await manager.resumeJob('job-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(resumeCalls).toBe(1);
    expect((await manager.getJobs('project-1'))[0].status).toBe('uploading');

    unblock!();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await manager.getJobs('project-1'))[0].status).toBe('completed');
  });

  it('retryJob only re-queues failed jobs', async () => {
    const manager = createManager(seed([
      job('paused-job', 'paused'),
      job('queued-job', 'queued'),
      job('failed-job', 'failed'),
    ]));
    manager.setOnline(false);
    await manager.getJobs('project-1'); // hydrate the cache
    await manager.retryJob('paused-job');
    await manager.retryJob('queued-job');
    await manager.retryJob('failed-job');
    const jobs = await manager.getJobs('project-1');
    expect(jobs.find((j) => j.id === 'paused-job')?.status).toBe('paused');
    expect(jobs.find((j) => j.id === 'queued-job')?.status).toBe('queued');
    expect(jobs.find((j) => j.id === 'failed-job')).toMatchObject({ status: 'queued', retries: 0 });
  });

  it('resumeJob re-queues paused and failed jobs', async () => {
    const manager = createManager(seed([job('paused-job', 'paused'), job('failed-job', 'failed')]));
    manager.setOnline(false);
    await manager.getJobs('project-1'); // hydrate the cache
    await manager.resumeJob('paused-job');
    await manager.resumeJob('failed-job');
    const jobs = await manager.getJobs('project-1');
    expect(jobs.every((j) => j.status === 'queued')).toBe(true);
  });
});

describe('waitForProjectCompletion', () => {
  it('resolves with paused jobs instead of hanging on user-paused work', async () => {
    const manager = createManager(seed([job('paused-job', 'paused')]));
    manager.setOnline(false);
    const jobs = await manager.waitForProjectCompletion('project-1');
    expect(jobs[0].status).toBe('paused');
  });

  it('resolves with the latest list when the wait is aborted', async () => {
    const manager = createManager(seed([job('queued-job', 'queued')]));
    manager.setOnline(false);
    const controller = new AbortController();
    const pending = manager.waitForProjectCompletion('project-1', 50, { signal: controller.signal });
    // Let the first poll reach its sleep before aborting.
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    const jobs = await pending;
    expect(jobs[0].status).toBe('queued');
  });
});

describe('dead multipart session', () => {
  it.each([404, 409, 410])(
    're-initiates once on a dead-session %i instead of replaying it forever',
    async (status) => {
      const dead = session();
      const fresh = { ...session(), sessionId: 'session-2', uploadId: 's3-2' };
      const initiate = vi.spyOn(MultipartUploader.prototype, 'initiate')
        .mockResolvedValue(fresh);
      const resumed: string[] = [];
      vi.spyOn(MultipartUploader.prototype, 'resume').mockImplementation(
        async (current) => {
          resumed.push(current.sessionId ?? 'none');
          if (current.sessionId === 'session-1') {
            throw new ApiRequestError('Session gone', status);
          }
          return {
            publicUrl: 'https://cdn.example.test/video.mp4',
            finalizationId: 'fin-2',
            mediaAssetId: 'media-1',
          };
        },
      );

      const seeded = { ...job(), session: dead };
      const manager = createManager(seed([seeded]));
      const result = await finish(manager);
      expect(result).toMatchObject({ status: 'completed', finalizationId: 'fin-2' });
      expect(initiate).toHaveBeenCalledTimes(1);
      expect(resumed).toEqual(['session-1', 'session-2']);
    },
  );
});

describe('pause during unwind', () => {
  it('resumeJob is a no-op while the aborted attempt is still unwinding', async () => {
    vi.spyOn(MultipartUploader.prototype, 'initiate').mockResolvedValue(session());
    let resumeCalls = 0;
    let unblock: (() => void) | undefined;
    vi.spyOn(MultipartUploader.prototype, 'resume').mockImplementation(
      (_s, _p, _progress, signal) =>
        new Promise((resolve, reject) => {
          resumeCalls += 1;
          const onAbort = () => reject(new Error('Aborted'));
          if (signal.aborted) return onAbort();
          signal.addEventListener('abort', onAbort, { once: true });
          unblock = () =>
            resolve({
              publicUrl: 'https://cdn.example.test/video.mp4',
              finalizationId: 'fin-1',
              mediaAssetId: 'media-1',
            });
        }),
    );

    const manager = createManager(seed([job()]));
    void manager.processQueue();
    await vi.advanceTimersByTimeAsync(0);
    expect(resumeCalls).toBe(1);

    // Pause aborts the attempt; the unwind is async. A resume landing
    // inside that window must no-op — otherwise a second processJob
    // starts while the first still owns the controller.
    manager.pauseJob('job-1');
    await manager.resumeJob('job-1');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(resumeCalls).toBe(1);
    expect((await manager.getJobs('project-1'))[0].status).toBe('paused');

    // After the unwind completes, resume works and no 'failed' ghost
    // write ever landed.
    await manager.resumeJob('job-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(resumeCalls).toBe(2);
    unblock!();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await manager.getJobs('project-1'))[0].status).toBe('completed');
  });
});

describe('single-PUT intent checkpoint', () => {
  const uploadedObject = {
    uploadIntentId: 'intent-1', bucket: 'media', key: 'looks/user/photo.jpg',
    publicUrl: 'https://cdn.example.test/photo.jpg', contentType: 'image/jpeg',
    sizeBytes: 1024, expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };

  it.each([404, 410])('clears the dead uploadedObject on finalize %i so the retry re-presigns', async (status) => {
    const small = { ...job(), sizeBytes: 1024, mimeType: 'image/jpeg', fileName: 'photo.jpg' };
    const manager = createManager(seed([{ ...small, uploadedObject }]));
    vi.mocked(fetchJson).mockRejectedValueOnce(new ApiRequestError('Gone', status));

    await manager.processQueue();
    await vi.advanceTimersByTimeAsync(10_000);
    const [failed] = await manager.getJobs('project-1');
    expect(failed.status).toBe('failed');
    expect(failed.uploadedObject).toBeUndefined();

    // Manual retry must re-presign (a fresh intent) rather than replay the dead one.
    vi.mocked(fetchJson).mockImplementation(async (url) => {
      if (url === '/uploads/presign') {
        return {
          uploadIntentId: 'intent-2', url: 'https://s3.example.test/put', bucket: 'media',
          key: 'looks/user/photo-2.jpg', publicUrl: 'https://cdn.example.test/photo-2.jpg',
          contentType: 'image/jpeg', sizeBytes: 1024, maxSizeBytes: 1024,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        } as never;
      }
      if (url === '/uploads/finalize') {
        return {
          ok: true,
          finalization: { id: 'fin-9', status: 'finalized', mediaAsset: { id: 'media-9' } },
        } as never;
      }
      return { asset: { id: 'media-9', status: 'published', canonicalUrl } } as never;
    });
    const { putFile } = await import('../../../../platform/media/nativeUploadTransport');
    vi.mocked(putFile).mockResolvedValue(undefined as never);

    await manager.retryJob(failed.id);
    await manager.processQueue();
    await vi.advanceTimersByTimeAsync(10_000);
    const [retried] = await manager.getJobs('project-1');
    expect(retried).toMatchObject({ status: 'completed', remoteUrl: 'https://cdn.example.test/photo-2.jpg' });
  });
});

describe('enqueue dedup + retention', () => {
  it('concurrent queueUpload calls for the same asset join into one job', async () => {
    const { getInfoAsync } = await import('expo-file-system/legacy');
    vi.mocked(getInfoAsync).mockResolvedValue({ exists: true, size: 15 * 1024 * 1024 } as never);
    const manager = createManager(seed([]));
    manager.setOnline(false);

    const params = {
      projectId: 'project-1', assetId: 'asset-1',
      localPath: 'file:///video.mp4', fileName: 'video.mp4', folder: 'looks',
    };
    const [first, second] = await Promise.all([
      manager.queueUpload(params),
      manager.queueUpload(params),
    ]);
    expect(second).toBe(first);
    expect(await manager.getJobs('project-1')).toHaveLength(1);
  });

  it('purges terminal jobs older than the retention window on hydrate', async () => {
    const stale = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const manager = createManager(seed([
      { ...job('old-complete', 'completed'), updatedAt: stale, remoteUrl: canonicalUrl, finalizationId: 'fin' },
      { ...job('old-failed', 'failed'), updatedAt: stale },
      job('fresh-paused', 'paused'),
    ]));
    manager.setOnline(false);
    const jobs = await manager.getJobs('project-1');
    expect(jobs.map((j) => j.id)).toEqual(['fresh-paused']);
  });
});
