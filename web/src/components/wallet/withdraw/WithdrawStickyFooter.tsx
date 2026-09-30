import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import {
  AMOUNT_ERROR_COPY,
  PAYOUT_GATE_COPY,
  WITHDRAWAL_ETA_LABEL,
  type PayoutAvailability,
  type WithdrawAmountError,
} from './withdrawViewModel';

interface WithdrawStickyFooterProps {
  isLive: boolean;
  reviewable: boolean;
  error: WithdrawAmountError | null;
  numericAmount: number;
  payoutAvailability: PayoutAvailability;
  destinationsCount: number;
  onReview: () => void;
}

export function WithdrawStickyFooter({
  isLive,
  reviewable,
  error,
  numericAmount,
  payoutAvailability,
  destinationsCount,
  onReview,
}: WithdrawStickyFooterProps) {
  return (
    <div className="sticky bottom-0 mt-10 border-t border-border-subtle bg-surface px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <span className="flex items-center gap-1.5 text-caption text-text-secondary">
          <Icon name="clock" size={15} />
          Estimated arrival
        </span>
        <span className="tnum text-caption font-semibold text-text-primary">
          {WITHDRAWAL_ETA_LABEL}
        </span>
      </div>
      <p className="mt-3 text-center text-caption text-text-muted">
        {isLive
          ? `Transfers typically arrive in ${WITHDRAWAL_ETA_LABEL} once reviewed.`
          : `Demo — requests are recorded on this device and stay pending locally.`}
      </p>
      <Button
        variant="primary"
        size="lg"
        fullWidth
        className="mt-3"
        disabled={!reviewable}
        onClick={onReview}
      >
        Review withdrawal
      </Button>
      {error === 'no_method' && numericAmount > 0 ? (
        <p className="mt-2 text-center text-caption text-danger-text" role="alert">
          {isLive
            ? payoutAvailability === 'country_unsupported'
              ? PAYOUT_GATE_COPY.countryUnsupportedTitle
              : destinationsCount > 0
                ? 'Finish payout setup — your method is still being verified.'
                : 'Set up a payout method to withdraw.'
            : AMOUNT_ERROR_COPY.no_method}
        </p>
      ) : null}
    </div>
  );
}
