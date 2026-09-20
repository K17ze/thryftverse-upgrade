import type { Queue, JobsOptions } from 'bullmq';

export interface QueuePriorityConfig {
  priority: number;
}

export type QueuePriorityMap = Record<string, QueuePriorityConfig>;

export interface QueueRateLimitConfig {
  max: number;
  duration: number;
}

export type QueueRateLimitMap = Record<string, QueueRateLimitConfig>;

export interface RepeatableJobConfig {
  name: string;
  data: Record<string, unknown>;
  options: JobsOptions;
}

/**
 * Returns priority configuration for BullMQ queues. Higher numbers mean
 * higher priority (processed first). This is additive configuration —
 * it does not modify existing queue instances.
 */
export function configureQueuePriorities(): QueuePriorityMap {
  // Entries must name real queues in lib/queues.ts — BullMQ applies
  // priority per job at enqueue time, so this map is the shared
  // registry for enqueue call sites.
  return {
    push_notifications: { priority: 5 },
    media_ingest: { priority: 7 },
    media_embedding: { priority: 6 },
    catalog_import: { priority: 3 },
    importer_extraction: { priority: 4 },
    moderation_triage: { priority: 8 },
    infra_ops: { priority: 9 },
    search_indexing: { priority: 2 },
    'agent-runs': { priority: 5 },
  };
}

/**
 * Returns rate limit configuration for BullMQ queues. The `max` value
 * is the maximum number of jobs per `duration` (in milliseconds). This
 * is additive configuration — it does not modify existing queue
 * instances.
 */
export function configureQueueRateLimits(): QueueRateLimitMap {
  // Entries must name real queues in lib/queues.ts. Worker `limiter`
  // options consume this map at worker construction.
  return {
    push_notifications: { max: 100, duration: 1000 },
  };
}

/**
 * Schedules repeatable jobs on the provided queues using BullMQ's
 * repeat pattern. Each job is idempotent — calling this function
 * multiple times will not create duplicate repeatable jobs because
 * BullMQ deduplicates by repeat key. Degrades gracefully and never
 * throws.
 */
export async function scheduleRepeatableJobs(
  queues: Record<string, Queue>,
): Promise<void> {
  const repeatableJobs: Array<{ queueName: string; config: RepeatableJobConfig }> = [
    {
      queueName: 'infra_ops',
      config: {
        name: 'auction_end_check',
        data: { reason: 'scheduled' },
        options: { repeat: { every: 60_000 }, removeOnComplete: true, removeOnFail: 100 },
      },
    },
    {
      queueName: 'infra_ops',
      config: {
        name: 'escrow_release_sweep',
        data: { reason: 'scheduled' },
        options: { repeat: { every: 5 * 60_000 }, removeOnComplete: true, removeOnFail: 100 },
      },
    },
    {
      queueName: 'infra_ops',
      config: {
        name: 'payout_schedule_sweep',
        data: { reason: 'scheduled' },
        options: { repeat: { every: 15 * 60_000 }, removeOnComplete: true, removeOnFail: 100 },
      },
    },
    {
      queueName: 'search_indexing',
      config: {
        name: 'search_index_sync',
        data: { reason: 'scheduled' },
        options: { repeat: { every: 60 * 60_000 }, removeOnComplete: true, removeOnFail: 100 },
      },
    },
    {
      queueName: 'infra_ops',
      config: {
        name: 'analytics_mv_refresh',
        data: { reason: 'scheduled' },
        options: { repeat: { every: 60 * 60_000 }, removeOnComplete: true, removeOnFail: 100 },
      },
    },
    {
      queueName: 'infra_ops',
      config: {
        name: 'backup_check',
        data: { reason: 'scheduled' },
        options: { repeat: { every: 24 * 60 * 60_000 }, removeOnComplete: true, removeOnFail: 100 },
      },
    },
    {
      queueName: 'infra_ops',
      config: {
        name: 'retention_sweep',
        data: { reason: 'scheduled' },
        options: { repeat: { every: 6 * 60 * 60_000 }, removeOnComplete: true, removeOnFail: 100 },
      },
    },
    {
      queueName: 'infra_ops',
      config: {
        name: 'backup_expiry_check',
        data: { reason: 'scheduled' },
        options: { repeat: { every: 24 * 60 * 60_000 }, removeOnComplete: true, removeOnFail: 100 },
      },
    },
  ];

  for (const { queueName, config } of repeatableJobs) {
    const queue = queues[queueName];
    if (!queue) {
      continue;
    }

    try {
      await queue.add(config.name, config.data, config.options);
    } catch {
      // Degrade gracefully — a failed repeatable job schedule should not
      // block startup or other jobs.
    }
  }
}
