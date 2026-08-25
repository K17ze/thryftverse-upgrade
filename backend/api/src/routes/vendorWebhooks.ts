import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  recordVendorWebhook,
  verifyWebhookSignature,
} from '../support/vendorAdapter.js';
import { logger } from '../lib/logger.js';

export type VendorWebhookRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  /** Map of vendorName → webhook signing secret. */
  vendorSecrets: Record<string, string>;
};

const vendorNameParamsSchema = z.object({
  vendorName: z.enum(['intercom', 'zendesk']),
});

/**
 * Signature header names vary by vendor. Intercom uses `X-Hub-Signature`,
 * Zendesk uses `X-Zendesk-Webhook-Signature`.
 */
function getSignatureHeader(
  headers: Record<string, string | string[] | undefined>,
  vendorName: string,
): string | null {
  if (vendorName === 'intercom') {
    const raw = headers['x-hub-signature'] ?? headers['X-Hub-Signature'];
    return typeof raw === 'string' ? raw : null;
  }
  if (vendorName === 'zendesk') {
    const raw =
      headers['x-zendesk-webhook-signature'] ??
      headers['X-Zendesk-Webhook-Signature'];
    return typeof raw === 'string' ? raw : null;
  }
  return null;
}

/**
 * Extracts a vendor event ID from the webhook payload. Each vendor uses a
 * different field name for their event identifier.
 */
function extractVendorEventId(
  payload: Record<string, unknown>,
  vendorName: string,
): string {
  if (vendorName === 'intercom') {
    const id = payload.id ?? payload.conversation_id ?? payload.data;
    return typeof id === 'string' ? id : `intercom_${Date.now()}`;
  }
  if (vendorName === 'zendesk') {
    const id = payload.id ?? payload.ticket_id ?? payload.event_id;
    return typeof id === 'string' ? id : `zendesk_${Date.now()}`;
  }
  return `${vendorName}_${Date.now()}`;
}

/**
 * Classifies the webhook event type from the vendor payload into a normalized
 * event type used by the inbox processor.
 */
function classifyEventType(
  payload: Record<string, unknown>,
  vendorName: string,
): string {
  const topic = payload.topic ?? payload.type ?? payload.event_type ?? '';
  const topicStr = typeof topic === 'string' ? topic.toLowerCase() : '';

  if (topicStr.includes('reply') || topicStr.includes('comment') || topicStr.includes('message')) {
    return 'reply';
  }
  if (topicStr.includes('status') || topicStr.includes('solved') || topicStr.includes('closed')) {
    return 'status_change';
  }
  if (topicStr.includes('assign')) {
    return 'assignment';
  }
  if (topicStr.includes('note') || topicStr.includes('internal')) {
    return 'note';
  }

  // Intercom conversation parts and Zendesk ticket events
  if (vendorName === 'intercom' && payload.conversation_id) {
    return 'reply';
  }
  if (vendorName === 'zendesk' && payload.ticket_id) {
    return 'reply';
  }

  return 'unknown';
}

export const registerVendorWebhookRoutes = ({
  app,
  db,
  vendorSecrets,
}: VendorWebhookRouteDependencies) => {
  // ── POST /webhooks/support/:vendorName ───────────────────────────────
  //
  // Receives a vendor webhook. The raw body is verified against the vendor's
  // signing secret. If the signature is valid, the event is recorded in the
  // vendor inbox (idempotent by vendor_name + vendor_event_id). Processing
  // happens asynchronously in a background worker.
  app.post('/webhooks/support/:vendorName', async (request, reply) => {
    const { vendorName } = vendorNameParamsSchema.parse(request.params);

    const secret = vendorSecrets[vendorName];
    if (!secret) {
      reply.code(503);
      return {
        ok: false,
        error: `Vendor "${vendorName}" is not configured`,
        code: 'VENDOR_NOT_CONFIGURED',
      };
    }

    const signature = getSignatureHeader(
      request.headers as Record<string, string | string[] | undefined>,
      vendorName,
    );
    if (!signature) {
      reply.code(401);
      return {
        ok: false,
        error: 'Missing signature header',
        code: 'MISSING_SIGNATURE',
      };
    }

    // Fastify provides the raw body string when rawBody is enabled.
    const rawBody = typeof request.rawBody === 'string'
      ? request.rawBody
      : JSON.stringify(request.body ?? {});

    const signatureValid = verifyWebhookSignature(rawBody, signature, secret);
    if (!signatureValid) {
      logger.warn(
        { vendorName },
        '[vendorWebhooks] invalid webhook signature rejected',
      );
      reply.code(401);
      return {
        ok: false,
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE',
      };
    }

    const payload = (request.body ?? {}) as Record<string, unknown>;
    const vendorEventId = extractVendorEventId(payload, vendorName);
    const eventType = classifyEventType(payload, vendorName);

    const vendorConversationId =
      typeof payload.conversation_id === 'string'
        ? payload.conversation_id
        : typeof payload.conversation_id === 'number'
          ? String(payload.conversation_id)
          : undefined;

    const vendorTicketId =
      typeof payload.ticket_id === 'string'
        ? payload.ticket_id
        : typeof payload.ticket_id === 'number'
          ? String(payload.ticket_id)
          : undefined;

    const { inserted } = await recordVendorWebhook(db, {
      vendorName,
      vendorEventId,
      eventType,
      vendorConversationId,
      vendorTicketId,
      payload,
      signatureValid: true,
    });

    logger.info(
      { vendorName, vendorEventId, eventType, inserted },
      '[vendorWebhooks] webhook received',
    );

    reply.code(200);
    return {
      ok: true,
      received: true,
      duplicate: !inserted,
    };
  });

  // ── GET /webhooks/support/health ─────────────────────────────────────
  app.get('/webhooks/support/health', async () => {
    const configuredVendors = Object.keys(vendorSecrets);
    return {
      ok: true,
      configuredVendors,
      timestamp: new Date().toISOString(),
    };
  });
};
