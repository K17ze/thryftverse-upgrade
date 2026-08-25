import type Stripe from 'stripe';

export interface StripeConnectPayoutInput {
  requestId: string;
  userId: string;
  destinationAccountId: string;
  netAmountGbp: number;
}

export interface StripeConnectPayoutResult {
  providerTransferRef: string;
  amountMinor: number;
  currency: 'gbp';
  destinationAccountId: string;
}

/**
 * Create a Stripe Connect transfer to a connected account's balance.
 *
 * Per Stripe API version 2026-04-22 (Dahlia), transfer creation is distinct
 * from bank payout. A transfer moves funds to the connected account's
 * Stripe balance — it does NOT mean the funds have arrived at the seller's
 * bank account. The payout lifecycle is:
 *   pending → in_transit → paid → failed → canceled
 *
 * `paid` is reserved for Stripe's `payout.paid` webhook (bank terminal
 * evidence). This function creates a transfer only; the caller must not
 * label the payout request as `paid` based on this transfer alone.
 */
export async function createStripeConnectPayoutTransfer(
  stripe: Pick<Stripe, 'transfers'>,
  input: StripeConnectPayoutInput
): Promise<StripeConnectPayoutResult> {
  const amountMinor = Math.round(input.netAmountGbp * 100);
  if (!Number.isInteger(amountMinor) || amountMinor < 1) {
    throw new Error('PAYOUT_PROVIDER_AMOUNT_INVALID');
  }

  const transfer = await stripe.transfers.create(
    {
      amount: amountMinor,
      currency: 'gbp',
      destination: input.destinationAccountId,
      metadata: {
        thryftverse_payout_request_id: input.requestId,
        thryftverse_user_id: input.userId,
      },
    },
    {
      idempotencyKey: `payout:${input.requestId}`,
    }
  );

  if (!transfer.id) {
    throw new Error('PAYOUT_PROVIDER_REFERENCE_MISSING');
  }

  return {
    providerTransferRef: transfer.id,
    amountMinor,
    currency: 'gbp',
    destinationAccountId: input.destinationAccountId,
  };
}
