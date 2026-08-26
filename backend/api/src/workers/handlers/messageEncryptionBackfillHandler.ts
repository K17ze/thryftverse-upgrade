/**
 * Message encryption backfill worker.
 *
 * Encrypts existing plaintext message bodies in `chat_messages` and
 * `support_messages` in batches. This is the migration worker for the
 * dual-write encryption strategy (migration 212).
 *
 * The worker:
 * 1. Selects a batch of rows where `body_ciphertext IS NULL` and `body` is
 *    not already an erasure tombstone (`[erased]`, `[retention-expired]`).
 * 2. Encrypts each body using the key service.
 * 3. Updates the row: sets `body_ciphertext` and `key_version`, sets `body`
 *    to `[encrypted]` as a tombstone.
 * 4. Repeats until no more un-encrypted rows are found.
 *
 * The worker is idempotent — re-running it will only process rows that have
 * not yet been encrypted. It processes rows in small batches (100) to avoid
 * overloading the key service and to allow resumption if interrupted.
 *
 * @packageDocumentation
 */

import type { Pool } from 'pg';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { encryptMessageBody } from '../../lib/messageEncryption.js';

export interface MessageEncryptionBackfillJobData {
  reason: 'scheduled' | 'manual';
  batchSize?: number;
}

interface ChatMessageRow {
  id: string;
  body: string;
}

interface SupportMessageRow {
  id: string;
  body: string;
}

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

const TOMBSTONE_VALUES = new Set(['[erased]', '[retention-expired]', '[encrypted]']);

async function backfillChatMessages(
  pool: Pool,
  batchSize: number,
): Promise<{ encrypted: number; skipped: number; errors: number }> {
  let encrypted = 0;
  let skipped = 0;
  let errors = 0;

  while (true) {
    const batch = await pool.query<ChatMessageRow>(
      `
        SELECT id, body
        FROM chat_messages
        WHERE body_ciphertext IS NULL
          AND body NOT IN ('[erased]', '[retention-expired]', '[encrypted]')
        ORDER BY created_at ASC
        LIMIT $1
      `,
      [batchSize],
    );

    if (batch.rows.length === 0) {
      break;
    }

    for (const row of batch.rows) {
      try {
        const { ciphertext, keyVersion } = await encryptMessageBody(row.id, row.body);

        await pool.query(
          `
            UPDATE chat_messages
            SET body_ciphertext = $2,
                key_version = $3,
                body = '[encrypted]'
            WHERE id = $1 AND body_ciphertext IS NULL
          `,
          [row.id, ciphertext, keyVersion],
        );

        encrypted++;
      } catch (error) {
        errors++;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          { table: 'chat_messages', messageId: row.id, err: message },
          'messageEncryptionBackfill.chat.failed',
        );
      }
    }

    logger.info(
      { table: 'chat_messages', batchEncrypted: encrypted, batchErrors: errors },
      'messageEncryptionBackfill.chat.batchComplete',
    );
  }

  return { encrypted, skipped, errors };
}

async function backfillSupportMessages(
  pool: Pool,
  batchSize: number,
): Promise<{ encrypted: number; skipped: number; errors: number }> {
  let encrypted = 0;
  let skipped = 0;
  let errors = 0;

  while (true) {
    const batch = await pool.query<SupportMessageRow>(
      `
        SELECT id, body
        FROM support_messages
        WHERE body_ciphertext IS NULL
          AND body NOT IN ('[erased]', '[retention-expired]', '[encrypted]')
        ORDER BY created_at ASC
        LIMIT $1
      `,
      [batchSize],
    );

    if (batch.rows.length === 0) {
      break;
    }

    for (const row of batch.rows) {
      try {
        const { ciphertext, keyVersion } = await encryptMessageBody(row.id, row.body);

        await pool.query(
          `
            UPDATE support_messages
            SET body_ciphertext = $2,
                key_version = $3,
                body = '[encrypted]'
            WHERE id = $1 AND body_ciphertext IS NULL
          `,
          [row.id, ciphertext, keyVersion],
        );

        encrypted++;
      } catch (error) {
        errors++;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          { table: 'support_messages', messageId: row.id, err: message },
          'messageEncryptionBackfill.support.failed',
        );
      }
    }

    logger.info(
      { table: 'support_messages', batchEncrypted: encrypted, batchErrors: errors },
      'messageEncryptionBackfill.support.batchComplete',
    );
  }

  return { encrypted, skipped, errors };
}

export async function processMessageEncryptionBackfill(
  data: MessageEncryptionBackfillJobData,
  pool: Pool = db,
): Promise<void> {
  const batchSize = Math.min(
    Math.max(data.batchSize ?? DEFAULT_BATCH_SIZE, 1),
    MAX_BATCH_SIZE,
  );

  logger.info({ reason: data.reason, batchSize }, 'messageEncryptionBackfill.start');

  try {
    const chatResults = await backfillChatMessages(pool, batchSize);
    const supportResults = await backfillSupportMessages(pool, batchSize);

    logger.info(
      {
        chat: chatResults,
        support: supportResults,
      },
      'messageEncryptionBackfill.complete',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { reason: data.reason, err: message },
      'messageEncryptionBackfill.failed',
    );
    throw err;
  }
}
