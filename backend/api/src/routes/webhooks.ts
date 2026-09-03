import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import {
  expectedGatewayIdForProvider,
  resolveProviderFromPathSegment,
  type ProviderPaymentStatus,
  type ProviderSlug,
  verifyAndNormalizeWebhook,
} from '../lib/paymentProviders.js';
import { isWebhookIpAllowed, extractClientIp } from '../lib/webhookIpAllowlist.js';
import {
  moneyFromMajorDecimal,
  moneyFromMinor,
  moneyToMajorDecimal,
  type Money,
  type MoneyConversionTrace,
  type ProviderAmountUnit,
} from '../lib/money.js';
import { enqueueOnezeMintReserveJob } from '../lib/queues.js';

// ── Types (mirrored from index.ts) ─────────────────────────────────────

type PaymentIntentChannel =
  | 'commerce'
  | 'wallet_topup'
  | 'co_own'
  | 'p2p_transfer';

type PaymentIntentStatus =
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

type PaymentIntentTerminalStatus = 'succeeded' | 'failed' | 'cancelled';

type PayoutRequestStatus = 'requested' | 'processing' | 'paid' | 'failed' | 'cancelled';

interface PaymentIntentRow {
  id: string;
  user_id: string;
  gateway_id: string;
  channel: PaymentIntentChannel;
  order_id: string | null;
  coOwn_order_id: number | null;
  instrument_id: number | null;
  amount_gbp: number | string;
  amount_currency: string;
  amount_minor?: number | string | null;
  currency_exponent?: number | null;
  money_registry_version?: string | null;
  provider_amount?: string | null;
  provider_amount_unit?: ProviderAmountUnit | null;
  money_conversion_trace?: MoneyConversionTrace | null;
  money_quarantined?: boolean;
  status: PaymentIntentStatus;
  provider_intent_ref: string | null;
  client_secret: string | null;
  provider_status: string | null;
  next_action_url: string | null;
  sca_expires_at: string | null;
  settled_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  request_hash?: string | null;
  created_at: string;
  updated_at: string;
}

interface PayoutRequestRow {
  id: string;
  user_id: string;
  payout_account_id: number;
  amount_gbp: number | string;
  amount_currency: string;
  amount_minor?: number | string | null;
  currency_exponent?: number | null;
  money_registry_version?: string | null;
  money_conversion_trace?: MoneyConversionTrace | null;
  money_quarantined?: boolean;
  request_hash?: string | null;
  status: PayoutRequestStatus;
  provider_payout_ref: string | null;
  failure_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface MintOperationRow {
  id: string;
  user_id: string;
  operation_type: string;
  status: string;
  amount_units: number | string;
  fiat_currency: string;
  fiat_amount_minor: number | string | null;
  payment_intent_id: string | null;
  provider: string | null;
  provider_operation_ref: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type DbQueryable = Pool | PoolClient;

type WebhookRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  toJsonString: (value: unknown) => string;
  getApiError: (error: unknown) => { code: string; message: string; details?: Record<string, unknown> } | null;
  paymentTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  ledgerTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  findPaymentIntentByProviderRef: (
    client: PoolClient,
    gatewayId: string,
    providerIntentRef: string
  ) => Promise<PaymentIntentRow | null>;
  settlePaymentIntent: (
    client: PoolClient,
    input: {
      intentId: string;
      finalStatus: PaymentIntentTerminalStatus;
      providerAttemptRef?: string;
      failureCode?: string;
      failureMessage?: string;
      rawPayload?: Record<string, unknown>;
    }
  ) => Promise<{
    intent: Record<string, unknown>;
    orderSettlement?: { orderId: string };
  }>;
  transitionPaymentIntentStatus: (
    client: PoolClient,
    input: {
      intentId: string;
      nextStatus: Exclude<ProviderPaymentStatus, 'succeeded' | 'failed' | 'cancelled'>;
      providerStatus: string;
      nextActionUrl: string | null;
      metadataPatch: Record<string, unknown>;
    }
  ) => Promise<{ intent: Record<string, unknown> }>;
  toPaymentIntentPayload: (row: PaymentIntentRow) => Record<string, unknown>;
  toPayoutRequestPayload: (row: PayoutRequestRow) => Record<string, unknown>;
  toMintOperationPayload: (row: MintOperationRow) => Record<string, unknown>;
  processMintOperationPaymentWebhook: (
    client: PoolClient,
    input: {
      paymentIntentId: string;
      paymentStatus: string | undefined;
      provider: string;
      eventType: string;
      providerEventId: string;
    }
  ) => Promise<{
    mintOperation: Record<string, unknown> | undefined;
    enqueueReserveAllocation: boolean;
  }>;
  upsertPaymentRefund: (
    client: PoolClient,
    input: {
      intentId: string;
      gatewayId: string;
      providerRefundRef: string;
      status: string;
      money?: Money;
      rawProviderAmount?: string;
      providerAmountUnit?: ProviderAmountUnit;
      conversionTrace?: MoneyConversionTrace;
      amount?: number;
      currency?: string;
      reason?: string;
      metadata: Record<string, unknown>;
    }
  ) => Promise<void>;
  upsertPaymentDispute: (
    client: PoolClient,
    input: {
      intentId?: string;
      gatewayId: string;
      providerDisputeRef: string;
      status: string;
      money?: Money;
      rawProviderAmount?: string;
      providerAmountUnit?: ProviderAmountUnit;
      conversionTrace?: MoneyConversionTrace;
      amount?: number;
      currency?: string;
      reason?: string;
      metadata: Record<string, unknown>;
    }
  ) => Promise<void>;
  postCommerceOrderRefundLedgerReversal: (
    client: PoolClient,
    orderId: string,
    userId: string,
    amountGbp: number
  ) => Promise<void>;
  roundTo: (value: number, decimals: number) => number;
  settlePayoutRequest: (
    client: PoolClient,
    input: {
      userId: string;
      requestId: string;
      targetStatus: string;
      providerPayoutRef?: string;
      failureReason?: string;
      metadata: Record<string, unknown>;
      source: string;
    }
  ) => Promise<{
    payoutRequest: Record<string, unknown> & { id: string; status: string };
    idempotent: boolean;
  }>;
  queueCommercePaymentNotifications: (input: {
    orderId: string;
    source: string;
  }) => Promise<void>;
  queuePayoutProcessedNotification: (input: {
    payoutRequest: Record<string, unknown>;
    source: string;
  }) => Promise<void>;
  queueRefundCompletedNotification: (input: {
    userId: string;
    amountGbp: number;
    orderId: string | null;
    source: string;
  }) => Promise<void>;
};

export const registerWebhookRoutes = ({
  app,
  db,
  createApiError,
  toJsonString,
  getApiError,
  paymentTablesAvailable,
  ledgerTablesAvailable,
  findPaymentIntentByProviderRef,
  settlePaymentIntent,
  transitionPaymentIntentStatus,
  toPaymentIntentPayload,
  toPayoutRequestPayload,
  toMintOperationPayload,
  processMintOperationPaymentWebhook,
  upsertPaymentRefund,
  upsertPaymentDispute,
  postCommerceOrderRefundLedgerReversal,
  roundTo,
  settlePayoutRequest,
  queueCommercePaymentNotifications,
  queuePayoutProcessedNotification,
  queueRefundCompletedNotification,
}: WebhookRouteDependencies) => {
  app.post('/webhooks/:provider', async (request, reply) => {
    const paramsSchema = z.object({ provider: z.string().min(3).max(40) });
    const { provider: providerSegment } = paramsSchema.parse(request.params);
    const provider = resolveProviderFromPathSegment(providerSegment);

    if (!provider) {
      reply.code(404);
      return {
        ok: false,
        error: 'Unsupported webhook provider',
      };
    }

    // ── IP allowlisting for non-Stripe providers ────────────────────────
    // Stripe verifies webhooks via signature, so IP allowlisting is not
    // needed. For other providers, check the client IP against the
    // configured allowlist as an additional security layer.
    if (config.webhookIpAllowlistEnabled && provider !== 'stripe') {
      const clientIp = extractClientIp(request.headers as Record<string, string | string[] | undefined>);
      if (clientIp && !isWebhookIpAllowed(clientIp, config.webhookAllowlistedIpRanges)) {
        request.log.warn({ provider, clientIp }, 'Webhook rejected: IP not in allowlist');
        reply.code(403);
        return {
          ok: false,
          error: 'Webhook source IP not allowed',
        };
      }
    }

    if (!(await paymentTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: 'Payment settlement tables are unavailable. Run migrations first.',
      };
    }

    const rawBody =
      typeof request.rawBody === 'string'
        ? request.rawBody
        : request.rawBody
          ? request.rawBody.toString('utf8')
          : toJsonString(request.body ?? {});
    const verification = await verifyAndNormalizeWebhook(
      provider,
      rawBody,
      request.headers as Record<string, unknown>,
      request.body
    );

    if (!verification.verified || !verification.event) {
      reply.code(401);
      return {
        ok: false,
        error: verification.reason ?? 'Webhook signature verification failed',
      };
    }

    const event = verification.event;
    const expectedGateway = expectedGatewayIdForProvider(provider);

    // ── Durable inbox: event-ID dedup INSIDE the transaction ───────────
    // The dedup row is inserted in the SAME transaction as the ledger
    // effects below.  If processing rolls back, the dedup row rolls back
    // too — so a Stripe retry will not be discarded as a duplicate.
    // The raw body and signature header are stored for audit and potential
    // re-verification by the recovery sweep.
    const signatureHeader =
      (request.headers['stripe-signature'] as string | string[] | undefined) ??
      (request.headers['razorpay-signature'] as string | string[] | undefined) ??
      null;
    const signatureHeaderValue =
      typeof signatureHeader === 'string' ? signatureHeader
      : Array.isArray(signatureHeader) ? signatureHeader[0] ?? null
      : null;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Insert the durable inbox row.  If the event was already fully
      // processed (status = 'succeeded'), return duplicate.  If it was
      // received/failed (e.g. a previous attempt rolled back), we proceed
      // to process it again.
      if (event.providerEventId) {
        const payloadHash = crypto
          .createHash('sha256')
          .update(rawBody)
          .digest('hex');

        const inboxInsert = await client.query<{ id: number; status: string }>(
          `
          INSERT INTO webhook_events (
            event_id, event_type, provider, gateway_id, payload_hash,
            raw_body, signature_header, status, processed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'received', NULL)
          ON CONFLICT (event_id) DO NOTHING
          RETURNING id, status
          `,
          [
            event.providerEventId,
            event.eventType,
            provider,
            expectedGateway,
            payloadHash,
            rawBody,
            signatureHeaderValue,
          ]
        );

        if (!inboxInsert.rowCount) {
          // Row already exists — check if it was already succeeded.
          const existing = await client.query<{ status: string }>(
            `SELECT status FROM webhook_events WHERE event_id = $1 LIMIT 1`,
            [event.providerEventId]
          );
          const existingStatus = existing.rows[0]?.status;
          if (existingStatus === 'succeeded') {
            await client.query('COMMIT');
            request.log.info(
              { providerEventId: event.providerEventId, eventType: event.eventType },
              'Webhook event already processed (durable inbox)'
            );
            reply.code(200);
            return { ok: true, duplicate: true };
          }
          // status is 'received', 'failed', or 'processing' — reprocess.
          // Update the row to 'received' and reset the lease.
          await client.query(
            `UPDATE webhook_events
             SET status = 'received', lease_owner = NULL, lease_expires_at = NULL,
                 raw_body = COALESCE(raw_body, $2),
                 signature_header = COALESCE(signature_header, $3)
             WHERE event_id = $1`,
            [event.providerEventId, rawBody, signatureHeaderValue]
          );
        }
      }

      const gateway = await client.query<{ id: string }>(
        'SELECT id FROM payment_gateways WHERE id = $1 LIMIT 1',
        [expectedGateway]
      );

      if (!gateway.rowCount) {
        await client.query('ROLLBACK');
        reply.code(400);
        return {
          ok: false,
          error: `Gateway '${expectedGateway}' is not configured`,
        };
      }

      let intentRow: PaymentIntentRow | null = null;
      if (event.intentId) {
        const byId = await client.query<PaymentIntentRow>(
          `
          SELECT
            id,
            user_id,
            gateway_id,
            channel,
            order_id,
            coOwn_order_id,
            instrument_id,
            amount_gbp,
            amount_currency,
            amount_minor,
            currency_exponent,
            money_registry_version,
            provider_amount,
            provider_amount_unit,
            money_conversion_trace,
            money_quarantined,
            status,
            provider_intent_ref,
            client_secret,
            provider_status,
            next_action_url,
            sca_expires_at,
            settled_at,
            failure_code,
            failure_message,
            created_at,
            updated_at
          FROM payment_intents
          WHERE id = $1
          LIMIT 1
        `,
          [event.intentId]
        );
        intentRow = byId.rows[0] ?? null;
      }

      if (!intentRow && event.providerIntentRef) {
        intentRow = await findPaymentIntentByProviderRef(client, expectedGateway, event.providerIntentRef);
      }

      const webhookMoney = event.money ?? event.refund?.money ?? event.dispute?.money;
      const webhookRawAmount =
        event.rawProviderAmount
        ?? event.refund?.rawProviderAmount
        ?? event.dispute?.rawProviderAmount;
      const webhookAmountUnit =
        event.providerAmountUnit
        ?? event.refund?.providerAmountUnit
        ?? event.dispute?.providerAmountUnit;
      const webhookConversionTrace =
        event.conversionTrace
        ?? event.refund?.conversionTrace
        ?? event.dispute?.conversionTrace;
      const webhookInsert = await client.query<{ id: number }>(
        `
        INSERT INTO payment_webhook_events (
          gateway_id,
          provider_event_id,
          event_type,
          intent_id,
          canonical_amount_minor,
          canonical_currency,
          currency_exponent,
          raw_provider_amount,
          provider_amount_unit,
          money_registry_version,
          money_conversion_trace,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
        ON CONFLICT (gateway_id, provider_event_id)
        DO NOTHING
        RETURNING id
      `,
        [
          expectedGateway,
          event.providerEventId,
          event.eventType,
          intentRow?.id ?? null,
          webhookMoney?.minorAmount ?? null,
          webhookMoney?.currency ?? null,
          webhookMoney?.exponent ?? null,
          webhookRawAmount ?? null,
          webhookAmountUnit ?? null,
          webhookMoney?.registryVersion ?? null,
          webhookConversionTrace ? toJsonString(webhookConversionTrace) : null,
          toJsonString({
            raw: event.rawPayload,
            normalizedMoney: webhookMoney ?? null,
            conversionTrace: webhookConversionTrace ?? null,
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

      let settledIntent: ReturnType<typeof toPaymentIntentPayload> | undefined;
      let settledPayout: ReturnType<typeof toPayoutRequestPayload> | undefined;
      let settledPayoutIdempotent = false;
      let settledCommerceOrderId: string | null = null;
      let refundCompletedUserId: string | null = null;
      let refundCompletedAmountGbp: number | null = null;
      let refundCompletedOrderId: string | null = null;
      let mintOperation: ReturnType<typeof toMintOperationPayload> | undefined;
      let mintReserveEnqueueOperationId: string | null = null;

      if (event.paymentStatus && intentRow) {
        if (
          event.money
          && intentRow.amount_minor !== undefined
          && intentRow.amount_minor !== null
          && (
            event.money.currency !== intentRow.amount_currency
            || event.money.minorAmount !== String(intentRow.amount_minor)
          )
        ) {
          throw createApiError(
            'PAYMENT_AMOUNT_MISMATCH',
            'Provider amount does not equal the canonical payment intent amount',
            {
              intentId: intentRow.id,
              expectedCurrency: intentRow.amount_currency,
              expectedMinorAmount: String(intentRow.amount_minor),
              providerCurrency: event.money.currency,
              providerMinorAmount: event.money.minorAmount,
              conversionTrace: event.conversionTrace ?? null,
            }
          );
        }
        if (['succeeded', 'failed', 'cancelled'].includes(event.paymentStatus)) {
          const settled = await settlePaymentIntent(client, {
            intentId: intentRow.id,
            finalStatus: event.paymentStatus as PaymentIntentTerminalStatus,
            providerAttemptRef: event.providerEventId,
            failureCode: event.paymentStatus === 'failed' ? 'provider_failed' : undefined,
            failureMessage: event.paymentStatus === 'failed' ? `Provider event ${event.eventType}` : undefined,
            rawPayload: {
              source: 'provider_webhook',
              provider,
              eventType: event.eventType,
              payload: event.rawPayload,
            },
          });
          settledIntent = settled.intent;
          settledCommerceOrderId = settled.orderSettlement?.orderId ?? settledCommerceOrderId;
        } else {
          const transitioned = await transitionPaymentIntentStatus(client, {
            intentId: intentRow.id,
            nextStatus: event.paymentStatus as Exclude<ProviderPaymentStatus, 'succeeded' | 'failed' | 'cancelled'>,
            providerStatus: event.eventType,
            nextActionUrl: (event.metadata.nextActionUrl as string | undefined) ?? null,
            metadataPatch: {
              source: 'provider_webhook',
              provider,
              eventType: event.eventType,
            },
          });
          settledIntent = transitioned.intent;
        }

        if (intentRow.channel === 'wallet_topup') {
          const mintTransition = await processMintOperationPaymentWebhook(client, {
            paymentIntentId: intentRow.id,
            paymentStatus: event.paymentStatus,
            provider,
            eventType: event.eventType,
            providerEventId: event.providerEventId,
          });

          if (mintTransition.mintOperation) {
            mintOperation = mintTransition.mintOperation;
          }

          if (mintTransition.enqueueReserveAllocation && mintTransition.mintOperation?.id) {
            mintReserveEnqueueOperationId = String(mintTransition.mintOperation.id);
          }
        }
      }

      if (event.refund && intentRow) {
        const refundMoney =
          event.refund.money
          ?? (
            intentRow.amount_minor !== undefined
            && intentRow.amount_minor !== null
              ? moneyFromMinor(intentRow.amount_currency, String(intentRow.amount_minor))
              : intentRow.amount_currency === 'GBP'
                ? moneyFromMajorDecimal('GBP', String(intentRow.amount_gbp))
                : undefined
          );
        await upsertPaymentRefund(client, {
          intentId: intentRow.id,
          gatewayId: expectedGateway,
          providerRefundRef: event.refund.providerRefundRef,
          status: event.refund.status,
          money: refundMoney,
          rawProviderAmount: event.refund.rawProviderAmount,
          providerAmountUnit: event.refund.providerAmountUnit,
          conversionTrace: event.refund.conversionTrace,
          amount: event.refund.amount,
          currency: event.refund.currency,
          reason: event.refund.reason,
          metadata: {
            provider,
            eventType: event.eventType,
            conversionTrace: event.refund.conversionTrace ?? null,
          },
        });

        if (event.refund.status === 'succeeded' && intentRow.order_id && (await ledgerTablesAvailable(client))) {
          await postCommerceOrderRefundLedgerReversal(
            client,
            intentRow.order_id,
            intentRow.user_id,
            refundMoney?.currency === 'GBP'
              ? Number(moneyToMajorDecimal(refundMoney))
              : Number(intentRow.amount_gbp)
          );
        }

        if (event.refund.status === 'succeeded') {
          refundCompletedUserId = intentRow.user_id;
          refundCompletedOrderId = intentRow.order_id;
          const refundCurrency = refundMoney?.currency ?? (event.refund.currency ?? '').toUpperCase();
          const refundAmount = refundMoney
            ? Number(moneyToMajorDecimal(refundMoney))
            : Number(intentRow.amount_gbp);
          if (refundCurrency === 'GBP') {
            refundCompletedAmountGbp = roundTo(refundAmount, 2);
          } else {
            refundCompletedAmountGbp = roundTo(Number(intentRow.amount_gbp), 2);
          }
        }
      }

      if (event.dispute) {
        const disputeMoney =
          event.dispute.money
          ?? (
            intentRow?.amount_minor !== undefined
            && intentRow.amount_minor !== null
              ? moneyFromMinor(intentRow.amount_currency, String(intentRow.amount_minor))
              : intentRow?.amount_currency === 'GBP'
                ? moneyFromMajorDecimal('GBP', String(intentRow.amount_gbp))
                : undefined
          );
        await upsertPaymentDispute(client, {
          intentId: intentRow?.id,
          gatewayId: expectedGateway,
          providerDisputeRef: event.dispute.providerDisputeRef,
          status: event.dispute.status,
          money: disputeMoney,
          rawProviderAmount: event.dispute.rawProviderAmount,
          providerAmountUnit: event.dispute.providerAmountUnit,
          conversionTrace: event.dispute.conversionTrace,
          amount: event.dispute.amount,
          currency: event.dispute.currency,
          reason: event.dispute.reason,
          metadata: {
            provider,
            eventType: event.eventType,
            conversionTrace: event.dispute.conversionTrace ?? null,
          },
        });

        if (event.dispute.status === 'lost' && intentRow?.order_id && (await ledgerTablesAvailable(client))) {
          await postCommerceOrderRefundLedgerReversal(
            client,
            intentRow.order_id,
            intentRow.user_id,
            disputeMoney?.currency === 'GBP'
              ? Number(moneyToMajorDecimal(disputeMoney))
              : Number(intentRow.amount_gbp)
          );

          await client.query(
            `
            UPDATE orders
            SET
              shipping_metadata = COALESCE(shipping_metadata, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
            WHERE id = $1
          `,
            [
              intentRow.order_id,
              toJsonString({
                paymentDispute: {
                  status: 'lost',
                  reviewRequired: true,
                  provider,
                  providerDisputeRef: event.dispute.providerDisputeRef,
                  eventType: event.eventType,
                  flaggedAt: new Date().toISOString(),
                },
              }),
            ]
          );
        }
      }

      if (event.payoutRequestId && event.payoutStatus) {
        const payoutRow = await client.query<{
          id: string;
          user_id: string;
          amount_currency: string;
          amount_minor: number | string | null;
        }>(
          `SELECT id, user_id, amount_currency, amount_minor
           FROM payout_requests
           WHERE id = $1
           LIMIT 1`,
          [event.payoutRequestId]
        );

        if (payoutRow.rowCount) {
          const canonicalPayout = payoutRow.rows[0];
          if (
            event.money
            && canonicalPayout.amount_minor !== null
            && (
              event.money.currency !== canonicalPayout.amount_currency
              || event.money.minorAmount !== String(canonicalPayout.amount_minor)
            )
          ) {
            throw createApiError(
              'PAYOUT_AMOUNT_MISMATCH',
              'Provider payout amount does not equal the canonical payout request',
              {
                payoutRequestId: canonicalPayout.id,
                expectedCurrency: canonicalPayout.amount_currency,
                expectedMinorAmount: String(canonicalPayout.amount_minor),
                providerCurrency: event.money.currency,
                providerMinorAmount: event.money.minorAmount,
                conversionTrace: event.conversionTrace ?? null,
              }
            );
          }
          const payoutSettled = await settlePayoutRequest(client, {
            userId: payoutRow.rows[0].user_id,
            requestId: payoutRow.rows[0].id,
            targetStatus: event.payoutStatus,
            providerPayoutRef: event.providerIntentRef,
            failureReason: event.payoutStatus === 'failed' ? `Provider event ${event.eventType}` : undefined,
            metadata: {
              provider,
              eventType: event.eventType,
            },
            source: 'provider_webhook',
          });
          settledPayout = payoutSettled.payoutRequest;
          settledPayoutIdempotent = payoutSettled.idempotent;
        }
      }

      await client.query('UPDATE payment_webhook_events SET processed_at = NOW() WHERE id = $1', [
        webhookInsert.rows[0].id,
      ]);

      // Mark the durable inbox row as succeeded — in the same transaction
      // as the ledger effects, so a rollback undoes both.
      if (event.providerEventId) {
        await client.query(
          `UPDATE webhook_events
           SET status = 'succeeded', processed_at = NOW(),
               lease_owner = NULL, lease_expires_at = NULL
           WHERE event_id = $1`,
          [event.providerEventId]
        );
      }

      await client.query('COMMIT');

      if (mintReserveEnqueueOperationId) {
        try {
          await enqueueOnezeMintReserveJob({
            mintOperationId: mintReserveEnqueueOperationId,
            initiatedBy: 'provider_webhook',
            reason: 'webhook_confirmed',
          });
        } catch (queueError) {
          request.log.error(
            {
              err: queueError,
              mintOperationId: mintReserveEnqueueOperationId,
            },
            'Failed to enqueue mint reserve allocation after payment webhook confirmation'
          );
        }
      }

      if (settledCommerceOrderId) {
        try {
          await queueCommercePaymentNotifications({
            orderId: settledCommerceOrderId,
            source: 'provider_webhook',
          });
        } catch (notificationError) {
          request.log.error(
            {
              err: notificationError,
              orderId: settledCommerceOrderId,
            },
            'Failed to queue payment notifications after provider webhook settlement'
          );
        }
      }

      if (settledPayout && settledPayout.status === 'paid' && !settledPayoutIdempotent) {
        try {
          await queuePayoutProcessedNotification({
            payoutRequest: settledPayout,
            source: 'provider_webhook',
          });
        } catch (notificationError) {
          request.log.error(
            {
              err: notificationError,
              payoutRequestId: settledPayout.id,
            },
            'Failed to queue payout notification after provider webhook settlement'
          );
        }
      }

      if (refundCompletedUserId && refundCompletedAmountGbp !== null) {
        try {
          await queueRefundCompletedNotification({
            userId: refundCompletedUserId,
            amountGbp: refundCompletedAmountGbp,
            orderId: refundCompletedOrderId,
            source: 'provider_webhook',
          });
        } catch (notificationError) {
          request.log.error(
            {
              err: notificationError,
              userId: refundCompletedUserId,
              orderId: refundCompletedOrderId,
            },
            'Failed to queue refund notification after provider webhook settlement'
          );
        }
      }

      return {
        ok: true,
        duplicate: false,
        unresolved: !intentRow && !event.payoutRequestId,
        intent: settledIntent,
        mintOperation,
        payoutRequest: settledPayout,
        refundRecorded: Boolean(event.refund),
        disputeRecorded: Boolean(event.dispute),
      };
    } catch (error) {
      await client.query('ROLLBACK');

      // Mark the durable inbox row as 'failed' so the recovery sweep can
      // retry it.  This is outside the rolled-back transaction, so it
      // persists.  The raw body and signature are already stored from the
      // initial insert.
      if (event?.providerEventId) {
        try {
          const backoffSeconds = Math.min(3600, 2 ** 1);
          await db.query(
            `UPDATE webhook_events
             SET status = 'failed',
                 attempts = attempts + 1,
                 last_error = $2,
                 next_retry_at = NOW() + ($3 || ' seconds')::INTERVAL,
                 lease_owner = NULL,
                 lease_expires_at = NULL
             WHERE event_id = $1`,
            [
              event.providerEventId,
              String((error as Error).message ?? 'Unknown error').slice(0, 2000),
              String(backoffSeconds),
            ]
          );
        } catch {
          // Best-effort — the outbox insert below is the secondary path.
        }
      }

      if ((error as Error).message === 'PAYMENT_INTENT_NOT_FOUND') {
        reply.code(404);
        return {
          ok: false,
          error: 'Payment intent not found for webhook event',
        };
      }

      const apiError = getApiError(error);
      if (apiError?.code === 'PAYOUT_INVALID_TRANSITION' || apiError?.code === 'PAYOUT_PENDING_INSUFFICIENT') {
        reply.code(409);
        return {
          ok: false,
          error: apiError.message,
          details: apiError.details,
        };
      }

      request.log.error({ err: error, provider, event }, 'Failed to process provider webhook');

      // ── Dead-letter queue: persist the failed event for retry ─────────
      // The webhook event was already inserted (before the processing error),
      // so we record the failure in the outbox for the retry sweep.
      try {
        const backoffSeconds = Math.min(300, 2 ** 0); // Initial: 1s
        await db.query(
          `
          INSERT INTO webhook_processing_outbox (
            gateway_id, provider_event_id, event_type, intent_id,
            raw_payload, status, attempts, last_error, next_retry_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', 0, $6, NOW() + ($7 || ' seconds')::INTERVAL)
          ON CONFLICT (gateway_id, provider_event_id) DO UPDATE
            SET status = 'pending',
                attempts = webhook_processing_outbox.attempts,
                last_error = EXCLUDED.last_error,
                next_retry_at = NOW() + ($7 || ' seconds')::INTERVAL,
                updated_at = NOW()
        `,
          [
            expectedGateway,
            event.providerEventId,
            event.eventType,
            event.intentId ?? null,
            toJsonString(event.rawPayload ?? {}),
            String((error as Error).message ?? 'Unknown error').slice(0, 2000),
            String(backoffSeconds),
          ]
        );
      } catch (dlqError) {
        request.log.error({ err: dlqError }, 'Failed to insert webhook into dead-letter queue');
      }

      reply.code(500);
      return {
        ok: false,
        error: 'Unable to process provider webhook',
      };
    } finally {
      client.release();
    }
  });
};
