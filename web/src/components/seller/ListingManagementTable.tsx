'use client';

/**
 * ListingManagementTable — the management list for /seller-hub/listings.
 * Hairline rows in the hub grammar: thumb, title, engagement stats,
 * status, age, then the per-row actions — Bump (24h cooldown, honest
 * countdown), Edit, Mark sold / Relist and View. Drafts can only resume;
 * sold rows can relist or be viewed. Mark-sold confirms through a Sheet,
 * mirroring the mobile ConfirmationSheet.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { formatCount, formatPrice, timeAgo } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import {
  bumpCooldownLabel,
  bumpCooldownRemaining,
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
  return <Badge variant="success">Active</Badge>;
}

function Row({
  row,
  bumpedAt,
  now,
  onBump,
  onRequestMarkSold,
  onRelist,
}: {
  row: ManagedListingRow;
  bumpedAt: string | undefined;
  now: number;
  onBump: (row: ManagedListingRow) => void;
  onRequestMarkSold: (row: ManagedListingRow) => void;
  onRelist: (row: ManagedListingRow) => void;
}) {
  const { listing } = row;
  const draft = row.status === 'draft';
  const cooldown = bumpCooldownRemaining(bumpedAt, now);
  const meta: string[] = [];
  if (listing.brand) meta.push(listing.brand);
  if (listing.size) meta.push(`Size ${listing.size}`);

  const thumb = (
    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-alt">
      <AppImage
        src={getListingCoverUri(listing.images)}
        alt={listing.title}
        fill
        sizes="56px"
      />
      {row.status === 'sold' ? <span className="absolute inset-0 bg-overlay/40" /> : null}
    </span>
  );

  return (
    <li className="flex items-center gap-3.5 py-3">
      {draft ? (
        thumb
      ) : (
        <Link href={`/item/${listing.id}`} className="pressable shrink-0" aria-label={`View ${listing.title}`}>
          {thumb}
        </Link>
      )}

      <div className="min-w-0 flex-1">
        {draft ? (
          <p className="clamp-1 text-body-emphasis font-medium text-text-primary">
            {listing.title}
          </p>
        ) : (
          <Link
            href={`/item/${listing.id}`}
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
            {row.status === 'active' ? 'Active' : row.status === 'draft' ? 'Draft' : 'Sold'} ·{' '}
          </span>
          {formatPrice(listing.price)}
          {meta.length ? ` · ${meta.join(' · ')}` : ''}
          {!draft ? (
            <span className="md:hidden">
              {' '}
              · {formatCount(row.views)} views · {formatCount(row.likes)} likes
              {row.watchers > 0 ? ` · ${formatCount(row.watchers)} watching` : ''}
            </span>
          ) : null}
        </p>
      </div>

      {/* Stats — own column from md up, folded into the meta line below it.
          Drafts aren't public yet, so there's no engagement to report. */}
      <div className="tnum hidden w-24 shrink-0 text-meta text-text-secondary md:block">
        {draft ? (
          <p className="text-text-muted">—</p>
        ) : (
          <>
            <p>{formatCount(row.views)} views</p>
            <p className="mt-0.5">{formatCount(row.likes)} likes</p>
            <p className="mt-0.5">{formatCount(row.watchers)} watching</p>
          </>
        )}
      </div>

      <div className="hidden shrink-0 flex-col items-start gap-1 sm:flex">
        {statusBadge(row.status)}
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

        {row.status === 'active' ? (
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
          <Link
            href="/sell"
            className="pressable inline-flex h-9 items-center rounded-md px-2 text-caption font-medium text-text-primary hover:bg-brand-subtle"
            aria-label={`Resume draft ${listing.title}`}
          >
            Resume
          </Link>
        ) : (
          <Link
            href={`/item/${listing.id}`}
            className="pressable inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-brand-subtle hover:text-text-primary"
            aria-label={`View ${listing.title}`}
          >
            <Icon name="forward" size={16} />
          </Link>
        )}
      </div>
    </li>
  );
}

export function ListingManagementTable({
  rows,
  bumps,
  onBump,
  onMarkSold,
  onRelist,
}: {
  rows: ManagedListingRow[];
  /** Persisted last-bump timestamps (post-hydration values). */
  bumps: Record<string, string>;
  onBump: (row: ManagedListingRow) => void;
  onMarkSold: (row: ManagedListingRow) => void;
  onRelist: (row: ManagedListingRow) => void;
}) {
  const now = useNow();
  const [soldTarget, setSoldTarget] = useState<ManagedListingRow | null>(null);

  const confirmCopy = useMemo(
    () =>
      soldTarget
        ? {
            title: 'Mark as sold?',
            body: `“${soldTarget.listing.title}” will show as sold and come off the public shelf. You can relist it anytime.`,
          }
        : null,
    [soldTarget],
  );

  return (
    <>
      <ul className="divide-y divide-border-subtle border-y border-border-subtle">
        {rows.map((row) => (
          <Row
            key={row.listing.id}
            row={row}
            bumpedAt={bumps[row.listing.id]}
            now={now}
            onBump={onBump}
            onRequestMarkSold={setSoldTarget}
            onRelist={onRelist}
          />
        ))}
      </ul>

      <Sheet
        open={soldTarget != null}
        onClose={() => setSoldTarget(null)}
        title={confirmCopy?.title}
        maxWidth={420}
      >
        <div className="px-5 py-5">
          <p className="text-body text-text-secondary">{confirmCopy?.body}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="quiet" size="md" onClick={() => setSoldTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                if (soldTarget) onMarkSold(soldTarget);
                setSoldTarget(null);
              }}
            >
              Mark sold
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
