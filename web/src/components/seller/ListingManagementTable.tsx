'use client';

/**
 * ListingManagementTable — the management list for /seller-hub/listings.
 * Hairline rows in the hub grammar: a real checkbox for multi-select,
 * thumb, title, engagement stats (itself the entry to the per-listing
 * stats sheet), status, age, then the per-row actions — Bump (24h
 * cooldown, honest countdown), Edit, Pause/Resume, Mark sold / Relist
 * and View. Drafts carry the mobile grammar: a "Needs: …" completeness
 * line, an "Imported" badge for catalog-import rows, Resume and a
 * confirmed Delete. Live rows flag missing discovery fields
 * (brand/size/…) the way mobile does. Destructive/state-changing actions
 * confirm through a Sheet, mirroring the mobile ConfirmationSheet.
 *
 * Multi-select: the header row's checkbox selects the visible slice;
 * once anything is selected the bulk bar offers Pause / Resume / Delete
 * scoped to what the command can legitimately touch (bulkEligible) —
 * skipped rows are reported, never silently dropped.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  bulkDeletable,
  bulkEditable,
  bulkEligible,
  type ManagedListingRow,
} from './listingManagementModel';
import { BulkActionBar } from './table/BulkActionBar';
import { ListingManagementRow } from './table/ListingManagementRow';
import { ListingConfirmSheet, type ConfirmTarget } from './table/ListingConfirmSheet';

export { RowCheckbox } from './table/RowCheckbox';
export { statusBadge, statusWord } from './table/ListingStatusBadge';
export { BulkActionBar } from './table/BulkActionBar';
export { ListingManagementRow } from './table/ListingManagementRow';
export { ListingConfirmSheet, type ConfirmTarget } from './table/ListingConfirmSheet';

const TICK_MS = 30_000;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function ListingManagementTable({
  rows,
  bumps,
  selectedIds,
  onToggleSelected,
  onToggleSelectAll,
  bulkPending,
  onBulkCommand,
  onBulkDelete,
  onBulkEdit,
  onBump,
  onMarkSold,
  onDeleteDraft,
  onRelist,
  onResume,
  onViewStats,
}: {
  rows: ManagedListingRow[];
  /** Persisted last-bump timestamps (post-hydration values). */
  bumps: Record<string, string>;
  /** Multi-select state owned by the page. */
  selectedIds: ReadonlySet<string>;
  onToggleSelected: (row: ManagedListingRow) => void;
  /** Toggles selection across the visible slice (`rows`). */
  onToggleSelectAll: () => void;
  bulkPending: boolean;
  /** Pause/resume — the table passes only the eligible subset. */
  onBulkCommand: (command: 'pause' | 'resume', rows: ManagedListingRow[]) => void;
  /** Confirmed delete — the full deletable selection (drafts included;
   *  the page routes them through their own stores). */
  onBulkDelete: (rows: ManagedListingRow[]) => void;
  /** Opens the bulk-edit sheet with the editable subset of the selection. */
  onBulkEdit?: (rows: ManagedListingRow[]) => void;
  /** Absent when the backend has no bump mechanic (live mode). */
  onBump?: (row: ManagedListingRow) => void;
  onMarkSold: (row: ManagedListingRow) => void;
  onDeleteDraft: (row: ManagedListingRow) => void;
  /** Absent in live mode — 'sold' is terminal; relisting can't run. */
  onRelist?: (row: ManagedListingRow) => void;
  onResume: (row: ManagedListingRow) => void;
  onViewStats: (row: ManagedListingRow) => void;
}) {
  const now = useNow();
  const [target, setTarget] = useState<ConfirmTarget | null>(null);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.listing.id)),
    [rows, selectedIds],
  );
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const someSelected = selectedRows.length > 0;
  const eligible = useMemo(
    () => ({
      pause: selectedRows.filter((r) => bulkEligible(r, 'pause')),
      resume: selectedRows.filter((r) => bulkEligible(r, 'resume')),
      delete: selectedRows.filter(bulkDeletable),
      edit: selectedRows.filter(bulkEditable),
    }),
    [selectedRows],
  );

  const handleConfirm = () => {
    if (!target) return;
    if (target.kind === 'delete-draft') onDeleteDraft(target.row);
    else if (target.kind === 'bulk-delete') onBulkDelete(target.rows);
    else onMarkSold(target.row);
    setTarget(null);
  };

  return (
    <>
      <BulkActionBar
        allSelected={allSelected}
        someSelected={someSelected}
        selectedCount={selectedRows.length}
        bulkPending={bulkPending}
        onToggleSelectAll={onToggleSelectAll}
        onBulkEdit={onBulkEdit ? () => onBulkEdit(eligible.edit) : undefined}
        onBulkPause={() => onBulkCommand('pause', eligible.pause)}
        onBulkResume={() => onBulkCommand('resume', eligible.resume)}
        onBulkDelete={() => setTarget({ kind: 'bulk-delete', rows: eligible.delete })}
        eligibleEditCount={eligible.edit.length}
        eligiblePauseCount={eligible.pause.length}
        eligibleResumeCount={eligible.resume.length}
        eligibleDeleteCount={eligible.delete.length}
      />

      <ul className="divide-y divide-border-subtle border-b border-border-subtle">
        {rows.map((row) => (
          <ListingManagementRow
            key={row.listing.id}
            row={row}
            bumpedAt={bumps[row.listing.id]}
            now={now}
            selected={selectedIds.has(row.listing.id)}
            onToggleSelected={onToggleSelected}
            onBump={onBump}
            onRequestMarkSold={(r) => setTarget({ kind: 'mark-sold', row: r })}
            onRequestDelete={(r) => setTarget({ kind: 'delete-draft', row: r })}
            onRelist={onRelist}
            onResume={onResume}
            onViewStats={onViewStats}
          />
        ))}
      </ul>

      <ListingConfirmSheet
        target={target}
        onClose={() => setTarget(null)}
        onConfirm={handleConfirm}
        canRelist={Boolean(onRelist)}
      />
    </>
  );
}
