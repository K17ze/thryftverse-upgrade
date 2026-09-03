import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { internalS3 } from '../lib/s3.js';

/**
 * Voice messages — playback authorization, transcription request and
 * waveform read path (report 19).
 *
 * Principles:
 * - Playback URLs are short-lived and membership-bound. A deleted/blocked
 *   user cannot access audio via a cached public URL. Revocation removes the
 *   authorization row and the signed URL expires on its own TTL.
 * - Transcription is opt-in, recipient-side, derived. The sender is never
 *   notified. The text is labelled "Automatically transcribed" on the client.
 * - Waveform is decoded PCM, not decorative. The client reads the samples
 *   here and renders real bars, or an honest progress line when absent.
 */

type VoiceMessageRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const conversationParamsSchema = z.object({
  conversationId: z.string().min(1).max(120),
});

const messageParamsSchema = z.object({
  conversationId: z.string().min(1).max(120),
  messageId: z.string().min(1).max(120),
});

const PLAYBACK_URL_TTL_SECONDS = 300; // 5 minutes — short-lived, re-authorizable

type VoiceMessageRow = {
  id: string;
  message_id: string;
  conversation_id: string;
  media_asset_id: string;
  duration_ms: number;
  bytes: string;
  container: string;
  codec: string;
  waveform_samples: number[] | null;
  waveform_sample_count: number | null;
  waveform_algorithm_version: number | null;
  moderation_state: string;
  revoked_at: string | null;
};

type MediaAssetRow = {
  id: string;
  bucket: string;
  object_key: string;
  status: string;
  canonical_url: string | null;
};

async function assertConversationMembership(
  db: Pool | PoolClient,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM chat_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
    [conversationId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function loadVoiceMessageByMessageId(
  db: Pool | PoolClient,
  messageId: string,
  conversationId: string,
): Promise<VoiceMessageRow | null> {
  const result = await db.query<VoiceMessageRow>(
    `SELECT id, message_id, conversation_id, media_asset_id, duration_ms,
            bytes::text, container, codec, waveform_samples,
            waveform_sample_count, waveform_algorithm_version,
            moderation_state, revoked_at::text
     FROM voice_messages
     WHERE message_id = $1 AND conversation_id = $2
     LIMIT 1`,
    [messageId, conversationId],
  );
  return result.rowCount ? result.rows[0] : null;
}

async function loadMediaAsset(
  db: Pool | PoolClient,
  assetId: string,
): Promise<MediaAssetRow | null> {
  const result = await db.query<MediaAssetRow>(
    `SELECT id, bucket, object_key, status, canonical_url
     FROM media_assets WHERE id = $1 LIMIT 1`,
    [assetId],
  );
  return result.rowCount ? result.rows[0] : null;
}

export const registerVoiceMessageRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
}: VoiceMessageRouteDependencies) => {
  /**
   * GET /chat/conversations/:conversationId/messages/:messageId/voice
   *
   * Returns the canonical voice message metadata: duration, container/codec,
   * waveform samples (when ready), moderation state. The waveform is decoded
   * PCM (32–80 samples in [0,1]) with an algorithm version, or NULL when the
   * worker has not yet completed — the client renders an honest progress line
   * in that case, never fake bars.
   *
   * Membership is verified; revoked voice messages return 410 Gone.
   */
  app.get(
    '/chat/conversations/:conversationId/messages/:messageId/voice',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { conversationId, messageId } = messageParamsSchema.parse(request.params);

      if (!(await assertConversationMembership(db, conversationId, actorUserId))) {
        reply.code(403);
        return { ok: false, error: 'Not a member of this conversation' };
      }

      const voice = await loadVoiceMessageByMessageId(db, messageId, conversationId);
      if (!voice) {
        reply.code(404);
        return { ok: false, error: 'Voice message not found' };
      }
      if (voice.revoked_at) {
        reply.code(410);
        return { ok: false, error: 'Voice message is no longer available' };
      }
      if (voice.moderation_state === 'blocked') {
        reply.code(451);
        return { ok: false, error: 'Voice message is unavailable' };
      }

      return {
        ok: true,
        voice: {
          id: voice.id,
          durationMs: voice.duration_ms,
          bytes: Number(voice.bytes),
          container: voice.container,
          codec: voice.codec,
          waveform:
            Array.isArray(voice.waveform_samples) && voice.waveform_samples.length > 0
              ? {
                  samples: voice.waveform_samples,
                  sampleCount: voice.waveform_sample_count,
                  algorithmVersion: voice.waveform_algorithm_version,
                }
              : null,
          moderationState: voice.moderation_state,
        },
      };
    },
  );

  /**
   * POST /chat/conversations/:conversationId/messages/:messageId/voice/playback-url
   *
   * Issue a short-lived, membership-bound signed playback URL for a voice
   * message. The URL is recorded in voice_playback_authorizations so
   * revocation (delete/block/leave) can target the exact grant. The signed
   * URL expires on its own TTL; revocation is for immediate denial.
   */
  app.post(
    '/chat/conversations/:conversationId/messages/:messageId/voice/playback-url',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { conversationId, messageId } = messageParamsSchema.parse(request.params);

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        if (!(await assertConversationMembership(client, conversationId, actorUserId))) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Not a member of this conversation' };
        }

        const voice = await loadVoiceMessageByMessageId(client, messageId, conversationId);
        if (!voice) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Voice message not found' };
        }
        if (voice.revoked_at) {
          await client.query('ROLLBACK');
          reply.code(410);
          return { ok: false, error: 'Voice message is no longer available' };
        }
        if (voice.moderation_state === 'blocked') {
          await client.query('ROLLBACK');
          reply.code(451);
          return { ok: false, error: 'Voice message is unavailable' };
        }

        const asset = await loadMediaAsset(client, voice.media_asset_id);
        if (!asset) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Voice media asset not found' };
        }

        const command = new GetObjectCommand({
          Bucket: asset.bucket,
          Key: asset.object_key,
        });
        const url = await getSignedUrl(internalS3, command, {
          expiresIn: PLAYBACK_URL_TTL_SECONDS,
        });
        const authId = `vauth_${crypto.randomUUID()}`;
        const expiresAt = new Date(Date.now() + PLAYBACK_URL_TTL_SECONDS * 1000).toISOString();
        await client.query(
          `INSERT INTO voice_playback_authorizations (
             id, voice_message_id, user_id, authorized_url, expires_at
           )
           VALUES ($1, $2, $3, $4, $5)`,
          [authId, voice.id, actorUserId, url, expiresAt],
        );
        await client.query('COMMIT');

        return {
          ok: true,
          playbackUrl: url,
          expiresAt,
          expiresIn: PLAYBACK_URL_TTL_SECONDS,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );

  /**
   * POST /chat/conversations/:conversationId/messages/:messageId/voice/transcribe
   *
   * Request opt-in, recipient-side transcription of a voice message. The
   * sender is not notified. Creates a voice_transcriptions row in `queued`
   * state and a voice_transcription_jobs row for the worker. Idempotent on
   * (voice_message_id, requested_by_user_id) — repeat calls return the
   * existing transcription state.
   *
   * Per WhatsApp's on-device model and Telegram's pending/complete/rated
   * lifecycle, transcription is derived data: the client must label it
   * "Automatically transcribed" and never present it as the sender's exact
   * words.
   */
  app.post(
    '/chat/conversations/:conversationId/messages/:messageId/voice/transcribe',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { conversationId, messageId } = messageParamsSchema.parse(request.params);
      const bodySchema = z.object({
        language: z.string().trim().min(2).max(16).optional(),
      });
      const payload = bodySchema.parse(request.body ?? {});

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        if (!(await assertConversationMembership(client, conversationId, actorUserId))) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Not a member of this conversation' };
        }

        const voice = await loadVoiceMessageByMessageId(client, messageId, conversationId);
        if (!voice) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Voice message not found' };
        }
        if (voice.revoked_at) {
          await client.query('ROLLBACK');
          reply.code(410);
          return { ok: false, error: 'Voice message is no longer available' };
        }

        // Idempotent: if a transcription already exists for this recipient,
        // return its current state without creating a new job.
        const existing = await client.query<{
          id: string;
          state: string;
          text: string | null;
          language: string | null;
          failure_reason: string | null;
        }>(
          `SELECT id, state, text, language, failure_reason
           FROM voice_transcriptions
           WHERE voice_message_id = $1 AND requested_by_user_id = $2
           LIMIT 1`,
          [voice.id, actorUserId],
        );
        if (existing.rowCount) {
          await client.query('COMMIT');
          const row = existing.rows[0];
          return {
            ok: true,
            transcription: {
              id: row.id,
              state: row.state,
              text: row.text,
              language: row.language,
              failureReason: row.failure_reason,
              derived: true as const,
            },
          };
        }

        const transcriptionId = `vtx_${crypto.randomUUID()}`;
        await client.query(
          `INSERT INTO voice_transcriptions (
             id, voice_message_id, requested_by_user_id, state, language
           )
           VALUES ($1, $2, $3, 'queued', $4)`,
          [transcriptionId, voice.id, actorUserId, payload.language ?? null],
        );
        const jobId = `vtxjob_${crypto.randomUUID()}`;
        await client.query(
          `INSERT INTO voice_transcription_jobs (
             id, transcription_id, status, language
           )
           VALUES ($1, $2, 'pending', $3)`,
          [jobId, transcriptionId, payload.language ?? null],
        );
        await client.query('COMMIT');

        return {
          ok: true,
          transcription: {
            id: transcriptionId,
            state: 'queued' as const,
            text: null,
            language: payload.language ?? null,
            failureReason: null,
            derived: true as const,
          },
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );

  /**
   * GET /chat/conversations/:conversationId/messages/:messageId/voice/transcription
   *
   * Read the current transcription state for the calling user. Returns 404
   * if the user has not requested transcription (the client offers the
   * "Transcribe" affordance; it is never auto-requested).
   */
  app.get(
    '/chat/conversations/:conversationId/messages/:messageId/voice/transcription',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { conversationId, messageId } = messageParamsSchema.parse(request.params);

      if (!(await assertConversationMembership(db, conversationId, actorUserId))) {
        reply.code(403);
        return { ok: false, error: 'Not a member of this conversation' };
      }

      const voice = await loadVoiceMessageByMessageId(db, messageId, conversationId);
      if (!voice) {
        reply.code(404);
        return { ok: false, error: 'Voice message not found' };
      }

      const result = await db.query<{
        id: string;
        state: string;
        text: string | null;
        language: string | null;
        rating: string | null;
        failure_reason: string | null;
      }>(
        `SELECT id, state, text, language, rating, failure_reason
         FROM voice_transcriptions
         WHERE voice_message_id = $1 AND requested_by_user_id = $2
         LIMIT 1`,
        [voice.id, actorUserId],
      );
      if (!result.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Transcription not requested' };
      }
      const row = result.rows[0];
      return {
        ok: true,
        transcription: {
          id: row.id,
          state: row.state,
          text: row.text,
          language: row.language,
          rating: row.rating,
          failureReason: row.failure_reason,
          derived: true as const,
        },
      };
    },
  );

  /**
   * POST /chat/conversations/:conversationId/messages/:messageId/voice/transcription/rating
   *
   * Rate a completed transcription (good/bad) per Telegram's lifecycle. Drives
   * model improvement; never shown to the sender. Only the requesting user
   * can rate their own transcription.
   */
  app.post(
    '/chat/conversations/:conversationId/messages/:messageId/voice/transcription/rating',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { conversationId, messageId } = messageParamsSchema.parse(request.params);
      const bodySchema = z.object({
        rating: z.enum(['good', 'bad']),
      });
      const payload = bodySchema.parse(request.body ?? {});

      if (!(await assertConversationMembership(db, conversationId, actorUserId))) {
        reply.code(403);
        return { ok: false, error: 'Not a member of this conversation' };
      }

      const voice = await loadVoiceMessageByMessageId(db, messageId, conversationId);
      if (!voice) {
        reply.code(404);
        return { ok: false, error: 'Voice message not found' };
      }

      const result = await db.query<{ id: string; state: string }>(
        `UPDATE voice_transcriptions
         SET rating = $3, rated_at = NOW(), updated_at = NOW()
         WHERE voice_message_id = $1 AND requested_by_user_id = $2
           AND state = 'complete'
         RETURNING id, state`,
        [voice.id, actorUserId, payload.rating],
      );
      if (!result.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Completed transcription not found' };
      }
      return { ok: true, rating: payload.rating };
    },
  );
};
