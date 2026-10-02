'use client';

/**
 * BulkDraftGrid — the multi-item draft rows for /seller-hub/bulk. Each row
 * carries its own validation truth (Ready / Needs work / Published /
 * Failed) and publish progress is reported per row, never averaged.
 *
 * Below xl the rows are a single hairline list; at xl they compose as a
 * draft tray — 2-col cards (3-col at 2xl) so a wide canvas doesn't render
 * one stretched phone-width strip.
 */

import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { formatPrice } from '@/lib/utils/format';
import { bulkStatusLabel, type BulkDraftItem } from './bulkListingModel';
import Link from 'next/link';

function statusBadge(item: BulkDraftItem) {
  switch (item.status) {
    case 'ready':
      return <Badge variant="success">{bulkStatusLabel(item.status)}</Badge>;
    case 'error':
    case 'failed':
      return <Badge variant="warning">{bulkStatusLabel(item.status)}</Badge>;
    case 'published':
      return <Badge variant="neutral">{bulkStatusLabel(item.status)}</Badge>;
    case 'publishing':
      return <Badge variant="neutral">{bulkStatusLabel(item.status)}</Badge>;
    default:
      return <Badge variant="neutral">{bulkStatusLabel(item.status)}</Badge>;
  }
}

interface BulkDraftGridProps {
  items: BulkDraftItem[];
  /** True while a publish run is in flight — rows lock except published. */
  publishing: boolean;
  onEdit: (item: BulkDraftItem) => void;
  onRemove: (item: BulkDraftItem) => void;
}

export function BulkDraftGrid({ items, publishing, onEdit, onRemove }: BulkDraftGridProps) {
  return (
    // divide-y stays live at xl — its hairline lands exactly on each
    // card's own top border, so the grid needs no undo classes.
    <ul className="divide-y divide-border-subtle border-y border-border-subtle xl:grid xl:grid-cols-2 xl:gap-4 xl:border-y-0 2xl:grid-cols-3">
      {items.map((item) => {
        const locked = publishing || item.status === 'published';
        const price = item.price > 0 ? formatPrice(item.price) : 'No price yet';
        const meta = [
          item.condition || null,
          item.category || null,
          item.images.length
            ? `${item.images.length} photo${item.images.length === 1 ? '' : 's'}`
            : 'No photos',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li
            key={item.tempId}
            className="flex items-start gap-3.5 py-3 xl:rounded-md xl:border xl:border-border-subtle xl:p-4"
          >
            <button
              type="button"
              onClick={() => onEdit(item)}
              disabled={locked}
              aria-label={`Edit ${item.title || 'untitled item'}`}
              className="pressable shrink-0 disabled:pointer-events-none"
            >
              <span className="relative block h-16 w-16 overflow-hidden rounded-md bg-surface-alt">
                <AppImage
                  src={item.images[0]}
                  alt={item.title || 'Item photo'}
                  fill
                  sizes="64px"
                  fallbackIcon="camera"
                />
                {item.status === 'published' ? (
                  <span className="absolute inset-0 bg-overlay/40" />
                ) : null}
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onEdit(item)}
                disabled={locked}
                className="pressable clamp-1 block text-left text-body-emphasis font-medium text-text-primary disabled:pointer-events-none"
              >
                {item.title.trim() || 'Untitled item'}
              </button>
              <p className="tnum mt-0.5 text-meta text-text-muted">
                {price} · {meta}
              </p>
              {/* Blocking issues — the publish gate's own words, per row. */}
              {item.errors.length ? (
                <ul className="mt-1 space-y-0.5">
                  {item.errors.map((e) => (
                    <li key={e} className="clamp-1 text-meta text-warning-text">
                      {e}
                    </li>
                  ))}
                </ul>
              ) : null}
              {item.publishError ? (
                <p className="mt-1 text-meta text-danger-text">{item.publishError}</p>
              ) : null}
              {item.status === 'published' && item.listingId ? (
                <Link
                  href={`/seller-hub/listings/${item.listingId}`}
                  className="pressable mt-1 inline-flex items-center gap-1 text-caption font-medium text-brand"
                >
                  Manage listing
                </Link>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              {statusBadge(item)}
              {!locked ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="pressable inline-flex h-9 items-center rounded-md px-2 text-caption font-medium text-text-primary hover:bg-brand-subtle"
                  >
                    Edit
                  </button>
                  <IconButton
                    name="trash"
                    size={15}
                    aria-label={`Remove ${item.title || 'untitled item'}`}
                    onClick={() => onRemove(item)}
                    className="text-danger-text hover:bg-danger-subtle"
                  />
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
