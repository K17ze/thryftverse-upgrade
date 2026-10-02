'use client';

import { RevenueChart } from '@/components/seller/RevenueChart';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import type { SellerOverview } from '@/lib/hooks/seller-queries';
import type { SellerPeriod } from '@/lib/data/fixtures-seller';
import { formatPrice } from '@/lib/utils/format';

export const PERIODS: { value: SellerPeriod; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

interface SellerRevenueSectionProps {
  overview: SellerOverview;
  period: SellerPeriod;
  onPeriodChange: (period: SellerPeriod) => void;
  className?: string;
}

export function SellerRevenueSection({
  overview,
  period,
  onPeriodChange,
  className = '',
}: SellerRevenueSectionProps) {
  return (
    <section aria-label="Revenue" className={`mt-10 ${className}`}>
      {/* The period control anchors here — it scopes this series and the
          metric grid below, so it sits on the section it drives rather
          than floating against the balance header. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-section-title font-semibold text-text-primary">Revenue</h2>
        <SegmentedControl options={PERIODS} value={period} onChange={onPeriodChange} />
      </div>
      <p className="tnum mt-1 text-meta text-text-muted">
        {formatPrice(overview.revenueTotal, overview.currency)} · prev{' '}
        {formatPrice(overview.revenuePrev, overview.currency)}
      </p>
      <div className="mt-4">
        <RevenueChart
          points={overview.series}
          ariaLabel={`Revenue, last ${period}`}
        />
      </div>
    </section>
  );
}
