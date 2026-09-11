import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UploadManager } from '../UploadManager';
import type { UploadJob, UploadJobStatus } from '../UploadTypes';

/**
 * A minimal, in-memory mock of `UploadJobStore`. Unlike the real store,
 * `loadJobs` here returns jobs verbatim (no `uploading`/`initiating` →
 * `queued` rewrite) so the manager's own defensive reconciliation is
 * exercised. `updateJob` records mutations so tests can assert on them.
 */
type JobRecord = {
  job: UploadJob;
  updates: Partial<UploadJob>[];
};

function createMockStore(initialJobs: UploadJob[]) {
  const jobs = new Map<string, JobRecord>();
  for (const job of initialJobs) {
    jobs.set(job.id, { job: { ...job }, updates: [] });
  }
  const updateJob = vi.fn(async (jobId: string, updates: Partial<UploadJob>) => {
    const record = jobs.get(jobId);
    if (!record) return;
    record.job = { ...record.job, ...updates, updatedAt: Date.now() };
    record.updates.push(updates);
  });
  const loadJobs = vi.fn(async (): Promise<UploadJob[]> => {
    return Array.from(jobs.values()).map((r) => ({ ...r.job }));
  });
  return {
    loadJobs,
    updateJob,
    addJob: vi.fn(async (job: UploadJob) => {
      jobs.set(job.id, { job: { ...job }, updates: [] });
    }),
    removeJob: vi.fn(async (jobId: string) => {
      jobs.delete(jobId);
    }),
    saveJobs: vi.fn(async () => {}),
    getJobsByProject: vi.fn(async () => []),
    getPendingJobs: vi.fn(async () => []),
    /** Expose the in-memory records for assertions. */
    records: jobs,
  };
}

function makeJob(id: string, status: UploadJobStatus): UploadJob {
  const now = Date.now();
  return {
    id,
    projectId: 'proj_1',
    assetId: `asset_${id}`,
    localPath: `file:///tmp/${id}.jpg`,
    fileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    status,
    progress: 0,
    retries: 0,
    maxRetries: 5,
    folder: 'looks',
    createdAt: now,
    updatedAt: now,
  };
}

describe('UploadManager.reconcileOnStartup', () => {
  beforeEach(() => {
    // The manager sets up a setInterval-based stall checker on
    // construction. Stub timers so no background tick interferes with
    // the assertions.
    vi.useFakeTimers();
  });

  it('re-queues uploading, initiating and stalled jobs, counts resumable work, and processes the queue', async () => {
    const initialJobs: UploadJob[] = [
      makeJob('queued_1', 'queued'),
      makeJob('stalled_1', 'stalled'),
      makeJob('uploading_1', 'uploading'),
      makeJob('initiating_1', 'initiating'),
      makeJob('completed_1', 'completed'),
      makeJob('failed_1', 'failed'),
    ];
    const store = createMockStore(initialJobs);
    const manager = new UploadManager(store as unknown as never, {
      multipartEnabled: false,
    });

    // Spy on processQueue to verify it is invoked without driving the
    // real network transport (which would attempt real uploads).
    const processQueueSpy = vi
      .spyOn(manager, 'processQueue')
      .mockResolvedValue(undefined);

    const result = await manager.reconcileOnStartup();

    // resumedCount covers queued + uploading + initiating + stalled (4).
    expect(result.resumedCount).toBe(4);

    // uploading / initiating jobs must be rewritten to `queued`.
    const uploadingRecord = store.records.get('uploading_1');
    const initiatingRecord = store.records.get('initiating_1');
    expect(uploadingRecord?.job.status).toBe('queued');
    expect(initiatingRecord?.job.status).toBe('queued');

    // stalled jobs must be rewritten to `queued`.
    const stalledRecord = store.records.get('stalled_1');
    expect(stalledRecord?.job.status).toBe('queued');

    // The already-queued job must NOT receive a status mutation.
    const queuedRecord = store.records.get('queued_1');
    expect(queuedRecord?.job.status).toBe('queued');
    expect(queuedRecord?.updates.some((u) => 'status' in u)).toBe(false);

    // Terminal jobs must be left untouched.
    expect(store.records.get('completed_1')?.job.status).toBe('completed');
    expect(store.records.get('failed_1')?.job.status).toBe('failed');

    // processQueue must be kicked off so re-queued jobs actually start.
    expect(processQueueSpy).toHaveBeenCalledTimes(1);

    manager.dispose();
    vi.useRealTimers();
  });

  it('returns zero and does not touch terminal jobs when there is nothing to resume', async () => {
    const initialJobs: UploadJob[] = [
      makeJob('completed_1', 'completed'),
      makeJob('failed_1', 'failed'),
    ];
    const store = createMockStore(initialJobs);
    const manager = new UploadManager(store as unknown as never, {
      multipartEnabled: false,
    });
    const processQueueSpy = vi
      .spyOn(manager, 'processQueue')
      .mockResolvedValue(undefined);

    const result = await manager.reconcileOnStartup();

    expect(result.resumedCount).toBe(0);
    expect(store.records.get('completed_1')?.job.status).toBe('completed');
    expect(store.records.get('failed_1')?.job.status).toBe('failed');
    // processQueue is still called (no-op when nothing is queued) so the
    // manager is in a consistent processing state.
    expect(processQueueSpy).toHaveBeenCalledTimes(1);

    manager.dispose();
    vi.useRealTimers();
  });

  it('is idempotent — a second reconcile does not resurrect terminal or already-queued jobs', async () => {
    const initialJobs: UploadJob[] = [
      makeJob('queued_1', 'queued'),
      makeJob('stalled_1', 'stalled'),
    ];
    const store = createMockStore(initialJobs);
    const manager = new UploadManager(store as unknown as never, {
      multipartEnabled: false,
    });
    vi.spyOn(manager, 'processQueue').mockResolvedValue(undefined);

    const first = await manager.reconcileOnStartup();
    expect(first.resumedCount).toBe(2);
    expect(store.records.get('stalled_1')?.job.status).toBe('queued');

    // After the first reconcile, every recoverable job is `queued`. A
    // second reconcile should count the same queued jobs but apply no
    // further status transitions.
    const stalledUpdatesBefore = store.records.get('stalled_1')?.updates.length ?? 0;
    const second = await manager.reconcileOnStartup();
    expect(second.resumedCount).toBe(2);
    expect(store.records.get('stalled_1')?.updates.length).toBe(stalledUpdatesBefore);

    manager.dispose();
    vi.useRealTimers();
  });
});
