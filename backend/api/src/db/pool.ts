import { Pool, type PoolClient } from 'pg';
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

/**
 * Runs `fn` inside a transaction with `app.current_user_id` set via
 * `set_config(..., is_local=true)` — the GUC the RLS policies in migration
 * 121 read. Callers pass the acting user, so every user-scoped query in `fn`
 * is additionally constrained at the database layer once RLS enforcement is
 * enabled on the serving role.
 *
 * Parameterised `set_config` keeps the user id out of the SQL text — no
 * string interpolation, no injection surface. The transaction rolls back on
 * error and the connection is always released.
 *
 * Note: the serving role currently holds BYPASSRLS, so this is defence in
 * depth + forward compatibility, not the sole isolation boundary — callers
 * must still include explicit actor predicates in their queries.
 */
export async function withActorContext<T>(
  pool: Pool,
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb() {
  if (readDb !== db) {
    await readDb.end();
  }

  await db.end();
}
