import { db, closeDb } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { syncListingsToSearchIndex, configureSearchIndex } from '../lib/searchSync.js';

async function main(): Promise<void> {
  logger.info('Starting search index sync script');

  await configureSearchIndex();

  const result = await syncListingsToSearchIndex(db);

  logger.info(
    { synced: result.synced, failed: result.failed, total: result.total },
    `Search sync complete: ${result.synced} listings synced, ${result.failed} failed`,
  );

  if (result.failed > 0 && result.synced === 0) {
    throw new Error(
      `Search sync failed — 0 synced, ${result.failed} failed`,
    );
  }
}

main()
  .then(() => {
    void closeDb().finally(() => {
      process.exit(0);
    });
  })
  .catch((error) => {
    logger.error({ err: error }, 'Search sync script failed');
    void closeDb().finally(() => {
      process.exit(1);
    });
  });
