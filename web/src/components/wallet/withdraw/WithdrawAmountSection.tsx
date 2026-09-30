import { Chip } from '@/components/ui/Chip';
import { formatPrice } from '@/lib/utils/format';
import { sanitizeAmount } from '../convertViewModel';
import {
  AMOUNT_ERROR_COPY,
  QUICK_PERCENTAGES,
  quickAmount,
  type WithdrawAmountError,
} from './withdrawViewModel';

interface WithdrawAmountSectionProps {
  available: number;
  currency: string;
  amount: string;
  onAmountChange: (value: string) => void;
  numericAmount: number;
  error: WithdrawAmountError | null;
}

export function WithdrawAmountSection({
  available,
  currency,
  amount,
  onAmountChange,
  numericAmount,
  error,
}: WithdrawAmountSectionProps) {
  return (
    <section aria-label="Amount" className="px-4 pt-6 sm:px-6">
      <div className="flex items-baseline justify-between">
        <p className="text-label text-text-muted">Available to withdraw</p>
        <p className="tnum text-body-emphasis font-semibold text-text-primary">
          {formatPrice(available, currency)}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-input px-4">
        <span className="shrink-0 text-price-hero font-bold text-text-muted">£</span>
        <input
          value={amount}
          onChange={(e) => onAmountChange(sanitizeAmount(e.target.value))}
          inputMode="decimal"
          placeholder="0.00"
          aria-label="Withdrawal amount in GBP"
          className="tnum h-16 min-w-0 flex-1 bg-transparent text-price-hero font-bold text-input-text placeholder:text-text-muted focus:outline-none"
        />
      </div>

      <div className="mt-3 flex gap-2" role="group" aria-label="Quick amounts">
        {QUICK_PERCENTAGES.map((pct) => (
          <Chip
            key={pct}
            selected={numericAmount === quickAmount(available, pct) && numericAmount > 0}
            onClick={() => onAmountChange(quickAmount(available, pct).toFixed(2))}
            aria-label={`Withdraw ${pct === 100 ? 'full balance' : `${pct}%`}`}
          >
            {pct === 100 ? 'Max' : `${pct}%`}
          </Chip>
        ))}
      </div>

      {error && error !== 'no_method' ? (
        <p className="mt-2 text-caption text-danger-text" role="alert">
          {AMOUNT_ERROR_COPY[error]}
        </p>
      ) : null}
    </section>
  );
}
