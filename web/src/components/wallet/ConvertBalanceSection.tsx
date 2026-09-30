'use client';

/**
 * ConvertBalanceSection — displays the available balance for conversion
 * and the breakdown of pending/reserved/withdrawable funds.
 */

import { formatPrice } from '@/lib/utils/format';
import { formatIze, round2 } from './convertViewModel';
import * as fxService from '@/lib/api/services/fx';

function PocketRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className={`text-body ${emphasize ? 'text-text-secondary' : 'text-text-muted'}`}>
        {label}
      </span>
      <span
        className={`tnum ${
          emphasize
            ? 'text-body-emphasis font-semibold text-text-primary'
            : 'text-body text-text-secondary'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

interface ConvertBalanceSectionProps {
  settledLabel: string;
  direction: 'ize_to_gbp' | 'gbp_to_ize';
  ize: {
    pending: number;
    reserved: number;
    available: number;
  };
  data: {
    pending: number;
    available: number;
    currency: string;
  };
  isLive: boolean;
  fiatPocket?: {
    fiatBalanceMinor: number;
  } | null;
  pocketCurrency: string;
}

export function ConvertBalanceSection({
  settledLabel,
  direction,
  ize,
  data,
  isLive,
  fiatPocket,
  pocketCurrency,
}: ConvertBalanceSectionProps) {
  return (
    <section aria-label="Available balance" className="px-4 pt-6 sm:px-6">
      <p className="text-label text-text-muted">Available to convert</p>
      <p className="tnum mt-2 text-display-large font-bold tracking-tight text-text-primary">
        {settledLabel}
      </p>

      <div className="mt-5 border-t border-border-subtle">
        {direction === 'ize_to_gbp' ? (
          <>
            {ize.pending > 0 ? (
              <PocketRow
                label="Pending — unsettled Co-Own proceeds"
                value={`${formatIze(ize.pending)} 1ZE`}
              />
            ) : null}
            {ize.reserved > 0 ? (
              <PocketRow label="Reserved for open orders" value={`${formatIze(ize.reserved)} 1ZE`} />
            ) : null}
            <PocketRow
              label="Withdrawable / Convertible"
              value={`${formatIze(ize.available)} 1ZE`}
              emphasize
            />
          </>
        ) : (
          <>
            {data.pending > 0 ? (
              <PocketRow
                label="Pending — clears on delivery"
                value={formatPrice(data.pending, data.currency)}
              />
            ) : null}
            <PocketRow
              label="Withdrawable / Convertible"
              value={
                isLive && fiatPocket
                  ? fxService.formatMinorAmount(fiatPocket.fiatBalanceMinor, pocketCurrency)
                  : formatPrice(round2(data.available), data.currency)
              }
              emphasize
            />
          </>
        )}
      </div>
    </section>
  );
}
