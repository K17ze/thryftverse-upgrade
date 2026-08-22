import { Queue, Worker } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { config } from '../config.js';
import { recordBackgroundJob, recordBackgroundJobDuration } from './metrics.js';
import { logger } from './logger.js';

export interface PushJobData {
  eventId: string;
  userId: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  eventType?: string;
  actorUserId?: string | null;
  route?: Record<string, unknown> | null;
}

export interface AuctionSweepJobData {
  reason: 'interval' | 'manual';
}

export interface OnezeWithdrawalExecuteJobData {
  withdrawalId: string;
  initiatedBy: string;
  reason: 'threshold_queue' | 'manual_queue';
}

export interface OnezeMintReserveJobData {
  mintOperationId: string;
  initiatedBy: string;
  reason: 'webhook_confirmed' | 'manual_retry';
}

export interface ReconciliationJobData {
  reason: 'scheduled' | 'manual';
  runDate?: string;
}

export interface OutboxDrainJobData {
  reason: 'scheduled' | 'after_commit' | 'manual';
}

type InfraJobData =
  | AuctionSweepJobData
  | OnezeWithdrawalExecuteJobData
  | OnezeMintReserveJobData
  | ReconciliationJobData
  | OutboxDrainJobData;

interface QueueHandlers {
  handlePushJob: (job: PushJobData) => Promise<void>;
  handleAuctionSweepJob: (job: AuctionSweepJobData) => Promise<void>;
  handleOnezeWithdrawalExecuteJob: (job: OnezeWithdrawalExecuteJobData) => Promise<void>;
  handleOnezeMintReserveJob: (job: OnezeMintReserveJobData) => Promise<void>;
  handleReconciliationJob: (job: ReconciliationJobData) => Promise<void>;
  handleOutboxDrainJob: (job: OutboxDrainJobData) => Promise<void>;
}

export interface BackgroundJobLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

let workerLogger: BackgroundJobLogger | null = null;

function logJobEvent(
  level: 'info' | 'error' | 'warn',
  obj: Record<string, unknown>,
  msg?: string,
): void {
  if (workerLogger) {
    workerLogger[level](obj, msg);
  } else {
    const payload = msg ? { ...obj, msg } : obj;
    if (level === 'error') {
      logger.error(payload, '[queues]');
    } else if (level === 'warn') {
      logger.warn(payload, '[queues]');
    } else {
      logger.info(payload, '[queues]');
    }
  }
}

const queueConnection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 500, 5000),
});
queueConnection.on('error', (err) => {
  logger.warn({ err: err.message }, '[queues] queueConnection redis error');
});

const workerConnection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 500, 5000),
});
workerConnection.on('error', (err) => {
  logger.warn({ err: err.message }, '[queues] workerConnection redis error');
});

const PUSH_QUEUE_NAME = 'push_notifications';
const INFRA_QUEUE_NAME = 'infra_ops';
const PUSH_DLQ_NAME = `${PUSH_QUEUE_NAME}:dlq`;
const INFRA_DLQ_NAME = `${INFRA_QUEUE_NAME}:dlq`;
const DLQ_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export const QUEUE_DLQ_MAP: Record<string, string> = {
  [PUSH_QUEUE_NAME]: PUSH_DLQ_NAME,
  [INFRA_QUEUE_NAME]: INFRA_DLQ_NAME,
};

const pushQueue = new Queue<PushJobData>(PUSH_QUEUE_NAME, {
  connection: queueConnection,
});

const infraQueue = new Queue<InfraJobData>(INFRA_QUEUE_NAME, {
  connection: queueConnection,
});

const pushDlq = new Queue<PushJobData>(PUSH_DLQ_NAME, {
  connection: queueConnection,
});

const infraDlq = new Queue<InfraJobData>(INFRA_DLQ_NAME, {
  connection: queueConnection,
});

export const dlqQueues: Record<string, Queue> = {
  [PUSH_DLQ_NAME]: pushDlq,
  [INFRA_DLQ_NAME]: infraDlq,
};

export const mainQueues: Record<string, Queue> = {
  [PUSH_QUEUE_NAME]: pushQueue,
  [INFRA_QUEUE_NAME]: infraQueue,
};

function moveToDlq(
  dlq: Queue,
  queueName: string,
  job: { id?: string; name: string; data: unknown; opts?: { attempts?: number } },
  err: unknown,
): void {
  const maxAttempts = job.opts?.attempts ?? 1;
  const attemptsMade = (job as { attemptsMade?: number }).attemptsMade ?? maxAttempts;
  if (attemptsMade < maxAttempts) {
    return;
  }

  void dlq
    .add(job.name, job.data as Record<string, unknown>, {
      jobId: job.id,
      removeOnFail: { age: DLQ_RETENTION_SECONDS, count: 10_000 },
      removeOnComplete: true,
    })
    .then(() => {
      logJobEvent(
        'error',
        { queue: queueName, dlq: dlq.name, job: job.name, jobId: job.id, err },
        'job_moved_to_dlq',
      );
    })
    .catch((dlqErr) => {
      logJobEvent(
        'error',
        { queue: queueName, job: job.name, jobId: job.id, err: dlqErr },
        'failed_to_move_job_to_dlq',
      );
    });
}

let pushWorker: Worker<PushJobData> | null = null;
let infraWorker: Worker<InfraJobData> | null = null;

export function startBackgroundWorkers(
  handlers: QueueHandlers,
  logger?: BackgroundJobLogger,
): void {
  if (logger) {
    workerLogger = logger;
  }

  if (!pushWorker) {
    pushWorker = new Worker<PushJobData>(
      PUSH_QUEUE_NAME,
      async (job) => {
        const jobStart = Date.now();
        logJobEvent('info', { queue: PUSH_QUEUE_NAME, job: job.name, jobId: job.id }, 'background_job_started');
        try {
          await handlers.handlePushJob(job.data);
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: PUSH_QUEUE_NAME,
            job: job.name,
            result: 'completed',
          });
          recordBackgroundJobDuration({
            queue: PUSH_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('info', { queue: PUSH_QUEUE_NAME, job: job.name, jobId: job.id, durationMs }, 'background_job_completed');
        } catch (error) {
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: PUSH_QUEUE_NAME,
            job: job.name,
            result: 'failed',
          });
          recordBackgroundJobDuration({
            queue: PUSH_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('error', { queue: PUSH_QUEUE_NAME, job: job.name, jobId: job.id, durationMs, err: error }, 'background_job_failed');
          throw error;
        }
      },
      {
        connection: workerConnection,
        concurrency: 6,
      }
    );
    pushWorker.on('error', (err) => {
      logJobEvent('warn', { err: err.message }, 'pushWorker error');
    });
    pushWorker.on('failed', (job, err) => {
      if (job) {
        moveToDlq(pushDlq, PUSH_QUEUE_NAME, job, err);
      }
    });
  }

  if (!infraWorker) {
    infraWorker = new Worker<InfraJobData>(
      INFRA_QUEUE_NAME,
      async (job) => {
        const jobStart = Date.now();
        logJobEvent('info', { queue: INFRA_QUEUE_NAME, job: job.name, jobId: job.id }, 'background_job_started');
        try {
          if (job.name === 'auction_sweep') {
            await handlers.handleAuctionSweepJob(job.data as AuctionSweepJobData);
          } else if (job.name === 'oneze_withdraw_execute') {
            await handlers.handleOnezeWithdrawalExecuteJob(job.data as OnezeWithdrawalExecuteJobData);
          } else if (job.name === 'oneze_mint_reserve_allocate') {
            await handlers.handleOnezeMintReserveJob(job.data as OnezeMintReserveJobData);
          } else if (job.name === 'reconciliation_run') {
            await handlers.handleReconciliationJob(job.data as ReconciliationJobData);
          } else if (job.name === 'domain_outbox_drain') {
            await handlers.handleOutboxDrainJob(job.data as OutboxDrainJobData);
          }

          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: INFRA_QUEUE_NAME,
            job: job.name,
            result: 'completed',
          });
          recordBackgroundJobDuration({
            queue: INFRA_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('info', { queue: INFRA_QUEUE_NAME, job: job.name, jobId: job.id, durationMs }, 'background_job_completed');
        } catch (error) {
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: INFRA_QUEUE_NAME,
            job: job.name,
            result: 'failed',
          });
          recordBackgroundJobDuration({
            queue: INFRA_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('error', { queue: INFRA_QUEUE_NAME, job: job.name, jobId: job.id, durationMs, err: error }, 'background_job_failed');
          throw error;
        }
      },
      {
        connection: workerConnection,
        concurrency: 1,
      }
    );
    infraWorker.on('error', (err) => {
      logJobEvent('warn', { err: err.message }, 'infraWorker error');
    });
    infraWorker.on('failed', (job, err) => {
      if (job) {
        moveToDlq(infraDlq, INFRA_QUEUE_NAME, job, err);
      }
    });
  }
}

export async function enqueuePushNotificationJob(input: PushJobData): Promise<void> {
  await pushQueue.add('push_send', input, {
    jobId: `push_${input.eventId}`,
    attempts: 4,
    backoff: {
      type: 'exponential',
      delay: 2_000,
    },
    removeOnComplete: true,
    removeOnFail: 500,
  });
}

export async function enqueueAuctionSweepJob(reason: 'interval' | 'manual' = 'interval'): Promise<void> {
  const timeBucket = Math.floor(Date.now() / 30_000);

  await infraQueue.add(
    'auction_sweep',
    { reason },
    {
      jobId: `auction_sweep_${timeBucket}`,
      removeOnComplete: true,
      removeOnFail: 100,
    }
  );
}

export async function enqueueOnezeWithdrawalExecuteJob(input: OnezeWithdrawalExecuteJobData): Promise<void> {
  await infraQueue.add(
    'oneze_withdraw_execute',
    input,
    {
      jobId: `oneze_withdraw_execute_${input.withdrawalId}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2_000,
      },
      removeOnComplete: true,
      removeOnFail: 200,
    }
  );
}

export async function enqueueOnezeMintReserveJob(input: OnezeMintReserveJobData): Promise<void> {
  await infraQueue.add(
    'oneze_mint_reserve_allocate',
    input,
    {
      jobId: `oneze_mint_reserve_allocate_${input.mintOperationId}`,
      attempts: 6,
      backoff: {
        type: 'exponential',
        delay: 2_000,
      },
      removeOnComplete: true,
      removeOnFail: 200,
    }
  );
}

export async function enqueueReconciliationJob(input: ReconciliationJobData): Promise<void> {
  const normalizedRunDate = input.runDate ?? new Date().toISOString().slice(0, 10);

  await infraQueue.add(
    'reconciliation_run',
    {
      reason: input.reason,
      runDate: input.runDate,
    },
    {
      jobId: `reconciliation_run_${input.reason}_${normalizedRunDate}`,
      removeOnComplete: true,
      removeOnFail: 100,
    }
  );
}

export async function enqueueOutboxDrainJob(
  reason: OutboxDrainJobData['reason'] = 'scheduled',
): Promise<void> {
  const timeBucket = Math.floor(Date.now() / 2_000);
  await infraQueue.add(
    'domain_outbox_drain',
    { reason },
    {
      jobId: `domain_outbox_drain_${timeBucket}`,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1_000,
      },
      removeOnComplete: true,
      removeOnFail: 200,
    },
  );
}

export async function closeBackgroundQueues(): Promise<void> {
  if (pushWorker) {
    await pushWorker.close();
    pushWorker = null;
  }

  if (infraWorker) {
    await infraWorker.close();
    infraWorker = null;
  }

  await pushQueue.close();
  await infraQueue.close();
  await pushDlq.close();
  await infraDlq.close();
  await workerConnection.quit();
  await queueConnection.quit();
}
