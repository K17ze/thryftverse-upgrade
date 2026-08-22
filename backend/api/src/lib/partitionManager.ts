import type { Pool } from 'pg';
import { logger } from './logger.js';

const PARTITIONED_TABLES = ['analytics_events', 'notifications', 'audit_logs'] as const;

/**
 * Ensure monthly RANGE partitions exist for `tableName` for the current
 * month plus `monthsAhead` future months. Calls the
 * `create_partition_if_not_exists` SQL helper defined in migration 115.
 * Never throws — errors are logged so a startup failure never blocks the
 * API from booting.
 */
export async function ensurePartitions(
  dbPool: Pool,
  tableName: string,
  monthsAhead: number = 3,
): Promise<void> {
  try {
    const startMonth = new Date();
    startMonth.setDate(1);
    startMonth.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i <= monthsAhead; i++) {
      const partitionDate = new Date(startMonth);
      partitionDate.setUTCMonth(startMonth.getUTCMonth() + i);
      const dateStr = partitionDate.toISOString().slice(0, 10);

      await dbPool.query(
        'SELECT create_partition_if_not_exists($1::text, $2::date)',
        [tableName, dateStr],
      );
    }

    logger.info(
      { table: tableName, monthsAhead },
      'Partitions ensured',
    );
  } catch (error) {
    logger.error(
      { err: error, table: tableName },
      'Failed to ensure partitions',
    );
  }
}

/**
 * Ensure partitions exist for all known partitioned time-series tables.
 * Intended to be called once on startup. Never throws.
 */
export async function ensureAllPartitions(
  dbPool: Pool,
  monthsAhead: number = 3,
): Promise<void> {
  for (const table of PARTITIONED_TABLES) {
    await ensurePartitions(dbPool, table, monthsAhead);
  }
}

export { PARTITIONED_TABLES };
