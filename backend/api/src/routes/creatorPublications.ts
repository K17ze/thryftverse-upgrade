import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  publishCommandSchema,
  publishCreatorDocumentTransaction,
} from '../services/creatorPublicationService.js';
import { appendDomainEvent } from '../lib/domainOutbox.js';

/**
 * Creator publication routes.
 *
 * The publication orchestration transaction lives in
 * `services/creatorPublicationService.ts` so that both this HTTP route and
 * the scheduled publication worker can call the same canonical function
 * without an HTTP dependency. This file is a thin route adapter: it parses
 * the request, resolves the actor, calls the service, and maps the result
 * to an HTTP response.
 *
 * `POST /creator/documents/:id/publications` is the canonical publish command.
 * Same idempotency key + same payload hash → replays the original result.
 * Same key + different hash → 409 conflict (fails closed).
 * No response after commit → discoverable by key via GET lookup.
 */

type CreatorPublicationsRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

// ── Schemas ────────────────────────────────────────────────────────────

const documentIdParamsSchema = z.object({
  documentId: z.string().min(2).max(120),
});

const idempotencyKeyParamsSchema = z.object({
  documentId: z.string().min(2).max(120),
  idempotencyKey: z.string().min(8).max(160),
});

// ── Route registration ─────────────────────────────────────────────────

export const registerCreatorPublicationRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
}: CreatorPublicationsRouteDependencies) => {

  // POST /creator/documents/:documentId/publications
  // The canonical publish command. Creates the public projection transactionally.
  // The orchestration transaction lives in creatorPublicationService.ts and is
  // shared with the scheduled publication worker.
  app.post('/creator/documents/:documentId/publications', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const command = publishCommandSchema.parse(request.body ?? {});

    // Idempotency key: header takes precedence, then body, then derived.
    const rawHeaderKey = Array.isArray(request.headers['idempotency-key'])
      ? request.headers['idempotency-key'][0]
      : request.headers['idempotency-key'];
    const headerKey = rawHeaderKey
      ? z.string().trim().min(8).max(160).parse(rawHeaderKey)
      : undefined;
    const idempotencyKey = headerKey ?? `pub_${documentId}_${command.revision}`;

    try {
      const result = await publishCreatorDocumentTransaction({
        db,
        documentId,
        actorUserId,
        command,
        idempotencyKey,
      });

      reply.code(result.status);
      return result;
    } catch (error) {
      app.log.error({ err: error }, 'Failed to publish creator document');
      reply.code(500);
      return { ok: false, error: 'Failed to publish document' };
    }
  });

  // GET /creator/documents/:documentId/publications/:idempotencyKey
  // Unknown-outcome recovery: the client lost the response but remembers the
  // idempotency key it sent. Resolve the authoritative outcome.
  app.get('/creator/documents/:documentId/publications/:idempotencyKey', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId, idempotencyKey } = idempotencyKeyParamsSchema.parse(request.params);

    // Verify document ownership.
    const docResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId],
    );
    if (!docResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }
    if (docResult.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const pubResult = await db.query<{
      id: string;
      revision_number: number;
      destination: string;
      target_id: string;
      state: string;
      payload_hash: string;
      created_at: string;
    }>(
      `SELECT id, revision_number, destination, target_id, state, payload_hash, created_at
       FROM creator_publications
       WHERE document_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [documentId, idempotencyKey],
    );

    if (!pubResult.rowCount) {
      // No publication found for this key — the publish may not have reached
      // the server. This is an honest "unknown" result, not a success.
      reply.code(404);
      return {
        ok: false,
        error: 'No publication found for this idempotency key',
        code: 'PUBLICATION_NOT_FOUND',
      };
    }

    const pub = pubResult.rows[0];
    return {
      ok: true,
      documentId,
      publicationId: pub.id,
      targetId: pub.target_id,
      destination: pub.destination,
      revisionNumber: pub.revision_number,
      state: pub.state,
      publishedAt: pub.created_at,
    };
  });

  // GET /creator/documents/:documentId/publications
  // List all publications for a document (revision history as publication timeline).
  app.get('/creator/documents/:documentId/publications', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const docResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId],
    );
    if (!docResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }
    if (docResult.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{
      id: string;
      revision_number: number;
      destination: string;
      target_id: string;
      state: string;
      created_at: string;
    }>(
      `SELECT id, revision_number, destination, target_id, state, created_at
       FROM creator_publications
       WHERE document_id = $1
       ORDER BY revision_number DESC`,
      [documentId],
    );

    return {
      ok: true,
      publications: result.rows.map((row) => ({
        id: row.id,
        revisionNumber: row.revision_number,
        destination: row.destination,
        targetId: row.target_id,
        state: row.state,
        publishedAt: row.created_at,
      })),
    };
  });

  // ── Scheduling ──────────────────────────────────────────────────────

  // POST /creator/documents/:documentId/schedule
  // Create a server-owned scheduled publication. The publish command is
  // frozen at schedule time and executed by the scheduled-publication
  // worker at due_at. This replaces the old PATCH /schedule that merely
  // set a timestamp on a row the native flow never created.
  const scheduleBodySchema = z.object({
    dueAt: z.string().datetime(),
    timezone: z.string().max(60).default('UTC'),
    publishCommand: z.object({
      revision: z.number().int().min(0),
      destination: z.enum(['look', 'poster', 'moodboard']),
      audience: z.enum(['public', 'private', 'closeFriends']).default('public'),
      expiresInHours: z.number().int().min(1).max(168).default(24),
      expectedMedia: z.array(z.object({
        layerId: z.string().min(1).max(120),
        finalizationId: z.string().min(2).max(160),
        assetId: z.string().min(2).max(160).optional(),
        mediaType: z.enum(['image', 'video']).default('image'),
        suppliedUrl: z.string().min(3).max(2048),
        role: z.string().min(1).max(60).default('primary'),
      })).default([]),
      compositionDocument: z.unknown().optional(),
      rightsSnapshotId: z.string().min(2).max(160).optional(),
      expectedLockVersion: z.number().int().min(0).optional(),
      expectedDocumentHash: z.string().min(8).max(160).optional(),
    }),
  });

  app.post('/creator/documents/:documentId/schedule', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const body = scheduleBodySchema.parse(request.body);

    // P0.3b: Reject closeFriends audience at schedule time too — fail fast
    // so the creator gets immediate feedback rather than a failure at
    // execution time.
    if (body.publishCommand.audience === 'closeFriends') {
      reply.code(400);
      return {
        ok: false,
        error: 'The closeFriends audience is not supported for publication. Use public or private.',
        code: 'AUDIENCE_UNSUPPORTED',
      };
    }

    // Idempotency key: header takes precedence, then derived default.
    // Stored on the schedule row so unknown-outcome reconciliation can
    // look up the schedule by key (GET /creator/documents/:id/schedule/:key).
    const rawHeaderKey = Array.isArray(request.headers['idempotency-key'])
      ? request.headers['idempotency-key'][0]
      : request.headers['idempotency-key'];
    const headerKey = rawHeaderKey
      ? z.string().trim().min(8).max(160).parse(rawHeaderKey)
      : undefined;
    const idempotencyKey = headerKey ?? `sched_${documentId}_${body.publishCommand.revision}`;

    // Due time must be in the future.
    const dueAt = new Date(body.dueAt);
    if (dueAt.getTime() <= Date.now()) {
      reply.code(422);
      return { ok: false, error: 'Scheduled time must be in the future', code: 'PAST_DUE_TIME' };
    }

    // ── Atomic schedule creation ──
    // All three operations (cancel existing, insert new, update document
    // status) run inside a single transaction with a FOR UPDATE lock on
    // the document row. This prevents concurrent schedule requests from
    // racing: the lock serializes them, and the transaction ensures the
    // schedule row and document status can never diverge.
    const client = await db.connect();
    let scheduleId: string;
    try {
      await client.query('BEGIN');

      // 1. Lock the document row (FOR UPDATE serializes concurrent schedules).
      const docResult = await client.query<{ creator_id: string; status: string; lock_version: number; document_hash: string; document_json: string; head_revision: number; updated_at: string }>(
        `SELECT creator_id, status, lock_version, document_hash, document_json, head_revision, updated_at
         FROM creator_documents
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [documentId],
      );

      if (!docResult.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Document not found' };
      }

      const docRow = docResult.rows[0];

      // 2. Validate ownership inside the transaction.
      if (docRow.creator_id !== actorUserId) {
        // P2.12: Collaborator-aware — editors can schedule too.
        const collabResult = await client.query<{ role: string }>(
          `SELECT role FROM creator_collaborators
           WHERE document_id = $1 AND user_id = $2 AND state = 'active'
           LIMIT 1`,
          [documentId, actorUserId],
        );
        const collabRole = collabResult.rows[0]?.role;
        if (collabRole !== 'editor') {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Access denied — only the owner or editors can schedule' };
        }
      }

      // 3. Validate document is not deleted.
      if (docRow.status === 'deleted') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Document is deleted', code: 'DOCUMENT_DELETED' };
      }

      // 4. Validate command evidence — expectedMedia must not be empty
      //    for a real publication (at least one media layer required).
      if (body.publishCommand.expectedMedia.length === 0) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Schedule command must include media evidence', code: 'NO_MEDIA_EVIDENCE' };
      }

      // 5. Stale-document check — the command's expectedLockVersion and
      //    expectedDocumentHash (if provided) must match the locked row.
      //    The response includes the current server metadata so the client
      //    can offer reload / compare / duplicate-draft recovery.
      if (
        body.publishCommand.expectedLockVersion !== undefined
        && body.publishCommand.expectedLockVersion !== docRow.lock_version
      ) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Document was modified by another session',
          code: 'DOCUMENT_VERSION_CONFLICT',
          serverLockVersion: docRow.lock_version,
          serverDocumentHash: docRow.document_hash
            ?? crypto.createHash('sha256').update(docRow.document_json).digest('hex'),
          serverUpdatedAt: docRow.updated_at,
          serverHeadRevision: docRow.head_revision,
        };
      }

      if (
        body.publishCommand.expectedDocumentHash !== undefined
        && body.publishCommand.expectedDocumentHash !== (
          docRow.document_hash
          ?? crypto.createHash('sha256').update(docRow.document_json).digest('hex')
        )
      ) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Document content hash mismatch — the document was modified since the client last saved.',
          code: 'DOCUMENT_HASH_CONFLICT',
          serverLockVersion: docRow.lock_version,
          serverDocumentHash: docRow.document_hash
            ?? crypto.createHash('sha256').update(docRow.document_json).digest('hex'),
          serverUpdatedAt: docRow.updated_at,
          serverHeadRevision: docRow.head_revision,
        };
      }

      // 6. Cancel any existing pending schedule for this document.
      await client.query(
        `UPDATE creator_schedules
         SET state = 'cancelled',
             version = version + 1,
             updated_at = NOW()
         WHERE document_id = $1 AND state IN ('pending', 'claimed')`,
        [documentId],
      );

      // 7. Create the new schedule row (with idempotency key).
      scheduleId = `sched_${crypto.randomUUID()}`;
      await client.query(
        `INSERT INTO creator_schedules (
           id, document_id, creator_id, due_at, timezone,
           version, publish_command, state, idempotency_key
         )
         VALUES ($1, $2, $3, $4, $5, 1, $6::jsonb, 'pending', $7)`,
        [
          scheduleId,
          documentId,
          actorUserId,
          dueAt,
          body.timezone,
          JSON.stringify(body.publishCommand),
          idempotencyKey,
        ],
      );

      // 8. Update document status to 'scheduled'.
      await client.query(
        `UPDATE creator_documents
         SET status = 'scheduled', updated_at = NOW()
         WHERE id = $1`,
        [documentId],
      );

      // 9. Append schedule-created domain outbox event (inside the tx).
      await appendDomainEvent(client, {
        aggregateType: 'creator_document',
        aggregateId: documentId,
        eventType: 'schedule.created',
        payload: {
          documentId,
          scheduleId,
          creatorId: actorUserId,
          dueAt: dueAt.toISOString(),
          timezone: body.timezone,
          destination: body.publishCommand.destination,
        },
        actorId: actorUserId,
        idempotencyKey,
        deduplicationKey: `schedule.created:${documentId}:${idempotencyKey}`,
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to create schedule');
      reply.code(500);
      return { ok: false, error: 'Failed to create schedule' };
    } finally {
      client.release();
    }

    return {
      ok: true,
      scheduleId,
      documentId,
      dueAt: body.dueAt,
      timezone: body.timezone,
      idempotencyKey,
    };
  });

  // DELETE /creator/documents/:documentId/schedule
  // Cancel a pending scheduled publication. Increments version so an
  // already-leased stale job cannot publish.
  app.delete('/creator/documents/:documentId/schedule', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const docResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId],
    );
    if (!docResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }
    if (docResult.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{ id: string }>(
      `UPDATE creator_schedules
       SET state = 'cancelled',
           version = version + 1,
           updated_at = NOW()
       WHERE document_id = $1 AND state IN ('pending', 'claimed')
       RETURNING id`,
      [documentId],
    );

    // Reset document status to draft.
    await db.query(
      `UPDATE creator_documents
       SET status = 'draft', updated_at = NOW()
       WHERE id = $1 AND status = 'scheduled'`,
      [documentId],
    );

    return {
      ok: true,
      cancelled: result.rowCount ?? 0,
    };
  });

  // GET /creator/documents/:documentId/schedule
  // Get the current schedule for a document (if any).
  app.get('/creator/documents/:documentId/schedule', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const docResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId],
    );
    if (!docResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }
    if (docResult.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{
      id: string;
      due_at: string;
      timezone: string;
      version: number;
      state: string;
      attempts: number;
      publication_id: string | null;
      failure_reason: string | null;
    }>(
      `SELECT id, due_at, timezone, version, state, attempts, publication_id, failure_reason
       FROM creator_schedules
       WHERE document_id = $1 AND state IN ('pending', 'claimed', 'published', 'failed')
       ORDER BY created_at DESC
       LIMIT 1`,
      [documentId],
    );

    if (!result.rowCount) {
      return { ok: true, schedule: null };
    }

    const row = result.rows[0];
    return {
      ok: true,
      schedule: {
        id: row.id,
        dueAt: row.due_at,
        timezone: row.timezone,
        version: row.version,
        state: row.state,
        attempts: row.attempts,
        publicationId: row.publication_id,
        failureReason: row.failure_reason,
      },
    };
  });

  // GET /creator/documents/:documentId/schedule/:idempotencyKey
  // Schedule unknown-outcome reconciliation: the client lost the response
  // to POST /schedule but remembers the idempotency key it sent. Resolve
  // the authoritative schedule state by key.
  app.get('/creator/documents/:documentId/schedule/:idempotencyKey', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId, idempotencyKey } = idempotencyKeyParamsSchema.parse(request.params);

    // Verify document ownership.
    const docResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId],
    );
    if (!docResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }
    if (docResult.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{
      id: string;
      due_at: string;
      timezone: string;
      version: number;
      state: string;
      attempts: number;
      publication_id: string | null;
      failure_reason: string | null;
    }>(
      `SELECT id, due_at, timezone, version, state, attempts, publication_id, failure_reason
       FROM creator_schedules
       WHERE document_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [documentId, idempotencyKey],
    );

    if (!result.rowCount) {
      // No schedule found for this key — the schedule command may not
      // have reached the server. This is an honest "unknown" result.
      reply.code(404);
      return {
        ok: false,
        error: 'No schedule found for this idempotency key',
        code: 'SCHEDULE_NOT_FOUND',
      };
    }

    const row = result.rows[0];
    return {
      ok: true,
      documentId,
      scheduleId: row.id,
      dueAt: row.due_at,
      timezone: row.timezone,
      version: row.version,
      state: row.state,
      attempts: row.attempts,
      publicationId: row.publication_id,
      failureReason: row.failure_reason,
    };
  });

  // ── Collaborators (P2.12) ───────────────────────────────────────────

  // Permission helper: resolve the actor's role on a document.
  // Returns 'owner', 'editor', 'viewer', or null (no access).
  async function resolveCollaboratorRole(
    documentId: string,
    userId: string,
  ): Promise<'owner' | 'editor' | 'viewer' | null> {
    const result = await db.query<{ role: string }>(
      `SELECT role FROM creator_collaborators
       WHERE document_id = $1 AND user_id = $2 AND state = 'active'
       LIMIT 1`,
      [documentId, userId],
    );
    if (!result.rowCount) return null;
    return result.rows[0].role as 'owner' | 'editor' | 'viewer';
  }

  // Log an auditable operation.
  async function logCreatorOperation(
    documentId: string,
    actorId: string,
    operation: string,
    targetUserId?: string | null,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO creator_operation_log (id, document_id, actor_id, operation, target_user_id, detail)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          `op_${crypto.randomUUID()}`,
          documentId,
          actorId,
          operation,
          targetUserId ?? null,
          JSON.stringify(detail ?? {}),
        ],
      );
    } catch {
      // Non-fatal — audit log is a projection, not a gate.
    }
  }

  // GET /creator/documents/:documentId/collaborators
  // List all collaborators on a document. Owner or active collaborators can view.
  app.get('/creator/documents/:documentId/collaborators', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const role = await resolveCollaboratorRole(documentId, actorUserId);
    if (!role) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{
      user_id: string;
      role: string;
      state: string;
      joined_at: string;
    }>(
      `SELECT user_id, role, state, joined_at
       FROM creator_collaborators
       WHERE document_id = $1 AND state IN ('active', 'invited')
       ORDER BY
         CASE role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
         joined_at ASC`,
      [documentId],
    );

    return {
      ok: true,
      collaborators: result.rows.map((row) => ({
        userId: row.user_id,
        role: row.role,
        state: row.state,
        joinedAt: row.joined_at,
      })),
    };
  });

  // POST /creator/documents/:documentId/collaborators
  // Invite a collaborator. Only the owner can invite.
  const inviteBodySchema = z.object({
    userId: z.string().min(2).max(120),
    role: z.enum(['editor', 'viewer']).default('viewer'),
  });

  app.post('/creator/documents/:documentId/collaborators', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const body = inviteBodySchema.parse(request.body);

    const actorRole = await resolveCollaboratorRole(documentId, actorUserId);
    if (actorRole !== 'owner') {
      reply.code(403);
      return { ok: false, error: 'Only the owner can invite collaborators' };
    }

    // Check if the user is already a collaborator.
    const existing = await db.query<{ state: string }>(
      `SELECT state FROM creator_collaborators
       WHERE document_id = $1 AND user_id = $2
       LIMIT 1`,
      [documentId, body.userId],
    );

    if (existing.rowCount && existing.rows[0].state === 'active') {
      reply.code(409);
      return { ok: false, error: 'User is already an active collaborator' };
    }

    // Upsert the collaborator row (re-activate if previously removed).
    await db.query(
      `INSERT INTO creator_collaborators (document_id, user_id, role, state, invited_by, joined_at)
       VALUES ($1, $2, $3, 'invited', $4, NOW())
       ON CONFLICT (document_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, state = 'invited',
                      invited_by = EXCLUDED.invited_by,
                      removed_at = NULL, joined_at = NOW()`,
      [documentId, body.userId, body.role, actorUserId],
    );

    await logCreatorOperation(documentId, actorUserId, 'invite', body.userId, { role: body.role });

    return { ok: true, documentId, userId: body.userId, role: body.role, state: 'invited' };
  });

  // POST /creator/documents/:documentId/collaborators/:userId/accept
  // Accept an invitation. The invited user accepts their own invitation.
  app.post('/creator/documents/:documentId/collaborators/:userId/accept', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId, userId } = z.object({
      documentId: z.string().min(2).max(120),
      userId: z.string().min(2).max(120),
    }).parse(request.params);

    if (actorUserId !== userId) {
      reply.code(403);
      return { ok: false, error: 'You can only accept your own invitation' };
    }

    const result = await db.query<{ role: string }>(
      `UPDATE creator_collaborators
       SET state = 'active', joined_at = NOW()
       WHERE document_id = $1 AND user_id = $2 AND state = 'invited'
       RETURNING role`,
      [documentId, userId],
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'No pending invitation found' };
    }

    await logCreatorOperation(documentId, actorUserId, 'accept_invite', userId);

    return { ok: true, documentId, userId, role: result.rows[0].role, state: 'active' };
  });

  // DELETE /creator/documents/:documentId/collaborators/:userId
  // Remove a collaborator. Only the owner can remove.
  app.delete('/creator/documents/:documentId/collaborators/:userId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId, userId } = z.object({
      documentId: z.string().min(2).max(120),
      userId: z.string().min(2).max(120),
    }).parse(request.params);

    const actorRole = await resolveCollaboratorRole(documentId, actorUserId);
    if (actorRole !== 'owner') {
      reply.code(403);
      return { ok: false, error: 'Only the owner can remove collaborators' };
    }

    // Cannot remove the owner.
    if (userId === actorUserId) {
      reply.code(422);
      return { ok: false, error: 'Cannot remove the document owner' };
    }

    const result = await db.query(
      `UPDATE creator_collaborators
       SET state = 'removed', removed_at = NOW()
       WHERE document_id = $1 AND user_id = $2 AND state IN ('active', 'invited')`,
      [documentId, userId],
    );

    await logCreatorOperation(documentId, actorUserId, 'remove_collaborator', userId);

    return { ok: true, removed: result.rowCount ?? 0 };
  });

  // PATCH /creator/documents/:documentId/collaborators/:userId
  // Change a collaborator's role. Only the owner can change roles.
  const roleChangeSchema = z.object({
    role: z.enum(['editor', 'viewer']),
  });

  app.patch('/creator/documents/:documentId/collaborators/:userId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId, userId } = z.object({
      documentId: z.string().min(2).max(120),
      userId: z.string().min(2).max(120),
    }).parse(request.params);
    const body = roleChangeSchema.parse(request.body);

    const actorRole = await resolveCollaboratorRole(documentId, actorUserId);
    if (actorRole !== 'owner') {
      reply.code(403);
      return { ok: false, error: 'Only the owner can change collaborator roles' };
    }

    const result = await db.query<{ role: string }>(
      `UPDATE creator_collaborators
       SET role = $3
       WHERE document_id = $1 AND user_id = $2 AND state = 'active'
       RETURNING role`,
      [documentId, userId, body.role],
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Active collaborator not found' };
    }

    await logCreatorOperation(documentId, actorUserId, 'role_change', userId, { newRole: body.role });

    return { ok: true, documentId, userId, role: result.rows[0].role };
  });

  // GET /creator/documents/:documentId/operations
  // Get the auditable operation log for a document. Owner or active collaborators can view.
  app.get('/creator/documents/:documentId/operations', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const role = await resolveCollaboratorRole(documentId, actorUserId);
    if (!role) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{
      id: string;
      actor_id: string;
      operation: string;
      target_user_id: string | null;
      detail: string;
      created_at: string;
    }>(
      `SELECT id, actor_id, operation, target_user_id, detail::text, created_at
       FROM creator_operation_log
       WHERE document_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [documentId],
    );

    return {
      ok: true,
      operations: result.rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        operation: row.operation,
        targetUserId: row.target_user_id,
        detail: JSON.parse(row.detail),
        createdAt: row.created_at,
      })),
    };
  });

  // ── Live presence (P2.13) ───────────────────────────────────────────
  // Presence is ephemeral — it is never saved as an edit. The realtime
  // infrastructure broadcasts presence events on the document's topic.
  // This endpoint lets clients heartbeat their presence and query who is
  // currently active on a document.

  // POST /creator/documents/:documentId/presence
  // Heartbeat presence on a document. The client sends this every 10-15
  // seconds while viewing/editing. The server broadcasts a presence event
  // on the document's realtime topic.
  const presenceBodySchema = z.object({
    activity: z.enum(['viewing', 'editing', 'idle']).default('viewing'),
    socketId: z.string().min(2).max(120),
  });

  app.post('/creator/documents/:documentId/presence', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const body = presenceBodySchema.parse(request.body);

    // Verify access — owner or active collaborator.
    const role = await resolveCollaboratorRole(documentId, actorUserId);
    if (!role) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    // Upsert presence row.
    await db.query(
      `INSERT INTO creator_document_presence (document_id, user_id, socket_id, activity, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (document_id, user_id, socket_id)
       DO UPDATE SET activity = EXCLUDED.activity, last_seen_at = NOW()`,
      [documentId, actorUserId, body.socketId, body.activity],
    );

    // Broadcast presence event on the document's realtime topic.
    // Presence is ephemeral — clients use it to show collaborator avatars
    // but it never counts as a saved edit.
    try {
      const { publishRealtimeEvent } = await import('../lib/realtime.js');
      await publishRealtimeEvent({
        topic: `creator.document:${documentId}`,
        type: 'presence.update',
        payload: {
          userId: actorUserId,
          activity: body.activity,
          timestamp: new Date().toISOString(),
        },
        version: 1,
      });
    } catch {
      // Realtime is non-fatal — presence still works via polling.
    }

    return { ok: true };
  });

  // GET /creator/documents/:documentId/presence
  // Get all active collaborators currently present on the document.
  app.get('/creator/documents/:documentId/presence', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const role = await resolveCollaboratorRole(documentId, actorUserId);
    if (!role) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    // Only return presence from the last 30 seconds (active presence).
    const result = await db.query<{
      user_id: string;
      activity: string;
      last_seen_at: string;
    }>(
      `SELECT user_id, activity, last_seen_at
       FROM creator_document_presence
       WHERE document_id = $1 AND last_seen_at > NOW() - INTERVAL '30 seconds'
       ORDER BY last_seen_at DESC`,
      [documentId],
    );

    // Deduplicate by user_id (keep most recent socket).
    const seen = new Set<string>();
    const presence = result.rows.filter((row) => {
      if (seen.has(row.user_id)) return false;
      seen.add(row.user_id);
      return true;
    });

    return {
      ok: true,
      presence: presence.map((row) => ({
        userId: row.user_id,
        activity: row.activity,
        lastSeenAt: row.last_seen_at,
      })),
    };
  });

  // DELETE /creator/documents/:documentId/presence
  // Clear presence when leaving the document.
  app.delete('/creator/documents/:documentId/presence', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const socketId = z.string().min(2).max(120).optional().parse((request.query as Record<string, unknown>).socketId);

    if (socketId) {
      await db.query(
        `DELETE FROM creator_document_presence
         WHERE document_id = $1 AND user_id = $2 AND socket_id = $3`,
        [documentId, actorUserId, socketId],
      );
    } else {
      await db.query(
        `DELETE FROM creator_document_presence
         WHERE document_id = $1 AND user_id = $2`,
        [documentId, actorUserId],
      );
    }

    // Broadcast departure.
    try {
      const { publishRealtimeEvent } = await import('../lib/realtime.js');
      await publishRealtimeEvent({
        topic: `creator.document:${documentId}`,
        type: 'presence.leave',
        payload: {
          userId: actorUserId,
          timestamp: new Date().toISOString(),
        },
        version: 1,
      });
    } catch {
      // Non-fatal.
    }

    return { ok: true };
  });

  // ── C2PA content credentials (P2.14) ────────────────────────────────

  // POST /media/:assetId/content-credentials
  // Attach C2PA 2.4 content credentials to a media asset. This is called
  // after AI enhancement or editing to record the provenance manifest.
  const c2paBodySchema = z.object({
    manifest: z.record(z.unknown()),
    specVersion: z.string().default('2.4'),
    claimGenerator: z.string().default('ThryftVerse'),
    source: z.enum(['platform', 'imported', 'third_party']).default('platform'),
    assertionTypes: z.array(z.string()).default([]),
    hasAiDisclosure: z.boolean().default(false),
    signatureFingerprint: z.string().optional(),
  });

  app.post('/media/:assetId/content-credentials', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { assetId } = z.object({ assetId: z.string().min(2).max(200) }).parse(request.params);
    const body = c2paBodySchema.parse(request.body);

    // Verify the asset belongs to the actor.
    const assetResult = await db.query<{ owner_id: string }>(
      `SELECT owner_id FROM media_assets WHERE id = $1 LIMIT 1`,
      [assetId],
    );
    if (!assetResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Media asset not found' };
    }
    if (assetResult.rows[0].owner_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const credentialId = `c2pa_${crypto.randomUUID()}`;
    await db.query(
      `INSERT INTO media_content_credentials (
         id, media_asset_id, manifest, spec_version, claim_generator,
         source, assertion_types, has_ai_disclosure, signature_fingerprint
       )
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (media_asset_id, spec_version)
       DO UPDATE SET manifest = EXCLUDED.manifest,
                      claim_generator = EXCLUDED.claim_generator,
                      assertion_types = EXCLUDED.assertion_types,
                      has_ai_disclosure = EXCLUDED.has_ai_disclosure,
                      signature_fingerprint = EXCLUDED.signature_fingerprint`,
      [
        credentialId,
        assetId,
        JSON.stringify(body.manifest),
        body.specVersion,
        body.claimGenerator,
        body.source,
        body.assertionTypes,
        body.hasAiDisclosure,
        body.signatureFingerprint ?? null,
      ],
    );

    return {
      ok: true,
      credentialId,
      mediaAssetId: assetId,
      specVersion: body.specVersion,
      hasAiDisclosure: body.hasAiDisclosure,
    };
  });

  // GET /media/:assetId/content-credentials
  // Get the C2PA content credentials for a media asset.
  app.get('/media/:assetId/content-credentials', async (request, reply) => {
    const { assetId } = z.object({ assetId: z.string().min(2).max(200) }).parse(request.params);

    const result = await db.query<{
      id: string;
      manifest: string;
      spec_version: string;
      claim_generator: string;
      source: string;
      assertion_types: string[];
      has_ai_disclosure: boolean;
      verified: boolean;
      verified_at: string | null;
      signature_fingerprint: string | null;
      created_at: string;
    }>(
      `SELECT id, manifest::text, spec_version, claim_generator, source,
              assertion_types, has_ai_disclosure, verified, verified_at,
              signature_fingerprint, created_at
       FROM media_content_credentials
       WHERE media_asset_id = $1
       ORDER BY created_at DESC`,
      [assetId],
    );

    if (!result.rowCount) {
      return { ok: true, credentials: [] };
    }

    return {
      ok: true,
      credentials: result.rows.map((row) => ({
        id: row.id,
        manifest: JSON.parse(row.manifest),
        specVersion: row.spec_version,
        claimGenerator: row.claim_generator,
        source: row.source,
        assertionTypes: row.assertion_types,
        hasAiDisclosure: row.has_ai_disclosure,
        verified: row.verified,
        verifiedAt: row.verified_at,
        signatureFingerprint: row.signature_fingerprint,
        createdAt: row.created_at,
      })),
    };
  });
};
