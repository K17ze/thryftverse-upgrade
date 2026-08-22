/**
 * Queued 1ze withdrawal execution handler.
 *
 * Extracted verbatim from `src/index.ts`
 * (`processQueuedOnezeWithdrawalExecution`). Executes a reserved withdrawal,
 * marking it PAID_OUT and recording the wallet burn ledger delta.
 */
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { onezeArchitectureTablesAvailable } from '../../lib/workerHelpers.js';
import { executeReservedWithdrawal } from '../../lib/workerRuntime.js';

export type OnezeWithdrawalHandlerDeps = {
  /** Uses shared db singleton + worker runtime helpers. */
};

export async function processQueuedOnezeWithdrawalExecution(input: {
  withdrawalId: string;
  initiatedBy: string;
  reason: 'threshold_queue' | 'manual_queue';
}): Promise<void> {
  if (!(await onezeArchitectureTablesAvailable(db))) {
    logger.warn(
      {
        withdrawalId: input.withdrawalId,
      },
      'Skipped queued 1ze withdrawal execution because architecture tables are unavailable'
    );
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const execution = await executeReservedWithdrawal(client, {
      withdrawalId: input.withdrawalId,
      metadata: {
        source: 'queue_worker',
        initiatedBy: input.initiatedBy,
        queueReason: input.reason,
      },
    });

    await client.query('COMMIT');

    logger.info(
      {
        withdrawalId: input.withdrawalId,
        alreadySettled: execution.alreadySettled,
        queueReason: input.reason,
      },
      'Processed queued 1ze withdrawal execution'
    );
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(
      {
        err: error,
        withdrawalId: input.withdrawalId,
        queueReason: input.reason,
      },
      'Failed queued 1ze withdrawal execution'
    );
    throw error;
  } finally {
    client.release();
  }
}
