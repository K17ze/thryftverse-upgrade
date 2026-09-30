'use client';

import Link from 'next/link';
import { formatCount } from '@/lib/utils/format';
import type { Listing } from '@/lib/contracts/domain';

function MetricCell({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div
      className={`relative px-3 py-2.5 first:pl-0 ${
        href ? 'transition-colors hover:bg-surface-alt' : ''
      }`}
    >
      <dt className="text-meta text-text-muted">{label}</dt>
      <dd className="tnum mt-0.5 text-body-emphasis font-semibold text-text-primary">{value}</dd>
      {href ? (
        <Link
          href={href}
          aria-label={`View ${label.toLowerCase()} for this listing`}
          className="absolute inset-0"
        />
      ) : null}
    </div>
  );
}

interface ListingManageActivityMetricsProps {
  listing: Listing;
  stats?: {
    views: number;
    likes: number;
    watchers: number;
    offers: number;
  } | null;
}

export function ListingManageActivityMetrics({
  listing,
  stats,
}: ListingManageActivityMetricsProps) {
  return (
    <dl
      aria-label="Buyer activity"
      className="mt-5 grid grid-cols-4 divide-x divide-border-subtle border-y border-border-subtle"
    >
      <MetricCell
        label="Views"
        value={stats ? formatCount(stats.views) : '—'}
      />
      <MetricCell label="Likes" value={formatCount(listing.likes)} />
      <MetricCell
        label="Watching"
        value={stats ? formatCount(stats.watchers) : '—'}
      />
      <MetricCell
        label="Offers"
        value={stats ? formatCount(stats.offers) : '—'}
        href={`/offers?listing=${listing.id}`}
      />
    </dl>
  );
}
