/**
 * Platform reconciliation handler.
 *
 * Extracted verbatim from `src/index.ts` (`runPlatformReconciliation`). Runs
 * the daily reconciliation, pauses outbound payouts on critical mismatch, and
 * dispatches an operational alert + Sentry event when the mismatch is
 * critical.
 */
import * as Sentry from '@sentry/node';
import { config } from '../../config.js';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import {
  type DailyReconciliationRun,
  reconciliationTableAvailable,
  runDailyReconciliation,
} from '../../lib/reconciliation.js';
import { createApiError, parseRunDateOrToday } from '../../lib/workerHelpers.js';
import { dispatchOpsAlert, setPayoutPauseState } from '../../lib/workerRuntime.js';

export type ReconciliationHandlerDeps = {
  /** Uses shared db singleton + worker runtime helpers. */
};

export async function runPlatformReconciliation(
  reason: 'scheduled' | 'manual',
  explicitRunDate?: string
): Promise<DailyReconciliationRun> {
  const runDate = parseRunDateOrToday(explicitRunDate);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    if (!(await reconciliationTableAvailable(client))) {
      throw createApiError(
        'RECONCILIATION_TABLES_UNAVAILABLE',
        'Reconciliation tables are unavailable. Run migrations first.'
      );
    }

    const run = await runDailyReconciliation(client, {
      runDate,
      reason,
      mismatchThresholdGbp: config.reconciliationMismatchThresholdGbp,
      criticalMismatchThresholdGbp: config.reconciliationCriticalMismatchThresholdGbp,
    });

    if (run.status === 'critical') {
      await setPayoutPauseState({
        paused: true,
        reason: 'critical_reconciliation_mismatch',
        reconciliationRunId: run.id,
        mismatchGbp: run.mismatchGbp,
      });
    } else {
      await setPayoutPauseState({
        paused: false,
        reason: 'reconciliation_ok',
      });
    }

    await client.query('COMMIT');

    if (run.status === 'critical') {
      try {
        await dispatchOpsAlert({
          code: 'reconciliation_critical',
          severity: 'critical',
          message: `Critical reconciliation mismatch for ${run.runDate}: GBP ${run.mismatchGbp.toFixed(2)}. Outbound payouts are paused until review.`,
          metricValue: Math.abs(run.mismatchGbp),
          threshold: Math.max(0, config.reconciliationCriticalMismatchThresholdGbp),
          metadata: {
            runId: run.id,
            runDate: run.runDate,
            mismatchGbp: run.mismatchGbp,
            reason,
          },
        });
      } catch (error) {
        logger.error({ err: error, runId: run.id }, 'Failed dispatching critical reconciliation ops alert');
      }
    }

    if (run.status === 'critical' && config.sentryDsn) {
      Sentry.captureMessage(
        `Critical reconciliation mismatch for ${run.runDate}: GBP ${run.mismatchGbp.toFixed(2)}`,
        {
          level: 'error',
          tags: {
            reconciliation_status: run.status,
          },
          extra: {
            run,
            reason,
          },
        }
      );
    }

    return run;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
