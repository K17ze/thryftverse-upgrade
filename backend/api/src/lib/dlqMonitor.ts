import type { Job, Queue } from 'bullmq';
import { QUEUE_DLQ_MAP, mainQueues, dlqQueues } from './queues.js';
import { logger } from './logger.js';

export interface DLQStats {
  queue: string;
  dlq: string;
  failedCount: number;
}

/**
 * Returns the count of failed jobs in each dead-letter queue.
 */
export async function getDLQStats(): Promise<DLQStats[]> {
  const stats: DLQStats[] = [];

  for (const [queueName, dlqName] of Object.entries(QUEUE_DLQ_MAP)) {
    const dlq = dlqQueues[dlqName];
    if (!dlq) {
      continue;
    }
    try {
      const failedCount = await dlq.getFailedCount();
      stats.push({ queue: queueName, dlq: dlqName, failedCount });
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error.message : String(error), dlq: dlqName },
        '[dlqMonitor] failed to get DLQ count',
      );
      stats.push({ queue: queueName, dlq: dlqName, failedCount: 0 });
    }
  }

  return stats;
}

/**
 * Moves a job from a dead-letter queue back to its main queue for
 * reprocessing. Returns true if the job was successfully replayed.
 */
export async function replayDLQJob(queueName: string, jobId: string): Promise<boolean> {
  const dlqName = QUEUE_DLQ_MAP[queueName];
  if (!dlqName) {
    logger.warn({ queueName }, '[dlqMonitor] unknown queue name for replay');
    return false;
  }

  const dlq = dlqQueues[dlqName] as Queue | undefined;
  const mainQueue = mainQueues[queueName] as Queue | undefined;
  if (!dlq || !mainQueue) {
    logger.warn({ queueName, dlqName }, '[dlqMonitor] queue not found for replay');
    return false;
  }

  const job = (await dlq.getJob(jobId)) as Job | undefined;
  if (!job) {
    logger.warn({ queueName, jobId }, '[dlqMonitor] job not found in DLQ');
    return false;
  }

  try {
    await mainQueue.add(job.name, job.data, {
      jobId: `${job.id}_replay_${Date.now()}`,
    });
    await job.remove();
    logger.info(
      { queueName, jobId, newJobName: job.name },
      '[dlqMonitor] job replayed from DLQ to main queue',
    );
    return true;
  } catch (error) {
    logger.error(
      { err: error, queueName, jobId },
      '[dlqMonitor] failed to replay job from DLQ',
    );
    return false;
  }
}

/**
 * Removes dead-letter queue entries older than the specified number of
 * days. Returns the number of jobs purged.
 */
export async function purgeDLQ(queueName: string, olderThanDays: number): Promise<number> {
  const dlqName = QUEUE_DLQ_MAP[queueName];
  if (!dlqName) {
    logger.warn({ queueName }, '[dlqMonitor] unknown queue name for purge');
    return 0;
  }

  const dlq = dlqQueues[dlqName] as Queue | undefined;
  if (!dlq) {
    logger.warn({ queueName, dlqName }, '[dlqMonitor] DLQ not found for purge');
    return 0;
  }

  const cutoffMs = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const failedJobs = await dlq.getFailed(0, -1);
  let purged = 0;

  for (const job of failedJobs) {
    const jobTimestamp = job.timestamp ?? 0;
    if (jobTimestamp < cutoffMs) {
      try {
        await job.remove();
        purged += 1;
      } catch (error) {
        logger.warn(
          { err: error instanceof Error ? error.message : String(error), jobId: job.id },
          '[dlqMonitor] failed to remove old DLQ job',
        );
      }
    }
  }

  logger.info(
    { queueName, dlqName, purged, olderThanDays },
    '[dlqMonitor] DLQ purge complete',
  );

  return purged;
}
