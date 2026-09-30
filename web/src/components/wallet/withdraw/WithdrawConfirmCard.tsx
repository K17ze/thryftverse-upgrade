'use client';

/**
 * WithdrawConfirmCard — explicit withdrawal confirmation view.
 * Shows requested amount, fee breakdown (0 GBP standard), net proceeds,
 * destination bank/Stripe account, and SLA payout review disclosure.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { formatPrice } from '@/lib/utils/format';
import { ConvertSummaryRow } from '../ConvertSummaryRow';
import {
  destinationLabel,
  WITHDRAWAL_FEE_GBP,
  WITHDRAWAL_REVIEW_LABEL,
  type PayoutDestination,
} from './withdrawViewModel';

interface WithdrawConfirmCardProps {
  numericAmount: number;
  selected: PayoutDestination;
  onExecute: () => void;
  onBack: () => void;
}

export function WithdrawConfirmCard({
  numericAmount,
  selected,
  onExecute,
  onBack,
}: WithdrawConfirmCardProps) {
  const amountLabel = formatPrice(numericAmount, 'GBP');

  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to edit" onClick={onBack} />
        <h1 className="text-screen-title text-text-primary">Confirm withdrawal</h1>
      </div>

      <section aria-label="Withdrawal summary" className="mt-8 px-4 sm:px-6">
        <ConvertSummaryRow label="Amount" value={amountLabel} />
        <ConvertSummaryRow label="Fee" value={formatPrice(WITHDRAWAL_FEE_GBP, 'GBP')} />
        <ConvertSummaryRow label="You receive" value={amountLabel} total />
        <ConvertSummaryRow label="Destination" value={destinationLabel(selected)} />
        <ConvertSummaryRow label="Payout review" value={WITHDRAWAL_REVIEW_LABEL} />
      </section>

      <p className="mt-6 flex items-start gap-1.5 px-4 text-caption text-text-muted sm:px-6">
        <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
        Withdrawals are processed from completed sale proceeds. This action cannot be undone.
      </p>

      <div className="mt-8 flex flex-col gap-2 px-4 sm:px-6">
        <Button variant="primary" size="lg" fullWidth onClick={onExecute}>
          Confirm withdrawal
        </Button>
        <Button variant="secondary" size="md" fullWidth onClick={onBack}>
          Back to edit
        </Button>
      </div>
    </div>
  );
}
