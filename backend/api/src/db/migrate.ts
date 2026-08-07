import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './pool.js';
import { logger } from '../lib/logger.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(currentDir, 'migrations');

export async function runMigrations() {
  const client = await db.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationFiles = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const fileName of migrationFiles) {
      const alreadyApplied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1 LIMIT 1',
        [fileName]
      );

      if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
        continue;
      }

      const migrationSql = await readFile(path.join(migrationsDir, fileName), 'utf8');

      await client.query('BEGIN');
      await client.query(migrationSql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [fileName]);
      await client.query('COMMIT');

      logger.info(`[migrate] applied ${fileName}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Migration rollback support ───────────────────────────────────────
// Rolls back the last N applied migrations (default 1). For each migration,
// the system looks for a corresponding *_down.sql file (e.g.
// 001_init.sql → 001_init_down.sql). If a down file exists, it is executed;
// if not, a warning is logged and the migration is still removed from the
// schema_migrations table. Only migrations that have been recorded as
// applied in schema_migrations are eligible for rollback.
export async function rollbackMigration(count: number = 1) {
  const client = await db.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Read applied migrations in reverse order of application (newest first).
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
      // Derive the down-migration file name: 001_init.sql → 001_init_down.sql
      const downFileName = fileName.replace(/\.sql$/, '_down.sql');
      const downFilePath = path.join(migrationsDir, downFileName);

      try {
        const downSql = await readFile(downFilePath, 'utf8');

        await client.query('BEGIN');
        await client.query(downSql);
        await client.query('DELETE FROM schema_migrations WHERE name = $1', [fileName]);
        await client.query('COMMIT');

        logger.info(`[migrate:rollback] rolled back ${fileName} using ${downFileName}`);
      } catch (readError) {
        // No _down.sql file exists for this migration — log a warning and
        // remove it from schema_migrations so the system stays consistent.
        if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
          logger.warn(
            `[migrate:rollback] no down file found for ${fileName} (expected ${downFileName}); removing from schema_migrations without executing rollback SQL`
          );

          await client.query('BEGIN');
          await client.query('DELETE FROM schema_migrations WHERE name = $1', [fileName]);
          await client.query('COMMIT');
        } else {
          await client.query('ROLLBACK');
          throw readError;
        }
      }
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
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
