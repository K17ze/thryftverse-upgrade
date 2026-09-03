/**
 * Web shim for @op-engineering/op-sqlite.
 *
 * op-sqlite's web build requires @sqlite.org/sqlite-wasm and a Web Worker,
 * which adds significant complexity to the web bundle. The app's storage
 * layer (db.ts) already guards all access with isDbAvailable(), which
 * returns false on web — so the database is never opened in the browser.
 *
 * This shim provides the minimal type-compatible surface so the import
 * resolves cleanly on web without pulling in the wasm worker. Every
 * function throws if called (which is unreachable because isDbAvailable()
 * gates all callers).
 */

export type OPSQLiteDatabase = {
  execute: () => { rows: { length: number; item: () => unknown } };
  transaction: (cb: () => void) => Promise<void>;
  close: () => void;
};

export type OpenDBOptions = {
  name?: string;
  journalMode?: string;
  enableChangeListener?: boolean;
};

export function openDB(_options: OpenDBOptions): OPSQLiteDatabase {
  throw new Error('[op-sqlite-web-shim] op-sqlite is not available on web.');
}
