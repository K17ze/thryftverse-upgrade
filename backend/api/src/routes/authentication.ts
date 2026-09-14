/**
 * Read surface for the physical authentication pipeline
 * (lib/authenticationPipeline.ts).
 *
 * Two routes:
 *   GET /orders/:orderId/authentication        — party-gated (buyer, seller,
 *                                                admin) status of the order's
 *                                                verification request.
 *   GET /authentication/certificates/:id       — public certificate lookup by
 *                                                the certificate id carried on
 *                                                an issued badge.
 *
 * Storage reality (no `authentication_requests` table exists):
 *   - `orders.verification_requested` is the durable record that a buyer
 *     asked for verification at checkout.
 *   - The pipeline's working state lives in Redis only: requests under
 *     `auth:request:auth_order_{orderId}` (90-day TTL refreshed per write),
 *     certificates under `auth:certificate:{certificateId}` (1-year TTL).
 *   The order endpoint therefore reports `requested` from Postgres and the
 *   live pipeline state from Redis, and is explicit when the durable flag is
 *   set but the Redis record is absent (post-commit create failure or TTL
 *   expiry) — it never claims a check is in flight when no record exists.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import {
  getAuthenticationRequestForOrder,
  getRequestTtlMs,
  verifyAuthenticationBadge,
  type AuthenticationRequest,
  type AuthenticationStatus,
} from '../lib/authenticationPipeline.js';

type AuthenticationRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  redis: Redis;
};

const orderIdParamsSchema = z.object({
  orderId: z.string().min(4).max(64),
});

const certificateIdParamsSchema = z.object({
  certificateId: z.string().min(4).max(64),
});

type AuthUser = { userId?: string; role?: string };

function authUserOf(request: FastifyRequest): AuthUser | undefined {
  return (request as FastifyRequest & { authUser?: AuthUser }).authUser;
}

/** What both order parties are allowed to see — no internal actor ids,
 *  no audit notes, and the AI triage stays labelled preliminary. */
function publicRequestView(request: AuthenticationRequest) {
  return {
    id: request.id,
    listingId: request.listingId,
    tier: request.tier,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    completedAt: request.completedAt ?? null,
    aiTriage: request.aiTriageResult
      ? {
          confidenceScore: request.aiTriageResult.confidenceScore,
          recommendation: request.aiTriageResult.recommendation,
          isPreliminary: true,
          triagedAt: request.aiTriageResult.triagedAt,
        }
      : null,
    expertReview: request.expertReview
      ? {
          verdict: request.expertReview.verdict,
          completedAt: request.expertReview.completedAt || null,
        }
      : null,
    labReport: request.labReport
      ? {
          result: request.labReport.result,
          submittedAt: request.labReport.submittedAt,
        }
      : null,
    badge: request.badge
      ? {
          type: request.badge.type,
          certificateId: request.badge.certificateId,
          authenticator: request.badge.authenticator,
          method: request.badge.method,
          confidenceLevel: request.badge.confidenceLevel,
          issuedAt: request.badge.issuedAt,
          expiresAt: request.badge.expiresAt ?? null,
        }
      : null,
  };
}

export function registerAuthenticationRoutes({
  app,
  db,
  redis,
}: AuthenticationRouteDependencies) {
  app.get('/orders/:orderId/authentication', async (request, reply) => {
    // The global preHandler authenticates non-public routes; this check keeps
    // the route honest when mounted without that hook (e.g. in tests).
    const actor = authUserOf(request);
    if (!actor?.userId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    const { orderId } = orderIdParamsSchema.parse(request.params);

    const orderResult = await db.query<{
      buyer_id: string;
      seller_id: string;
      verification_requested: boolean | null;
    }>(
      `SELECT buyer_id, seller_id, verification_requested
       FROM orders
       WHERE id = $1
       LIMIT 1`,
      [orderId]
    );

    if (!orderResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Order not found' };
    }

    const order = orderResult.rows[0];
    const isParty =
      actor.role === 'admin' ||
      actor.userId === order.buyer_id ||
      actor.userId === order.seller_id;
    if (!isParty) {
      reply.code(403);
      return { ok: false, error: 'Forbidden: order access denied' };
    }

    const requested = order.verification_requested === true;
    if (!requested) {
      return {
        ok: true,
        authentication: {
          requested: false,
          status: 'not_requested' as const,
          request: null,
        },
      };
    }

    // The durable flag is set — read the live pipeline record. A Redis
    // outage must not fail the endpoint: report the request as recorded
    // with no live state rather than 500ing on an order surface.
    let pipelineRequest: AuthenticationRequest | null = null;
    let recordExpiresAt: string | null = null;
    try {
      pipelineRequest = await getAuthenticationRequestForOrder(redis, orderId);
      if (pipelineRequest) {
        const ttlMs = await getRequestTtlMs(redis, pipelineRequest.id);
        recordExpiresAt =
          ttlMs === null ? null : new Date(Date.now() + ttlMs).toISOString();
      }
    } catch (error) {
      request.log.warn(
        { err: error, orderId },
        'Authentication pipeline state unavailable — returning durable flag only'
      );
    }

    return {
      ok: true,
      authentication: {
        requested: true,
        // 'request_pending' = the checkout flag is durable but no live
        // pipeline record exists (create failed post-commit or the Redis
        // record hit its 90-day TTL). Not a fabricated "in progress".
        status: (pipelineRequest?.status ?? 'request_pending') as
          | AuthenticationStatus
          | 'request_pending',
        request: pipelineRequest ? publicRequestView(pipelineRequest) : null,
        storage: {
          persistence: 'ephemeral',
          recordExpiresAt,
        },
      },
    };
  });

  // Public certificate verification. Registered as a public route in
  // index.ts isPublicRoute — the certificateId is the unguessable
  // capability (CERT-<12 hex of sha256>) printed on the verification URL.
  app.get(
    '/authentication/certificates/:certificateId',
    async (request, reply) => {
      const { certificateId } = certificateIdParamsSchema.parse(request.params);

      let result: Awaited<ReturnType<typeof verifyAuthenticationBadge>>;
      try {
        result = await verifyAuthenticationBadge(redis, certificateId);
      } catch (error) {
        request.log.warn(
          { err: error, certificateId },
          'Certificate verification read failed'
        );
        reply.code(503);
        return { ok: false, error: 'Certificate verification unavailable' };
      }

      if (!result.valid) {
        reply.code(404);
        return { ok: false, error: result.error ?? 'Certificate not found' };
      }

      return { ok: true, certificate: result.certificate };
    }
  );
}
