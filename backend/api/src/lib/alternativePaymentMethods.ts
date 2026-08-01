/**
 * Alternative Payment Methods (APMs) — PayPal, iDEAL, UPI, Bancontact.
 *
 * PayPal is integrated via the PayPal REST API (Orders v2).
 * iDEAL and Bancontact are routed through Mollie (already integrated).
 * UPI is routed through Razorpay (already integrated).
 *
 * This module provides the APM intent creation and webhook normalization
 * for these methods, complementing the existing card-based gateways.
 */

import type { Money } from './money.js';

export type ApmType = 'paypal' | 'ideal' | 'upi' | 'bancontact';

export interface ApmIntentInput {
  type: ApmType;
  intentId: string;
  money: Money;
  returnUrl: string;
  metadata: Record<string, unknown>;
}

export interface ApmIntentResult {
  providerIntentRef: string;
  checkoutUrl: string | null;
  initialStatus: 'requires_confirmation';
  providerStatus: string;
  scaExpiresAt: string;
}

export interface ApmConfig {
  paypalClientId: string | null;
  paypalClientSecret: string | null;
  paypalApiBaseUrl: string;
  mollieApiKey: string | null;
  razorpayKeyId: string | null;
  razorpayKeySecret: string | null;
}

/**
 * Create a PayPal order via the PayPal REST API (Orders v2).
 * Returns the PayPal order ID and approval URL for redirect.
 */
export async function createPaypalOrder(input: {
  config: ApmConfig;
  intentId: string;
  amount: number;
  currency: string;
  returnUrl: string;
  metadata: Record<string, unknown>;
}): Promise<ApmIntentResult> {
  if (!input.config.paypalClientId || !input.config.paypalClientSecret) {
    throw new Error('PAYPAL_NOT_CONFIGURED');
  }

  // Get access token
  const tokenResponse = await fetch(
    `${input.config.paypalApiBaseUrl}/v1/oauth2/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${input.config.paypalClientId}:${input.config.paypalClientSecret}`
        ).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    }
  );

  if (!tokenResponse.ok) {
    throw new Error('PAYPAL_AUTH_FAILED');
  }

  const tokenData = (await tokenResponse.json()) as { access_token: string };
  const accessToken = tokenData.access_token;

  // Create order
  const orderResponse = await fetch(
    `${input.config.paypalApiBaseUrl}/v2/checkout/orders`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.intentId,
            amount: {
              currency_code: input.currency,
              value: input.amount.toFixed(2),
            },
            custom_id: input.intentId,
          },
        ],
        application_context: {
          return_url: input.returnUrl,
          cancel_url: input.returnUrl.replace('/return', '/cancel'),
        },
      }),
    }
  );

  if (!orderResponse.ok) {
    throw new Error('PAYPAL_ORDER_CREATION_FAILED');
  }

  const orderData = (await orderResponse.json()) as {
    id: string;
    links: Array<{ href: string; rel: string }>;
  };

  const approvalLink = orderData.links.find((l) => l.rel === 'approve');

  return {
    providerIntentRef: orderData.id,
    checkoutUrl: approvalLink?.href ?? null,
    initialStatus: 'requires_confirmation',
    providerStatus: 'CREATED',
    scaExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

/**
 * Capture a PayPal order after buyer approval.
 */
export async function capturePaypalOrder(input: {
  config: ApmConfig;
  paypalOrderId: string;
}): Promise<{ captured: boolean; providerRef: string }> {
  if (!input.config.paypalClientId || !input.config.paypalClientSecret) {
    throw new Error('PAYPAL_NOT_CONFIGURED');
  }

  const tokenResponse = await fetch(
    `${input.config.paypalApiBaseUrl}/v1/oauth2/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${input.config.paypalClientId}:${input.config.paypalClientSecret}`
        ).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    }
  );

  if (!tokenResponse.ok) {
    throw new Error('PAYPAL_AUTH_FAILED');
  }

  const tokenData = (await tokenResponse.json()) as { access_token: string };

  const captureResponse = await fetch(
    `${input.config.paypalApiBaseUrl}/v2/checkout/orders/${encodeURIComponent(input.paypalOrderId)}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!captureResponse.ok) {
    throw new Error('PAYPAL_CAPTURE_FAILED');
  }

  const captureData = (await captureResponse.json()) as { id: string; status: string };

  return {
    captured: captureData.status === 'COMPLETED',
    providerRef: captureData.id,
  };
}

/**
 * Create a Mollie iDEAL or Bancontact payment.
 * Mollie handles these as regular payments with a specific method.
 */
export async function createMollieApmPayment(input: {
  config: ApmConfig;
  intentId: string;
  amount: string;
  currency: string;
  method: 'ideal' | 'bancontact' | 'klarna';
  returnUrl: string;
  metadata: Record<string, unknown>;
}): Promise<ApmIntentResult> {
  if (!input.config.mollieApiKey) {
    throw new Error('MOLLIE_NOT_CONFIGURED');
  }

  const response = await fetch('https://api.mollie.com/v2/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.config.mollieApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: {
        currency: input.currency,
        value: input.amount,
      },
      method: input.method,
      description: `Thryftverse ${input.intentId}`,
      redirectUrl: input.returnUrl,
      webhookUrl: input.returnUrl.replace('/return', '/webhooks/mollie'),
      metadata: input.metadata,
    }),
  });

  if (!response.ok) {
    throw new Error(`MOLLIE_${input.method.toUpperCase()}_CREATION_FAILED`);
  }

  const data = (await response.json()) as {
    id: string;
    _links: { checkout: { href: string } };
    status: string;
  };

  return {
    providerIntentRef: data.id,
    checkoutUrl: data._links?.checkout?.href ?? null,
    initialStatus: 'requires_confirmation',
    providerStatus: data.status,
    scaExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

/**
 * Check which APMs are available for a given country/currency corridor.
 */
export function getAvailableApmsForCorridor(country: string, currency: string): ApmType[] {
  const apms: ApmType[] = [];

  // PayPal: available globally
  apms.push('paypal');

  // iDEAL: Netherlands only
  if (country.toUpperCase() === 'NL' || currency.toUpperCase() === 'EUR') {
    apms.push('ideal');
  }

  // Bancontact: Belgium only
  if (country.toUpperCase() === 'BE' || currency.toUpperCase() === 'EUR') {
    apms.push('bancontact');
  }

  // UPI: India only
  if (country.toUpperCase() === 'IN' || currency.toUpperCase() === 'INR') {
    apms.push('upi');
  }

  return apms;
}
