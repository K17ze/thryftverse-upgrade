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

export interface RetentionSweepJobData {
  reason: 'scheduled' | 'manual';
}

export interface AnalyticsAggregationJobData {
  reason: 'scheduled' | 'manual';
}

export interface PushReceiptReconciliationJobData {
  reason: 'scheduled' | 'manual';
}

export interface ScheduledPublicationSweepJobData {
  reason: 'scheduled' | 'manual';
}

export interface MediaIngestJobData {
  assetId: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Media embedding queue — offline, versioned embedding generation for
// approved media assets. Kept separate from media_ingest so embedding
// backfill volume never blocks derivative generation / moderation.
// ---------------------------------------------------------------------------

export interface MediaEmbeddingJobData {
  mediaAssetId: string;
  imageUrl: string;
  modelId: string;
  modelVersion: string;
  preprocessingVersion: string;
}

// ---------------------------------------------------------------------------
// Importer extraction intelligence queue — ML-assisted structured extraction
// from catalogue photos. Kept separate from catalog_import so extraction
// model latency never blocks the import saga. Every candidate is advisory
// until the seller accepts it through the revision-checked field-decision
// command. Model identity is server-owned; the job carries the runId and
// the server-selected model bundle.
// ---------------------------------------------------------------------------

export interface ImporterExtractionJobData {
  runId: string;
  itemId: string;
  mediaAssetId: string | null;
  modelBundleId: string;
  modelBundleVersion: string;
}

// ---------------------------------------------------------------------------
// Moderation triage queue — ML-assisted moderation triage with a
// human-in-the-loop gate. Kept separate from media_ingest so triage volume
// (which may call an external model) never blocks derivative generation.
// ---------------------------------------------------------------------------

export interface ModerationTriageJobData {
  mediaAssetId: string;
  modelId: string;
  modelVersion: string;
}

// ---------------------------------------------------------------------------
// Catalogue import queue — dedicated queue for network-heavy import jobs.
// Kept separate from infra_ops so import volume never blocks platform sweeps.
// ---------------------------------------------------------------------------

export interface CatalogImportDiscoveryJobData {
  batchId: string;
}

export interface CatalogImportHydrationJobData {
  batchId: string;
  itemId: string;
}

export interface CatalogImportMediaJobData {
  mediaId: string;
}

export interface CatalogImportNormalisationJobData {
  batchId: string;
  itemId: string;
}

export interface CatalogImportPublicationJobData {
  batchId: string;
}

export interface CatalogImportRetentionJobData {
  batchId: string;
}

export interface CatalogImportReconcileJobData {
  itemId: string;
  publicationKey: string;
}

type CatalogImportJobData =
  | CatalogImportDiscoveryJobData
  | CatalogImportHydrationJobData
  | CatalogImportMediaJobData
  | CatalogImportNormalisationJobData
  | CatalogImportPublicationJobData
  | CatalogImportRetentionJobData
  | CatalogImportReconcileJobData;

type InfraJobData =
  | AuctionSweepJobData
  | OnezeWithdrawalExecuteJobData
  | OnezeMintReserveJobData
  | ReconciliationJobData
  | OutboxDrainJobData
  | RetentionSweepJobData
  | AnalyticsAggregationJobData
  | PushReceiptReconciliationJobData
  | ScheduledPublicationSweepJobData;

interface QueueHandlers {
  handlePushJob: (job: PushJobData) => Promise<void>;
  handleAuctionSweepJob: (job: AuctionSweepJobData) => Promise<void>;
  handleOnezeWithdrawalExecuteJob: (job: OnezeWithdrawalExecuteJobData) => Promise<void>;
  handleOnezeMintReserveJob: (job: OnezeMintReserveJobData) => Promise<void>;
  handleReconciliationJob: (job: ReconciliationJobData) => Promise<void>;
  handleOutboxDrainJob: (job: OutboxDrainJobData) => Promise<void>;
  handleRetentionSweepJob: (job: RetentionSweepJobData) => Promise<void>;
  handleAnalyticsAggregationJob: (job: AnalyticsAggregationJobData) => Promise<void>;
  handlePushReceiptReconciliationJob: (job: PushReceiptReconciliationJobData) => Promise<void>;
  handleScheduledPublicationSweepJob: (job: ScheduledPublicationSweepJobData) => Promise<void>;
  handleMediaIngestJob: (job: MediaIngestJobData) => Promise<void>;
  handleMediaEmbeddingJob: (job: MediaEmbeddingJobData) => Promise<void>;
  handleModerationTriageJob: (job: ModerationTriageJobData) => Promise<void>;
  handleImporterExtractionJob: (job: ImporterExtractionJobData) => Promise<void>;
  handleCatalogImportDiscoveryJob: (job: CatalogImportDiscoveryJobData) => Promise<void>;
  handleCatalogImportHydrationJob: (job: CatalogImportHydrationJobData) => Promise<void>;
  handleCatalogImportMediaJob: (job: CatalogImportMediaJobData) => Promise<void>;
  handleCatalogImportNormalisationJob: (job: CatalogImportNormalisationJobData) => Promise<void>;
  handleCatalogImportPublicationJob: (job: CatalogImportPublicationJobData) => Promise<void>;
  handleCatalogImportRetentionJob: (job: CatalogImportRetentionJobData) => Promise<void>;
  handleCatalogImportReconcileJob: (job: CatalogImportReconcileJobData) => Promise<void>;
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

const queueConnection = new IORedis(config.redisQueueUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 500, 5000),
});
queueConnection.on('error', (err) => {
  logger.warn({ err: err.message }, '[queues] queueConnection redis error');
});

const workerConnection = new IORedis(config.redisQueueUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 500, 5000),
});
workerConnection.on('error', (err) => {
  logger.warn({ err: err.message }, '[queues] workerConnection redis error');
});

const PUSH_QUEUE_NAME = 'push_notifications';
const INFRA_QUEUE_NAME = 'infra_ops';
const MEDIA_INGEST_QUEUE_NAME = 'media_ingest';
const CATALOG_IMPORT_QUEUE_NAME = 'catalog_import';
const MEDIA_EMBEDDING_QUEUE_NAME = 'media_embedding';
const MODERATION_TRIAGE_QUEUE_NAME = 'moderation_triage';
const IMPORTER_EXTRACTION_QUEUE_NAME = 'importer_extraction';
const PUSH_DLQ_NAME = `${PUSH_QUEUE_NAME}:dlq`;
const INFRA_DLQ_NAME = `${INFRA_QUEUE_NAME}:dlq`;
const MEDIA_INGEST_DLQ_NAME = `${MEDIA_INGEST_QUEUE_NAME}:dlq`;
const CATALOG_IMPORT_DLQ_NAME = `${CATALOG_IMPORT_QUEUE_NAME}:dlq`;
const MEDIA_EMBEDDING_DLQ_NAME = `${MEDIA_EMBEDDING_QUEUE_NAME}:dlq`;
const MODERATION_TRIAGE_DLQ_NAME = `${MODERATION_TRIAGE_QUEUE_NAME}:dlq`;
const IMPORTER_EXTRACTION_DLQ_NAME = `${IMPORTER_EXTRACTION_QUEUE_NAME}:dlq`;
const DLQ_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export const QUEUE_DLQ_MAP: Record<string, string> = {
  [PUSH_QUEUE_NAME]: PUSH_DLQ_NAME,
  [INFRA_QUEUE_NAME]: INFRA_DLQ_NAME,
  [MEDIA_INGEST_QUEUE_NAME]: MEDIA_INGEST_DLQ_NAME,
  [CATALOG_IMPORT_QUEUE_NAME]: CATALOG_IMPORT_DLQ_NAME,
  [MEDIA_EMBEDDING_QUEUE_NAME]: MEDIA_EMBEDDING_DLQ_NAME,
  [IMPORTER_EXTRACTION_QUEUE_NAME]: IMPORTER_EXTRACTION_DLQ_NAME,
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

const mediaIngestQueue = new Queue<MediaIngestJobData>(MEDIA_INGEST_QUEUE_NAME, {
  connection: queueConnection,
});

const mediaIngestDlq = new Queue<MediaIngestJobData>(MEDIA_INGEST_DLQ_NAME, {
  connection: queueConnection,
});

const catalogImportQueue = new Queue<CatalogImportJobData>(CATALOG_IMPORT_QUEUE_NAME, {
  connection: queueConnection,
});

const catalogImportDlq = new Queue<CatalogImportJobData>(CATALOG_IMPORT_DLQ_NAME, {
  connection: queueConnection,
});

const mediaEmbeddingQueue = new Queue<MediaEmbeddingJobData>(MEDIA_EMBEDDING_QUEUE_NAME, {
  connection: queueConnection,
});

const mediaEmbeddingDlq = new Queue<MediaEmbeddingJobData>(MEDIA_EMBEDDING_DLQ_NAME, {
  connection: queueConnection,
});

const moderationTriageQueue = new Queue<ModerationTriageJobData>(MODERATION_TRIAGE_QUEUE_NAME, {
  connection: queueConnection,
});

const moderationTriageDlq = new Queue<ModerationTriageJobData>(MODERATION_TRIAGE_DLQ_NAME, {
  connection: queueConnection,
});

const importerExtractionQueue = new Queue<ImporterExtractionJobData>(IMPORTER_EXTRACTION_QUEUE_NAME, {
  connection: queueConnection,
});

const importerExtractionDlq = new Queue<ImporterExtractionJobData>(IMPORTER_EXTRACTION_DLQ_NAME, {
  connection: queueConnection,
});

export const dlqQueues: Record<string, Queue> = {
  [PUSH_DLQ_NAME]: pushDlq,
  [INFRA_DLQ_NAME]: infraDlq,
  [MEDIA_INGEST_DLQ_NAME]: mediaIngestDlq,
  [CATALOG_IMPORT_DLQ_NAME]: catalogImportDlq,
  [MEDIA_EMBEDDING_DLQ_NAME]: mediaEmbeddingDlq,
  [MODERATION_TRIAGE_DLQ_NAME]: moderationTriageDlq,
  [IMPORTER_EXTRACTION_DLQ_NAME]: importerExtractionDlq,
};

export const mainQueues: Record<string, Queue> = {
  [PUSH_QUEUE_NAME]: pushQueue,
  [INFRA_QUEUE_NAME]: infraQueue,
  [MEDIA_INGEST_QUEUE_NAME]: mediaIngestQueue,
  [CATALOG_IMPORT_QUEUE_NAME]: catalogImportQueue,
  [MEDIA_EMBEDDING_QUEUE_NAME]: mediaEmbeddingQueue,
  [MODERATION_TRIAGE_QUEUE_NAME]: moderationTriageQueue,
  [IMPORTER_EXTRACTION_QUEUE_NAME]: importerExtractionQueue,
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
let mediaIngestWorker: Worker<MediaIngestJobData> | null = null;
let catalogImportWorker: Worker<CatalogImportJobData> | null = null;
let mediaEmbeddingWorker: Worker<MediaEmbeddingJobData> | null = null;
let moderationTriageWorker: Worker<ModerationTriageJobData> | null = null;
let importerExtractionWorker: Worker<ImporterExtractionJobData> | null = null;

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
          } else if (job.name === 'retention_sweep') {
            await handlers.handleRetentionSweepJob(job.data as RetentionSweepJobData);
          } else if (job.name === 'analytics_aggregation') {
            await handlers.handleAnalyticsAggregationJob(job.data as AnalyticsAggregationJobData);
          } else if (job.name === 'push_receipt_reconciliation') {
            await handlers.handlePushReceiptReconciliationJob(job.data as PushReceiptReconciliationJobData);
          } else if (job.name === 'scheduled_publication_sweep') {
            await handlers.handleScheduledPublicationSweepJob(job.data as ScheduledPublicationSweepJobData);
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

  if (!mediaIngestWorker) {
    mediaIngestWorker = new Worker<MediaIngestJobData>(
      MEDIA_INGEST_QUEUE_NAME,
      async (job) => {
        const jobStart = Date.now();
        logJobEvent('info', { queue: MEDIA_INGEST_QUEUE_NAME, job: job.name, jobId: job.id }, 'background_job_started');
        try {
          await handlers.handleMediaIngestJob(job.data);
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: MEDIA_INGEST_QUEUE_NAME,
            job: job.name,
            result: 'completed',
          });
          recordBackgroundJobDuration({
            queue: MEDIA_INGEST_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('info', { queue: MEDIA_INGEST_QUEUE_NAME, job: job.name, jobId: job.id, durationMs }, 'background_job_completed');
        } catch (error) {
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: MEDIA_INGEST_QUEUE_NAME,
            job: job.name,
            result: 'failed',
          });
          recordBackgroundJobDuration({
            queue: MEDIA_INGEST_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('error', { queue: MEDIA_INGEST_QUEUE_NAME, job: job.name, jobId: job.id, durationMs, err: error }, 'background_job_failed');
          throw error;
        }
      },
      {
        connection: workerConnection,
        concurrency: 2,
      }
    );
    mediaIngestWorker.on('error', (err) => {
      logJobEvent('warn', { err: err.message }, 'mediaIngestWorker error');
    });
    mediaIngestWorker.on('failed', (job, err) => {
      if (job) {
        moveToDlq(mediaIngestDlq, MEDIA_INGEST_QUEUE_NAME, job, err);
      }
    });
  }

  if (!catalogImportWorker) {
    catalogImportWorker = new Worker<CatalogImportJobData>(
      CATALOG_IMPORT_QUEUE_NAME,
      async (job) => {
        const jobStart = Date.now();
        logJobEvent('info', { queue: CATALOG_IMPORT_QUEUE_NAME, job: job.name, jobId: job.id }, 'background_job_started');
        try {
          if (job.name === 'catalog_import_discover') {
            await handlers.handleCatalogImportDiscoveryJob(job.data as CatalogImportDiscoveryJobData);
          } else if (job.name === 'catalog_import_hydrate') {
            await handlers.handleCatalogImportHydrationJob(job.data as CatalogImportHydrationJobData);
          } else if (job.name === 'catalog_import_media') {
            await handlers.handleCatalogImportMediaJob(job.data as CatalogImportMediaJobData);
          } else if (job.name === 'catalog_import_normalise') {
            await handlers.handleCatalogImportNormalisationJob(job.data as CatalogImportNormalisationJobData);
          } else if (job.name === 'catalog_import_publish') {
            await handlers.handleCatalogImportPublicationJob(job.data as CatalogImportPublicationJobData);
          } else if (job.name === 'catalog_import_retention') {
            await handlers.handleCatalogImportRetentionJob(job.data as CatalogImportRetentionJobData);
          } else if (job.name === 'catalog_import_reconcile') {
            await handlers.handleCatalogImportReconcileJob(job.data as CatalogImportReconcileJobData);
          }

          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: CATALOG_IMPORT_QUEUE_NAME,
            job: job.name,
            result: 'completed',
          });
          recordBackgroundJobDuration({
            queue: CATALOG_IMPORT_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('info', { queue: CATALOG_IMPORT_QUEUE_NAME, job: job.name, jobId: job.id, durationMs }, 'background_job_completed');
        } catch (error) {
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: CATALOG_IMPORT_QUEUE_NAME,
            job: job.name,
            result: 'failed',
          });
          recordBackgroundJobDuration({
            queue: CATALOG_IMPORT_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('error', { queue: CATALOG_IMPORT_QUEUE_NAME, job: job.name, jobId: job.id, durationMs, err: error }, 'background_job_failed');
          throw error;
        }
      },
      {
        connection: workerConnection,
        concurrency: 4,
      }
    );
    catalogImportWorker.on('error', (err) => {
      logJobEvent('warn', { err: err.message }, 'catalogImportWorker error');
    });
    catalogImportWorker.on('failed', (job, err) => {
      if (job) {
        moveToDlq(catalogImportDlq, CATALOG_IMPORT_QUEUE_NAME, job, err);
      }
    });
  }

  if (!mediaEmbeddingWorker) {
    mediaEmbeddingWorker = new Worker<MediaEmbeddingJobData>(
      MEDIA_EMBEDDING_QUEUE_NAME,
      async (job) => {
        const jobStart = Date.now();
        logJobEvent('info', { queue: MEDIA_EMBEDDING_QUEUE_NAME, job: job.name, jobId: job.id }, 'background_job_started');
        try {
          await handlers.handleMediaEmbeddingJob(job.data);
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: MEDIA_EMBEDDING_QUEUE_NAME,
            job: job.name,
            result: 'completed',
          });
          recordBackgroundJobDuration({
            queue: MEDIA_EMBEDDING_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('info', { queue: MEDIA_EMBEDDING_QUEUE_NAME, job: job.name, jobId: job.id, durationMs }, 'background_job_completed');
        } catch (error) {
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: MEDIA_EMBEDDING_QUEUE_NAME,
            job: job.name,
            result: 'failed',
          });
          recordBackgroundJobDuration({
            queue: MEDIA_EMBEDDING_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('error', { queue: MEDIA_EMBEDDING_QUEUE_NAME, job: job.name, jobId: job.id, durationMs, err: error }, 'background_job_failed');
          throw error;
        }
      },
      {
        connection: workerConnection,
        concurrency: 2,
      }
    );
    mediaEmbeddingWorker.on('error', (err) => {
      logJobEvent('warn', { err: err.message }, 'mediaEmbeddingWorker error');
    });
    mediaEmbeddingWorker.on('failed', (job, err) => {
      if (job) {
        moveToDlq(mediaEmbeddingDlq, MEDIA_EMBEDDING_QUEUE_NAME, job, err);
      }
    });
  }

  if (!moderationTriageWorker) {
    moderationTriageWorker = new Worker<ModerationTriageJobData>(
      MODERATION_TRIAGE_QUEUE_NAME,
      async (job) => {
        const jobStart = Date.now();
        logJobEvent('info', { queue: MODERATION_TRIAGE_QUEUE_NAME, job: job.name, jobId: job.id }, 'background_job_started');
        try {
          await handlers.handleModerationTriageJob(job.data);
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: MODERATION_TRIAGE_QUEUE_NAME,
            job: job.name,
            result: 'completed',
          });
          recordBackgroundJobDuration({
            queue: MODERATION_TRIAGE_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('info', { queue: MODERATION_TRIAGE_QUEUE_NAME, job: job.name, jobId: job.id, durationMs }, 'background_job_completed');
        } catch (error) {
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: MODERATION_TRIAGE_QUEUE_NAME,
            job: job.name,
            result: 'failed',
          });
          recordBackgroundJobDuration({
            queue: MODERATION_TRIAGE_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('error', { queue: MODERATION_TRIAGE_QUEUE_NAME, job: job.name, jobId: job.id, durationMs, err: error }, 'background_job_failed');
          throw error;
        }
      },
      {
        connection: workerConnection,
        concurrency: 2,
      }
    );
    moderationTriageWorker.on('error', (err) => {
      logJobEvent('warn', { err: err.message }, 'moderationTriageWorker error');
    });
    moderationTriageWorker.on('failed', (job, err) => {
      if (job) {
        moveToDlq(moderationTriageDlq, MODERATION_TRIAGE_QUEUE_NAME, job, err);
      }
    });
  }

  if (!importerExtractionWorker) {
    importerExtractionWorker = new Worker<ImporterExtractionJobData>(
      IMPORTER_EXTRACTION_QUEUE_NAME,
      async (job) => {
        const jobStart = Date.now();
        logJobEvent('info', { queue: IMPORTER_EXTRACTION_QUEUE_NAME, job: job.name, jobId: job.id }, 'background_job_started');
        try {
          await handlers.handleImporterExtractionJob(job.data);
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: IMPORTER_EXTRACTION_QUEUE_NAME,
            job: job.name,
            result: 'completed',
          });
          recordBackgroundJobDuration({
            queue: IMPORTER_EXTRACTION_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('info', { queue: IMPORTER_EXTRACTION_QUEUE_NAME, job: job.name, jobId: job.id, durationMs }, 'background_job_completed');
        } catch (error) {
          const durationMs = Date.now() - jobStart;
          recordBackgroundJob({
            queue: IMPORTER_EXTRACTION_QUEUE_NAME,
            job: job.name,
            result: 'failed',
          });
          recordBackgroundJobDuration({
            queue: IMPORTER_EXTRACTION_QUEUE_NAME,
            job: job.name,
            durationSeconds: durationMs / 1000,
          });
          logJobEvent('error', { queue: IMPORTER_EXTRACTION_QUEUE_NAME, job: job.name, jobId: job.id, durationMs, err: error }, 'background_job_failed');
          throw error;
        }
      },
      {
        connection: workerConnection,
        concurrency: 2,
      }
    );
    importerExtractionWorker.on('error', (err) => {
      logJobEvent('warn', { err: err.message }, 'importerExtractionWorker error');
    });
    importerExtractionWorker.on('failed', (job, err) => {
      if (job) {
        moveToDlq(importerExtractionDlq, IMPORTER_EXTRACTION_QUEUE_NAME, job, err);
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

export async function enqueueRetentionSweepJob(
  reason: RetentionSweepJobData['reason'] = 'scheduled',
): Promise<void> {
  const timeBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  await infraQueue.add(
    'retention_sweep',
    { reason },
    {
      jobId: `retention_sweep_${reason}_${timeBucket}`,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export async function enqueueAnalyticsAggregationJob(
  reason: AnalyticsAggregationJobData['reason'] = 'scheduled',
): Promise<void> {
  const timeBucket = Math.floor(Date.now() / (15 * 60 * 1000));
  await infraQueue.add(
    'analytics_aggregation',
    { reason },
    {
      jobId: `analytics_aggregation_${reason}_${timeBucket}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10_000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export async function enqueuePushReceiptReconciliationJob(
  reason: PushReceiptReconciliationJobData['reason'] = 'scheduled',
): Promise<void> {
  const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  await infraQueue.add(
    'push_receipt_reconciliation',
    { reason },
    {
      jobId: `push_receipt_reconciliation_${reason}_${timeBucket}`,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export async function enqueueScheduledPublicationSweepJob(
  reason: ScheduledPublicationSweepJobData['reason'] = 'scheduled',
): Promise<void> {
  // Run every 30 seconds — the SLO target is "within 60 seconds of due time".
  const timeBucket = Math.floor(Date.now() / 30_000);
  await infraQueue.add(
    'scheduled_publication_sweep',
    { reason },
    {
      jobId: `scheduled_publication_sweep_${reason}_${timeBucket}`,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 10_000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export async function enqueueMediaIngestJob(input: MediaIngestJobData): Promise<void> {
  await mediaIngestQueue.add(
    'media_ingest',
    input,
    {
      jobId: `media_ingest_${input.assetId}`,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5_000,
      },
      removeOnComplete: true,
      removeOnFail: 200,
    },
  );
}

export async function enqueueMediaEmbeddingJob(input: MediaEmbeddingJobData): Promise<void> {
  // Deterministic job id: (asset, model, version, preprocessing) is the
  // natural dedup key — re-queuing the same tuple is a no-op.
  const jobId = `media_embedding_${input.mediaAssetId}_${input.modelId}_${input.modelVersion}_${input.preprocessingVersion}`;
  await mediaEmbeddingQueue.add(
    'media_embedding_generate',
    input,
    {
      jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10_000,
      },
      removeOnComplete: true,
      removeOnFail: 200,
    },
  );
}

export async function enqueueModerationTriageJob(input: ModerationTriageJobData): Promise<void> {
  // Deterministic job id: (asset, model, version) is the natural dedup key
  // — re-queuing the same tuple is a no-op. A re-triage after a model change
  // uses a different model_version and so produces a new job.
  const jobId = `moderation_triage_${input.mediaAssetId}_${input.modelId}_${input.modelVersion}`;
  await moderationTriageQueue.add(
    'moderation_triage',
    input,
    {
      jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10_000,
      },
      removeOnComplete: true,
      removeOnFail: 200,
    },
  );
}

export async function enqueueImporterExtractionJob(input: ImporterExtractionJobData): Promise<void> {
  // Deterministic job id: the runId is unique per run, so re-queuing
  // the same run is a no-op.
  const jobId = `importer_extraction_${input.runId}`;
  await importerExtractionQueue.add(
    'importer_extraction_run',
    input,
    {
      jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10_000,
      },
      removeOnComplete: true,
      removeOnFail: 200,
    },
  );
}

// ---------------------------------------------------------------------------
// Catalogue import enqueue helpers — deterministic job IDs for deduplication.
// ---------------------------------------------------------------------------

export async function enqueueCatalogImportDiscoveryJob(
  input: CatalogImportDiscoveryJobData,
): Promise<void> {
  await catalogImportQueue.add(
    'catalog_import_discover',
    input,
    {
      jobId: `catalog_import_discover_${input.batchId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 200,
    },
  );
}

export async function enqueueCatalogImportHydrationJob(
  input: CatalogImportHydrationJobData,
): Promise<void> {
  await catalogImportQueue.add(
    'catalog_import_hydrate',
    input,
    {
      jobId: `catalog_import_hydrate_${input.itemId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 200,
    },
  );
}

export async function enqueueCatalogImportMediaJob(
  input: CatalogImportMediaJobData,
): Promise<void> {
  await catalogImportQueue.add(
    'catalog_import_media',
    input,
    {
      jobId: `catalog_import_media_${input.mediaId}`,
      attempts: 4,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: 200,
    },
  );
}

export async function enqueueCatalogImportNormalisationJob(
  input: CatalogImportNormalisationJobData,
): Promise<void> {
  await catalogImportQueue.add(
    'catalog_import_normalise',
    input,
    {
      jobId: `catalog_import_normalise_${input.itemId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3_000 },
      removeOnComplete: true,
      removeOnFail: 200,
    },
  );
}

export async function enqueueCatalogImportPublicationJob(
  input: CatalogImportPublicationJobData,
): Promise<void> {
  await catalogImportQueue.add(
    'catalog_import_publish',
    input,
    {
      jobId: `catalog_import_publish_${input.batchId}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export async function enqueueCatalogImportRetentionJob(
  input: CatalogImportRetentionJobData,
): Promise<void> {
  await catalogImportQueue.add(
    'catalog_import_retention',
    input,
    {
      jobId: `catalog_import_retention_${input.batchId}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export async function enqueueCatalogImportReconcileJob(
  input: CatalogImportReconcileJobData,
): Promise<void> {
  await catalogImportQueue.add(
    'catalog_import_reconcile',
    input,
    {
      jobId: `catalog_import_reconcile_${input.itemId}_${input.publicationKey}`,
      attempts: 4,
      backoff: { type: 'exponential', delay: 10_000 },
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

  if (mediaIngestWorker) {
    await mediaIngestWorker.close();
    mediaIngestWorker = null;
  }

  if (mediaEmbeddingWorker) {
    await mediaEmbeddingWorker.close();
    mediaEmbeddingWorker = null;
  }

  if (moderationTriageWorker) {
    await moderationTriageWorker.close();
    moderationTriageWorker = null;
  }

  if (importerExtractionWorker) {
    await importerExtractionWorker.close();
    importerExtractionWorker = null;
  }

  await pushQueue.close();
  await infraQueue.close();
  await mediaIngestQueue.close();
  await mediaEmbeddingQueue.close();
  await moderationTriageQueue.close();
  await importerExtractionQueue.close();
  await pushDlq.close();
  await infraDlq.close();
  await mediaIngestDlq.close();
  await mediaEmbeddingDlq.close();
  await moderationTriageDlq.close();
  await importerExtractionDlq.close();
  await workerConnection.quit();
  await queueConnection.quit();
}
