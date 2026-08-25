/**
 * Kysely — type-safe SQL query builder over the existing pg.Pool.
 *
 * This module creates a Kysely instance that shares the SAME connection
 * pool as the raw `pg` queries throughout the codebase. Both Kysely
 * queries (`kysely.selectFrom(...)`) and raw pg queries (`db.query(...)`)
 * draw from the same pool — no separate connection pool is created.
 *
 * Incremental adoption:
 *   - New routes and new queries should use `kysely` (type-safe).
 *   - Existing routes continue to use raw `db.query()` unchanged.
 *   - Both coexist without conflict.
 *
 * Transactions:
 *   Use `kysely.transaction().execute(async (trx) => { ... })` for
 *   atomic read-then-write patterns. The `trx` object supports
 *   `.forUpdate()` for SELECT...FOR UPDATE row locking.
 *
 * Raw SQL escape hatch:
 *   Use `sql\`SELECT ... WHERE col = ${value}\`` for queries too complex
 *   for the builder. Values are parameterized automatically — no SQL
 *   injection risk.
 *
 * Type generation:
 *   Run `npm run db:types` (kysely-codegen) against a live Postgres
 *   instance to regenerate `database-types.ts` from the actual schema.
 */

import { Kysely, PostgresDialect } from "kysely";
import type { Pool } from "pg";
import type { Database } from "./database-types.js";

/**
 * Create a Kysely instance that wraps an existing pg.Pool.
 *
 * @param pool — the existing pg.Pool from `src/db/pool.ts` (primary or replica)
 * @returns Kysely<Database> instance for type-safe queries
 */
export function createKysely(pool: Pool): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool,
    }),
  });
}

/**
 * Create a read-only Kysely instance for read-replica queries.
 * Uses the same pool as `readDb` from `src/db/pool.ts`.
 */
export function createReadKysely(pool: Pool): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool,
    }),
  });
}

// Re-export types for convenience
export type { Database } from "./database-types.js";
export type { Selectable, Insertable, Updateable } from "kysely";
