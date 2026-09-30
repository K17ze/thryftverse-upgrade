'use client';

import Link from 'next/link';
import { formatIze } from '../convertViewModel';
import { formatPrice } from '@/lib/utils/format';

interface WalletLiquidityAccountsProps {
  available: number;
  currency: string;
  ize?: {
    available: number;
    pending: number;
    reserved: number;
  } | null;
  balanceHidden: boolean;
  convertAvailable: boolean;
  onRefresh: () => void;
}

export function WalletLiquidityAccounts({
  available,
  currency,
  ize,
  balanceHidden,
  convertAvailable,
  onRefresh,
}: WalletLiquidityAccountsProps) {
  return (
    <section aria-label="Balances" className="mt-8 px-4 sm:px-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Liquidity pockets
        </h2>
        <span className="flex items-baseline gap-4">
          <Link
            href="/wallet/send"
            className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Send
          </Link>
          <Link
            href="/wallet/exchange"
            className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Exchange
          </Link>
          {convertAvailable ? (
            <Link
              href="/wallet/convert"
              className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
            >
              Convert
            </Link>
          ) : null}
        </span>
      </div>
      <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
        <li className="flex items-baseline justify-between gap-4 py-3">
          <div>
            <span className="text-body font-medium text-text-primary">
              British pound · GBP
            </span>
            <p className="text-meta text-text-muted">Primary settlement currency</p>
          </div>
          <span className="text-body font-semibold text-text-primary tnum">
            {balanceHidden ? '••••••' : formatPrice(available, currency)}
          </span>
        </li>
        {ize ? (
          <li className="py-3">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <span className="text-body font-medium text-text-primary">
                  Thryft credit · 1ZE
                </span>
                <p className="text-meta text-text-muted">Co-Own &amp; checkout credits</p>
              </div>
              <span className="text-body font-semibold text-text-primary tnum">
                {balanceHidden ? '••••••' : `${formatIze(ize.available)} 1ZE`}
              </span>
            </div>
            {ize.pending > 0 || ize.reserved > 0 ? (
              <p className="mt-1 text-right text-meta text-text-muted tnum">
                {ize.pending > 0 ? `${formatIze(ize.pending)} pending` : ''}
                {ize.pending > 0 && ize.reserved > 0 ? ' · ' : ''}
                {ize.reserved > 0
                  ? `${formatIze(ize.reserved)} held for open orders`
                  : ''}
              </p>
            ) : null}
          </li>
        ) : (
          <li className="flex items-baseline justify-between gap-4 py-3">
            <div>
              <span className="text-body font-medium text-text-primary">
                Thryft credit · 1ZE
              </span>
              <p className="text-meta text-text-muted">
                Position unavailable — retry to load
              </p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
            >
              Retry
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
