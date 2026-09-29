'use client';

/**
 * WalletSellerEarningsStrip — operational seller liquidity radar.
 * Shows available vs pending seller proceeds with direct link to Seller Hub / Analytics.
 * Flat canvas with hairline divider (spec 17).
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';

interface WalletSellerEarningsStripProps {
  available: number;
  pending: number;
  currency: string;
  balanceHidden?: boolean;
}

export function WalletSellerEarningsStrip({
  available,
  pending,
  currency,
  balanceHidden = false,
}: WalletSellerEarningsStripProps) {
  if (available <= 0 && pending <= 0) return null;

  const mask = (val: string) => (balanceHidden ? '••••••' : val);

  return (
    <section aria-label="Seller earnings" className="mt-8 px-4 sm:px-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Seller liquidity
        </h2>
        <Link
          href="/orders"
          className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          View sales orders
        </Link>
      </div>

      <div className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
        <div className="flex items-baseline justify-between py-3">
          <div className="flex items-center gap-2">
            <Icon name="store" size={16} className="text-text-secondary" />
            <div>
              <span className="text-body font-medium text-text-primary">
                Available to pay out
              </span>
              <p className="text-meta text-text-muted">Funds from completed deliveries</p>
            </div>
          </div>
          <span className="tnum text-body font-semibold text-text-primary">
            {mask(formatPrice(available, currency))}
          </span>
        </div>

        {pending > 0 ? (
          <div className="flex items-baseline justify-between py-3">
            <div className="flex items-center gap-2">
              <Icon name="clock" size={16} className="text-warning-text" />
              <div>
                <span className="text-body text-text-secondary">Pending in transit</span>
                <p className="text-meta text-text-muted">
                  Auto-releases upon delivery scan
                </p>
              </div>
            </div>
            <span className="tnum text-body font-semibold text-warning-text">
              {mask(formatPrice(pending, currency))}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
