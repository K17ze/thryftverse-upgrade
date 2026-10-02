'use client';

/**
 * ExchangeExecuting — loading transition state while executing an FX quote.
 * Debits source pocket and credits target pocket at the guaranteed rate.
 */

import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { IconButton } from '@/components/ui/IconButton';
import type { SupportedCurrencyCode } from '@/lib/constants/currencies';

interface ExchangeExecutingProps {
  sourceCurrency: SupportedCurrencyCode;
  targetCurrency: SupportedCurrencyCode;
}

export function ExchangeExecuting({
  sourceCurrency,
  targetCurrency,
}: ExchangeExecutingProps) {
  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" disabled />
        <h1 className="text-screen-title text-text-primary">Exchange</h1>
      </div>
      <div className="flex flex-col items-center px-6 pt-24 text-center">
        <Icon name="sort" size={48} className="text-brand" />
        <h2 className="mt-4 text-section-title font-semibold text-text-primary">
          Exchanging your money
        </h2>
        <p className="mt-3 flex items-center gap-2 text-body text-text-secondary" role="status">
          <Spinner size={24} />
          <span>
            Debiting {sourceCurrency} and crediting {targetCurrency} at the quoted rate.
          </span>
        </p>
      </div>
    </div>
  );
}
