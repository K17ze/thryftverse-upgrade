'use client';

/**
 * /seller-hub/listings — the seller's management table. Filter rail
 * (All / Active / Sold / Drafts), newest/views/likes sort, and per-row
 * actions: Bump (one per item per 24h, session-persisted), Edit, Mark
 * sold / Relist and View. Flat canvas, hairlines — the hub grammar.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { ListingManagementTable } from '@/components/seller/ListingManagementTable';
import { ListingManagementToolbar } from '@/components/seller/ListingManagementToolbar';
import {
  buildManagedRows,
  bumpCooldownRemaining,
  sortManagedRows,
  type ListingSortKey,
  type ListingStatusFilter,
  type ManagedListingRow,
} from '@/components/seller/listingManagementModel';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useMyListings } from '@/lib/hooks/queries';
import { useFulfilmentCounts } from '@/lib/hooks/seller-queries';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { MY_DRAFT_LISTINGS, MY_LISTINGS } from '@/lib/data/fixtures';
import { bumpListing, setListingStatus } from '@/lib/data/fixtures-commerce';
import type { Listing } from '@/lib/contracts/domain';

const EMPTY_COPY: Record<Exclude<ListingStatusFilter, 'all'>, { title: string; subtitle: string }> = {
  active: {
    title: 'No active listings',
    subtitle: 'Everything you have live will show here.',
  },
  sold: {
    title: 'Nothing sold yet',
    subtitle: 'Sold pieces land here — keep listings fresh to move them.',
  },
  draft: {
    title: 'No drafts saved',
    subtitle: 'Half-finished listings you save in the sell flow wait here.',
  },
};

function ListingsSkeleton() {
  return (
    <ul
      className="divide-y divide-border-subtle border-y border-border-subtle"
      aria-busy
      aria-label="Loading listings"
    >
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3.5 py-3">
          <Skeleton className="h-14 w-14 rounded-md" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="mt-1.5 h-3 w-32" />
          </div>
          <Skeleton className="hidden h-4 w-20 sm:block" />
          <Skeleton className="h-8 w-24" />
        </li>
      ))}
    </ul>
  );
}

export default function SellerListingsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { show } = useToast();
  const hydrated = useHydrated();
  const counts = useFulfilmentCounts();

  const bumps = useStore((s) => s.listingBumps);
  const recordListingBump = useStore((s) => s.recordListingBump);

  const { data, isLoading, isError, refetch } = useMyListings();
  const [filter, setFilter] = useState<ListingStatusFilter>('all');
  const [sort, setSort] = useState<ListingSortKey>('newest');

  // Persisted bumps only exist client-side — gate them on hydration.
  const rows = useMemo(
    () => buildManagedRows(data ?? [], MY_DRAFT_LISTINGS, hydrated ? bumps : {}),
    [data, hydrated, bumps],
  );

  const visible = useMemo(() => {
    const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
    return sortManagedRows(filtered, sort);
  }, [rows, filter, sort]);

  /**
   * Fixture writes mutate MY_LISTINGS in place, so invalidation alone
   * can't re-render readers (the refetched array is the same reference
   * and structural sharing keeps it). Push a fresh array into the cache
   * first — the same optimistic-write pattern useMarkPosted relies on —
   * then invalidate so every MY_LISTINGS consumer re-reads the new truth.
   */
  const invalidate = () => {
    qc.setQueryData<Listing[]>(['my-listings'], [...MY_LISTINGS]);
    void qc.invalidateQueries({ queryKey: ['my-listings'] });
    void qc.invalidateQueries({ queryKey: ['seller'] });
  };

  const handleBump = (row: ManagedListingRow) => {
    if (bumpCooldownRemaining(bumps[row.listing.id], Date.now()) > 0) return;
    if (!bumpListing(row.listing.id)) return;
    recordListingBump(row.listing.id);
    invalidate();
    show('Bumped — back near the top of feeds', 'success');
  };

  const handleMarkSold = (row: ManagedListingRow) => {
    if (!setListingStatus(row.listing.id, 'sold')) return;
    invalidate();
    show(`“${row.listing.title}” marked as sold`, 'success');
  };

  const handleRelist = (row: ManagedListingRow) => {
    if (!setListingStatus(row.listing.id, 'active')) return;
    invalidate();
    show(`“${row.listing.title}” is live again`, 'success');
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <h1 className="text-screen-title font-semibold text-text-primary">Listings</h1>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {isLoading ? (
        <div className="mt-6">
          <ListingsSkeleton />
        </div>
      ) : isError ? (
        <EmptyState
          icon="alert"
          title="Couldn't load your listings"
          subtitle="We couldn't reach your closet data. Try again in a moment."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="inventory"
          title="Nothing listed yet"
          subtitle="Photograph a piece, set a price — your first listing takes minutes."
          actionLabel="List an item"
          onAction={() => router.push('/sell')}
        />
      ) : (
        <>
          <ListingManagementToolbar
            filter={filter}
            onFilter={setFilter}
            sort={sort}
            onSort={setSort}
            visibleCount={visible.length}
            totalCount={rows.length}
          />

          <div className="mt-4">
            {visible.length === 0 && filter !== 'all' ? (
              <EmptyState
                compact
                icon="filter"
                title={EMPTY_COPY[filter].title}
                subtitle={EMPTY_COPY[filter].subtitle}
                actionLabel="Show all"
                onAction={() => setFilter('all')}
              />
            ) : (
              <ListingManagementTable
                rows={visible}
                bumps={hydrated ? bumps : {}}
                onBump={handleBump}
                onMarkSold={handleMarkSold}
                onRelist={handleRelist}
              />
            )}
          </div>

          <p className="mt-3 text-meta text-text-muted">
            Bump resurfaces a listing — one per item every 24 hours. Demo mode: bumps are
            remembered on this device.
          </p>
        </>
      )}
    </div>
  );
}
