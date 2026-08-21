import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UploadJob } from './UploadTypes';

/**
 * Persistent job store for the upload manager.
 *
 * Only job *metadata* + multipart session state is persisted — never the
 * media payload. This keeps AsyncStorage writes small and fast even for
 * large media files. The store is intentionally simple: a single JSON
 * array under one key. Job counts are bounded by the number of assets in
 * a creator project, which is small enough that a full load/save per
 * mutation is acceptable.
 *
 * ## Session persistence
 *
 * For multipart uploads, the full `UploadSession` (including per-part
 * ETags and statuses) is persisted as part of the job. On app restart,
 * `loadJobs()` returns jobs with their sessions intact, so the manager
 * can resume at the last completed part — not byte zero.
 *
 * ## Migration
 *
 * Jobs persisted by the previous (whole-Blob PUT) schema are detected by
 * the absence of `localPath` and are silently discarded. They cannot be
 * resumed by the new multipart-aware manager.
 */
export class UploadJobStore {
  private storageKey: string;
  /** AsyncStorage read-modify-write operations must be serialized. Without
   *  this queue, progress events from concurrent jobs can overwrite each
   *  other's newer snapshots. */
  private mutationChain: Promise<void> = Promise.resolve();

  constructor(storageKey = 'creator_upload_jobs_v2') {
    this.storageKey = storageKey;
  }

  /**
   * Load all persisted jobs. Returns an empty array when none exist.
   * Discards jobs in the old format (missing `localPath`).
   */
  async loadJobs(): Promise<UploadJob[]> {
    try {
      const raw = await AsyncStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      // Filter out jobs persisted by the old schema (whole-Blob PUT).
      // Old jobs have `localUri` instead of `localPath` and `state`
      // instead of `status`.
      return parsed.filter(
        (j): j is UploadJob =>
          typeof j === 'object' &&
          j !== null &&
          'localPath' in j &&
          'status' in j,
      ).map((job) => {
        // A process kill cannot leave an active native/XHR task attached to
        // this JS runtime. Rehydrate transient work as queued so the manager
        // restarts it instead of polling an impossible `uploading` state.
        if (job.status === 'uploading' || job.status === 'initiating') {
          return { ...job, status: 'queued' as const, error: undefined };
        }
        // Versionless jobs completed by the old manager contain only an
        // unverified presign URL. They must re-enter the trusted pipeline.
        if (job.status === 'completed' && !job.finalizationId) {
          return {
            ...job,
            status: 'queued' as const,
            progress: 0,
            remoteUrl: undefined,
            error: undefined,
            retries: 0,
          };
        }
        return job;
      });
    } catch {
      // Corrupt or unreadable store — start fresh rather than crashing
      // the publish flow. The caller will re-queue from source of truth.
      return [];
    }
  }

  /** Persist the full job list, replacing any previous value. */
  async saveJobs(jobs: UploadJob[]): Promise<void> {
    await this.enqueueMutation(async () => {
      await this.writeJobs(jobs);
    });
  }

  /** Add a new job and persist. */
  async addJob(job: UploadJob): Promise<void> {
    await this.enqueueMutation(async () => {
      const jobs = await this.loadJobs();
      jobs.push(job);
      await this.writeJobs(jobs);
    });
  }

  /** Apply partial updates to a job and persist. */
  async updateJob(jobId: string, updates: Partial<UploadJob>): Promise<void> {
    await this.enqueueMutation(async () => {
      const jobs = await this.loadJobs();
      const idx = jobs.findIndex((j) => j.id === jobId);
      if (idx === -1) return;
      jobs[idx] = {
        ...jobs[idx],
        ...updates,
        updatedAt: Date.now(),
      };
      await this.writeJobs(jobs);
    });
  }

  /** Remove a job and persist. */
  async removeJob(jobId: string): Promise<void> {
    await this.enqueueMutation(async () => {
      const jobs = await this.loadJobs();
      const next = jobs.filter((j) => j.id !== jobId);
      await this.writeJobs(next);
    });
  }

  /** Return all jobs belonging to a project. */
  async getJobsByProject(projectId: string): Promise<UploadJob[]> {
    const jobs = await this.loadJobs();
    return jobs.filter((j) => j.projectId === projectId);
  }

  /** Return all jobs that are not yet completed. */
  async getPendingJobs(): Promise<UploadJob[]> {
    const jobs = await this.loadJobs();
    return jobs.filter((j) => j.status !== 'completed');
  }

  private async writeJobs(jobs: UploadJob[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(jobs));
    } catch {
      // Storage failures must not abort an in-flight upload. The manager
      // continues from memory and surfaces transport failures separately.
    }
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    const next = this.mutationChain.then(operation, operation);
    this.mutationChain = next.catch(() => undefined);
    return next;
  }
}
