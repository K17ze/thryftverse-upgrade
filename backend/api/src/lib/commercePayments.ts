/**
 * Commerce payment helpers shared by the payment-intent routes in index.ts.
 *
 * Extracted so the synchronous 1ZE settle path (P0), the retriable
 * provider-failure guard (P2-7), and the provider_submission_pending
 * reconciler (P1) are unit-testable without booting the Fastify monolith.
 */
import {
  createApiError,
  ONEZE_UNITS_PER_IZE,
  roundTo,
  unitsToOnezeAmount,
  type DbQueryable,
} from './workerHelpers.js';
import { resolveCountryPricingQuoteByCurrency } from './pricingEngine.js';

// ─── 1ZE internal-rail settlement ───────────────────────────────────────────

export interface OnezeDebitQuote {
  /** Order total the buyer is charged, in GBP major units. */
  totalGbp: number;
  /** GBP → USD internal FX rate (1 1ZE = $1 at par). */
  gbpToUsdRate: number;
  /** 1ZE amount in major units (totalGbp / gbpToUsdRate), 6dp. */
  izeAmount: number;
  /** 1ZE amount in minor units (izeAmount * ONEZE_UNITS_PER_IZE). */
  debitUnits: number;
  /** Pricing anchor carried into the wallet-ledger row for reconciliation. */
  anchorValueInInr: number;
}

/**
 * Server-side 1ZE debit quote for a commerce order. Uses the SAME pricing
 * source and conversion formula as the wallet debit inside the settlement
 * path (totalGbp / fxRate → units), so the balance the client displays can
 * never disagree with the amount actually debited.
 *
 * Throws createApiError('PAYMENT_PROVIDER_UNAVAILABLE' | 'IZE_AMOUNT_INVALID').
 */
export async function computeOnezeDebitQuote(
  client: DbQueryable,
  totalGbp: number,
): Promise<OnezeDebitQuote> {
  const normalizedTotal = roundTo(Number(totalGbp), 2);
  if (!Number.isFinite(normalizedTotal) || normalizedTotal <= 0) {
    throw createApiError('IZE_AMOUNT_INVALID', 'Order total cannot be debited in 1ZE', {
      totalGbp,
    });
  }

  let fxRate: number;
  let anchorValueInInr: number;
  try {
    const quote = await resolveCountryPricingQuoteByCurrency(client, 'GBP');
    fxRate = quote.fxRate;
    anchorValueInInr = quote.anchorValueInInr;
  } catch (error) {
    throw createApiError(
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'Unable to resolve GBP→USD FX rate for 1ZE debit',
      { reason: error instanceof Error ? error.message : 'pricing_quote_unavailable' },
    );
  }

  if (!Number.isFinite(fxRate) || fxRate <= 0) {
    throw createApiError(
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'Unable to resolve GBP→USD FX rate for 1ZE debit',
      { gbpToUsdRate: fxRate },
    );
  }

  // GBP → USD (at par with 1ZE): 1ZE amount = GBP / fxRate — identical to the
  // debit computation in the settlement path.
  const izeAmount = Number((normalizedTotal / fxRate).toFixed(6));
  if (!Number.isFinite(izeAmount) || izeAmount <= 0) {
    throw createApiError(
      'IZE_AMOUNT_INVALID',
      'Unable to derive a valid 1ZE debit amount from GBP total',
      { totalGbp: normalizedTotal, gbpToUsdRate: fxRate },
    );
  }

  const debitUnits = Math.round(izeAmount * ONEZE_UNITS_PER_IZE);
  if (!Number.isSafeInteger(debitUnits) || debitUnits <= 0) {
    throw createApiError(
      'IZE_AMOUNT_INVALID',
      '1ze amount cannot be represented safely in minor units',
      { izeAmount },
    );
  }

  return {
    totalGbp: normalizedTotal,
    gbpToUsdRate: fxRate,
    izeAmount,
    debitUnits,
    anchorValueInInr,
  };
}

/**
 * Row-locked read of the wallet's 1ZE balance in minor units. Callers hold
 * the wallet row lock for the rest of the transaction, so a balance observed
 * here cannot be spent concurrently before the debit is applied.
 */
export async function readOnezeBalanceUnitsForUpdate(
  client: DbQueryable,
  walletId: string,
): Promise<number> {
  const result = await client.query<{ oneze_balance_units: number | string }>(
    `SELECT oneze_balance_units
     FROM wallets
     WHERE id = $1
     LIMIT 1
     FOR UPDATE`,
    [walletId],
  );
  const row = result.rows[0];
  if (!row) {
    throw createApiError('WALLET_NOT_FOUND', 'Wallet not found', { walletId });
  }
  return Number(row.oneze_balance_units);
}

export function onezeUnitsToAmount(units: number): number {
  return unitsToOnezeAmount(units);
}

// ─── Retriable provider failure guard (P2-7) ────────────────────────────────

/**
 * Stripe keeps a PaymentIntent confirmable after a declined attempt — the PI
 * object reports `requires_payment_method` / `requires_action` /
 * `requires_confirmation` / `processing` and the buyer's payment sheet stays
 * open. A `payment_intent.payment_failed` webhook in that state is an
 * ATTEMPT failure, not a terminal PI failure: marking our intent 'failed'
 * would cancel the order while the buyer is still mid-SCA, and a later
 * `payment_intent.succeeded` would then hit an already-terminal intent —
 * money captured, order cancelled, listing released.
 *
 * Returns true only when the provider payload proves the payment object is
 * still actionable. All other providers (Mollie 'failed'/'expired', Tap
 * 'declined', Flutterwave 'failed') report terminal objects, so they keep
 * the existing settle-and-compensate behaviour.
 */
export function isRetriableProviderPaymentFailure(
  provider: string,
  rawPayload: unknown,
): boolean {
  if (provider !== 'stripe') {
    return false;
  }
  const payload = rawPayload && typeof rawPayload === 'object'
    ? (rawPayload as Record<string, unknown>)
    : {};
  const data = payload.data && typeof payload.data === 'object'
    ? (payload.data as Record<string, unknown>)
    : {};
  const object = data.object && typeof data.object === 'object'
    ? (data.object as Record<string, unknown>)
    : {};
  const status = typeof object.status === 'string' ? object.status : null;
  return status !== null && RETRIABLE_STRIPE_PI_STATUSES.has(status);
}

const RETRIABLE_STRIPE_PI_STATUSES = new Set([
  'requires_payment_method',
  'requires_action',
  'requires_confirmation',
  'processing',
]);

// ─── provider_submission_pending reconciler decision (P1) ───────────────────

export type StaleSubmissionDecision =
  | { action: 'settle'; finalStatus: 'succeeded' | 'failed' | 'cancelled' }
  | { action: 'recover'; status: 'requires_confirmation' | 'processing' | 'requires_payment_method' }
  | { action: 'fail' };

/**
 * Decide what to do with a payment intent stuck in
 * 'provider_submission_pending' past its TTL. `queriedStatus` is the
 * provider's authoritative intent status when the gateway exposes a
 * deterministic reference lookup (e.g. Flutterwave tx_ref = intentId, or a
 * persisted provider_intent_ref for Stripe), 'query_failed' when the
 * provider call errored, and null when no client-side reference exists to
 * query with.
 */
export function classifyStaleSubmission(
  queriedStatus: string | 'query_failed' | null,
): StaleSubmissionDecision {
  if (queriedStatus === 'succeeded') {
    return { action: 'settle', finalStatus: 'succeeded' };
  }
  if (queriedStatus === 'failed') {
    return { action: 'settle', finalStatus: 'failed' };
  }
  if (queriedStatus === 'cancelled') {
    return { action: 'settle', finalStatus: 'cancelled' };
  }
  if (
    queriedStatus === 'requires_confirmation'
    || queriedStatus === 'processing'
    || queriedStatus === 'requires_payment_method'
  ) {
    // The provider intent is alive and awaiting action — recover the real
    // status instead of failing a payment the buyer can still complete.
    return { action: 'recover', status: queriedStatus };
  }
  // No queryable reference, the query failed, or the provider reported an
  // unknown state — fail the intent so the bound order is compensated.
  return { action: 'fail' };
}
