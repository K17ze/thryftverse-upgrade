import assert from 'node:assert/strict';
import test from 'node:test';

// ─────────────────────────────────────────────────────────────────────────────
// SEP20-FIN-10 — Mollie webhook fail-closed verification
//
// Mollie's webhook contract delivers ONLY the payment `id`; the status is
// never transmitted (docs.mollie.com/reference/webhooks). With an API key
// but no webhook secret, the ONLY authentication channel is server-side
// retrieval of the payment. These tests prove:
//   (a) a forged paid-status payload + failed provider retrieval produces
//       NO verified event and NO state transition (retryable → 5xx);
//   (b) a missing/malformed payment id is rejected non-retryably;
//   (c) a successful retrieval derives status, money and intent linkage
//       EXCLUSIVELY from the provider response — the caller payload is
//       only the trigger;
//   (d) the provider event id is deterministic, so redelivered webhooks
//       dedup on (gateway_id, provider_event_id) → exactly-once effect.
//
// Old behaviour: normalizeMollieEvent initialized status/money/metadata
// from the caller payload and swallowed retrieval errors — every test
// below FAILS against it.
// ─────────────────────────────────────────────────────────────────────────────

process.env.MOLLIE_API_KEY ??= 'test-mollie-api-key';
// No webhook secret → unsigned path under test.
delete process.env.MOLLIE_WEBHOOK_SECRET;
process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test';

const providers = await import('../lib/paymentProviders.js');

type VerifyFn = typeof providers.verifyAndNormalizeWebhook;
const verify: VerifyFn = (provider, rawBody, headers, payload) =>
  providers.verifyAndNormalizeWebhook(provider, rawBody, headers, payload);

test.after(() => {
  providers.__testables.setMolliePaymentRetriever(null);
});

test('forged paid webhook + provider retrieval outage → unverified, retryable, no event', async () => {
  providers.__testables.setMolliePaymentRetriever(async () => {
    throw new Error('connect ECONNREFUSED mollie api');
  });

  const result = await verify(
    'mollie',
    'id=tr_abc123&status=paid',
    {},
    { id: 'tr_abc123', status: 'paid' },
  );

  assert.equal(result.verified, false);
  assert.equal(result.retryable, true);
  assert.equal(result.event, undefined);
  assert.match(result.reason ?? '', /retrieval failed/i);
});

test('forged paid webhook with syntactically invalid payment id → unverified, non-retryable', async () => {
  let retrievalAttempted = false;
  providers.__testables.setMolliePaymentRetriever(async () => {
    retrievalAttempted = true;
    throw new Error('should not be called');
  });

  const result = await verify(
    'mollie',
    'id=forged&status=paid',
    {},
    { id: 'forged', status: 'paid' },
  );

  assert.equal(result.verified, false);
  assert.equal(result.retryable, false);
  assert.equal(result.event, undefined);
  assert.equal(retrievalAttempted, false);
});

test('unsigned webhook with no payment id → unverified, non-retryable', async () => {
  const result = await verify('mollie', 'status=paid', {}, { status: 'paid' });

  assert.equal(result.verified, false);
  assert.equal(result.retryable, false);
  assert.equal(result.event, undefined);
});

test('verified retrieval → status, money and intent linkage come ONLY from the provider', async () => {
  providers.__testables.setMolliePaymentRetriever(async (paymentId) => ({
    id: paymentId,
    status: 'paid',
    metadata: { intentId: 'pi_winner_1' },
    amount: { value: '50.00', currency: 'GBP' },
  }));

  // Caller forges a *failed* status and a different amount — the retrieved
  // resource must win on every field.
  const result = await verify(
    'mollie',
    'id=tr_pay1&status=failed',
    {},
    {
      id: 'tr_pay1',
      status: 'failed',
      amount: { value: '0.01', currency: 'EUR' },
      metadata: { intentId: 'pi_forged' },
    },
  );

  assert.equal(result.verified, true);
  const event = result.event;
  assert.ok(event);
  assert.equal(event.paymentStatus, 'succeeded');
  assert.equal(event.gatewayId, 'mollie_eu');
  assert.equal(event.providerIntentRef, 'tr_pay1');
  assert.equal(event.intentId, 'pi_winner_1');
  assert.equal(event.money?.currency, 'GBP');
  assert.equal(event.money?.minorAmount, '5000');
});

test('retrieved non-paid status does not settle — expired maps to failed', async () => {
  providers.__testables.setMolliePaymentRetriever(async (paymentId) => ({
    id: paymentId,
    status: 'expired',
    metadata: {},
    amount: { value: '50.00', currency: 'GBP' },
  }));

  const result = await verify('mollie', 'id=tr_exp1', {}, { id: 'tr_exp1', status: 'paid' });

  assert.equal(result.verified, true);
  assert.equal(result.event?.paymentStatus, 'failed');
});

test('deterministic providerEventId → duplicate deliveries dedup to exactly one effect', async () => {
  providers.__testables.setMolliePaymentRetriever(async (paymentId) => ({
    id: paymentId,
    status: 'paid',
    metadata: { intentId: 'pi_winner_1' },
    amount: { value: '50.00', currency: 'GBP' },
  }));

  const first = await verify('mollie', 'id=tr_dup1', {}, { id: 'tr_dup1' });
  const second = await verify('mollie', 'id=tr_dup1', {}, { id: 'tr_dup1' });

  assert.equal(first.verified, true);
  assert.equal(second.verified, true);
  // The durable inbox dedups on (gateway_id, provider_event_id): identical
  // event ids mean the second delivery is a duplicate — the settlement
  // path therefore runs exactly once for the verified capture.
  assert.equal(first.event?.providerEventId, second.event?.providerEventId);
  assert.equal(first.event?.providerEventId, 'payment.paid:tr_dup1');
});
