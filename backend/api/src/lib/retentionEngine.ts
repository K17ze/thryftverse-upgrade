/**
 * Centralised retention enforcement engine.
 *
 * Reads declarative retention policies from the `retention_policy` table and
 * enforces them by deleting or anonymising rows older than the configured TTL.
 * Each enforcement batch is recorded in `retention_enforcement_log` for
 * Art. 30 (records of processing) compliance.
 *
 * Design principles:
 * - **Declarative.** Policies are data, not code. Adding a new data class
 *   requires a new row in `retention_policy` and a mapping in
 *   `DATA_CLASS_MAP` — no new code paths.
 * - **Auditable.** Every enforcement batch writes to
 *   `retention_enforcement_log` with the batch ID, data class, rows
 *   affected, and duration.
 * - **Idempotent.** Running the sweep twice in the same hour is safe —
 *   rows that have already been purged will not match the TTL predicate
 *   again.
 * - **Parameterised.** TTL values are passed as query parameters, not
 *   string-interpolated, to eliminate SQL injection surface.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

export interface RetentionPolicy {
  id: string;
  dataClass: string;
  ttlDays: number;
  action: 'anonymise' | 'delete';
  legalBasis?: string;
}

interface DataClassMapping {
  table: string;
  timestampColumn: string;
  /** For anonymise actions: the SET clause (column = value pairs). */
  anonymiseColumns?: string;
  /** Optional WHERE clause filter appended to the TTL predicate. */
  extraFilter?: string;
  /** Whether the table is partitioned (uses DROP TABLE instead of DELETE). */
  partitioned?: boolean;
}

const DATA_CLASS_MAP: Record<string, DataClassMapping> = {
  chat_messages: {
    table: 'chat_messages',
    timestampColumn: 'created_at',
    anonymiseColumns: `body = '[retention-expired]', metadata = '{}'::jsonb`,
  },
  support_transcripts: {
    table: 'support_messages',
    timestampColumn: 'created_at',
    anonymiseColumns: `body = '[retention-expired]', citations = '[]'::jsonb, metadata = '{}'::jsonb`,
  },
  support_agent_runs: {
    table: 'support_agent_runs',
    timestampColumn: 'created_at',
  },
  support_cases: {
    table: 'support_cases',
    timestampColumn: 'updated_at',
    extraFilter: `AND operational_state = 'closed'`,
  },
  ai_usage_events: {
    table: 'ai_usage_events',
    timestampColumn: 'created_at',
  },
  analytics_events: {
    table: 'analytics_events',
    timestampColumn: 'created_at',
    partitioned: true,
  },
  notification_events: {
    table: 'notification_events',
    timestampColumn: 'created_at',
  },
  user_sessions: {
    table: 'user_sessions',
    timestampColumn: 'created_at',
  },
  password_reset_tokens: {
    table: 'password_reset_tokens',
    timestampColumn: 'created_at',
  },
  catalog_import_raw: {
    table: 'catalog_import_items',
    timestampColumn: 'created_at',
  },
  listings_soft_deleted: {
    table: 'listings',
    timestampColumn: 'updated_at',
    extraFilter: `AND status = 'deleted'`,
  },
  media_assets_deleted: {
    table: 'media_assets',
    timestampColumn: 'updated_at',
    extraFilter: `AND status IN ('deleted', 'revoked')`,
  },
};

export async function getRetentionPolicies(db: Pool): Promise<RetentionPolicy[]> {
  const result = await db.query<{
    id: string;
    data_class: string;
    ttl_days: number;
    action: 'anonymise' | 'delete';
    legal_basis: string | null;
  }>(
    `SELECT id, data_class, ttl_days, action, legal_basis FROM retention_policy ORDER BY data_class`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    dataClass: row.data_class,
    ttlDays: row.ttl_days,
    action: row.action,
    legalBasis: row.legal_basis ?? undefined,
  }));
}

async function sweepPartitionedAnalytics(
  db: Pool,
  ttlDays: number,
): Promise<number> {
  const cutoffDate = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);
  const cutoffYear = cutoffDate.getUTCFullYear();
  const cutoffMonth = cutoffDate.getUTCMonth();

  const partitionsResult = await db.query<{ tablename: string }>(
    `
      SELECT c.relname AS tablename
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
      WHERE p.relname = 'analytics_events'
        AND c.relname LIKE 'analytics_events\\_%' ESCAPE '\\'
        AND c.relname <> 'analytics_events_default'
    `,
  );

  let dropped = 0;

  for (const row of partitionsResult.rows) {
    const match = row.tablename.match(/^analytics_events_(\d{4})(\d{2})$/);
    if (!match) {
      continue;
    }

    const partYear = parseInt(match[1], 10);
    const partMonth = parseInt(match[2], 10) - 1;

    if (partYear < cutoffYear || (partYear === cutoffYear && partMonth < cutoffMonth)) {
      await db.query(`DROP TABLE IF EXISTS ${row.tablename}`);
      dropped++;
    }
  }

  return dropped;
}

/**
 * Write an enforcement log entry for audit traceability.
 */
async function writeEnforcementLog(
  db: Pool,
  batchId: string,
  policy: RetentionPolicy,
  rowsAffected: number,
  action: string,
  durationMs: number,
  error?: string,
): Promise<void> {
  try {
    await db.query(
      `
        INSERT INTO retention_enforcement_log (
          id, batch_id, data_class, policy_id, rows_affected, action,
          duration_ms, error
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        randomUUID(),
        batchId,
        policy.dataClass,
        policy.id,
        rowsAffected,
        action,
        durationMs,
        error ?? null,
      ],
    );
  } catch (logError) {
    // Logging is best-effort — a log write failure should not abort the sweep.
    const message = logError instanceof Error ? logError.message : String(logError);
    logger.error(
      { batchId, dataClass: policy.dataClass, err: message },
      'retentionEngine.enforcementLog.failed',
    );
  }
}

export interface RetentionSweepResult {
  dataClass: string;
  rowsAffected: number;
  action: string;
  error?: string;
}

/**
 * Run a full retention sweep across all configured policies.
 *
 * Returns per-data-class results and writes an enforcement log entry for
 * each policy execution.
 */
export async function runRetentionSweep(
  db: Pool,
): Promise<RetentionSweepResult[]> {
  const policies = await getRetentionPolicies(db);
  const batchId = randomUUID();
  const results: RetentionSweepResult[] = [];

  logger.info(
    { batchId, policyCount: policies.length },
    'retentionEngine.sweep.start',
  );

  for (const policy of policies) {
    const mapping = DATA_CLASS_MAP[policy.dataClass];
    if (!mapping) {
      logger.warn(
        { dataClass: policy.dataClass },
        'retentionEngine.sweep.noMapping',
      );
      results.push({
        dataClass: policy.dataClass,
        rowsAffected: 0,
        action: 'skipped',
        error: 'no mapping configured',
      });
      continue;
    }

    const startedAt = Date.now();

    try {
      let rowsAffected = 0;
      let actionLabel: string = policy.action;

      if (mapping.partitioned) {
        rowsAffected = await sweepPartitionedAnalytics(db, policy.ttlDays);
        actionLabel = 'drop_partition';
      } else {
        const extraFilter = mapping.extraFilter ?? '';

        if (policy.action === 'delete') {
          const result = await db.query(
            `DELETE FROM ${mapping.table}
             WHERE ${mapping.timestampColumn} < NOW() - ($1 || ' days')::interval
             ${extraFilter}`,
            [String(policy.ttlDays)],
          );
          rowsAffected = result.rowCount ?? 0;
        } else {
          if (!mapping.anonymiseColumns) {
            logger.warn(
              { dataClass: policy.dataClass },
              'retentionEngine.sweep.noAnonymiseColumns',
            );
            results.push({
              dataClass: policy.dataClass,
              rowsAffected: 0,
              action: 'skipped',
              error: 'no anonymise columns configured',
            });
            continue;
          }

          const result = await db.query(
            `UPDATE ${mapping.table}
             SET ${mapping.anonymiseColumns}
             WHERE ${mapping.timestampColumn} < NOW() - ($1 || ' days')::interval
             ${extraFilter}`,
            [String(policy.ttlDays)],
          );
          rowsAffected = result.rowCount ?? 0;
        }
      }

      const durationMs = Date.now() - startedAt;

      results.push({
        dataClass: policy.dataClass,
        rowsAffected,
        action: actionLabel,
      });

      await writeEnforcementLog(
        db,
        batchId,
        policy,
        rowsAffected,
        actionLabel,
        durationMs,
      );

      logger.info(
        {
          batchId,
          dataClass: policy.dataClass,
          rowsAffected,
          action: actionLabel,
          durationMs,
        },
        'retentionEngine.sweep.complete',
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        { batchId, dataClass: policy.dataClass, err: message },
        'retentionEngine.sweep.failed',
      );

      results.push({
        dataClass: policy.dataClass,
        rowsAffected: 0,
        action: policy.action,
        error: message,
      });

      await writeEnforcementLog(
        db,
        batchId,
        policy,
        0,
        policy.action,
        durationMs,
        message,
      );
    }
  }

  logger.info(
    { batchId, resultCount: results.length },
    'retentionEngine.sweep.batchComplete',
  );

  return results;
}
