'use client';

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { formatCount, formatPrice, timeAgo } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import {
  bumpCooldownLabel,
  bumpCooldownRemaining,
  draftMissingFields,
  listingMissingDetails,
  type ManagedListingRow,
} from '../listingManagementModel';
import { RowCheckbox } from './RowCheckbox';
import { statusBadge, statusWord } from './ListingStatusBadge';

interface ListingManagementRowProps {
  row: ManagedListingRow;
  bumpedAt: string | undefined;
  now: number;
  selected: boolean;
  onToggleSelected: (row: ManagedListingRow) => void;
  /** Absent when the backend has no bump mechanic — no dead affordance. */
  onBump?: (row: ManagedListingRow) => void;
  onRequestMarkSold: (row: ManagedListingRow) => void;
  onRequestDelete: (row: ManagedListingRow) => void;
  /** Absent in live mode — 'sold' is a terminal status; relist can't run. */
  onRelist?: (row: ManagedListingRow) => void;
  onResume: (row: ManagedListingRow) => void;
  onViewStats: (row: ManagedListingRow) => void;
}

export function ListingManagementRow({
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
}: ListingManagementRowProps) {
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
          {/* Price leaves the meta line at lg — it has its own column. */}
          <span className="lg:hidden">
            {listing.price > 0 ? formatPrice(listing.price) : 'No price yet'}
            {meta.length ? ' · ' : ''}
          </span>
          {meta.join(' · ')}
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

      <div className="hidden shrink-0 flex-col items-start gap-1 sm:flex lg:w-40">
        <span className="flex items-center gap-1.5">
          {statusBadge(row.status)}
          {row.imported ? <Badge variant="neutral">Imported</Badge> : null}
        </span>
        <span className="tnum text-meta text-text-muted">
          {row.status === 'draft' ? 'Saved' : 'Listed'} {timeAgo(row.effectiveCreatedAt)}
        </span>
      </div>

      {/* Price — own column at lg (it leaves the meta line there). */}
      <span className="tnum hidden w-24 shrink-0 text-right text-body-emphasis font-semibold text-text-primary lg:block">
        {listing.price > 0 ? formatPrice(listing.price) : '—'}
      </span>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 lg:w-[280px]">
        {row.status === 'active' && onBump ? (
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

        {row.status === 'sold' && onRelist ? (
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
