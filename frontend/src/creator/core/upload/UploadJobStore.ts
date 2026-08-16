import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UploadJob } from './UploadTypes';

/**
 * Persistent job store for the upload manager.
 *
 * Only job *metadata* is persisted — never the media payload. This keeps
 * AsyncStorage writes small and fast even for large media files. The
 * store is intentionally simple: a single JSON array under one key. Job
 * counts are bounded by the number of assets in a creator project, which
 * is small enough that a full load/save per mutation is acceptable.
 */
export class UploadJobStore {
  private storageKey: string;

  constructor(storageKey = 'creator_upload_jobs') {
    this.storageKey = storageKey;
  }

  /** Load all persisted jobs. Returns an empty array when none exist. */
  async loadJobs(): Promise<UploadJob[]> {
    try {
      const raw = await AsyncStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as UploadJob[];
    } catch {
      // Corrupt or unreadable store — start fresh rather than crashing
      // the publish flow. The caller will re-queue from source of truth.
      return [];
    }
  }

  /** Persist the full job list, replacing any previous value. */
  async saveJobs(jobs: UploadJob[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(jobs));
    } catch {
      // Storage failures (e.g. quota) must not abort in-flight uploads.
      // The manager keeps working from memory; persistence is best-effort.
    }
  }

  /** Add a new job and persist. */
  async addJob(job: UploadJob): Promise<void> {
    const jobs = await this.loadJobs();
    jobs.push(job);
    await this.saveJobs(jobs);
  }

  /** Apply partial updates to a job and persist. */
  async updateJob(jobId: string, updates: Partial<UploadJob>): Promise<void> {
    const jobs = await this.loadJobs();
    const idx = jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return;
    jobs[idx] = { ...jobs[idx], ...updates, updatedAt: new Date().toISOString() };
    await this.saveJobs(jobs);
  }

  /** Remove a job and persist. */
  async removeJob(jobId: string): Promise<void> {
    const jobs = await this.loadJobs();
    const next = jobs.filter((j) => j.id !== jobId);
    await this.saveJobs(next);
  }

  /** Return all jobs belonging to a project. */
  async getJobsByProject(projectId: string): Promise<UploadJob[]> {
    const jobs = await this.loadJobs();
    return jobs.filter((j) => j.projectId === projectId);
  }

  /** Return all jobs that are not yet complete. */
  async getPendingJobs(): Promise<UploadJob[]> {
    const jobs = await this.loadJobs();
    return jobs.filter((j) => j.state !== 'complete');
  }
}
