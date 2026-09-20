/**
 * Search Index Sync Worker Handler
 *
 * Runs the scheduled full reindex of the listings search index on the
 * dedicated `search_indexing` queue (`search_index_sync` job). Incremental
 * per-listing writes (create/update/delete) bypass the queue via
 * `syncSingleListing` / `removeListingFromIndex`; this sweep is the
 * self-healing pass that repairs index drift from dropped incremental
 * updates.
 *
 * @packageDocumentation
 */

import type { Pool } from 'pg';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { syncListingsToSearchIndex } from '../../lib/searchSync.js';

export interface SearchIndexSyncJobData {
  reason: 'scheduled' | 'manual';
}

export async function processSearchIndexSync(
  data: SearchIndexSyncJobData,
  pool: Pool = db,
): Promise<void> {
  const { reason } = data;

  logger.info({ reason }, 'searchIndexSync.start');

  // syncListingsToSearchIndex never throws — per-listing failures are
  // counted and logged inside the batch loop. Mirror the manual script's
  // contract: a run that synced nothing but recorded failures is a real
  // failure and must surface to BullMQ for retry/DLQ, not read as success.
  const result = await syncListingsToSearchIndex(pool);

  logger.info(
    {
      reason,
      synced: result.synced,
      failed: result.failed,
      total: result.total,
    },
    'searchIndexSync.complete',
  );

  if (result.failed > 0 && result.synced === 0) {
    throw new Error(
      `Search index sync failed — 0 synced, ${result.failed} failed`,
    );
  }
}
