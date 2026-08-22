import { Pool } from 'pg';
import { config } from '../config.js';

/**
 * When PgBouncer is enabled, rewrites the port in the connection string
 * to point at the PgBouncer port (default 6432) instead of the raw
 * PostgreSQL port. Returns the original string when PgBouncer is not
 * enabled.
 *
 * POOL_MODE=transaction is required for BullMQ compatibility — BullMQ
 * uses session-level features (LISTEN/NOTIFY, prepared statements) that
 * require transaction-level pooling with careful configuration, or
 * session-level pooling for the queue connections specifically.
 */
function resolveConnectionString(connectionString: string): string {
  if (!config.pgbouncerEnabled) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);
    url.port = String(config.pgbouncerPort);
    return url.toString();
  } catch {
    return connectionString;
  }
}

function resolvePoolMax(): number {
  if (config.pgbouncerEnabled) {
    return Math.min(config.databasePoolMax, 10);
  }
  return config.databasePoolMax;
}

function createPool(connectionString: string, applicationName: string): Pool {
  const resolvedUrl = resolveConnectionString(connectionString);
  const pool = new Pool({
    connectionString: resolvedUrl,
    max: resolvePoolMax(),
    idleTimeoutMillis: config.databasePoolIdleTimeoutMs,
    connectionTimeoutMillis: config.databasePoolConnectionTimeoutMs,
    statement_timeout: config.databaseStatementTimeoutMs,
    query_timeout: config.databaseQueryTimeoutMs,
    keepAlive: true,
    application_name: applicationName,
  });

  pool.on('error', (error) => {
    console.error(`[postgres:${applicationName}] idle client error`, error);
  });

  return pool;
}

export const db = createPool(config.databaseUrl, 'thryftverse-api-primary');

const useDedicatedReplicaPool =
  Boolean(config.databaseReplicaUrl)
  && config.databaseReplicaUrl !== config.databaseUrl;

export const replicaConfigured = useDedicatedReplicaPool;

export const readDb = useDedicatedReplicaPool
  ? createPool(config.databaseReplicaUrl!, 'thryftverse-api-replica')
  : db;

export interface DatabasePoolSnapshot {
  total: number;
  idle: number;
  waiting: number;
}

export function databasePoolSnapshot(pool: Pool = db): DatabasePoolSnapshot {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

export async function assertDatabaseConnectivity(pool: Pool = db): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closeDb() {
  if (readDb !== db) {
    await readDb.end();
  }

  await db.end();
}
