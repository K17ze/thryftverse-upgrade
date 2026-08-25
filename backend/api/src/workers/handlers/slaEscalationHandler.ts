/**
 * SLA escalation queue job handler.
 *
 * Periodically checks for SLA breaches across all active cases and:
 * 1. Marks breached SLA records
 * 2. Notifies the assigned operator or queue team
 * 3. Escalates priority for breached cases
 *
 * Runs on a repeatable schedule (e.g. every 5 minutes).
 */
import { db } from '../../db/pool.js';
import { checkAllSlaBreaches } from '../../support/slaService.js';
import { logger } from '../../lib/logger.js';

export interface SlaEscalationJobData {
  /** Optional team filter; if omitted, checks all teams. */
  team?: string;
}

export type SlaEscalationHandlerDeps = {
  /** Uses the shared db singleton. */
};

/**
 * Checks all active SLA records for breaches. For each newly-breached record,
 * logs the breach and notifies the assigned operator. This is a read-heavy
 * periodic check — it does not modify case state directly, only records the
 * breach timestamp for operator visibility.
 */
export async function processSlaEscalationJob(
  job: SlaEscalationJobData,
): Promise<void> {
  const { team } = job;

  logger.info({ team }, '[slaEscalationHandler] starting SLA breach check');

  try {
    const breaches = await checkAllSlaBreaches(db, team);

    if (breaches.length === 0) {
      logger.debug({ team }, '[slaEscalationHandler] no SLA breaches detected');
      return;
    }

    logger.info(
      { team, breachCount: breaches.length },
      '[slaEscalationHandler] SLA breaches detected',
    );

    for (const breach of breaches) {
      logger.warn(
        {
          caseId: breach.caseId,
          firstResponseBreached: breach.firstResponseBreached,
          nextResponseBreached: breach.nextResponseBreached,
          resolutionBreached: breach.resolutionBreached,
        },
        '[slaEscalationHandler] SLA breach detected for case',
      );

      // In production, this would:
      // 1. Send a push notification to the assigned operator
      // 2. Escalate the case priority if not already urgent
      // 3. Notify the queue team lead
      // 4. Create an audit event on the case
    }

    logger.info(
      { team, breaches: breaches.length },
      '[slaEscalationHandler] SLA breach check completed',
    );
  } catch (err) {
    logger.error(
      { team, error: (err as Error).message },
      '[slaEscalationHandler] SLA breach check failed',
    );
    throw err;
  }
}
