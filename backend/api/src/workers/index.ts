import { startBackgroundWorkers, closeBackgroundQueues } from '../lib/queues.js';
import { logger } from '../lib/logger.js';
import { closeDb } from '../db/pool.js';
import { closeRedis } from '../lib/redis.js';
import { closeRealtimeConnections } from '../lib/realtime.js';
import {
  processPushQueueJob,
  sweepExpiredAuctions,
  runPlatformReconciliation,
  processDomainOutboxBatch,
  processQueuedOnezeMintReserveAllocation,
  processQueuedOnezeWithdrawalExecution,
  processMediaIngestJob,
} from './handlers/index.js';

/**
 * Standalone BullMQ worker process entry point.
 *
 * This process runs all background job workers without the Fastify API
 * server, so heavy jobs never block the event loop of API instances.
 *
 * The handler implementations live in `src/workers/handlers/` and are
 * self-contained — they import the shared `db` pool singleton, the shared
 * `redis` singleton, and lib helper modules directly, so no dependencies
 * need to be passed in at call-site.
 *
 * In production, this process runs in its own container (see
 * docker-compose.prod.yml `worker` service). The API service should set
 * `RUN_BACKGROUND_WORKERS=false` so it does not start duplicate workers
 * inline.
 */
async function main(): Promise<void> {
  logger.info('[workers] starting standalone worker process');

  startBackgroundWorkers(
    {
      handlePushJob: processPushQueueJob,
      handleAuctionSweepJob: async ({ reason }) => {
        await sweepExpiredAuctions(reason);
      },
      handleReconciliationJob: async ({ reason, runDate }) => {
        await runPlatformReconciliation(reason, runDate);
      },
      handleOutboxDrainJob: async () => {
        await processDomainOutboxBatch();
      },
      handleOnezeMintReserveJob: async ({ mintOperationId, initiatedBy, reason }) => {
        await processQueuedOnezeMintReserveAllocation({
          mintOperationId,
          initiatedBy,
          reason,
        });
      },
      handleOnezeWithdrawalExecuteJob: async ({ withdrawalId, initiatedBy, reason }) => {
        await processQueuedOnezeWithdrawalExecution({
          withdrawalId,
          initiatedBy,
          reason,
        });
      },
      handleMediaIngestJob: async ({ assetId, reason }) => {
        await processMediaIngestJob({ assetId, reason });
      },
    },
    logger,
  );

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      logger.warn({ signal }, '[workers] shutdown already in progress — ignoring duplicate signal');
      return;
    }
    shuttingDown = true;

    logger.info({ signal }, '[workers] received shutdown signal — stopping workers');

    try {
      await closeBackgroundQueues();
    } catch (error) {
      logger.error({ err: error }, '[workers] error closing background queues');
    }

    try {
      await closeRealtimeConnections();
    } catch (error) {
      logger.error({ err: error }, '[workers] error closing realtime connections');
    }

    try {
      await closeRedis();
    } catch (error) {
      logger.error({ err: error }, '[workers] error closing redis client');
    }

    try {
      await closeDb();
    } catch (error) {
      logger.error({ err: error }, '[workers] error closing database pool');
    }

    logger.info('[workers] shutdown complete — exiting');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.info('[workers] workers are running — press Ctrl+C to stop');
}

main().catch((error) => {
  logger.error({ err: error }, '[workers] fatal error during startup');
  process.exit(1);
});
