'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ListingPerformanceRow } from '@/lib/data/fixtures-seller';
import { formatCount, formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

export type SortKey = 'views' | 'price' | 'age';

interface SellerListingsPerformanceProps {
  performance: ListingPerformanceRow[];
  currency: string;
}

export function SellerListingsPerformance({ performance, currency }: SellerListingsPerformanceProps) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'desc' | 'asc' }>({ key: 'views', dir: 'desc' });

  const rows = useMemo(() => {
    const list = [...performance];
    const dir = sort.dir === 'desc' ? -1 : 1;
    return list.sort((a, b) => {
      if (sort.key === 'views') return (a.views - b.views) * dir;
      if (sort.key === 'price') return (a.listing.price - b.listing.price) * dir;
      return (b.ageDays - a.ageDays) * dir;
    });
  }, [performance, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  return (
    <section aria-label="Listing performance" className="mt-10 scroll-mt-20" id="performance">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section-title font-semibold text-text-primary">Your listings</h2>
        <div className="flex items-center gap-1" role="group" aria-label="Sort listings">
          <span className="text-meta text-text-muted">Sort</span>
          {(['views', 'price', 'age'] as const).map((k) => (
            <button
              key={k}
              onClick={() => toggleSort(k)}
              aria-pressed={sort.key === k}
              className={`pressable rounded px-2 py-1 text-meta font-semibold capitalize ${
                sort.key === k ? 'bg-surface-alt text-text-primary' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {rows.length > 0 ? (
        <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
          {rows.map((row) => {
            const sold = row.listing.status === 'sold' || row.listing.isSold;
            return (
              <li key={row.listing.id}>
                <Link
                  href={`/item/${row.listing.id}`}
                  className="pressable flex items-center gap-3.5 py-3"
                >
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                    <AppImage
                      src={getListingCoverUri(row.listing.images)}
                      alt={row.listing.title}
                      fill
                      sizes="56px"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="clamp-1 block text-body-emphasis font-medium text-text-primary">
                      {row.listing.title}
                    </span>
                    <span className="tnum mt-0.5 block text-meta text-text-muted">
                      {formatCount(row.views)} views · {formatCount(row.likes)} likes ·{' '}
                      {row.ageDays}d listed
                    </span>
                  </span>
                  <Badge variant={sold ? 'neutral' : 'success'}>{sold ? 'Sold' : 'Active'}</Badge>
                  <span className="tnum w-16 shrink-0 text-right text-body-emphasis font-semibold text-text-primary lg:w-24">
                    {formatPrice(row.listing.price, currency)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          compact
          icon="inventory"
          title="Nothing listed yet"
          subtitle="Photograph a piece, set a price — your first listing takes minutes."
          actionLabel="List an item"
          onAction={() => router.push('/sell')}
        />
      )}
    </section>
  );
}
