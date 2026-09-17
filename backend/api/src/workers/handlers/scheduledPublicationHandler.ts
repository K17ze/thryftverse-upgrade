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
  due_at: string;
  created_at: string;
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
        creator_schedules.publish_command::text,
        creator_schedules.due_at::text,
        creator_schedules.created_at::text
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
        creator_schedules.publish_command::text,
        creator_schedules.due_at::text,
        creator_schedules.created_at::text
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
          // Success — mark as published and link the publication. The
          // transition is gated on state='claimed': a cancel that landed
          // while the publish transaction was in flight must not be
          // overwritten back to 'published'.
          const publishedUpdate = await db.query<{ id: string }>(
            `UPDATE creator_schedules
             SET state = 'published',
                 publication_id = $2,
                 claimed_at = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND state = 'claimed'
             RETURNING id`,
            [schedule.id, result.publicationId],
          );
          if (!publishedUpdate.rowCount) {
            // The schedule was cancelled (or rescheduled) mid-flight and
            // the publication still committed — the post is live. Record
            // the publication id on the row for traceability, restore the
            // document to 'published' (cancel reset it to 'draft'), and
            // notify the creator honestly rather than pretending the
            // cancel fully rolled back.
            await db.query(
              `UPDATE creator_schedules
               SET publication_id = $2, updated_at = NOW()
               WHERE id = $1`,
              [schedule.id, result.publicationId],
            );
            await db.query(
              `UPDATE creator_documents
               SET status = 'published', updated_at = NOW()
               WHERE id = $1 AND status IN ('scheduled', 'draft', 'publishing')`,
              [schedule.document_id],
            );
            logger.warn(
              { scheduleId: schedule.id, documentId: schedule.document_id, publicationId: result.publicationId },
              'scheduled_publication_committed_after_cancel',
            );
            await queueUserNotification({
              userId: schedule.creator_id,
              title: 'Post published',
              body: 'Your post was published just before the cancellation completed.',
              eventType: 'scheduled_publication_success',
              payload: {
                documentId: schedule.document_id,
                scheduleId: schedule.id,
                publicationId: result.publicationId,
                targetId: result.targetId,
              },
              route: { screen: 'CreatorDraftList', params: {} },
              idempotencyKey: `sched_pub_success_${schedule.id}`,
            });
            continue;
          }
          recordBackgroundJob({
            queue: 'infra_ops',
            job: 'scheduled_publication',
            result: 'completed',
          });

          // Notify the creator. Immediate publishes (the async
          // "publish now" path) get copy that reflects what the user
          // actually did — they didn't schedule anything.
          const isImmediate =
            Math.abs(
              new Date(schedule.due_at).getTime() - new Date(schedule.created_at).getTime(),
            ) < 60_000;
          await queueUserNotification({
            userId: schedule.creator_id,
            title: isImmediate ? 'Post published' : 'Scheduled content published',
            body: isImmediate
              ? 'Your post is now live.'
              : 'Your scheduled content is now live.',
            eventType: 'scheduled_publication_success',
            payload: {
              documentId: schedule.document_id,
              scheduleId: schedule.id,
              publicationId: result.publicationId,
              targetId: result.targetId,
            },
            // The drafts library is where the published document lives.
            route: { screen: 'CreatorDraftList', params: {} },
            idempotencyKey: `sched_pub_success_${schedule.id}`,
          });
        } else if (result.blocked) {
          // Policy block — mark as failed with reason, and move the
          // document out of 'scheduled'/'publishing' so its lifecycle
          // state stays honest ('failed' is a terminal publish state in
          // the creator_documents state machine).
          await db.query(
            `UPDATE creator_schedules
             SET state = 'failed',
                 failure_reason = $2,
                 claimed_at = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [schedule.id, result.error ?? 'blocked'],
          );
          await db.query(
            `UPDATE creator_documents
             SET status = 'failed', updated_at = NOW()
             WHERE id = $1 AND status IN ('scheduled', 'publishing')`,
            [schedule.document_id],
          );
          recordBackgroundJob({
            queue: 'infra_ops',
            job: 'scheduled_publication',
            result: 'failed',
          });

          const isImmediateBlock =
            Math.abs(
              new Date(schedule.due_at).getTime() - new Date(schedule.created_at).getTime(),
            ) < 60_000;
          await queueUserNotification({
            userId: schedule.creator_id,
            title: isImmediateBlock
              ? 'Post could not be published'
              : 'Scheduled content could not be published',
            body: result.error ?? 'The content was blocked by policy.',
            eventType: 'scheduled_publication_blocked',
            payload: {
              documentId: schedule.document_id,
              scheduleId: schedule.id,
              reason: result.error,
            },
            route: { screen: 'CreatorDraftList', params: {} },
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
          await db.query(
            `UPDATE creator_documents
             SET status = 'failed', updated_at = NOW()
             WHERE id = $1 AND status IN ('scheduled', 'publishing')`,
            [schedule.document_id],
          );
          recordBackgroundJob({
            queue: 'infra_ops',
            job: 'scheduled_publication',
            result: 'failed',
          });

          const isImmediateFail =
            Math.abs(
              new Date(schedule.due_at).getTime() - new Date(schedule.created_at).getTime(),
            ) < 60_000;
          await queueUserNotification({
            userId: schedule.creator_id,
            title: isImmediateFail ? 'Post failed to publish' : 'Scheduled publication failed',
            body: isImmediateFail
              ? 'The post could not be published. Please try again.'
              : 'After multiple attempts, the scheduled content could not be published. Please try publishing manually.',
            eventType: 'scheduled_publication_failed',
            payload: {
              documentId: schedule.document_id,
              scheduleId: schedule.id,
              reason: result.error,
            },
            route: { screen: 'CreatorDraftList', params: {} },
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
          await db.query(
            `UPDATE creator_documents
             SET status = 'failed', updated_at = NOW()
             WHERE id = $1 AND status IN ('scheduled', 'publishing')`,
            [schedule.document_id],
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

    // Reclaim guard: before converting any non-OK result into a failure,
    // check whether a publication already exists under this schedule's
    // idempotency key. A previous attempt may have committed the
    // publication and then crashed before the schedule row updated —
    // marking it failed would convert a live post into a false failure
    // (and flip the document to 'failed' beneath a live publication).
    const committed = await db.query<{ id: string; target_id: string }>(
      `SELECT id, target_id FROM creator_publications
       WHERE document_id = $1 AND idempotency_key = $2
         AND state IN ('publishing', 'published')
       LIMIT 1`,
      [schedule.document_id, idempotencyKey],
    );
    if (committed.rowCount) {
      return {
        ok: true,
        publicationId: committed.rows[0].id,
        targetId: committed.rows[0].target_id,
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
