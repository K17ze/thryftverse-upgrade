'use client';

import { RowCheckbox } from './RowCheckbox';

interface BulkActionBarProps {
  allSelected: boolean;
  someSelected: boolean;
  selectedCount: number;
  bulkPending: boolean;
  onToggleSelectAll: () => void;
  onBulkEdit?: () => void;
  onBulkPause?: () => void;
  onBulkResume?: () => void;
  onBulkDelete?: () => void;
  eligibleEditCount: number;
  eligiblePauseCount: number;
  eligibleResumeCount: number;
  eligibleDeleteCount: number;
}

export function BulkActionBar({
  allSelected,
  someSelected,
  selectedCount,
  bulkPending,
  onToggleSelectAll,
  onBulkEdit,
  onBulkPause,
  onBulkResume,
  onBulkDelete,
  eligibleEditCount,
  eligiblePauseCount,
  eligibleResumeCount,
  eligibleDeleteCount,
}: BulkActionBarProps) {
  return (
    <>
      {/* Select-all + bulk bar — flat hairline header, appears as a
          persistent affordance so multi-select is discoverable. */}
      <div className="flex items-center gap-3 border-b border-border-subtle pb-2">
        <RowCheckbox
          checked={allSelected}
          mixed={someSelected && !allSelected}
          label={allSelected ? 'Clear selection' : 'Select all shown'}
          onToggle={onToggleSelectAll}
        />
        {someSelected ? (
          <>
            <span className="tnum text-caption font-medium text-text-primary">
              {selectedCount} selected
            </span>
            <span className="flex items-center gap-0.5" role="group" aria-label="Bulk actions">
              {onBulkEdit && eligibleEditCount > 0 ? (
                <button
                  type="button"
                  disabled={bulkPending}
                  onClick={onBulkEdit}
                  className="pressable relative inline-flex h-8 items-center rounded-md px-2.5 text-caption font-medium text-text-primary after:absolute after:-inset-y-1.5 after:content-[''] hover:bg-brand-subtle disabled:opacity-50"
                >
                  Edit {eligibleEditCount}
                </button>
              ) : null}
              {eligiblePauseCount > 0 && onBulkPause ? (
                <button
                  type="button"
                  disabled={bulkPending}
                  onClick={onBulkPause}
                  className="pressable relative inline-flex h-8 items-center rounded-md px-2.5 text-caption font-medium text-text-primary after:absolute after:-inset-y-1.5 after:content-[''] hover:bg-brand-subtle disabled:opacity-50"
                >
                  Pause {eligiblePauseCount}
                </button>
              ) : null}
              {eligibleResumeCount > 0 && onBulkResume ? (
                <button
                  type="button"
                  disabled={bulkPending}
                  onClick={onBulkResume}
                  className="pressable relative inline-flex h-8 items-center rounded-md px-2.5 text-caption font-medium text-text-primary after:absolute after:-inset-y-1.5 after:content-[''] hover:bg-brand-subtle disabled:opacity-50"
                >
                  Resume {eligibleResumeCount}
                </button>
              ) : null}
              {eligibleDeleteCount > 0 && onBulkDelete ? (
                <button
                  type="button"
                  disabled={bulkPending}
                  onClick={onBulkDelete}
                  className="pressable relative inline-flex h-8 items-center rounded-md px-2.5 text-caption font-medium text-danger-text after:absolute after:-inset-y-1.5 after:content-[''] hover:bg-danger-subtle disabled:opacity-50"
                >
                  Delete {eligibleDeleteCount}
                </button>
              ) : null}
            </span>
          </>
        ) : (
          <span className="text-meta text-text-muted">Select listings for bulk actions</span>
        )}
      </div>

      {/* Column header — desktop table grammar. Mirrors the row geometry
          below (checkbox bleed, 56px thumb, then the flex columns); visual
          signpost only, the <ul> rows carry the semantics. */}
      <div
        aria-hidden="true"
        className="hidden items-center gap-3.5 border-b border-border-subtle pb-2 lg:flex"
      >
        <span className="-ml-2 w-9 shrink-0" />
        <span className="w-14 shrink-0" />
        <span className="min-w-0 flex-1 text-label text-text-muted">
          Item
        </span>
        <span className="w-24 shrink-0 text-label text-text-muted">
          Stats
        </span>
        <span className="w-40 shrink-0 text-label text-text-muted">
          Status
        </span>
        <span className="w-24 shrink-0 text-right text-label text-text-muted">
          Price
        </span>
        <span className="w-[280px] shrink-0 text-right text-label text-text-muted">
          Actions
        </span>
      </div>
    </>
  );
}
