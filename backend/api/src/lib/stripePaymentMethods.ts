import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import Stripe from 'stripe';

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export interface StripeCustomerBinding {
  userId: string;
  customerId: string;
  livemode: boolean;
}

export interface ProviderPaymentMethodProjection {
  id: number;
  userId: string;
  provider: 'stripe';
  providerCustomerId: string;
  providerPaymentMethodId: string;
  type: 'card';
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  label: string;
  details: string;
  isDefault: boolean;
  status: 'active';
  redisplayConsent: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentMethodProjectionRow {
  id: number;
  user_id: string;
  provider: string;
  provider_customer_ref: string;
  provider_payment_method_ref: string;
  method_type: 'card';
  label: string;
  details: string;
  brand: string;
  last4: string;
  expiry_month: number;
  expiry_year: number;
  is_default: boolean;
  status: 'active';
  redisplay_consent: string | null;
  created_at: string;
  updated_at: string;
}

export function normalizeStripeCardBrand(brand: string | null | undefined): string {
  const normalized = brand?.trim().toLowerCase();
  if (!normalized) return 'Card';
  if (normalized === 'amex') return 'American Express';
  if (normalized === 'mastercard') return 'Mastercard';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function stripeCardDisplayDetails(card: Stripe.PaymentMethod.Card): {
  label: string;
  details: string;
  brand: string;
} {
  const brand = normalizeStripeCardBrand(card.brand);
  return {
    brand,
    label: `${brand} •••• ${card.last4}`,
    details: `Expires ${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}`,
  };
}

function hashBillingCountry(country: string | null | undefined, hmacSecret: string): string | null {
  const normalized = country?.trim().toUpperCase();
  if (!normalized) return null;
  return crypto.createHmac('sha256', hmacSecret).update(normalized).digest('hex');
}

function projectionFromRow(row: PaymentMethodProjectionRow): ProviderPaymentMethodProjection {
  return {
    id: Number(row.id),
    userId: row.user_id,
    provider: 'stripe',
    providerCustomerId: row.provider_customer_ref,
    providerPaymentMethodId: row.provider_payment_method_ref,
    type: 'card',
    brand: row.brand,
    last4: row.last4,
    expiryMonth: Number(row.expiry_month),
    expiryYear: Number(row.expiry_year),
    label: row.label,
    details: row.details,
    isDefault: row.is_default,
    status: 'active',
    redisplayConsent: row.redisplay_consent ?? 'unspecified',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOrCreateStripeCustomer(input: {
  db: Queryable;
  stripe: Stripe;
  userId: string;
}): Promise<StripeCustomerBinding> {
  const existing = await input.db.query<{
    provider_customer_ref: string;
    livemode: boolean;
  }>(
    `SELECT provider_customer_ref, livemode
     FROM stripe_payment_customers
     WHERE user_id = $1
     LIMIT 1`,
    [input.userId]
  );

  if (existing.rowCount) {
    return {
      userId: input.userId,
      customerId: existing.rows[0].provider_customer_ref,
      livemode: existing.rows[0].livemode,
    };
  }

  const userResult = await input.db.query<{
    email: string | null;
    display_name: string | null;
    username: string;
  }>(
    `SELECT email, display_name, username
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [input.userId]
  );
  const user = userResult.rows[0];
  if (!user) {
    throw new Error('STRIPE_CUSTOMER_USER_NOT_FOUND');
  }

  const customer = await input.stripe.customers.create(
    {
      email: user.email ?? undefined,
      name: user.display_name ?? user.username,
      metadata: {
        thryftverse_user_id: input.userId,
      },
    },
    {
      idempotencyKey: `thryftverse:stripe-customer:${input.userId}`,
    }
  );

  await input.db.query(
    `INSERT INTO stripe_payment_customers (
       user_id, provider_customer_ref, livemode
     )
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO NOTHING`,
    [input.userId, customer.id, customer.livemode]
  );

  const binding = await input.db.query<{
    provider_customer_ref: string;
    livemode: boolean;
  }>(
    `SELECT provider_customer_ref, livemode
     FROM stripe_payment_customers
     WHERE user_id = $1
     LIMIT 1`,
    [input.userId]
  );
  if (!binding.rowCount) {
    throw new Error('STRIPE_CUSTOMER_BINDING_FAILED');
  }

  return {
    userId: input.userId,
    customerId: binding.rows[0].provider_customer_ref,
    livemode: binding.rows[0].livemode,
  };
}

export async function createMobileCustomerSession(
  stripe: Stripe,
  customerId: string
): Promise<Stripe.CustomerSession> {
  return stripe.customerSessions.create({
    customer: customerId,
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
}

export async function syncStripePaymentMethodProjections(input: {
  db: Queryable;
  stripe: Stripe;
  userId: string;
  customerId: string;
  hmacSecret: string;
}): Promise<ProviderPaymentMethodProjection[]> {
  const [customer, methods] = await Promise.all([
    input.stripe.customers.retrieve(input.customerId),
    input.stripe.paymentMethods.list({
      customer: input.customerId,
      type: 'card',
      limit: 100,
    }),
  ]);

  if (customer.deleted) {
    throw new Error('STRIPE_CUSTOMER_DELETED');
  }

  let defaultPaymentMethodId =
    typeof customer.invoice_settings.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings.default_payment_method?.id ?? null;

  if (!defaultPaymentMethodId && methods.data.length > 0) {
    defaultPaymentMethodId = methods.data[0].id;
    await input.stripe.customers.update(input.customerId, {
      invoice_settings: {
        default_payment_method: defaultPaymentMethodId,
      },
    });
  }

  const providerIds: string[] = [];
  for (const method of methods.data) {
    if (method.customer !== input.customerId || method.type !== 'card' || !method.card) {
      continue;
    }

    providerIds.push(method.id);
    const display = stripeCardDisplayDetails(method.card);

    // Detect wallet type (Apple Pay / Google Pay) from the card's wallet field.
    // Stripe attaches card.wallet.type when a card was tokenized via a wallet.
    const walletType = method.card.wallet?.type;
    const methodType: 'card' | 'apple_pay' | 'google_pay' =
      walletType === 'apple_pay' ? 'apple_pay'
      : walletType === 'google_pay' ? 'google_pay'
      : 'card';

    await input.db.query(
      `INSERT INTO user_payment_methods (
         user_id,
         method_type,
         label,
         details,
         is_default,
         provider,
         provider_customer_ref,
         provider_payment_method_ref,
         status,
         brand,
         last4,
         expiry_month,
         expiry_year,
         billing_country_hash,
         redisplay_consent,
         provider_created_at,
         detached_at,
         wallet_type
       )
       VALUES (
         $1, $14, $2, $3, $4, 'stripe', $5, $6, 'active',
         $7, $8, $9, $10, $11, $12, TO_TIMESTAMP($13), NULL, $15
       )
       ON CONFLICT (provider, provider_payment_method_ref)
         WHERE provider_payment_method_ref IS NOT NULL
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         label = EXCLUDED.label,
         details = EXCLUDED.details,
         is_default = EXCLUDED.is_default,
         provider_customer_ref = EXCLUDED.provider_customer_ref,
         status = 'active',
         brand = EXCLUDED.brand,
         last4 = EXCLUDED.last4,
         expiry_month = EXCLUDED.expiry_month,
         expiry_year = EXCLUDED.expiry_year,
         billing_country_hash = EXCLUDED.billing_country_hash,
         redisplay_consent = EXCLUDED.redisplay_consent,
         provider_created_at = EXCLUDED.provider_created_at,
         detached_at = NULL,
         wallet_type = EXCLUDED.wallet_type,
         updated_at = NOW()`,
      [
        input.userId,
        display.label,
        display.details,
        method.id === defaultPaymentMethodId,
        input.customerId,
        method.id,
        display.brand,
        method.card.last4,
        method.card.exp_month,
        method.card.exp_year,
        hashBillingCountry(method.billing_details.address?.country, input.hmacSecret),
        method.allow_redisplay ?? 'unspecified',
        method.created,
        methodType,
        walletType ?? null,
      ]
    );
  }

  if (providerIds.length === 0) {
    await input.db.query(
      `UPDATE user_payment_methods
       SET status = 'detached', is_default = FALSE, detached_at = COALESCE(detached_at, NOW()), updated_at = NOW()
       WHERE user_id = $1
         AND provider = 'stripe'
         AND provider_customer_ref = $2
         AND status = 'active'`,
      [input.userId, input.customerId]
    );
  } else {
    await input.db.query(
      `UPDATE user_payment_methods
       SET status = 'detached', is_default = FALSE, detached_at = COALESCE(detached_at, NOW()), updated_at = NOW()
       WHERE user_id = $1
         AND provider = 'stripe'
         AND provider_customer_ref = $2
         AND status = 'active'
         AND NOT (provider_payment_method_ref = ANY($3::text[]))`,
      [input.userId, input.customerId, providerIds]
    );
  }

  const result = await input.db.query<PaymentMethodProjectionRow>(
    `SELECT
       id,
       user_id,
       provider,
       provider_customer_ref,
       provider_payment_method_ref,
       method_type,
       label,
       details,
       brand,
       last4,
       expiry_month,
       expiry_year,
       is_default,
       status,
       redisplay_consent,
       created_at::text,
       updated_at::text
     FROM user_payment_methods
     WHERE user_id = $1
       AND provider = 'stripe'
       AND provider_customer_ref = $2
       AND status = 'active'
     ORDER BY is_default DESC, provider_created_at DESC, updated_at DESC`,
    [input.userId, input.customerId]
  );

  return result.rows.map(projectionFromRow);
}

export async function resolveActiveStripeMethod(input: {
  db: Queryable;
  userId: string;
  projectionId: number;
}): Promise<{ customerId: string; paymentMethodId: string } | null> {
  const result = await input.db.query<{
    provider_customer_ref: string;
    provider_payment_method_ref: string;
  }>(
    `SELECT provider_customer_ref, provider_payment_method_ref
     FROM user_payment_methods
     WHERE id = $1
       AND user_id = $2
       AND provider = 'stripe'
       AND status = 'active'
       AND provider_customer_ref IS NOT NULL
       AND provider_payment_method_ref IS NOT NULL
     LIMIT 1`,
    [input.projectionId, input.userId]
  );

  if (!result.rowCount) return null;
  return {
    customerId: result.rows[0].provider_customer_ref,
    paymentMethodId: result.rows[0].provider_payment_method_ref,
  };
}
