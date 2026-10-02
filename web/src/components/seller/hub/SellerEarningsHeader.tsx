'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { PayoutSchedule } from '@/lib/data/fixtures-seller';
import type { SellerOverview } from '@/lib/hooks/seller-queries';
import { formatPrice, formatDate } from '@/lib/utils/format';

interface SellerEarningsHeaderProps {
  overview: SellerOverview;
  earnings?: { schedule: PayoutSchedule };
}

export function SellerEarningsHeader({
  overview,
  earnings,
}: SellerEarningsHeaderProps) {
  return (
    <section aria-label="Earnings" className="mt-8">
      <div>
        <p className="text-label text-text-muted">
          Available to withdraw
        </p>
        <p className="tnum mt-2 text-display font-bold tracking-tight text-text-primary">
          {formatPrice(overview.available, overview.currency)}
        </p>
        <p className="mt-2 text-body text-text-secondary">
          <span className="tnum font-medium text-text-primary">
            {formatPrice(overview.pending, overview.currency)}
          </span>{' '}
          pending ·{' '}
          <span className="tnum font-medium text-text-primary">
            {formatPrice(overview.lifetimeSales, overview.currency)}
          </span>{' '}
          lifetime sales
        </p>
        {/* Withdraw — the real wallet flow owns amount/method */}
        <Link
          href="/wallet/withdraw"
          className="pressable mt-2 inline-flex items-center gap-1.5 text-caption font-semibold text-text-primary hover:text-text-secondary"
        >
          <Icon name="payout" size={14} className="text-text-muted" />
          Withdraw
          <Icon name="forward" size={12} className="text-text-muted" />
        </Link>
        {/* Payout schedule — the ledger's own next-amount/date */}
        {earnings &&
        (earnings.schedule.nextAmount != null || earnings.schedule.nextDate != null) ? (
          <Link
            href="/seller-hub/earnings"
            className="pressable mt-2 inline-flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary"
          >
            <Icon name="payout" size={14} className="text-text-muted" />
            {earnings.schedule.nextAmount != null ? (
              <>
                Next payout{' '}
                <span className="tnum font-medium text-text-primary">
                  {formatPrice(earnings.schedule.nextAmount, overview.currency)}
                </span>
              </>
            ) : (
              'Next payout'
            )}
            {earnings.schedule.nextDate
              ? ` on ${formatDate(earnings.schedule.nextDate)}`
              : ''}
            {earnings.schedule.method
              ? ` · ${earnings.schedule.method}${
                  earnings.schedule.methodIsDemo ? ' (demo)' : ''
                }`
              : ''}
            <Icon name="forward" size={12} className="text-text-muted" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
