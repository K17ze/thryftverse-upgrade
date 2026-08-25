import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './pool.js';
import { logger } from '../lib/logger.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(currentDir, 'migrations');

// Stable advisory-lock key (two 32-bit ints → one 64-bit key).
// Chosen once; never change while any deployment may run migrations concurrently.
const ADVISORY_LOCK_KEY_A = 20260823;
const ADVISORY_LOCK_KEY_B = 1;

// Marker that a migration file must run OUTSIDE a transaction (e.g. ALTER SYSTEM,
// CREATE INDEX CONCURRENTLY). Place as a comment anywhere in the file.
const NO_TRANSACTION_MARKER = '-- @noTransaction';

function computeChecksum(content: string): string {
  // Normalise line endings so checksum is stable across Windows/Unix checkouts.
  const normalised = content.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalised, 'utf8').digest('hex');
}

export async function runMigrations() {
  const client = await db.connect();
  let inTransaction = false;
  try {
    // Ensure the registry table exists with a checksum column.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Add checksum column to pre-existing installations.
    await client.query(
      `ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT`
    );

    // Acquire a session-level advisory lock so two migration runners cannot
    // execute concurrently.  Session-level (not xact-level) because each
    // migration runs in its own transaction and we need the lock to span the
    // entire run.
    await client.query('SELECT pg_advisory_lock($1, $2)', [
      ADVISORY_LOCK_KEY_A,
      ADVISORY_LOCK_KEY_B,
    ]);

    const migrationFiles = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const fileName of migrationFiles) {
      const existing = await client.query(
        'SELECT checksum FROM schema_migrations WHERE name = $1 LIMIT 1',
        [fileName]
      );

      if (existing.rowCount && existing.rowCount > 0) {
        // Verify checksum — applied migrations must not be modified.
        const migrationSql = await readFile(
          path.join(migrationsDir, fileName),
          'utf8'
        );
        const currentChecksum = computeChecksum(migrationSql);
        const storedChecksum = existing.rows[0].checksum;
        if (storedChecksum && storedChecksum !== currentChecksum) {
          throw new Error(
            `[migrate] checksum mismatch for ${fileName}: stored=${storedChecksum}, current=${currentChecksum}. ` +
              'Applied migrations must not be modified. Create a new migration instead.'
          );
        }
        continue;
      }

      const migrationSql = await readFile(path.join(migrationsDir, fileName), 'utf8');
      const checksum = computeChecksum(migrationSql);
      const noTransaction = migrationSql.includes(NO_TRANSACTION_MARKER);

      if (noTransaction) {
        // Execute outside a transaction — required for ALTER SYSTEM,
        // CREATE INDEX CONCURRENTLY, and other non-transactional statements.
        await client.query(migrationSql);
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [fileName, checksum]
        );
      } else {
        await client.query('BEGIN');
        inTransaction = true;
        await client.query(migrationSql);
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [fileName, checksum]
        );
        await client.query('COMMIT');
        inTransaction = false;
      }

      logger.info(`[migrate] applied ${fileName}`);
    }
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore — connection may already be broken.
      }
      inTransaction = false;
    }
    throw error;
  } finally {
    // Release the advisory lock so the next runner can proceed.
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        ADVISORY_LOCK_KEY_A,
        ADVISORY_LOCK_KEY_B,
      ]);
    } catch {
      // Ignore — best-effort cleanup.
    }
    client.release();
  }
}

// ── Migration rollback support ───────────────────────────────────────
// Rolls back the last N applied migrations (default 1). For each migration,
// the system looks for a corresponding *_down.sql file (e.g.
// 001_init.sql → 001_init_down.sql). If a down file exists, it is executed
// in the same transaction as the ledger-row deletion. If no down file
// exists, the rollback ERRORS — silently deleting the ledger row while
// leaving schema changes in place is unsafe and is no longer permitted.
export async function rollbackMigration(count: number = 1) {
  const client = await db.connect();
  let inTransaction = false;
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      `ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT`
    );

    // Acquire advisory lock for the same reason as runMigrations.
    await client.query('SELECT pg_advisory_lock($1, $2)', [
      ADVISORY_LOCK_KEY_A,
      ADVISORY_LOCK_KEY_B,
    ]);

    const appliedResult = await client.query(
      'SELECT name FROM schema_migrations ORDER BY applied_at DESC LIMIT $1',
      [count]
    );

    if (!appliedResult.rowCount || appliedResult.rowCount === 0) {
      logger.info('[migrate:rollback] no applied migrations to roll back');
      return;
    }

    const appliedNames = appliedResult.rows.map((row: { name: string }) => row.name);

    for (const fileName of appliedNames) {
      const downFileName = fileName.replace(/\.sql$/, '_down.sql');
      const downFilePath = path.join(migrationsDir, downFileName);

      let downSql: string;
      try {
        downSql = await readFile(downFilePath, 'utf8');
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(
            `[migrate:rollback] no down file found for ${fileName} (expected ${downFileName}). ` +
              'Refusing to delete the ledger row without reverting schema. ' +
              `Create a ${downFileName} file or mark this migration as non-reversible.`
          );
        }
        throw readError;
      }

      const noTransaction = downSql.includes(NO_TRANSACTION_MARKER);

      if (noTransaction) {
        await client.query(downSql);
        await client.query('DELETE FROM schema_migrations WHERE name = $1', [fileName]);
      } else {
        await client.query('BEGIN');
        inTransaction = true;
        await client.query(downSql);
        await client.query('DELETE FROM schema_migrations WHERE name = $1', [fileName]);
        await client.query('COMMIT');
        inTransaction = false;
      }

      logger.info(`[migrate:rollback] rolled back ${fileName} using ${downFileName}`);
    }
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore.
      }
      inTransaction = false;
    }
    throw error;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        ADVISORY_LOCK_KEY_A,
        ADVISORY_LOCK_KEY_B,
      ]);
    } catch {
      // Ignore.
    }
    client.release();
  }
}

// ── CLI entry point ──────────────────────────────────────────────────
// Usage:
//   ts-node src/db/migrate.ts          # Apply pending migrations (up)
//   ts-node src/db/migrate.ts down     # Roll back the last migration
//   ts-node src/db/migrate.ts down 3   # Roll back the last 3 migrations
const command = process.argv[2];

async function main() {
  if (command === 'down') {
    const countArg = Number(process.argv[3]);
    const rollbackCount = Number.isInteger(countArg) && countArg > 0 ? countArg : 1;
    await rollbackMigration(rollbackCount);
    logger.info('[migrate:rollback] done');
  } else {
    await runMigrations();
    logger.info('[migrate] done');
  }
}

main()
  .then(async () => {
    await db.end();
  })
  .catch(async (error) => {
    logger.error({ err: error }, '[migrate] failed');
    await db.end();
    process.exit(1);
  });
