import type Stripe from 'stripe';

export interface StripeConnectPayoutInput {
  requestId: string;
  userId: string;
  destinationAccountId: string;
  netAmountGbp: number;
}

export interface StripeConnectPayoutResult {
  providerPayoutRef: string;
  amountMinor: number;
  currency: 'gbp';
  destinationAccountId: string;
}

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
    providerPayoutRef: transfer.id,
    amountMinor,
    currency: 'gbp',
    destinationAccountId: input.destinationAccountId,
  };
}
