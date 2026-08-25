/**
 * Barrel export for the standalone BullMQ worker handler modules.
 *
 * Each handler is a self-contained extraction of the corresponding inline
 * implementation from `src/index.ts`. They import shared lib modules and the
 * worker runtime helpers directly, so the standalone worker process can run
 * the REAL handler implementations without importing the Fastify monolith.
 */
export { processPushQueueJob } from './pushHandler.js';
export type { PushHandlerDeps } from './pushHandler.js';

export { sweepExpiredAuctions } from './auctionSweepHandler.js';
export type { AuctionSweepHandlerDeps } from './auctionSweepHandler.js';

export { runPlatformReconciliation } from './reconciliationHandler.js';
export type { ReconciliationHandlerDeps } from './reconciliationHandler.js';

export { processDomainOutboxBatch } from './outboxDrainHandler.js';
export type { OutboxDrainHandlerDeps } from './outboxDrainHandler.js';

export { processQueuedOnezeMintReserveAllocation } from './onezeMintReserveHandler.js';
export type { OnezeMintReserveHandlerDeps } from './onezeMintReserveHandler.js';

export { processQueuedOnezeWithdrawalExecution } from './onezeWithdrawalHandler.js';
export type { OnezeWithdrawalHandlerDeps } from './onezeWithdrawalHandler.js';

export { processMediaIngestJob } from './mediaIngestHandler.js';
export type { MediaIngestHandlerDeps } from './mediaIngestHandler.js';

export { processMediaEmbeddingJob } from './mediaEmbeddingHandler.js';

export { processModerationTriageJob } from './moderationTriageHandler.js';

export { processImporterExtraction } from './importerExtractionHandler.js';
export type { ImporterExtractionJobData } from './importerExtractionHandler.js';

export { processCatalogImportDiscovery } from './catalogImportDiscoveryHandler.js';
export type { CatalogImportDiscoveryJobData } from './catalogImportDiscoveryHandler.js';

export { processCatalogImportHydration } from './catalogImportHydrationHandler.js';
export type { CatalogImportHydrationJobData } from './catalogImportHydrationHandler.js';

export { processCatalogImportMedia } from './catalogImportMediaHandler.js';
export type { CatalogImportMediaJobData } from './catalogImportMediaHandler.js';

export { processCatalogImportNormalisation } from './catalogImportNormalisationHandler.js';
export type { CatalogImportNormalisationJobData } from './catalogImportNormalisationHandler.js';

export { processCatalogImportPublication } from './catalogImportPublicationHandler.js';
export type { CatalogImportPublicationJobData } from './catalogImportPublicationHandler.js';

export { processCatalogImportRetention } from './catalogImportRetentionHandler.js';
export type { CatalogImportRetentionJobData } from './catalogImportRetentionHandler.js';

export { processCatalogImportReconcile } from './catalogImportReconcileHandler.js';
export type { CatalogImportReconcileJobData } from './catalogImportReconcileHandler.js';
