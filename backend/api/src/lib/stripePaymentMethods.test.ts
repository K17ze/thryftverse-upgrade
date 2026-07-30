import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import {
  createMobileCustomerSession,
  getOrCreateStripeCustomer,
  normalizeStripeCardBrand,
  stripeCardDisplayDetails,
} from './stripePaymentMethods.js';

test('provider card brands and display details are derived from Stripe data', () => {
  assert.equal(normalizeStripeCardBrand('visa'), 'Visa');
  assert.equal(normalizeStripeCardBrand('mastercard'), 'Mastercard');
  assert.equal(normalizeStripeCardBrand('amex'), 'American Express');

  assert.deepEqual(
    stripeCardDisplayDetails({
      brand: 'amex',
      last4: '0005',
      exp_month: 9,
      exp_year: 2031,
    } as Stripe.PaymentMethod.Card),
    {
      brand: 'American Express',
      label: 'American Express •••• 0005',
      details: 'Expires 09/31',
    }
  );
});

test('mobile CustomerSession enables provider-owned saved-method controls', async () => {
  let received: unknown;
  const stripe = {
    customerSessions: {
      create: async (params: unknown) => {
        received = params;
        return { id: 'cs_test', client_secret: 'cuss_test_secret' };
      },
    },
  } as unknown as Stripe;

  const result = await createMobileCustomerSession(stripe, 'cus_test');

  assert.equal(result.client_secret, 'cuss_test_secret');
  assert.deepEqual(received, {
    customer: 'cus_test',
    components: {
      mobile_payment_element: {
        enabled: true,
        features: {
          payment_method_allow_redisplay_filters: ['always', 'limited'],
          payment_method_redisplay: 'enabled',
          payment_method_remove: 'enabled',
          payment_method_save: 'enabled',
        },
      },
    },
  });
});

test('existing customer binding avoids duplicate provider creation', async () => {
  let providerCreateCalls = 0;
  const stripe = {
    customers: {
      create: async () => {
        providerCreateCalls += 1;
        return { id: 'cus_unexpected' };
      },
    },
  } as unknown as Stripe;
  const db = {
    query: async () => ({
      rowCount: 1,
      rows: [{ provider_customer_ref: 'cus_existing', livemode: false }],
    }),
  };

  const result = await getOrCreateStripeCustomer({
    db: db as never,
    stripe,
    userId: 'user_123',
  });

  assert.deepEqual(result, {
    userId: 'user_123',
    customerId: 'cus_existing',
    livemode: false,
  });
  assert.equal(providerCreateCalls, 0);
});

test('new customer creation uses a stable provider idempotency key and server identity', async () => {
  const providerCalls: Array<{ params: unknown; options: unknown }> = [];
  let queryCount = 0;
  const db = {
    query: async (query: string) => {
      queryCount += 1;
      if (query.includes('FROM stripe_payment_customers') && queryCount === 1) {
        return { rowCount: 0, rows: [] };
      }
      if (query.includes('FROM users')) {
        return {
          rowCount: 1,
          rows: [{
            email: 'buyer@example.test',
            display_name: 'Buyer Name',
            username: 'buyer',
          }],
        };
      }
      if (query.includes('INSERT INTO stripe_payment_customers')) {
        return { rowCount: 1, rows: [] };
      }
      return {
        rowCount: 1,
        rows: [{ provider_customer_ref: 'cus_created', livemode: false }],
      };
    },
  };
  const stripe = {
    customers: {
      create: async (params: unknown, options: unknown) => {
        providerCalls.push({ params, options });
        return { id: 'cus_created', livemode: false };
      },
    },
  } as unknown as Stripe;

  const result = await getOrCreateStripeCustomer({
    db: db as never,
    stripe,
    userId: 'user_123',
  });

  assert.equal(result.customerId, 'cus_created');
  assert.deepEqual(providerCalls, [{
    params: {
      email: 'buyer@example.test',
      name: 'Buyer Name',
      metadata: { thryftverse_user_id: 'user_123' },
    },
    options: {
      idempotencyKey: 'thryftverse:stripe-customer:user_123',
    },
  }]);
});
