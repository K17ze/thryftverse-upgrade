'use client';

/**
 * WithdrawSubmitting — animated progress screen while submitting a payout request.
 * Displays current stage: submission to provider, ledger recording, and confirmation.
 */

import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { formatPrice } from '@/lib/utils/format';
import { destinationLabel, type PayoutDestination } from './withdrawViewModel';

interface WithdrawSubmittingProps {
  numericAmount: number;
  selected: PayoutDestination | null;
  stage: number;
  stages: readonly string[];
}

export function WithdrawSubmitting({
  numericAmount,
  selected,
  stage,
  stages,
}: WithdrawSubmittingProps) {
  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl" aria-busy aria-live="polite">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <span className="h-11 w-11" aria-hidden />
        <h1 className="text-screen-title text-text-primary">Withdraw</h1>
      </div>
      <div className="px-4 pt-16 sm:px-6">
        <p className="tnum text-display-large font-bold tracking-tight text-text-primary">
          {formatPrice(numericAmount, 'GBP')}
        </p>
        <p className="mt-1 text-body text-text-secondary">
          to {selected ? destinationLabel(selected) : 'your payout account'}
        </p>
        <ul className="mt-10">
          {stages.map((label, i) => (
            <li
              key={label}
              className="flex items-center gap-3 border-t border-border-subtle py-4"
            >
              {i < stage ? (
                <Icon name="check" filled size={20} className="text-success-text" />
              ) : i === stage ? (
                <Spinner size={20} tone="neutral" />
              ) : (
                <span className="h-5 w-5 rounded-full border border-border" aria-hidden />
              )}
              <span
                className={`text-body ${
                  i <= stage ? 'text-text-primary' : 'text-text-muted'
                }`}
              >
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
