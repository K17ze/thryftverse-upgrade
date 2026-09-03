/**
 * Scheduled publication sweep handler.
 *
 * This is the P1 implementation of the server-owned scheduled publication
 * queue (research report 23). The worker claims due `creator_schedules`
 * rows using `FOR UPDATE SKIP LOCKED`, then executes the same idempotent
 * publication command used by "Publish now" by calling the shared
 * `publishCreatorDocumentTransaction` service directly — no HTTP inject.
 *
 * Key invariants:
 * - Claim uses a short database lease (claimed_at). Stuck claims are
 *   reclaimed after a timeout.
 * - The worker records the version it claimed. If the row's version has
 *   moved on (cancel/reschedule), the worker refuses to publish.
 * - Re-checks ownership, media readiness and moderation at execution time.
 * - Notifies on success, actionable block, definite failure and prolonged delay.
 * - Max attempts bound poison jobs.
 */
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { queueUserNotification } from '../../lib/workerRuntime.js';
import { recordBackgroundJob } from '../../lib/metrics.js';
import {
  publishCommandSchema,
  publishCreatorDocumentTransaction,
  type PublishCommand,
} from '../../services/creatorPublicationService.js';

/** Lease timeout: a claim older than this is considered stuck. */
const CLAIM_LEASE_MS = 5 * 60 * 1000; // 5 minutes

/** Batch size per sweep. */
const BATCH_SIZE = 20;

interface ClaimedSchedule {
  id: string;
  document_id: string;
  creator_id: string;
  version: number;
  attempts: number;
  max_attempts: number;
  publish_command: string;
}

/**
 * Sweep due creator_schedules rows and execute their publication commands.
 * Returns the number of rows processed.
 */
export async function sweepScheduledPublications(
  reason: 'scheduled' | 'manual' = 'scheduled',
): Promise<number> {
  const client = await db.connect();
  let processed = 0;

  try {
    await client.query('BEGIN');

    // ── Claim due rows using FOR UPDATE SKIP LOCKED ──
    // This is the 2026 best-practice pattern for Postgres-backed queues:
    // each worker locks a different row and skips rows already locked by
    // other workers. No external broker needed.
    const claimResult = await client.query<ClaimedSchedule>(
      `
      WITH claimable AS (
        SELECT id
        FROM creator_schedules
        WHERE state = 'pending'
          AND due_at <= NOW()
        ORDER BY due_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE creator_schedules
      SET state = 'claimed',
          claimed_at = NOW(),
          attempts = attempts + 1,
          updated_at = NOW()
      FROM claimable
      WHERE creator_schedules.id = claimable.id
      RETURNING
        creator_schedules.id,
        creator_schedules.document_id,
        creator_schedules.creator_id,
        creator_schedules.version,
        creator_schedules.attempts,
        creator_schedules.max_attempts,
        creator_schedules.publish_command::text
      `,
      [BATCH_SIZE],
    );

    // Also reclaim stuck claims (claimed but never completed).
    const stuckResult = await client.query<ClaimedSchedule>(
      `
      WITH stuck AS (
        SELECT id
        FROM creator_schedules
        WHERE state = 'claimed'
          AND claimed_at < NOW() - INTERVAL '${CLAIM_LEASE_MS} milliseconds'
          AND attempts < max_attempts
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE creator_schedules
      SET attempts = attempts + 1,
          claimed_at = NOW(),
          updated_at = NOW()
      FROM stuck
      WHERE creator_schedules.id = stuck.id
      RETURNING
        creator_schedules.id,
        creator_schedules.document_id,
        creator_schedules.creator_id,
        creator_schedules.version,
        creator_schedules.attempts,
        creator_schedules.max_attempts,
        creator_schedules.publish_command::text
      `,
      [BATCH_SIZE],
    );

    const allClaimed = [...claimResult.rows, ...stuckResult.rows];

    await client.query('COMMIT');

    // ── Execute each claimed publication outside the claim transaction ──
    // The publication itself runs in its own transaction (the orchestrator's).
    // We update the schedule row after the result.
    for (const schedule of allClaimed) {
      try {
        // Both the inline (API-process) and standalone worker paths now
        // call the shared publication service directly — no HTTP inject.
        // The service is a pure database transaction with no Fastify
        // dependency, so the worker does not need the app instance.
        const result = await executeScheduledPublication(schedule);
        processed++;

        if (result.ok) {
          // Success — mark as published and link the publication.
          await db.query(
            `UPDATE creator_schedules
             SET state = 'published',
                 publication_id = $2,
                 claimed_at = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [schedule.id, result.publicationId],
          );
          recordBackgroundJob({
            queue: 'infra_ops',
            job: 'scheduled_publication',
            result: 'completed',
          });

          // Notify the creator.
          await queueUserNotification({
            userId: schedule.creator_id,
            title: 'Scheduled content published',
            body: 'Your scheduled content is now live.',
            eventType: 'scheduled_publication_success',
            payload: {
              documentId: schedule.document_id,
              scheduleId: schedule.id,
              publicationId: result.publicationId,
              targetId: result.targetId,
            },
            idempotencyKey: `sched_pub_success_${schedule.id}`,
          });
        } else if (result.blocked) {
          // Policy block — mark as failed with reason.
          await db.query(
            `UPDATE creator_schedules
             SET state = 'failed',
                 failure_reason = $2,
                 claimed_at = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [schedule.id, result.error ?? 'blocked'],
          );
          recordBackgroundJob({
            queue: 'infra_ops',
            job: 'scheduled_publication',
            result: 'failed',
          });

          await queueUserNotification({
            userId: schedule.creator_id,
            title: 'Scheduled content could not be published',
            body: result.error ?? 'The content was blocked by policy.',
            eventType: 'scheduled_publication_blocked',
            payload: {
              documentId: schedule.document_id,
              scheduleId: schedule.id,
              reason: result.error,
            },
            idempotencyKey: `sched_pub_blocked_${schedule.id}`,
          });
        } else if (schedule.attempts >= schedule.max_attempts) {
          // Definite failure after max attempts.
          await db.query(
            `UPDATE creator_schedules
             SET state = 'failed',
                 failure_reason = $2,
                 claimed_at = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [schedule.id, result.error ?? 'max attempts exceeded'],
          );
          recordBackgroundJob({
            queue: 'infra_ops',
            job: 'scheduled_publication',
            result: 'failed',
          });

          await queueUserNotification({
            userId: schedule.creator_id,
            title: 'Scheduled publication failed',
            body: 'After multiple attempts, the scheduled content could not be published. Please try publishing manually.',
            eventType: 'scheduled_publication_failed',
            payload: {
              documentId: schedule.document_id,
              scheduleId: schedule.id,
              reason: result.error,
            },
            idempotencyKey: `sched_pub_failed_${schedule.id}`,
          });
        } else {
          // Transient failure — return to pending for retry.
          await db.query(
            `UPDATE creator_schedules
             SET state = 'pending',
                 claimed_at = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [schedule.id],
          );
          logger.warn(
            { scheduleId: schedule.id, documentId: schedule.document_id, error: result.error },
            'scheduled_publication_transient_failure',
          );
        }
      } catch (error) {
        // Unexpected error — return to pending if attempts remain, else fail.
        const isLastAttempt = schedule.attempts >= schedule.max_attempts;
        if (isLastAttempt) {
          await db.query(
            `UPDATE creator_schedules
             SET state = 'failed',
                 failure_reason = $2,
                 claimed_at = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [schedule.id, error instanceof Error ? error.message : 'unexpected error'],
          );
        } else {
          await db.query(
            `UPDATE creator_schedules
             SET state = 'pending',
                 claimed_at = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [schedule.id],
          );
        }
        logger.error(
          { err: error, scheduleId: schedule.id, documentId: schedule.document_id },
          'scheduled_publication_error',
        );
      }
    }

    if (processed > 0) {
      logger.info({ reason, processed }, 'scheduled_publication_sweep_complete');
    }

    return processed;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ err: error, reason }, 'scheduled_publication_sweep_failed');
    throw error;
  } finally {
    client.release();
  }
}

// ── Execute a single scheduled publication ─────────────────────────────

interface ScheduleExecutionResult {
  ok: boolean;
  publicationId?: string;
  targetId?: string;
  blocked?: boolean;
  error?: string;
}

/**
 * Execute the scheduled publication by calling the shared publication
 * service (`publishCreatorDocumentTransaction`) directly. This is the same
 * canonical transaction the POST /creator/documents/:id/publications route
 * uses — no HTTP inject, no Fastify dependency.
 *
 * The publish_command stored in the schedule row is the exact payload that
 * would have been sent to the route. The creator_id from the schedule row
 * is the actor (the schedule was created by the document owner, so the
 * ownership check inside the service passes).
 *
 * The idempotency key is derived as `sched_<id>_<version>` so a replay
 * (e.g. after a crash between commit and schedule-row update) returns the
 * original publication result instead of creating a duplicate.
 */
async function executeScheduledPublication(
  schedule: ClaimedSchedule,
): Promise<ScheduleExecutionResult> {
  // Re-check that the schedule hasn't been cancelled (version check).
  const currentResult = await db.query<{ version: number; state: string }>(
    `SELECT version, state FROM creator_schedules WHERE id = $1 LIMIT 1`,
    [schedule.id],
  );
  if (!currentResult.rowCount) {
    return { ok: false, error: 'Schedule no longer exists' };
  }
  if (currentResult.rows[0].state === 'cancelled') {
    return { ok: false, error: 'Schedule was cancelled' };
  }
  if (currentResult.rows[0].version !== schedule.version) {
    return { ok: false, error: 'Schedule version changed — refusing to publish stale version' };
  }

  // Parse and validate the frozen publish command through the same Zod
  // schema the route uses, so a corrupted/stale schedule row cannot bypass
  // validation.
  let command: PublishCommand;
  try {
    command = publishCommandSchema.parse(JSON.parse(schedule.publish_command));
  } catch {
    return { ok: false, error: 'Invalid publish command payload' };
  }

  const idempotencyKey = `sched_${schedule.id}_${schedule.version}`;

  try {
    const result = await publishCreatorDocumentTransaction({
      db,
      documentId: schedule.document_id,
      actorUserId: schedule.creator_id,
      command,
      idempotencyKey,
      isServiceContext: true,
    });

    if (result.ok) {
      return {
        ok: true,
        publicationId: result.publicationId,
        targetId: result.targetId,
      };
    }

    // A non-ok result with `blocked` is a permanent policy block
    // (e.g. closeFriends audience, media quarantined, access denied).
    // The sweep loop marks the schedule as failed.
    if (result.blocked) {
      return {
        ok: false,
        blocked: true,
        error: result.error ?? 'Publication blocked',
      };
    }

    // Other non-ok results (document not found, deleted, idempotency
    // conflict, validation errors) are permanent — treat as blocked so
    // the schedule is marked failed rather than retried indefinitely.
    // The only genuinely transient cause is an unexpected thrown error,
    // which is caught below and returned to pending.
    return {
      ok: false,
      blocked: true,
      error: result.error ?? 'Publication failed',
    };
  } catch (error) {
    // Unexpected error (DB connection, deadlock, etc.) — transient.
    // The sweep loop returns the schedule to pending for retry (or
    // fails it after max attempts).
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected publication error',
    };
  }
}
