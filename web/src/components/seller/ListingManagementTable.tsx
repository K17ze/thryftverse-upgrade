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
import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { formatCount, formatPrice, timeAgo } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import {
  bulkDeletable,
  bulkEditable,
  bulkEligible,
  bumpCooldownLabel,
  bumpCooldownRemaining,
  draftMissingFields,
  listingMissingDetails,
  type ManagedListingRow,
} from './listingManagementModel';

const TICK_MS = 30_000;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function statusBadge(status: ManagedListingRow['status']) {
  if (status === 'sold') return <Badge variant="neutral">Sold</Badge>;
  if (status === 'draft') return <Badge variant="warning">Draft</Badge>;
  // Paused is a deliberate seller state, not a fault — neutral badge,
  // the row keeps Resume instead of masquerading as active.
  if (status === 'paused') return <Badge variant="neutral">Paused</Badge>;
  return <Badge variant="success">Active</Badge>;
}

/** Compact status word for the small-screen meta line. */
function statusWord(status: ManagedListingRow['status']): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'draft':
      return 'Draft';
    default:
      return 'Sold';
  }
}

/** Visible 18px box inside a 44px hit area — the selection affordance. */
function RowCheckbox({
  checked,
  mixed,
  label,
  onToggle,
}: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? 'mixed' : checked}
      aria-label={label}
      onClick={onToggle}
      // 36px visual column padded to a 44px hit width by the ::after
      // bleed — the same pad-out idiom the filter rail uses, so the row
      // spacing doesn't move.
      className="pressable relative -ml-2 flex h-11 w-9 shrink-0 items-center justify-center after:absolute after:-inset-x-1 after:content-['']"
    >
      <span
        className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors ${
          checked || mixed
            ? 'border-brand bg-brand text-text-inverse'
            : 'border-border bg-surface hover:border-text-muted'
        }`}
      >
        {mixed ? (
          <span className="block h-0.5 w-2 rounded-full bg-current" aria-hidden />
        ) : checked ? (
          <Icon name="check" size={12} />
        ) : null}
      </span>
    </button>
  );
}

function Row({
  row,
  bumpedAt,
  now,
  selected,
  onToggleSelected,
  onBump,
  onRequestMarkSold,
  onRequestDelete,
  onRelist,
  onResume,
  onViewStats,
}: {
  row: ManagedListingRow;
  bumpedAt: string | undefined;
  now: number;
  selected: boolean;
  onToggleSelected: (row: ManagedListingRow) => void;
  onBump: (row: ManagedListingRow) => void;
  onRequestMarkSold: (row: ManagedListingRow) => void;
  onRequestDelete: (row: ManagedListingRow) => void;
  onRelist: (row: ManagedListingRow) => void;
  onResume: (row: ManagedListingRow) => void;
  onViewStats: (row: ManagedListingRow) => void;
}) {
  const { listing } = row;
  const draft = row.status === 'draft';
  const cooldown = bumpCooldownRemaining(bumpedAt, now);
  const meta: string[] = [];
  if (listing.brand) meta.push(listing.brand);
  if (listing.size) meta.push(`Size ${listing.size}`);
  const needs = draft ? draftMissingFields(listing) : [];
  const gaps = row.status === 'active' ? listingMissingDetails(listing) : [];

  const thumb = (
    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-alt">
      <AppImage
        src={getListingCoverUri(listing.images)}
        alt={listing.title}
        fill
        sizes="56px"
      />
      {row.status === 'sold' || row.status === 'paused' ? (
        <span className="absolute inset-0 bg-overlay/40" />
      ) : null}
    </span>
  );

  return (
    <li className={`flex items-center gap-3.5 py-3 ${selected ? 'bg-surface-alt/60' : ''}`}>
      <RowCheckbox
        checked={selected}
        label={`Select ${listing.title || 'untitled draft'}`}
        onToggle={() => onToggleSelected(row)}
      />
      {draft ? (
        thumb
      ) : (
        <Link href={`/seller-hub/listings/${listing.id}`} className="pressable shrink-0" aria-label={`Manage ${listing.title}`}>
          {thumb}
        </Link>
      )}

      <div className="min-w-0 flex-1">
        {draft ? (
          <p className="clamp-1 text-body-emphasis font-medium text-text-primary">
            {listing.title || 'Untitled draft'}
          </p>
        ) : (
          <Link
            href={`/seller-hub/listings/${listing.id}`}
            className="pressable clamp-1 block text-body-emphasis font-medium text-text-primary"
          >
            {listing.title}
          </Link>
        )}
        <p className="tnum mt-0.5 text-meta text-text-muted">
          <span
            className={`sm:hidden ${
              row.status === 'active'
                ? 'text-success-text'
                : row.status === 'draft'
                  ? 'text-warning-text'
                  : ''
            }`}
          >
            {statusWord(row.status)} ·{' '}
          </span>
          {row.imported ? <span className="sm:hidden">Imported · </span> : null}
          {listing.price > 0 ? formatPrice(listing.price) : 'No price yet'}
          {meta.length ? ` · ${meta.join(' · ')}` : ''}
          {!draft ? (
            <span className="md:hidden">
              {' '}
              · {formatCount(row.views)} views · {formatCount(row.likes)} likes
              {row.watchers > 0 ? ` · ${formatCount(row.watchers)} watching` : ''}
            </span>
          ) : null}
        </p>
        {/* Draft completeness — what publish still needs (composer gate). */}
        {needs.length ? (
          <p className="mt-0.5 clamp-1 text-meta text-warning-text">
            Needs: {needs.join(', ')}
          </p>
        ) : null}
        {/* Live-listing discovery gaps — buyers filter on these. */}
        {gaps.length ? (
          <p className="mt-0.5 clamp-1 text-meta text-warning-text">
            Missing: {gaps.join(', ')}
          </p>
        ) : null}
      </div>

      {/* Stats — own column from md up; it's also the stats-sheet entry
          (the numbers are the affordance). Drafts aren't public yet, so
          there's no engagement to report. */}
      {draft ? (
        <div className="tnum hidden w-24 shrink-0 text-meta text-text-muted md:block">—</div>
      ) : (
        <button
          type="button"
          onClick={() => onViewStats(row)}
          aria-label={`Stats for ${listing.title}`}
          className="pressable tnum hidden w-24 shrink-0 rounded-md px-1 py-1 text-left text-meta text-text-secondary transition-colors hover:bg-surface-alt hover:text-text-primary md:block"
        >
          <p>{formatCount(row.views)} views</p>
          <p className="mt-0.5">{formatCount(row.likes)} likes</p>
          <p className="mt-0.5">{formatCount(row.watchers)} watching</p>
        </button>
      )}

      <div className="hidden shrink-0 flex-col items-start gap-1 sm:flex">
        <span className="flex items-center gap-1.5">
          {statusBadge(row.status)}
          {row.imported ? <Badge variant="neutral">Imported</Badge> : null}
        </span>
        <span className="tnum text-meta text-text-muted">
          {row.status === 'draft' ? 'Saved' : 'Listed'} {timeAgo(row.effectiveCreatedAt)}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {row.status === 'active' ? (
          <Button
            variant="secondary"
            size="sm"
            icon="trending"
            onClick={() => onBump(row)}
            disabled={cooldown > 0}
            title={cooldown > 0 ? 'One bump per item every 24 hours' : 'Resurface this listing in feeds'}
            aria-label={
              cooldown > 0
                ? `${bumpCooldownLabel(cooldown)} for ${listing.title}`
                : `Bump ${listing.title}`
            }
          >
            {cooldown > 0 ? bumpCooldownLabel(cooldown) : 'Bump'}
          </Button>
        ) : null}

        {row.status === 'active' || row.status === 'paused' ? (
          <Link
            href={`/sell?edit=${listing.id}`}
            className="pressable inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-caption font-medium text-text-primary hover:bg-brand-subtle"
            aria-label={`Edit ${listing.title}`}
          >
            Edit
          </Link>
        ) : null}

        {row.status === 'active' ? (
          <button
            type="button"
            onClick={() => onRequestMarkSold(row)}
            className="pressable inline-flex h-9 items-center rounded-md px-2 text-caption font-medium text-text-primary hover:bg-brand-subtle"
            aria-label={`Mark ${listing.title} as sold`}
          >
            Mark sold
          </button>
        ) : null}

        {row.status === 'paused' ? (
          <button
            type="button"
            onClick={() => onResume(row)}
            className="pressable inline-flex h-9 items-center rounded-md px-2 text-caption font-medium text-text-primary hover:bg-brand-subtle"
            aria-label={`Resume ${listing.title} — back on sale`}
          >
            Resume
          </button>
        ) : null}

        {row.status === 'sold' ? (
          <button
            type="button"
            onClick={() => onRelist(row)}
            className="pressable inline-flex h-9 items-center rounded-md px-2 text-caption font-medium text-text-primary hover:bg-brand-subtle"
            aria-label={`Relist ${listing.title}`}
          >
            Relist
          </button>
        ) : null}

        {draft ? (
          <>
            <Link
              href={`/sell?draft=${listing.id}`}
              className="pressable inline-flex h-9 items-center rounded-md px-2 text-caption font-medium text-text-primary hover:bg-brand-subtle"
              aria-label={`Resume draft ${listing.title || 'untitled'}`}
            >
              Resume
            </Link>
            <IconButton
              name="trash"
              size={16}
              aria-label={`Delete draft ${listing.title || 'untitled'}`}
              onClick={() => onRequestDelete(row)}
              className="text-danger-text hover:bg-danger-subtle"
            />
          </>
        ) : (
          <>
            {/* Below md the stats column folds away — keep the sheet one
                tap deep on small screens too. */}
            <Link
              href={`/item/${listing.id}`}
              className="pressable inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-brand-subtle hover:text-text-primary"
              aria-label={`View ${listing.title}`}
            >
              <Icon name="forward" size={16} />
            </Link>
            <button
              type="button"
              onClick={() => onViewStats(row)}
              aria-label={`Stats for ${listing.title}`}
              className="pressable inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-brand-subtle hover:text-text-primary md:hidden"
            >
              <Icon name="analytics" size={16} />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** Pending destructive confirm — which row(s), and which verb. */
type ConfirmTarget =
  | { kind: 'mark-sold'; row: ManagedListingRow }
  | { kind: 'delete-draft'; row: ManagedListingRow }
  | { kind: 'bulk-delete'; rows: ManagedListingRow[] };

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
  onBump: (row: ManagedListingRow) => void;
  onMarkSold: (row: ManagedListingRow) => void;
  onDeleteDraft: (row: ManagedListingRow) => void;
  onRelist: (row: ManagedListingRow) => void;
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

  const confirmCopy = useMemo(() => {
    if (!target) return null;
    if (target.kind === 'delete-draft') {
      return {
        title: 'Delete this draft?',
        body: `“${target.row.listing.title || 'Untitled draft'}” will be removed permanently — it can't be recovered.`,
        action: 'Delete',
      };
    }
    if (target.kind === 'bulk-delete') {
      const n = target.rows.length;
      const listings = target.rows.filter((r) => r.status !== 'draft').length;
      const drafts = n - listings;
      return {
        title: `Delete ${n} item${n === 1 ? '' : 's'}?`,
        body: `${[
          listings ? `${listings} listing${listings === 1 ? '' : 's'}` : null,
          drafts ? `${drafts} draft${drafts === 1 ? '' : 's'}` : null,
        ]
          .filter(Boolean)
          .join(' and ')} will be removed permanently — this can't be undone.`,
        action: 'Delete',
      };
    }
    return {
      title: 'Mark as sold?',
      body: `“${target.row.listing.title}” will show as sold and come off the public shelf. You can relist it anytime.`,
      action: 'Mark sold',
    };
  }, [target]);

  const confirm = () => {
    if (!target) return;
    if (target.kind === 'delete-draft') onDeleteDraft(target.row);
    else if (target.kind === 'bulk-delete') onBulkDelete(target.rows);
    else onMarkSold(target.row);
    setTarget(null);
  };

  const bulkButton = (
    command: 'pause' | 'resume',
    eligibleRows: ManagedListingRow[],
    label: string,
  ) =>
    eligibleRows.length ? (
      <button
        key={command}
        type="button"
        disabled={bulkPending}
        onClick={() => onBulkCommand(command, eligibleRows)}
        // h-8 pill padded to a 44px hit height by the ::after bleed.
        className="pressable relative inline-flex h-8 items-center rounded-md px-2.5 text-caption font-medium text-text-primary after:absolute after:-inset-y-1.5 after:content-[''] hover:bg-brand-subtle disabled:opacity-50"
      >
        {label} {eligibleRows.length}
      </button>
    ) : null;

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
              {selectedRows.length} selected
            </span>
            <span className="flex items-center gap-0.5" role="group" aria-label="Bulk actions">
              {onBulkEdit && eligible.edit.length ? (
                <button
                  type="button"
                  disabled={bulkPending}
                  onClick={() => onBulkEdit(eligible.edit)}
                  className="pressable relative inline-flex h-8 items-center rounded-md px-2.5 text-caption font-medium text-text-primary after:absolute after:-inset-y-1.5 after:content-[''] hover:bg-brand-subtle disabled:opacity-50"
                >
                  Edit {eligible.edit.length}
                </button>
              ) : null}
              {bulkButton('pause', eligible.pause, 'Pause')}
              {bulkButton('resume', eligible.resume, 'Resume')}
              {eligible.delete.length ? (
                <button
                  type="button"
                  disabled={bulkPending}
                  onClick={() => setTarget({ kind: 'bulk-delete', rows: eligible.delete })}
                  className="pressable relative inline-flex h-8 items-center rounded-md px-2.5 text-caption font-medium text-danger-text after:absolute after:-inset-y-1.5 after:content-[''] hover:bg-danger-subtle disabled:opacity-50"
                >
                  Delete {eligible.delete.length}
                </button>
              ) : null}
            </span>
          </>
        ) : (
          <span className="text-meta text-text-muted">Select listings for bulk actions</span>
        )}
      </div>

      <ul className="divide-y divide-border-subtle border-b border-border-subtle">
        {rows.map((row) => (
          <Row
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

      <Sheet
        open={target != null}
        onClose={() => setTarget(null)}
        title={confirmCopy?.title}
        maxWidth={420}
      >
        <div className="px-5 py-5">
          <p className="text-body text-text-secondary">{confirmCopy?.body}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="quiet" size="md" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={target?.kind !== 'mark-sold' ? 'danger' : 'primary'}
              size="md"
              onClick={confirm}
            >
              {confirmCopy?.action}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
