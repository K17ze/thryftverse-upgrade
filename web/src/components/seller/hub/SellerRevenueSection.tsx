'use client';

import { RevenueChart } from '@/components/seller/RevenueChart';
import type { SellerOverview } from '@/lib/hooks/seller-queries';
import type { SellerPeriod } from '@/lib/data/fixtures-seller';
import { formatPrice } from '@/lib/utils/format';

interface SellerRevenueSectionProps {
  overview: SellerOverview;
  period: SellerPeriod;
  className?: string;
}

export function SellerRevenueSection({ overview, period, className = '' }: SellerRevenueSectionProps) {
  return (
    <section aria-label="Revenue" className={`mt-10 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section-title font-semibold text-text-primary">Revenue</h2>
        <p className="tnum text-meta text-text-muted">
          {formatPrice(overview.revenueTotal, overview.currency)} · prev{' '}
          {formatPrice(overview.revenuePrev, overview.currency)}
        </p>
      </div>
      <div className="mt-4">
        <RevenueChart
          points={overview.series}
          ariaLabel={`Revenue, last ${period}`}
        />
      </div>
    </section>
  );
}
