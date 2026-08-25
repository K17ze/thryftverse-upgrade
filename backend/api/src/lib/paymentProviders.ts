import crypto from 'node:crypto';
import Stripe from 'stripe';
import { config } from '../config.js';
import {
  moneyFromProviderAmount,
  type Money,
  type MoneyConversionTrace,
  type ProviderAmountUnit,
} from './money.js';

export type ProviderSlug = 'stripe' | 'razorpay' | 'mollie' | 'flutterwave' | 'tap' | 'wise';

export type MoneyGatewayId =
  | 'mock_fiat_gbp'
  | 'mock_tvusd'
  | 'stripe_americas'
  | 'razorpay_in'
  | 'mollie_eu'
  | 'flutterwave_africa'
  | 'tap_gulf'
  | 'wise_global';

export type ProviderPaymentStatus =
  | 'requires_confirmation'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type ProviderPayoutStatus = 'processing' | 'paid' | 'failed' | 'cancelled';
export type ProviderRefundStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';
export type ProviderDisputeStatus = 'open' | 'warning' | 'needs_response' | 'won' | 'lost' | 'closed';

export interface NormalizedWebhookEvent {
  gatewayId: MoneyGatewayId;
  providerEventId: string;
  eventType: string;
  intentId?: string;
  providerIntentRef?: string;
  paymentStatus?: ProviderPaymentStatus;
  money?: Money;
  rawProviderAmount?: string;
  providerAmountUnit?: ProviderAmountUnit;
  conversionTrace?: MoneyConversionTrace;
  payoutRequestId?: string;
  payoutStatus?: ProviderPayoutStatus;
  refund?: {
    providerRefundRef: string;
    status: ProviderRefundStatus;
    money?: Money;
    rawProviderAmount?: string;
    providerAmountUnit?: ProviderAmountUnit;
    conversionTrace?: MoneyConversionTrace;
    /** @deprecated Read money.minorAmount at canonical boundaries. */
    amount?: number;
    currency?: string;
    reason?: string;
  };
  dispute?: {
    providerDisputeRef: string;
    status: ProviderDisputeStatus;
    money?: Money;
    rawProviderAmount?: string;
    providerAmountUnit?: ProviderAmountUnit;
    conversionTrace?: MoneyConversionTrace;
    /** @deprecated Read money.minorAmount at canonical boundaries. */
    amount?: number;
    currency?: string;
    reason?: string;
  };
  metadata: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
}

export interface WebhookVerificationResult {
  verified: boolean;
  reason?: string;
  event?: NormalizedWebhookEvent;
}

function providerToGatewayId(provider: ProviderSlug): MoneyGatewayId {
  switch (provider) {
    case 'stripe':
      return 'stripe_americas';
    case 'razorpay':
      return 'razorpay_in';
    case 'mollie':
      return 'mollie_eu';
    case 'flutterwave':
      return 'flutterwave_africa';
    case 'tap':
      return 'tap_gulf';
    case 'wise':
      return 'wise_global';
    default:
      return 'mock_fiat_gbp';
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function headerValue(headers: Record<string, unknown>, key: string): string | null {
  const lower = key.toLowerCase();
  const entries = Object.entries(headers);

  for (const [name, value] of entries) {
    if (name.toLowerCase() !== lower) {
      continue;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }
  }

  return null;
}

function hexDigest(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function derivedEventId(prefix: string, eventType: string, rawBody: string): string {
  const hash = crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex').slice(0, 32);
  return `${prefix}:${eventType}:${hash}`;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function asProviderAmount(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function normalizeEventMoney(
  provider: ProviderSlug,
  currency: string | undefined,
  rawAmount: string | number | undefined
): {
  money?: Money;
  rawProviderAmount?: string;
  providerAmountUnit?: ProviderAmountUnit;
  conversionTrace?: MoneyConversionTrace;
} {
  if (!currency || rawAmount === undefined) {
    return {};
  }
  const normalized = moneyFromProviderAmount(provider, currency, rawAmount);
  return {
    money: normalized.money,
    rawProviderAmount: normalized.value,
    providerAmountUnit: normalized.unit,
    conversionTrace: normalized.trace,
  };
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

function statusFromStripeEvent(eventType: string): ProviderPaymentStatus | undefined {
  if (eventType === 'payment_intent.succeeded') {
    return 'succeeded';
  }

  if (eventType === 'payment_intent.processing') {
    return 'processing';
  }

  if (eventType === 'payment_intent.payment_failed') {
    return 'failed';
  }

  if (eventType === 'payment_intent.canceled') {
    return 'cancelled';
  }

  if (eventType === 'payment_intent.requires_action' || eventType === 'payment_intent.requires_confirmation') {
    return 'requires_confirmation';
  }

  return undefined;
}

function statusFromRazorpayEvent(eventType: string): ProviderPaymentStatus | undefined {
  if (eventType === 'payment.captured') {
    return 'succeeded';
  }

  if (eventType === 'payment.failed') {
    return 'failed';
  }

  if (eventType === 'payment.authorized' || eventType === 'payment.pending') {
    return 'processing';
  }

  return undefined;
}

function statusFromMollieState(status: string | undefined): ProviderPaymentStatus | undefined {
  if (!status) {
    return undefined;
  }

  if (status === 'paid') {
    return 'succeeded';
  }

  if (status === 'failed' || status === 'expired') {
    return 'failed';
  }

  if (status === 'canceled') {
    return 'cancelled';
  }

  if (status === 'open' || status === 'pending') {
    return 'processing';
  }

  return undefined;
}

function statusFromFlutterwaveState(status: string | undefined): ProviderPaymentStatus | undefined {
  if (!status) {
    return undefined;
  }

  const normalized = status.toLowerCase();

  if (normalized === 'successful' || normalized === 'success') {
    return 'succeeded';
  }

  if (normalized === 'failed' || normalized === 'error') {
    return 'failed';
  }

  if (normalized === 'cancelled' || normalized === 'canceled') {
    return 'cancelled';
  }

  if (normalized === 'pending') {
    return 'processing';
  }

  return undefined;
}

function statusFromTapState(status: string | undefined): ProviderPaymentStatus | undefined {
  if (!status) {
    return undefined;
  }

  const normalized = status.toLowerCase();

  if (normalized === 'captured' || normalized === 'paid') {
    return 'succeeded';
  }

  if (normalized === 'declined' || normalized === 'failed') {
    return 'failed';
  }

  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'void') {
    return 'cancelled';
  }

  if (normalized === 'initiated' || normalized === 'pending') {
    return 'processing';
  }

  return undefined;
}

function statusFromWisePayoutState(
  status: string | undefined,
  eventType: string
): ProviderPayoutStatus | undefined {
  const normalizedStatus = status?.toLowerCase();
  const normalizedEventType = eventType.toLowerCase();

  if (
    normalizedStatus === 'completed'
    || normalizedStatus === 'outgoing_payment_sent'
    || normalizedStatus === 'funds_converted'
    || normalizedStatus === 'paid'
    || normalizedEventType.includes('completed')
    || normalizedEventType.includes('outgoing_payment_sent')
  ) {
    return 'paid';
  }

  if (
    normalizedStatus === 'cancelled'
    || normalizedStatus === 'canceled'
    || normalizedEventType.includes('cancel')
  ) {
    return 'cancelled';
  }

  if (
    normalizedStatus === 'failed'
    || normalizedStatus === 'rejected'
    || normalizedStatus === 'bounced'
    || normalizedStatus === 'error'
    || normalizedEventType.includes('fail')
    || normalizedEventType.includes('reject')
  ) {
    return 'failed';
  }

  if (
    normalizedStatus === 'processing'
    || normalizedStatus === 'pending'
    || normalizedStatus === 'queued'
    || normalizedStatus === 'created'
    || normalizedStatus === 'incoming_payment_waiting'
    || normalizedEventType.includes('processing')
    || normalizedEventType.includes('pending')
  ) {
    return 'processing';
  }

  return undefined;
}

function normalizeStripeEvent(event: Stripe.Event, rawBody: string): NormalizedWebhookEvent {
  const dataObject = asRecord(event.data.object);
  const metadata = asRecord(dataObject.metadata);
  const maybePaymentIntent = asString(dataObject.payment_intent) ?? asString(dataObject.id);
  const intentId =
    asString(metadata.intentId)
    ?? asString(metadata.intent_id)
    ?? asString(metadata.paymentIntentId)
    ?? undefined;

  const eventType: string = event.type;
  const providerEventId = asString(event.id) ?? derivedEventId('stripe', eventType, rawBody);
  const paymentCurrency = asString(dataObject.currency)?.toUpperCase();
  const paymentRawAmount = asProviderAmount(dataObject.amount);

  const normalized: NormalizedWebhookEvent = {
    gatewayId: 'stripe_americas',
    providerEventId,
    eventType,
    providerIntentRef: maybePaymentIntent,
    intentId,
    paymentStatus: statusFromStripeEvent(eventType),
    ...normalizeEventMoney('stripe', paymentCurrency, paymentRawAmount),
    metadata,
    rawPayload: asRecord(event as unknown),
  };

  if (eventType.startsWith('refund.') || eventType === 'charge.refunded') {
    const refundRef = asString(dataObject.id) ?? asString(dataObject.latest_refund) ?? providerEventId;
    const currency = asString(dataObject.currency)?.toUpperCase();
    const rawAmount = asProviderAmount(
      eventType === 'charge.refunded' ? dataObject.amount_refunded : dataObject.amount
    );
    normalized.refund = {
      providerRefundRef: refundRef,
      status: eventType === 'refund.failed' ? 'failed' : eventType === 'refund.canceled' ? 'cancelled' : 'succeeded',
      amount: asNumber(
        eventType === 'charge.refunded' ? dataObject.amount_refunded : dataObject.amount
      ),
      currency,
      ...normalizeEventMoney('stripe', currency, rawAmount),
      reason: asString(dataObject.reason),
    };
  }

  if (eventType.startsWith('charge.dispute.')) {
    const disputeStatus: ProviderDisputeStatus =
      eventType === 'charge.dispute.closed'
        ? 'closed'
        : eventType === 'charge.dispute.funds_withdrawn'
          ? 'lost'
          : eventType === 'charge.dispute.funds_reinstated'
            ? 'won'
            : 'open';

    const currency = asString(dataObject.currency)?.toUpperCase();
    const rawAmount = asProviderAmount(dataObject.amount);
    normalized.dispute = {
      providerDisputeRef: asString(dataObject.id) ?? providerEventId,
      status: disputeStatus,
      amount: asNumber(dataObject.amount),
      currency,
      ...normalizeEventMoney('stripe', currency, rawAmount),
      reason: asString(dataObject.reason),
    };
  }

  return normalized;
}

function normalizeRazorpayEvent(payload: Record<string, unknown>, rawBody: string): NormalizedWebhookEvent {
  const eventType = asString(payload.event) ?? 'unknown';
  const bodyPayload = asRecord(payload.payload);
  const paymentEntity = asRecord(asRecord(bodyPayload.payment).entity);
  const refundEntity = asRecord(asRecord(bodyPayload.refund).entity);
  const payoutEntity = asRecord(asRecord(bodyPayload.payout).entity);
  const activeEntity =
    Object.keys(paymentEntity).length > 0
      ? paymentEntity
      : Object.keys(refundEntity).length > 0
        ? refundEntity
        : payoutEntity;

  const notes = asRecord(activeEntity.notes);
  const providerEntityId = asString(activeEntity.id);
  const paymentCurrency = asString(activeEntity.currency)?.toUpperCase();
  const paymentRawAmount = asProviderAmount(activeEntity.amount);

  const normalized: NormalizedWebhookEvent = {
    gatewayId: 'razorpay_in',
    providerEventId: providerEntityId ? `${eventType}:${providerEntityId}` : derivedEventId('razorpay', eventType, rawBody),
    eventType,
    providerIntentRef: asString(activeEntity.order_id) ?? providerEntityId,
    intentId: asString(notes.intentId) ?? asString(notes.intent_id),
    paymentStatus: statusFromRazorpayEvent(eventType),
    ...normalizeEventMoney('razorpay', paymentCurrency, paymentRawAmount),
    metadata: notes,
    rawPayload: payload,
  };

  if (eventType.startsWith('refund.')) {
    const currency = asString(activeEntity.currency)?.toUpperCase();
    const rawAmount = asProviderAmount(activeEntity.amount);
    normalized.refund = {
      providerRefundRef: providerEntityId ?? normalized.providerEventId,
      status: eventType === 'refund.failed' ? 'failed' : 'succeeded',
      amount: asNumber(activeEntity.amount),
      currency,
      ...normalizeEventMoney('razorpay', currency, rawAmount),
      reason: asString(activeEntity.notes),
    };
  }

  if (eventType.startsWith('dispute.')) {
    const currency = asString(activeEntity.currency)?.toUpperCase();
    const rawAmount = asProviderAmount(activeEntity.amount);
    normalized.dispute = {
      providerDisputeRef: providerEntityId ?? normalized.providerEventId,
      status: eventType === 'dispute.won' ? 'won' : eventType === 'dispute.lost' ? 'lost' : 'open',
      amount: asNumber(activeEntity.amount),
      currency,
      ...normalizeEventMoney('razorpay', currency, rawAmount),
      reason: asString(activeEntity.reason),
    };
  }

  if (eventType.startsWith('payout.')) {
    normalized.payoutRequestId = asString(notes.payoutRequestId) ?? asString(notes.payout_request_id);
    normalized.payoutStatus =
      eventType === 'payout.processed'
        ? 'paid'
        : eventType === 'payout.failed'
          ? 'failed'
          : eventType === 'payout.reversed'
            ? 'cancelled'
            : 'processing';
  }

  return normalized;
}

async function normalizeMollieEvent(
  payload: Record<string, unknown>,
  rawBody: string
): Promise<NormalizedWebhookEvent> {
  const paymentRef = asString(payload.id);
  let eventType = asString(payload.event) ?? 'payment.updated';
  let providerStatus = asString(payload.status);
  let metadata = asRecord(payload.metadata);
  let amount: string | number | undefined = asProviderAmount(asRecord(payload.amount).value);
  let currency: string | undefined = asString(asRecord(payload.amount).currency);

  if (paymentRef && config.mollieApiKey) {
    try {
      const { createMollieClient } = await import('@mollie/api-client');
      const mollie = createMollieClient({ apiKey: config.mollieApiKey });
      const payment = await mollie.payments.get(paymentRef);
      providerStatus = asString((payment as unknown as { status?: unknown }).status) ?? providerStatus;
      metadata = asRecord((payment as unknown as { metadata?: unknown }).metadata) || metadata;
      amount = asProviderAmount((payment as unknown as { amount?: { value?: unknown } }).amount?.value);
      currency = asString((payment as unknown as { amount?: { currency?: unknown } }).amount?.currency);
      eventType = `payment.${providerStatus ?? 'updated'}`;
    } catch {
      // Keep webhook processing resilient; status will be resolved from payload when API lookup is unavailable.
    }
  }

  return {
    gatewayId: 'mollie_eu',
    providerEventId: paymentRef ? `${eventType}:${paymentRef}` : derivedEventId('mollie', eventType, rawBody),
    eventType,
    providerIntentRef: paymentRef,
    intentId: asString(metadata.intentId) ?? asString(metadata.intent_id),
    paymentStatus: statusFromMollieState(providerStatus),
    ...normalizeEventMoney('mollie', currency?.toUpperCase(), amount),
    metadata,
    rawPayload: payload,
    ...(eventType.startsWith('refund.')
      ? {
          refund: {
            providerRefundRef: paymentRef ?? derivedEventId('mollie-refund', eventType, rawBody),
            status: providerStatus === 'failed' ? 'failed' : providerStatus === 'canceled' ? 'cancelled' : 'succeeded',
            amount: asNumber(amount),
            currency: currency?.toUpperCase(),
            ...normalizeEventMoney('mollie', currency?.toUpperCase(), amount),
            reason: asString(payload.reason),
          },
        }
      : {}),
  };
}

function normalizeFlutterwaveEvent(payload: Record<string, unknown>, rawBody: string): NormalizedWebhookEvent {
  const eventType = asString(payload.event) ?? 'unknown';
  const data = asRecord(payload.data);
  const metadata = asRecord(data.meta);
  const txRef = asString(data.tx_ref) ?? asString(data.flw_ref) ?? asString(data.id);
  const paymentCurrency = asString(data.currency)?.toUpperCase();
  const paymentRawAmount = asProviderAmount(data.amount);

  const normalized: NormalizedWebhookEvent = {
    gatewayId: 'flutterwave_africa',
    providerEventId: txRef ? `${eventType}:${txRef}` : derivedEventId('flutterwave', eventType, rawBody),
    eventType,
    providerIntentRef: txRef,
    intentId: asString(metadata.intentId) ?? asString(metadata.intent_id),
    paymentStatus: statusFromFlutterwaveState(asString(data.status)),
    ...normalizeEventMoney('flutterwave', paymentCurrency, paymentRawAmount),
    metadata,
    rawPayload: payload,
  };

  if (eventType.toLowerCase().includes('refund')) {
    const currency = asString(data.currency)?.toUpperCase();
    const rawAmount = asProviderAmount(data.amount);
    normalized.refund = {
      providerRefundRef: asString(data.id) ?? normalized.providerEventId,
      status: asString(data.status)?.toLowerCase() === 'failed' ? 'failed' : 'succeeded',
      amount: asNumber(data.amount),
      currency,
      ...normalizeEventMoney('flutterwave', currency, rawAmount),
      reason: asString(data.reason),
    };
  }

  if (eventType.toLowerCase().includes('dispute')) {
    const currency = asString(data.currency)?.toUpperCase();
    const rawAmount = asProviderAmount(data.amount);
    normalized.dispute = {
      providerDisputeRef: asString(data.id) ?? normalized.providerEventId,
      status: asString(data.status)?.toLowerCase() === 'lost' ? 'lost' : 'open',
      amount: asNumber(data.amount),
      currency,
      ...normalizeEventMoney('flutterwave', currency, rawAmount),
      reason: asString(data.reason),
    };
  }

  return normalized;
}

function normalizeTapEvent(payload: Record<string, unknown>, rawBody: string): NormalizedWebhookEvent {
  const eventType = asString(payload.event_type) ?? asString(payload.status) ?? 'unknown';
  const data = asRecord(payload.data);
  const metadata = asRecord(payload.metadata);
  const providerIntentRef =
    asString(payload.id)
    ?? asString(asRecord(payload.reference).payment)
    ?? asString(data.id)
    ?? undefined;
  const paymentCurrency = asString(asRecord(payload.amount).currency)?.toUpperCase()
    ?? asString(payload.currency)?.toUpperCase();
  const paymentRawAmount = asProviderAmount(asRecord(payload.amount).value)
    ?? asProviderAmount(payload.amount);

  const normalized: NormalizedWebhookEvent = {
    gatewayId: 'tap_gulf',
    providerEventId: providerIntentRef
      ? `${eventType}:${providerIntentRef}`
      : derivedEventId('tap', eventType, rawBody),
    eventType,
    providerIntentRef,
    intentId: asString(metadata.intentId) ?? asString(metadata.intent_id),
    paymentStatus: statusFromTapState(asString(payload.status)),
    ...normalizeEventMoney('tap', paymentCurrency, paymentRawAmount),
    metadata,
    rawPayload: payload,
  };

  if (eventType.toLowerCase().includes('refund')) {
    const currency = asString(asRecord(payload.amount).currency)?.toUpperCase();
    const rawAmount = asProviderAmount(asRecord(payload.amount).value);
    normalized.refund = {
      providerRefundRef: providerIntentRef ?? normalized.providerEventId,
      status: asString(payload.status)?.toLowerCase() === 'failed' ? 'failed' : 'succeeded',
      amount: asNumber(asRecord(payload.amount).value),
      currency,
      ...normalizeEventMoney('tap', currency, rawAmount),
      reason: asString(payload.description),
    };
  }

  if (eventType.toLowerCase().includes('dispute')) {
    const currency = asString(asRecord(payload.amount).currency)?.toUpperCase();
    const rawAmount = asProviderAmount(asRecord(payload.amount).value);
    normalized.dispute = {
      providerDisputeRef: providerIntentRef ?? normalized.providerEventId,
      status: asString(payload.status)?.toLowerCase() === 'closed' ? 'closed' : 'open',
      amount: asNumber(asRecord(payload.amount).value),
      currency,
      ...normalizeEventMoney('tap', currency, rawAmount),
      reason: asString(payload.description),
    };
  }

  return normalized;
}

function normalizeWiseEvent(payload: Record<string, unknown>, rawBody: string): NormalizedWebhookEvent {
  const eventType = asString(payload.event_type) ?? asString(payload.type) ?? 'unknown';
  const data = asRecord(payload.data);
  const resource = asRecord(data.resource);
  const metadata = {
    ...asRecord(data.metadata),
    ...asRecord(resource.metadata),
  };

  const providerPayoutRef =
    asString(resource.id)
    ?? asString(data.resource_id)
    ?? asString(data.transfer_id)
    ?? asString(data.id)
    ?? undefined;

  const payoutRequestId =
    asString(metadata.payoutRequestId)
    ?? asString(metadata.payout_request_id)
    ?? asString(data.payoutRequestId)
    ?? asString(data.payout_request_id)
    ?? undefined;

  const state =
    asString(resource.status)
    ?? asString(asRecord(data.current_state).status)
    ?? asString(data.status)
    ?? undefined;
  const payoutCurrency =
    asString(resource.sourceCurrency)
    ?? asString(resource.currency)
    ?? asString(data.sourceCurrency)
    ?? asString(data.currency);
  const payoutRawAmount =
    asProviderAmount(resource.sourceAmount)
    ?? asProviderAmount(resource.amount)
    ?? asProviderAmount(data.sourceAmount)
    ?? asProviderAmount(data.amount);

  const providerEventId =
    asString(payload.id)
    ?? asString(data.id)
    ?? (providerPayoutRef ? `${eventType}:${providerPayoutRef}` : derivedEventId('wise', eventType, rawBody));

  return {
    gatewayId: 'wise_global',
    providerEventId,
    eventType,
    providerIntentRef: providerPayoutRef,
    payoutRequestId,
    payoutStatus: statusFromWisePayoutState(state, eventType),
    ...normalizeEventMoney('wise', payoutCurrency?.toUpperCase(), payoutRawAmount),
    metadata,
    rawPayload: payload,
  };
}

function verifyHmacSignature(
  headers: Record<string, unknown>,
  headerName: string,
  secret: string | undefined,
  rawBody: string,
  stripPrefix = false
): boolean {
  if (!secret) {
    return false;
  }

  const provided = headerValue(headers, headerName);
  if (!provided) {
    return false;
  }

  const normalized = stripPrefix ? provided.replace(/^sha256=/i, '') : provided;
  const expected = hexDigest(secret, rawBody);
  return timingSafeEqualHex(expected, normalized);
}

function verifyStripeSignature(headers: Record<string, unknown>, rawBody: string): Stripe.Event | null {
  if (!config.stripeWebhookSecret || !config.stripeSecretKey) {
    return null;
  }

  const signature = headerValue(headers, 'stripe-signature');
  if (!signature) {
    return null;
  }

  const stripe = new Stripe(config.stripeSecretKey, {
    apiVersion: '2024-06-20',
  });

  try {
    return stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
  } catch {
    return null;
  }
}

function verifyWiseSignature(headers: Record<string, unknown>, rawBody: string): boolean {
  const signatureHeader =
    headerValue(headers, 'x-wise-signature')
    ?? headerValue(headers, 'x-signature');

  if (signatureHeader && config.wiseWebhookSecret) {
    const expected = hexDigest(config.wiseWebhookSecret, rawBody);
    const normalized = signatureHeader.replace(/^sha256=/i, '');
    return timingSafeEqualHex(expected, normalized);
  }

  if (!config.wiseApiKey) {
    return false;
  }

  const bearer = headerValue(headers, 'authorization');
  const bearerToken =
    typeof bearer === 'string' && bearer.toLowerCase().startsWith('bearer ')
      ? bearer.slice(7).trim()
      : null;
  const apiToken = bearerToken ?? headerValue(headers, 'x-api-key');

  if (!apiToken) {
    return false;
  }

  return timingSafeEqualString(apiToken, config.wiseApiKey);
}

export async function verifyAndNormalizeWebhook(
  provider: ProviderSlug,
  rawBody: string,
  headers: Record<string, unknown>,
  parsedBody: unknown
): Promise<WebhookVerificationResult> {
  const payload = asRecord(parsedBody);

  if (provider === 'stripe') {
    const stripeEvent = verifyStripeSignature(headers, rawBody);
    if (!stripeEvent) {
      return {
        verified: false,
        reason: 'Invalid Stripe webhook signature',
      };
    }

    return {
      verified: true,
      event: normalizeStripeEvent(stripeEvent, rawBody),
    };
  }

  if (provider === 'razorpay') {
    const ok = verifyHmacSignature(
      headers,
      'x-razorpay-signature',
      config.razorpayWebhookSecret ?? config.razorpayKeySecret,
      rawBody
    );

    if (!ok) {
      return {
        verified: false,
        reason: 'Invalid Razorpay webhook signature',
      };
    }

    return {
      verified: true,
      event: normalizeRazorpayEvent(payload, rawBody),
    };
  }

  if (provider === 'mollie') {
    if (config.mollieWebhookSecret) {
      const ok = verifyHmacSignature(headers, 'x-mollie-signature', config.mollieWebhookSecret, rawBody);
      if (!ok) {
        return {
          verified: false,
          reason: 'Invalid Mollie webhook signature',
        };
      }
    }

    return {
      verified: true,
      event: await normalizeMollieEvent(payload, rawBody),
    };
  }

  if (provider === 'flutterwave') {
    const provided = headerValue(headers, 'verif-hash');
    const expected = config.flutterwaveWebhookSecret ?? config.flutterwaveSecretKey;

    if (!provided || !expected || provided !== expected) {
      return {
        verified: false,
        reason: 'Invalid Flutterwave webhook signature',
      };
    }

    return {
      verified: true,
      event: normalizeFlutterwaveEvent(payload, rawBody),
    };
  }

  if (provider === 'tap') {
    const signature =
      headerValue(headers, 'x-tap-signature')
      ?? headerValue(headers, 'tap-signature')
      ?? headerValue(headers, 'x-signature');

    if (!signature || !(config.tapWebhookSecret ?? config.tapSecretKey)) {
      return {
        verified: false,
        reason: 'Missing Tap webhook signature configuration',
      };
    }

    const expected = hexDigest(config.tapWebhookSecret ?? config.tapSecretKey ?? '', rawBody);
    const normalized = signature.replace(/^sha256=/i, '');

    if (!timingSafeEqualHex(expected, normalized)) {
      return {
        verified: false,
        reason: 'Invalid Tap webhook signature',
      };
    }

    return {
      verified: true,
      event: normalizeTapEvent(payload, rawBody),
    };
  }

  if (provider === 'wise') {
    const ok = verifyWiseSignature(headers, rawBody);
    if (!ok) {
      return {
        verified: false,
        reason: 'Invalid Wise webhook signature',
      };
    }

    return {
      verified: true,
      event: normalizeWiseEvent(payload, rawBody),
    };
  }

  return {
    verified: false,
    reason: `Unsupported provider '${provider}'`,
  };
}

/**
 * Normalize a webhook payload WITHOUT signature verification.
 *
 * This is used by the webhook retry sweep, which re-processes events that
 * were already signature-verified at receipt time.  The durable inbox row's
 * existence proves the event was verified when first received — re-verifying
 * with a re-serialized payload and no original signature header would always
 * fail (Stripe generates a new signature on each delivery).
 *
 * NEVER use this for initial webhook receipt — always use
 * `verifyAndNormalizeWebhook` for that.
 */
export async function normalizeWebhookEvent(
  provider: ProviderSlug,
  parsedBody: unknown
): Promise<NormalizedWebhookEvent | null> {
  const payload = asRecord(parsedBody);
  const rawBody = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody ?? {});

  if (provider === 'stripe') {
    // The stored payload is the parsed Stripe Event object.  Cast it back
    // to Stripe.Event for the normalizer — the structure is preserved.
    return normalizeStripeEvent(payload as unknown as Stripe.Event, rawBody);
  }
  if (provider === 'razorpay') {
    return normalizeRazorpayEvent(payload, rawBody);
  }
  if (provider === 'mollie') {
    return await normalizeMollieEvent(payload, rawBody);
  }
  if (provider === 'flutterwave') {
    return normalizeFlutterwaveEvent(payload, rawBody);
  }
  if (provider === 'tap') {
    return normalizeTapEvent(payload, rawBody);
  }
  if (provider === 'wise') {
    return normalizeWiseEvent(payload, rawBody);
  }
  return null;
}

export function resolveProviderFromPathSegment(providerSegment: string): ProviderSlug | null {
  const normalized = providerSegment.trim().toLowerCase();
  if (normalized === 'stripe') {
    return 'stripe';
  }

  if (normalized === 'razorpay') {
    return 'razorpay';
  }

  if (normalized === 'mollie') {
    return 'mollie';
  }

  if (normalized === 'flutterwave') {
    return 'flutterwave';
  }

  if (normalized === 'tap') {
    return 'tap';
  }

  if (normalized === 'wise') {
    return 'wise';
  }

  return null;
}

export function expectedGatewayIdForProvider(provider: ProviderSlug): MoneyGatewayId {
  return providerToGatewayId(provider);
}
