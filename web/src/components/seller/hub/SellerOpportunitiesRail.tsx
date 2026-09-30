'use client';

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import type { SellerOpportunity } from '@/lib/hooks/seller-queries';
import { formatPrice } from '@/lib/utils/format';

interface SellerOpportunitiesRailProps {
  opportunities?: SellerOpportunity[] | null;
  currency: string;
}

export function SellerOpportunitiesRail({ opportunities, currency }: SellerOpportunitiesRailProps) {
  if (!opportunities || opportunities.length === 0) return null;

  return (
    <section aria-label="Views, no sales yet" className="mt-10">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-section-title font-semibold text-text-primary">
          Views, no sales yet
        </h2>
        <Link
          href="/seller-hub/listings"
          className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          View all
        </Link>
      </div>
      <ul className="no-scrollbar -mx-4 mt-3 flex gap-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        {opportunities.map((o) => (
          <li key={o.listingId} className="w-28 shrink-0">
            <Link
              href={`/seller-hub/listings/${o.listingId}`}
              className="pressable block rounded-md focus-visible:outline-2 focus-visible:outline-text-primary"
              aria-label={`${o.title} — ${o.views30d} views in 30 days, no sales`}
            >
              <AppImage
                src={o.imageUrl}
                alt={o.title}
                aspectRatio={1}
                className="rounded-md"
                sizes="112px"
                fallbackIcon="tag"
              />
              <span className="clamp-1 mt-2 block text-caption font-medium text-text-primary">
                {o.title}
              </span>
              <span className="tnum mt-0.5 block text-meta text-text-muted">
                {o.priceGbp != null
                  ? `${formatPrice(o.priceGbp, currency)} · `
                  : ''}
                {o.views30d} views
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
