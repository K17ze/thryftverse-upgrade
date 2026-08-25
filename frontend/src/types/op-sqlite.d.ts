/**
 * Minimal type declarations for `@op-engineering/op-sqlite`.
 *
 * op-sqlite is a JSI-direct C++ SQLite binding for React Native (~5x faster
 * than expo-sqlite). These declarations mirror the public surface used by the
 * ThryftVerse local store (`src/storage/db.ts`). They are intentionally
 * narrow — only the methods the app consumes are typed. When the real package
 * is installed (see `package.json` → `@op-engineering/op-sqlite`), TypeScript
 * will prefer the bundled types; this file exists so `tsc --noEmit` passes in
 * environments where the native dependency has not yet been linked.
 *
 * The runtime API is synchronous (JSI): `execute` returns a result object
 * immediately. `executeBatch` runs a batch in a single transaction.
 * `executeWithAsync` is the async variant for large result sets.
 */

declare module '@op-engineering/op-sqlite' {
  export type SQLBindValue = string | number | null | Uint8Array;

  export interface SQLRow {
    [column: string]: SQLBindValue;
  }

  export interface SQLError {
    message: string;
    code?: number;
  }

  export interface ExecuteResult {
    rows: {
      _array: SQLRow[];
      length: number;
      item(index: number): SQLRow;
    };
    rowsAffected: number;
    insertId?: number;
    metadata?: { name: string; type?: string }[];
  }

  export interface BatchCommand {
    sql: string;
    params?: SQLBindValue[];
  }

  export interface Transaction {
    commit(): void;
    rollback(): void;
  }

  export interface OPSQLiteDatabase {
    execute(sql: string, ...params: SQLBindValue[]): ExecuteResult;
    executeWithAsync(
      sql: string,
      params?: SQLBindValue[],
    ): Promise<ExecuteResult>;
    executeBatch(commands: BatchCommand[]): { rowsAffected: number };
    transaction(
      callback: (tx: Transaction) => void | Promise<void>,
    ): Promise<void>;
    close(): void;
    delete(): void;
    getRawState(): unknown;
  }

  export interface OpenDBOptions {
    name?: string;
    location?: string;
    encryptionKey?: string;
    journalMode?: 'WAL' | 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY';
    enableChangeListener?: boolean;
    useSQLCipher?: boolean;
    syncSize?: number;
    openFlags?: number;
  }

  export function openDB(options: OpenDBOptions | string): OPSQLiteDatabase;

  export const removeDB: (name: string, location?: string) => void;

  export const getDBPath: (name: string, location?: string) => string;
}

declare module '@op-engineering/op-sqlite/lib/types' {
  export * from '@op-engineering/op-sqlite';
}
