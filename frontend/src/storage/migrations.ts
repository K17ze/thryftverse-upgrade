/**
 * SQLite migration runner for the ThryftVerse local store.
 *
 * Migrations are versioned, ordered, and applied atomically. The runner
 * reads the `schema_version` table to determine the highest applied version
 * and applies each pending migration in order. Each migration runs inside a
 * transaction so a failure rolls back that migration without leaving the
 * database in a half-applied state.
 *
 * Today only v1 exists (the full initial schema). Future migrations append
 * to the `MIGRATIONS` array below — never edit an already-shipped migration.
 */

import type { OPSQLiteDatabase } from '@op-engineering/op-sqlite';
import { CURRENT_SCHEMA_VERSION, SCHEMA_VERSION_1 } from './schema';

/**
 * A single migration step. `version` is the schema version produced by
 * applying `sql`. Migrations must be ordered ascending by `version` with no
 * gaps.
 */
export interface Migration {
  version: number;
  description: string;
  sql: string;
}

/**
 * Ordered list of migrations. v1 creates the entire initial schema and seeds
 * the `schema_version` row. Append new entries here for future schema changes.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema — sync, conversations, messages, feed, drafts, products, outbox.',
    sql: SCHEMA_VERSION_1,
  },
];

/**
 * Ensure the `schema_version` table exists. It is created by the v1 migration
 * itself, but on a brand-new database the table does not yet exist when the
 * runner first queries it, so we create it defensively here.
 */
function ensureSchemaVersionTable(db: OPSQLiteDatabase): void {
  db.execute(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT    NOT NULL DEFAULT ''
    );
  `);
}

/**
 * Read the highest applied schema version from the database. Returns 0 when
 * no migrations have been recorded (a fresh database).
 */
function getAppliedVersion(db: OPSQLiteDatabase): number {
  const result = db.execute('SELECT MAX(version) AS v FROM schema_version;');
  const row = result.rows.item(0);
  const value = row?.v;
  return typeof value === 'number' ? value : 0;
}

/**
 * Apply all pending migrations in order. Each migration runs inside a
 * transaction; on failure the offending migration is rolled back and the
 * error propagates so the caller (`db.ts`) can mark the store unavailable.
 *
 * This function is idempotent — when the database is already at
 * `CURRENT_SCHEMA_VERSION` it returns immediately without executing any SQL.
 */
export async function runMigrations(db: OPSQLiteDatabase): Promise<void> {
  ensureSchemaVersionTable(db);
  const applied = getAppliedVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version <= applied) {
      continue;
    }

    await db.transaction(() => {
      // Split on ';' so multi-statement migrations (the v1 schema is many
      // statements) execute individually. op-sqlite's `execute` handles one
      // statement at a time via JSI.
      for (const statement of migration.sql.split(';')) {
        const trimmed = statement.trim();
        if (trimmed.length === 0) {
          continue;
        }
        db.execute(trimmed);
      }

      // Record the applied version. Use INSERT OR REPLACE so a re-run after a
      // partial failure does not violate the PRIMARY KEY constraint.
      db.execute(
        `INSERT OR REPLACE INTO schema_version (version, applied_at)
         VALUES (?, datetime('now'));`,
        migration.version,
      );
    });
  }
}
