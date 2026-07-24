import { Pool } from 'pg';
import { config } from '../config.js';

function createPool(connectionString: string, applicationName: string): Pool {
  const pool = new Pool({
    connectionString,
    max: config.databasePoolMax,
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
