'use client';

/**
 * /seller-hub/listings — the seller's management table. Filter rail with
 * per-status counts (All / Active / Paused / Sold / Drafts),
 * newest/views/likes sort, per-row actions — Bump (one per item per 24h,
 * session-persisted), Edit, Pause/Resume, Mark sold / Relist, View, and
 * a per-listing stats sheet — plus multi-select bulk actions (pause /
 * resume / delete) run through the durable batch command with per-item
 * receipts. Drafts unify the hub shelf (MY_DRAFT_LISTINGS) and
 * catalog-import session drafts, which carry an "Imported" badge.
 * Flat canvas, hairlines — the hub grammar.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { ListingManagementTable } from '@/components/seller/ListingManagementTable';
import { ListingManagementToolbar } from '@/components/seller/ListingManagementToolbar';
import { ListingStatsSheet } from '@/components/seller/ListingStatsSheet';
import { BulkEditSheet } from '@/components/seller/BulkEditSheet';
import { InventorySearchField } from '@/components/seller/InventorySearchField';
import { InventorySummaryStrip } from '@/components/seller/InventorySummaryStrip';
import {
  buildManagedRows,
  bulkReasonCopy,
  bumpCooldownRemaining,
  sortManagedRows,
  type ListingSortKey,
  type ListingStatusFilter,
  type ManagedListingRow,
} from '@/components/seller/listingManagementModel';
import {
  useImportDraftActions,
  useImportDrafts,
} from '@/components/catalogimport/useImportDrafts';
import {
  clearSellDraft,
  loadSellDraft,
} from '@/lib/hooks/sell/useSellDraftPersistence';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useMyListings } from '@/lib/hooks/queries';
import {
  useFulfilmentCounts,
  useListingBatchCommand,
  useListingBatchEdit,
  type BulkActionResult,
} from '@/lib/hooks/seller-queries';
import type { SellerHubListingEditPatch } from '@/lib/api/services/sellerHub';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { MY_DRAFT_LISTINGS, MY_LISTINGS } from '@/lib/data/fixtures';
import { bumpListing, setListingStatus } from '@/lib/data/fixtures-commerce';
import { removeSellerDraft } from '@/lib/data/fixtures-seller';
import type { Listing } from '@/lib/contracts/domain';

const EMPTY_COPY: Record<Exclude<ListingStatusFilter, 'all'>, { title: string; subtitle: string }> = {
  active: {
    title: 'No active listings',
    subtitle: 'Everything you have live will show here.',
  },
  paused: {
    title: 'Nothing paused',
    subtitle: 'Paused listings stay yours — buyers can’t see or buy them until you resume.',
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

/** Per-item receipt rollup — "Paused 2 · 1 skipped (already sold)". The
 *  batch command's honest vocabulary, compressed for a toast. */
function receiptSummary(verb: string, result: BulkActionResult): string {
  const applied = result.results.filter((r) => r.state === 'applied').length;
  const rejected = result.results.filter((r) => r.state !== 'applied');
  if (!rejected.length) return `${verb} ${applied}`;
  const reasons = [...new Set(rejected.map((r) => bulkReasonCopy(r.reason)))].join(', ');
  return `${verb} ${applied} · ${rejected.length} skipped (${reasons})`;
}

export default function SellerListingsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { show } = useToast();
  const hydrated = useHydrated();
  const counts = useFulfilmentCounts();
  const batch = useListingBatchCommand();
  const batchEdit = useListingBatchEdit();

  const bumps = useStore((s) => s.listingBumps);
  const recordListingBump = useStore((s) => s.recordListingBump);

  const { data, isLoading, isError, refetch } = useMyListings();
  // Imported catalog drafts share the shelf — session-scoped, flagged
  // "Imported" on the row. Wait for the session-store tick so draft
  // counts and rows don't flash in a beat late.
  const importDrafts = useImportDrafts();
  const { removeDraft: removeImportDraft } = useImportDraftActions();
  const [filter, setFilter] = useState<ListingStatusFilter>('all');
  const [sort, setSort] = useState<ListingSortKey>('newest');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [statsRow, setStatsRow] = useState<ManagedListingRow | null>(null);
  const [editRows, setEditRows] = useState<ManagedListingRow[] | null>(null);
  const [editResult, setEditResult] = useState<BulkActionResult | null>(null);

  // Persisted bumps only exist client-side — gate them on hydration.
  const rows = useMemo(
    () =>
      buildManagedRows(
        data ?? [],
        MY_DRAFT_LISTINGS,
        hydrated ? bumps : {},
        importDrafts.data ?? [],
      ),
    [data, hydrated, bumps, importDrafts.data],
  );

  // A row that left the shelf (sold away, deleted, published) can't stay
  // selected — prune against the current truth, not the stale id list.
  useEffect(() => {
    const live = new Set(rows.map((r) => r.listing.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const statusCounts = useMemo(() => {
    const c = { active: 0, paused: 0, sold: 0, draft: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      // Title/brand/category — the same fields the mobile search bar reads.
      const haystack = [r.listing.title, r.listing.brand, r.listing.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
    return sortManagedRows(filtered, sort);
  }, [rows, filter, sort, query]);

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

  /**
   * One draft-retire path shared by the row delete and the bulk delete —
   * the record leaves whichever store owns it and a bound composer
   * snapshot is cleared so autosave can't resurrect it.
   */
  const retireDraft = (row: ManagedListingRow) => {
    if (row.imported) {
      removeImportDraft(row.listing.id);
    } else {
      removeSellerDraft(row.listing.id);
      invalidate();
    }
    if (loadSellDraft()?.draftId === row.listing.id) clearSellDraft();
  };

  const handleDeleteDraft = (row: ManagedListingRow) => {
    const title = row.listing.title || 'Untitled draft';
    retireDraft(row);
    show(`Draft “${title}” deleted`, 'success');
  };

  const toggleSelected = (row: ManagedListingRow) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.listing.id)) next.delete(row.listing.id);
      else next.add(row.listing.id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelectedIds((prev) =>
      visible.every((r) => prev.has(r.listing.id))
        ? new Set([...prev].filter((id) => !visible.some((r) => r.listing.id === id)))
        : new Set([...prev, ...visible.map((r) => r.listing.id)]),
    );

  /** After a batch, applied ids leave the selection; rejected rows stay
   *  selected so the seller can see exactly what didn't move. */
  const keepRejected = (result: BulkActionResult) =>
    setSelectedIds((prev) => {
      const applied = new Set(
        result.results.filter((r) => r.state === 'applied').map((r) => r.listingId),
      );
      return new Set([...prev].filter((id) => !applied.has(id)));
    });

  const runBulk = (command: 'pause' | 'resume', target: ManagedListingRow[]) => {
    if (!target.length) return;
    const ids = target.map((r) => r.listing.id);
    batch.mutate(
      { command, listingIds: ids },
      {
        onSuccess: (result) => {
          keepRejected(result);
          const verb = command === 'pause' ? 'Paused' : 'Resumed';
          const summary = receiptSummary(verb, result);
          show(summary, result.state === 'complete' ? 'success' : 'info');
        },
        onError: () =>
          show(
            `Couldn't ${command} ${ids.length === 1 ? 'that listing' : 'those listings'} — try again`,
            'error',
          ),
      },
    );
  };

  const handleResume = (row: ManagedListingRow) => runBulk('resume', [row]);

  /** Bulk edit — the sheet ships per-item absolute patches (percent rules
   *  are resolved per row upstream); receipts render inside the sheet and
   *  rejected rows stay selected for a second pass. */
  const handleBulkEdit = (items: { listingId: string; patch: SellerHubListingEditPatch }[]) => {
    batchEdit.mutate(
      { items },
      {
        onSuccess: (result) => {
          setEditResult(result);
          keepRejected(result);
        },
        onError: () =>
          show("Couldn't apply those edits — try again", 'error'),
      },
    );
  };

  /**
   * Bulk delete — drafts leave through their own stores (the batch
   * command only manages live listings), live/paused rows go through the
   * real command. Sold rows were filtered before the confirm sheet.
   */
  const handleBulkDelete = (target: ManagedListingRow[]) => {
    const drafts = target.filter((r) => r.status === 'draft');
    const listings = target.filter((r) => r.status !== 'draft');
    for (const d of drafts) retireDraft(d);
    if (!listings.length) {
      setSelectedIds(new Set());
      show(`Deleted ${drafts.length} draft${drafts.length === 1 ? '' : 's'}`, 'success');
      return;
    }
    batch.mutate(
      { command: 'delete', listingIds: listings.map((r) => r.listing.id) },
      {
        onSuccess: (result) => {
          keepRejected(result);
          const deleted =
            result.results.filter((r) => r.state === 'applied').length + drafts.length;
          const skipped = result.results.filter((r) => r.state !== 'applied');
          const summary = skipped.length
            ? `Deleted ${deleted} · ${skipped.length} skipped (${[
                ...new Set(skipped.map((r) => bulkReasonCopy(r.reason))),
              ].join(', ')})`
            : `Deleted ${deleted}`;
          show(summary, skipped.length ? 'info' : 'success');
        },
        onError: () => show("Couldn't delete those listings — try again", 'error'),
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-screen-title font-semibold text-text-primary">Listings</h1>
        <div className="flex items-center gap-1">
          <Link
            href="/seller-hub/bulk"
            className="pressable inline-flex h-11 items-center rounded-md px-3 text-caption font-medium text-text-secondary hover:bg-surface-alt hover:text-text-primary"
          >
            Bulk list
          </Link>
          <Link
            href="/seller-hub/promotions"
            className="pressable inline-flex h-11 items-center rounded-md px-3 text-caption font-medium text-text-secondary hover:bg-surface-alt hover:text-text-primary"
          >
            Promoted
          </Link>
        </div>
      </div>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {isLoading || importDrafts.isLoading ? (
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
          <div className="mt-6">
            <InventorySummaryStrip rows={rows} />
          </div>

          <ListingManagementToolbar
            filter={filter}
            onFilter={setFilter}
            sort={sort}
            onSort={setSort}
            counts={statusCounts}
            visibleCount={visible.length}
            totalCount={rows.length}
          />

          <div className="mt-3">
            <InventorySearchField value={query} onChange={setQuery} />
          </div>

          <div className="mt-4">
            {visible.length === 0 ? (
              query.trim() ? (
                <EmptyState
                  compact
                  icon="search"
                  title={`No matches for “${query.trim()}”`}
                  subtitle="Search covers titles, brands and categories."
                  actionLabel="Clear search"
                  onAction={() => setQuery('')}
                />
              ) : filter !== 'all' ? (
                <EmptyState
                  compact
                  icon="filter"
                  title={EMPTY_COPY[filter].title}
                  subtitle={EMPTY_COPY[filter].subtitle}
                  actionLabel="Show all"
                  onAction={() => setFilter('all')}
                />
              ) : null
            ) : (
              <ListingManagementTable
                rows={visible}
                bumps={hydrated ? bumps : {}}
                selectedIds={selectedIds}
                onToggleSelected={toggleSelected}
                onToggleSelectAll={toggleSelectAll}
                bulkPending={batch.isPending || batchEdit.isPending}
                onBulkCommand={runBulk}
                onBulkDelete={handleBulkDelete}
                onBulkEdit={(target) => {
                  setEditResult(null);
                  setEditRows(target);
                }}
                onBump={handleBump}
                onMarkSold={handleMarkSold}
                onDeleteDraft={handleDeleteDraft}
                onRelist={handleRelist}
                onResume={handleResume}
                onViewStats={setStatsRow}
              />
            )}
          </div>

          <p className="mt-3 text-meta text-text-muted">
            Bump resurfaces a listing — one per item every 24 hours. Demo mode: bumps,
            pauses and deletes apply on this device only.
          </p>
        </>
      )}

      <ListingStatsSheet row={statsRow} onClose={() => setStatsRow(null)} />
      <BulkEditSheet
        open={editRows != null}
        rows={editRows ?? []}
        pending={batchEdit.isPending}
        result={editResult}
        onApply={handleBulkEdit}
        onClose={() => {
          setEditRows(null);
          setEditResult(null);
        }}
      />
    </div>
  );
}
