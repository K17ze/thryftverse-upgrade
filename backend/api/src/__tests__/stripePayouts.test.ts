import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import { createStripeConnectPayoutTransfer } from '../lib/stripePayouts.js';

test('Stripe Connect payout transfer uses deterministic provider idempotency', async () => {
  const calls: Array<{
    params: Record<string, unknown>;
    options: Record<string, unknown>;
  }> = [];
  const stripe = {
    transfers: {
      create: async (
        params: Record<string, unknown>,
        options: Record<string, unknown>
      ) => {
        calls.push({ params, options });
        return { id: 'tr_live_123' };
      },
    },
  } as unknown as Pick<Stripe, 'transfers'>;

  const result = await createStripeConnectPayoutTransfer(stripe, {
    requestId: 'payout_123',
    userId: 'user_123',
    destinationAccountId: 'acct_123',
    netAmountGbp: 42.35,
  });

  assert.equal(result.providerPayoutRef, 'tr_live_123');
  assert.equal(result.amountMinor, 4235);
  assert.equal(calls[0]?.params.destination, 'acct_123');
  assert.equal(calls[0]?.options.idempotencyKey, 'payout:payout_123');
});

test('Stripe Connect payout transfer rejects non-positive net amounts', async () => {
  const stripe = {
    transfers: {
      create: async () => ({ id: 'should_not_run' }),
    },
  } as unknown as Pick<Stripe, 'transfers'>;

  await assert.rejects(
    () =>
      createStripeConnectPayoutTransfer(stripe, {
        requestId: 'payout_zero',
        userId: 'user_123',
        destinationAccountId: 'acct_123',
        netAmountGbp: 0,
      }),
    /PAYOUT_PROVIDER_AMOUNT_INVALID/
  );
});
