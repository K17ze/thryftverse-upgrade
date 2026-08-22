import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import type { AuthenticatedUser } from '../lib/auth.js';

// ── Local helpers (mirrored from index.ts) ──

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

// ── Local types ──

interface ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

type DbQueryable = Pick<PoolClient, 'query'>;

// ── Dependency injection ──

type PayoutRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => ApiError;
  getApiError: (error: unknown) => ApiError | null;
  ensureSecurityAdminAccess: (
    request: { headers: Record<string, string | string[] | undefined>; authUser?: AuthenticatedUser },
    reply: { code: (statusCode: number) => unknown }
  ) => { ok: false; error: string } | null;
  paymentTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  settlePayoutRequest: (
    client: DbQueryable,
    input: {
      userId: string;
      requestId: string;
      targetStatus: string;
      providerPayoutRef?: string;
      failureReason?: string;
      metadata?: Record<string, unknown>;
      source: string;
    }
  ) => Promise<{
    idempotent: boolean;
    payoutRequest: Record<string, unknown>;
  }>;
};

export const registerPayoutRoutes = ({
  app,
  db,
  getApiError,
  ensureSecurityAdminAccess,
  paymentTablesAvailable,
  settlePayoutRequest,
}: PayoutRouteDependencies) => {

if (config.nodeEnv !== 'production') {
app.post('/payouts/webhooks/mock', async (request, reply) => {
  if (config.nodeEnv === 'production') {
    reply.code(404);
    return {
      ok: false,
      error: 'Mock endpoints are disabled in production',
    };
  }

  const bodySchema = z.object({
    gatewayId: z.string().min(2).max(80).default('mock_fiat_gbp'),
    providerEventId: z.string().min(4).max(140),
    eventType: z.string().min(3).max(120),
    payoutRequestId: z.string().min(4).max(140),
    status: z.enum(['processing', 'paid', 'failed', 'cancelled']),
    providerPayoutRef: z.string().min(4).max(140).optional(),
    failureReason: z.string().max(240).optional(),
    payload: z.record(z.unknown()).optional(),
  });

  const payload = bodySchema.parse(request.body);

  if (!config.apiEnableMockWebhooks) {
    reply.code(404);
    return {
      ok: false,
      error: 'Mock payout webhook endpoint is disabled',
    };
  }

  const securityAdminError = ensureSecurityAdminAccess(request, reply);
  if (securityAdminError) {
    return securityAdminError;
  }

  if (!(await paymentTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const gateway = await client.query<{ id: string }>(
      'SELECT id FROM payment_gateways WHERE id = $1 LIMIT 1',
      [payload.gatewayId]
    );

    if (!gateway.rowCount) {
      await client.query('ROLLBACK');
      reply.code(400);
      return {
        ok: false,
        error: 'Webhook gateway is unknown',
      };
    }

    const payoutRequest = await client.query<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM payout_requests WHERE id = $1 LIMIT 1',
      [payload.payoutRequestId]
    );

    if (!payoutRequest.rowCount) {
      await client.query('ROLLBACK');
      reply.code(404);
      return {
        ok: false,
        error: 'Payout request not found for webhook event',
      };
    }

    const webhookInsert = await client.query<{ id: number }>(
      `
        INSERT INTO payment_webhook_events (
          gateway_id,
          provider_event_id,
          event_type,
          intent_id,
          payload
        )
        VALUES ($1, $2, $3, NULL, $4::jsonb)
        ON CONFLICT (gateway_id, provider_event_id)
        DO NOTHING
        RETURNING id
      `,
      [
        payload.gatewayId,
        payload.providerEventId,
        payload.eventType,
        toJsonString({
          kind: 'payout_webhook',
          payoutRequestId: payload.payoutRequestId,
          status: payload.status,
          providerPayoutRef: payload.providerPayoutRef,
          ...(payload.payload ?? {}),
        }),
      ]
    );

    if (!webhookInsert.rowCount) {
      await client.query('COMMIT');
      return {
        ok: true,
        duplicate: true,
      };
    }

    const settled = await settlePayoutRequest(client, {
      userId: payoutRequest.rows[0].user_id,
      requestId: payload.payoutRequestId,
      targetStatus: payload.status,
      providerPayoutRef: payload.providerPayoutRef,
      failureReason: payload.failureReason,
      metadata: payload.payload,
      source: 'mock_webhook',
    });

    await client.query(
      'UPDATE payment_webhook_events SET processed_at = NOW() WHERE id = $1',
      [webhookInsert.rows[0].id]
    );

    await client.query('COMMIT');
    return {
      ok: true,
      duplicate: false,
      idempotent: settled.idempotent,
      payoutRequest: settled.payoutRequest,
    };
  } catch (error) {
    await client.query('ROLLBACK');

    const apiError = getApiError(error);
    if (apiError?.code === 'PAYOUT_REQUEST_NOT_FOUND') {
      reply.code(404);
      return {
        ok: false,
        error: apiError.message,
      };
    }

    if (apiError?.code === 'PAYOUT_INVALID_TRANSITION') {
      reply.code(409);
      return {
        ok: false,
        error: apiError.message,
      };
    }

    if (apiError?.code === 'PAYOUT_PENDING_INSUFFICIENT') {
      reply.code(409);
      return {
        ok: false,
        error: apiError.message,
        balance: apiError.details,
      };
    }

    request.log.error({ err: error, payload }, 'Failed to process mock payout webhook');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to process payout webhook event',
    };
  } finally {
    client.release();
  }
});
}

};
