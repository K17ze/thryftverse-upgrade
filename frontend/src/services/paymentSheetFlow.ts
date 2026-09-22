import { Platform } from 'react-native';
import {
  initPaymentSheet,
  PaymentSheetError,
  presentPaymentSheet,
} from '@stripe/stripe-react-native';
import { fetchJson } from '../lib/apiClient';
import {
  configureStripeMobile,
  getStripeReturnUrl,
} from '../platform/payments/stripeMobile';

/**
 * Shared Stripe PaymentSheet orchestration — SEP21-FIN-A.
 *
 * Checkout and the auction winner-pay flow must collect payment through the
 * SAME native sheet: identical init parameters, identical cancel semantics,
 * identical customer/ephemeral-credential wiring. Extracting the sequence
 * here keeps the two flows from diverging — the sheet is configured from a
 * server-issued config (POST /v2/payments/orders/:id/sheet for orders,
 * POST /v2/payments/intents/:id/sheet for any owned intent), so customer
 * and customer-session credentials always come from the backend contract
 * rather than being reconstructed client-side.
 */

/** Server-issued PaymentSheet configuration (v2 sheet endpoints). */
export interface StripePaymentSheetConfig {
  paymentIntentClientSecret: string;
  customerId?: string | null;
  customerSessionClientSecret?: string | null;
  publishableKey: string;
  merchantDisplayName: string;
  merchantCountryCode: string;
  currency: string;
  returnUrl?: string | null;
  applePayEnabled?: boolean;
  googlePayEnabled?: boolean;
}

export type PaymentSheetOutcome =
  /** The buyer confirmed in-sheet; poll the intent for authoritative settlement. */
  | 'completed'
  /** The buyer dismissed the sheet — honestly unpaid, the intent stays live. */
  | 'cancelled';

/**
 * Fetch the PaymentSheet configuration for an existing payment intent the
 * authenticated user owns. The backend validates ownership, gateway
 * ('stripe_americas'), a live client secret, a non-terminal status and the
 * Stripe customer binding before issuing the customer-session credential.
 *
 * Throws an ApiRequestError on rejection (e.g. PAYMENT_SHEET_UNAVAILABLE
 * for non-Stripe rails, PAYMENT_INTENT_FINAL for settled intents) — callers
 * decide whether to fall back to status polling or surface the error.
 */
export async function fetchPaymentIntentSheetConfig(
  intentId: string
): Promise<StripePaymentSheetConfig> {
  return fetchJson<StripePaymentSheetConfig & { ok: true }>(
    `/v2/payments/intents/${encodeURIComponent(intentId)}/sheet`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
}

/**
 * Initialise and present the Stripe PaymentSheet for a server-issued
 * config. Resolves 'completed' once the sheet confirms the payment (the
 * authoritative outcome is still the intent's settled status — always poll
 * afterwards) and 'cancelled' when the buyer dismisses it.
 *
 * Throws Error on initialisation or presentation failure — retryable by
 * re-entering the flow; the intent stays live server-side.
 *
 * `opts.onSheetPresenting` fires after a successful init and before the
 * sheet opens — the canonical hook for "payment submitted" stage/analytics.
 */
export async function presentStripePaymentSheet(
  sheet: StripePaymentSheetConfig,
  opts?: { onSheetPresenting?: () => void }
): Promise<PaymentSheetOutcome> {
  await configureStripeMobile(sheet.publishableKey);

  const { error: sheetInitializationError } = await initPaymentSheet({
    merchantDisplayName: sheet.merchantDisplayName,
    customerId: sheet.customerId ?? undefined,
    customerSessionClientSecret: sheet.customerSessionClientSecret ?? undefined,
    paymentIntentClientSecret: sheet.paymentIntentClientSecret,
    // Canonical checkout always resolves the return URL locally — the
    // Expo-aware helper emits /--/ deep links in dev, which the static
    // server-provided returnUrl cannot express. Same value both flows.
    returnURL: getStripeReturnUrl(),
    allowsDelayedPaymentMethods: false,
    applePay:
      sheet.applePayEnabled && Platform.OS === 'ios'
        ? { merchantCountryCode: sheet.merchantCountryCode }
        : undefined,
    googlePay:
      sheet.googlePayEnabled && Platform.OS === 'android'
        ? {
            merchantCountryCode: sheet.merchantCountryCode,
            currencyCode: sheet.currency,
            testEnv: sheet.publishableKey.startsWith('pk_test_'),
          }
        : undefined,
  });
  if (sheetInitializationError) {
    throw new Error(sheetInitializationError.message);
  }

  opts?.onSheetPresenting?.();

  const { error: sheetPresentationError } = await presentPaymentSheet();
  if (sheetPresentationError?.code === PaymentSheetError.Canceled) {
    return 'cancelled';
  }
  if (sheetPresentationError) {
    throw new Error(sheetPresentationError.message);
  }
  return 'completed';
}
