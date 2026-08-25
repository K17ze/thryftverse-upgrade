import type { Pool } from 'pg';
import { logger } from './logger.js';

export interface RetentionPolicy {
  dataClass: string;
  ttlDays: number;
  action: 'anonymise' | 'delete';
  legalBasis?: string;
}

interface DataClassMapping {
  table: string;
  timestampColumn: string;
  anonymiseColumns?: string;
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
};

export async function getRetentionPolicies(db: Pool): Promise<RetentionPolicy[]> {
  const result = await db.query<{
    data_class: string;
    ttl_days: number;
    action: 'anonymise' | 'delete';
    legal_basis: string | null;
  }>(
    `SELECT data_class, ttl_days, action, legal_basis FROM retention_policy ORDER BY data_class`,
  );

  return result.rows.map((row) => ({
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

export async function runRetentionSweep(
  db: Pool,
): Promise<{ dataClass: string; rowsAffected: number; action: string }[]> {
  const policies = await getRetentionPolicies(db);
  const results: { dataClass: string; rowsAffected: number; action: string }[] = [];

  for (const policy of policies) {
    const mapping = DATA_CLASS_MAP[policy.dataClass];
    if (!mapping) {
      logger.warn(
        { dataClass: policy.dataClass },
        'retentionEngine.sweep.noMapping',
      );
      continue;
    }

    try {
      let rowsAffected = 0;

      if (mapping.partitioned) {
        rowsAffected = await sweepPartitionedAnalytics(db, policy.ttlDays);
      } else {
        const intervalLiteral = `${policy.ttlDays} days`;

        if (policy.action === 'delete') {
          const result = await db.query(
            `DELETE FROM ${mapping.table} WHERE ${mapping.timestampColumn} < NOW() - INTERVAL '${intervalLiteral}'`,
          );
          rowsAffected = result.rowCount ?? 0;
        } else {
          if (!mapping.anonymiseColumns) {
            logger.warn(
              { dataClass: policy.dataClass },
              'retentionEngine.sweep.noAnonymiseColumns',
            );
            continue;
          }

          const result = await db.query(
            `UPDATE ${mapping.table} SET ${mapping.anonymiseColumns} WHERE ${mapping.timestampColumn} < NOW() - INTERVAL '${intervalLiteral}'`,
          );
          rowsAffected = result.rowCount ?? 0;
        }
      }

      results.push({
        dataClass: policy.dataClass,
        rowsAffected,
        action: policy.action,
      });

      logger.info(
        {
          dataClass: policy.dataClass,
          rowsAffected,
          action: policy.action,
        },
        'retentionEngine.sweep.complete',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { dataClass: policy.dataClass, err: message },
        'retentionEngine.sweep.failed',
      );
      results.push({
        dataClass: policy.dataClass,
        rowsAffected: 0,
        action: policy.action,
      });
    }
  }

  return results;
}
