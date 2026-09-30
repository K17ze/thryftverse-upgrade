'use client';

/**
 * /seller-hub/listings — the seller's inventory management orchestrator.
 *
 * Factored into domain components (<400 LOC standard):
 *  - ListingManagementTable
 *  - ListingManagementToolbar
 *  - InventorySummaryStrip
 *  - InventorySearchField
 *  - SellerSectionNav
 *  - ListingStatsSheet
 *  - BulkEditSheet
 *  - useSellerListingsWorkflow
 */

import Link from 'next/link';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { ListingManagementTable } from '@/components/seller/ListingManagementTable';
import { ListingManagementToolbar } from '@/components/seller/ListingManagementToolbar';
import { ListingStatsSheet } from '@/components/seller/ListingStatsSheet';
import { BulkEditSheet } from '@/components/seller/BulkEditSheet';
import { InventorySearchField } from '@/components/seller/InventorySearchField';
import { InventorySummaryStrip } from '@/components/seller/InventorySummaryStrip';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ListingsSkeleton,
  EMPTY_COPY,
} from '@/components/seller/listings/SellerListingsPrimitives';
import { useSellerListingsWorkflow } from '@/components/seller/listings/useSellerListingsWorkflow';

export default function SellerListingsPage() {
  const workflow = useSellerListingsWorkflow();

  const {
    router,
    counts,
    isLoading,
    isError,
    refetch,
    rows,
    visible,
    filter,
    setFilter,
    sort,
    setSort,
    query,
    setQuery,
    statusCounts,
    selectedIds,
    toggleSelected,
    toggleSelectAll,
    bulkPending,
    runBulk,
    handleBulkDelete,
    handleBulkEdit,
    handleBump,
    handleMarkSold,
    handleDeleteDraft,
    handleRelist,
    handleResume,
    statsRow,
    setStatsRow,
    editRows,
    setEditRows,
    editResult,
    setEditResult,
    bumps,
    liveMode,
  } = workflow;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-screen-title text-text-primary">Listings</h1>
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
                bumps={bumps}
                selectedIds={selectedIds}
                onToggleSelected={toggleSelected}
                onToggleSelectAll={toggleSelectAll}
                bulkPending={bulkPending}
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
            {liveMode
              ? 'Changes apply everywhere you’re signed in — this is the same inventory the app manages.'
              : 'Bump resurfaces a listing — one per item every 24 hours. Demo mode: bumps, pauses and deletes apply on this device only.'}
          </p>
        </>
      )}

      <ListingStatsSheet row={statsRow} onClose={() => setStatsRow(null)} />
      <BulkEditSheet
        open={editRows != null}
        rows={editRows ?? []}
        pending={bulkPending}
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
