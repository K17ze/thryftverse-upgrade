import type { Pool } from 'pg';
import { logger } from './logger.js';

const ANALYTICS_VIEWS = [
  'mv_seller_analytics',
  'mv_user_engagement',
  'mv_category_performance',
  'mv_auction_analytics',
] as const;

/**
 * Refresh a single materialized view concurrently so readers are never
 * blocked during the refresh. Requires a unique index on the view (all
 * analytics views declare one in migration 114). Never throws — errors
 * are logged and swallowed so a scheduled refresh job never takes down
 * the process.
 */
export async function refreshMaterializedView(
  dbPool: Pool,
  name: string,
): Promise<void> {
  try {
    await dbPool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${name}`);
    logger.info({ view: name }, 'Materialized view refreshed');
  } catch (error) {
    logger.error(
      { err: error, view: name },
      'Failed to refresh materialized view',
    );
  }
}

/**
 * Refresh all analytics materialized views concurrently. Never throws —
 * a failure on one view does not stop the others from refreshing.
 */
export async function refreshAllViews(dbPool: Pool): Promise<void> {
  for (const view of ANALYTICS_VIEWS) {
    await refreshMaterializedView(dbPool, view);
  }
}

export { ANALYTICS_VIEWS };
