/**
 * op-sqlite database provider for the ThryftVerse local store.
 *
 * Opens `thryftverse.db` via the JSI-direct `@op-engineering/op-sqlite`
 * binding and runs migrations on first open. The database is a process-wide
 * singleton — `getDb()` returns the open instance and throws if the native
 * binding is unavailable (web / Expo Go without a custom dev client). Callers
 * that cannot guarantee a native build should guard with `isDbAvailable()`.
 *
 * The store is intentionally separate from the MMKV layer (`mmkv.ts`), which
 * remains the home for small, synchronous key-value preferences. SQLite is
 * the source of truth for structured, queryable, offline-first data.
 */

import { Platform } from 'react-native';
import {
  openDB,
  type OPSQLiteDatabase,
  type OpenDBOptions,
} from '@op-engineering/op-sqlite';
import { CURRENT_SCHEMA_VERSION, DB_PRAGMAS } from './schema';
import { runMigrations } from './migrations';

const DB_NAME = 'thryftverse.db';

let dbInstance: OPSQLiteDatabase | null = null;
let dbOpenPromise: Promise<OPSQLiteDatabase> | null = null;
let dbUnavailable = false;

/**
 * Whether the op-sqlite native binding is linked and a local SQLite store
 * can be opened. Returns `false` on web and on any platform where the JSI
 * module failed to load. Call this before `getDb()` in cross-platform code.
 */
export function isDbAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  if (dbUnavailable) return false;
  // If the DB is already open or opening, it's available.
  if (dbInstance !== null || dbOpenPromise !== null) return true;
  // On native platforms, op-sqlite's openDB is a JSI function that exists
  // only when the native module is linked. If the import resolved but the
  // function is undefined, the native binding is not linked (e.g. Expo Go).
  return typeof openDB === 'function';
}

/**
 * Open (or return the already-open) database instance. On first open this
 * applies connection pragmas and runs pending migrations. The result is
 * cached — subsequent calls return the same instance without re-migrating.
 *
 * @throws if op-sqlite is not linked (web / Expo Go). Guard with
 *         `isDbAvailable()` first when the caller cannot tolerate a throw.
 */
export async function getDb(): Promise<OPSQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }
  if (dbOpenPromise) {
    return dbOpenPromise;
  }
  if (Platform.OS === 'web') {
    dbUnavailable = true;
    throw new Error('[thryftverse.db] op-sqlite is not available on web.');
  }

  // Guard: if the op-sqlite native binding is not linked (e.g. Expo Go
  // without a custom dev client), openDB is undefined. Throw a clean error
  // instead of a confusing "undefined is not a function" TypeError.
  if (typeof openDB !== 'function') {
    dbUnavailable = true;
    throw new Error('[thryftverse.db] op-sqlite native binding is not linked.');
  }

  dbOpenPromise = openDbInternal();
  try {
    dbInstance = await dbOpenPromise;
    return dbInstance;
  } catch (error) {
    dbOpenPromise = null;
    dbUnavailable = true;
    throw error;
  }
}

async function openDbInternal(): Promise<OPSQLiteDatabase> {
  const options: OpenDBOptions = {
    name: DB_NAME,
    journalMode: 'WAL',
    enableChangeListener: false,
  };

  const db = openDB(options);

  // Apply connection pragmas. op-sqlite executes these synchronously via JSI.
  for (const statement of DB_PRAGMAS.trim().split(';')) {
    const trimmed = statement.trim();
    if (trimmed.length > 0) {
      db.execute(trimmed);
    }
  }

  // Run migrations (idempotent — no-ops when already at CURRENT_SCHEMA_VERSION).
  await runMigrations(db);

  return db;
}

/**
 * Close the database and reset the cached instance. Intended for tests and
 * explicit teardown — production code keeps the DB open for the app lifetime.
 */
export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Best-effort close.
    }
  }
  dbInstance = null;
  dbOpenPromise = null;
  dbUnavailable = false;
}

/**
 * The current schema version this provider targets. Exposed for diagnostics.
 */
export const TARGET_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
