'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { useMyListings } from '@/lib/hooks/queries';
import {
  useFulfilmentCounts,
  useListingBatchCommand,
  useListingBatchEdit,
  type BulkActionResult,
} from '@/lib/hooks/seller-queries';
import {
  useImportDraftActions,
  useImportDrafts,
} from '@/components/catalogimport/useImportDrafts';
import {
  clearSellDraft,
  loadSellDraft,
} from '@/lib/hooks/sell/useSellDraftPersistence';
import {
  buildManagedRows,
  bulkReasonCopy,
  bumpCooldownRemaining,
  sortManagedRows,
  type ListingSortKey,
  type ListingStatusFilter,
  type ManagedListingRow,
} from '@/components/seller/listingManagementModel';
import type { SellerHubListingEditPatch } from '@/lib/api/services/sellerHub';
import { DATA_MODE } from '@/lib/api/client';
import { deleteListing, patchListing } from '@/lib/api/services/listings';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { MY_DRAFT_LISTINGS, MY_LISTINGS } from '@/lib/data/fixtures';
import { bumpListing, setListingStatus } from '@/lib/data/fixtures-commerce';
import { removeSellerDraft } from '@/lib/data/fixtures-seller';
import type { Listing } from '@/lib/contracts/domain';
import { receiptSummary } from './SellerListingsPrimitives';

const LIVE = DATA_MODE === 'live';

export function useSellerListingsWorkflow() {
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
  const importDrafts = useImportDrafts();
  const { removeDraft: removeImportDraft } = useImportDraftActions();
  const [filter, setFilter] = useState<ListingStatusFilter>('all');
  const [sort, setSort] = useState<ListingSortKey>('newest');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [statsRow, setStatsRow] = useState<ManagedListingRow | null>(null);
  const [editRows, setEditRows] = useState<ManagedListingRow[] | null>(null);
  const [editResult, setEditResult] = useState<BulkActionResult | null>(null);

  const rows = useMemo(
    () =>
      buildManagedRows(
        data ?? [],
        LIVE ? [] : MY_DRAFT_LISTINGS,
        hydrated && !LIVE ? bumps : {},
        importDrafts.data ?? [],
      ),
    [data, hydrated, bumps, importDrafts.data],
  );

  useEffect(() => {
    const live = new Set(rows.map((r) => r.listing.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const statusCounts = useMemo(() => {
    const c = { active: 0, paused: 0, sold: 0, draft: 0, held: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      const haystack = [r.listing.title, r.listing.brand, r.listing.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
    return sortManagedRows(filtered, sort);
  }, [rows, filter, sort, query]);

  const invalidate = () => {
    if (!LIVE) {
      qc.setQueryData<Listing[]>(['my-listings'], [...MY_LISTINGS]);
    }
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
    if (LIVE) {
      void patchListing(row.listing.id, { status: 'sold' })
        .then(() => {
          invalidate();
          show(`“${row.listing.title}” marked as sold`, 'success');
        })
        .catch(() => show("Couldn't mark it as sold — try again", 'error'));
      return;
    }
    if (!setListingStatus(row.listing.id, 'sold')) return;
    invalidate();
    show(`“${row.listing.title}” marked as sold`, 'success');
  };

  const handleRelist = (row: ManagedListingRow) => {
    if (!setListingStatus(row.listing.id, 'active')) return;
    invalidate();
    show(`“${row.listing.title}” is live again`, 'success');
  };

  const retireDraft = (row: ManagedListingRow) => {
    if (row.imported) {
      removeImportDraft(row.listing.id);
    } else if (!LIVE) {
      removeSellerDraft(row.listing.id);
      invalidate();
    }
    if (loadSellDraft()?.draftId === row.listing.id) clearSellDraft();
  };

  const handleDeleteDraft = (row: ManagedListingRow) => {
    const title = row.listing.title || 'Untitled draft';
    if (LIVE && !row.imported) {
      if (loadSellDraft()?.draftId === row.listing.id) clearSellDraft();
      void deleteListing(row.listing.id)
        .then(() => {
          invalidate();
          show(`Draft “${title}” deleted`, 'success');
        })
        .catch(() => show("Couldn't delete that draft — try again", 'error'));
      return;
    }
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

  const handleBulkDelete = (target: ManagedListingRow[]) => {
    const remote = target.filter((r) => !r.imported && (LIVE || r.status !== 'draft'));
    const localCount = target.length - remote.length;
    for (const row of target) {
      if (row.imported) removeImportDraft(row.listing.id);
      else if (!LIVE && row.status === 'draft') removeSellerDraft(row.listing.id);
      if (loadSellDraft()?.draftId === row.listing.id) clearSellDraft();
    }
    if (localCount) invalidate();
    if (!remote.length) {
      setSelectedIds(new Set());
      show(`Deleted ${localCount} draft${localCount === 1 ? '' : 's'}`, 'success');
      return;
    }
    batch.mutate(
      { command: 'delete', listingIds: remote.map((r) => r.listing.id) },
      {
        onSuccess: (result) => {
          keepRejected(result);
          const deleted =
            result.results.filter((r) => r.state === 'applied').length + localCount;
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

  return {
    router,
    counts,
    isLoading: isLoading || importDrafts.isLoading,
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
    bulkPending: batch.isPending || batchEdit.isPending,
    runBulk,
    handleBulkDelete,
    handleBulkEdit,
    handleBump: LIVE ? undefined : handleBump,
    handleMarkSold,
    handleDeleteDraft,
    handleRelist: LIVE ? undefined : handleRelist,
    handleResume,
    statsRow,
    setStatsRow,
    editRows,
    setEditRows,
    editResult,
    setEditResult,
    bumps: hydrated && !LIVE ? bumps : {},
    liveMode: LIVE,
  };
}
