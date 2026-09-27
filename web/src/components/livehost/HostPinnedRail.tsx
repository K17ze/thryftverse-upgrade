'use client';

/**
 * HostPinnedRail — the pinned-product rail in the host console. Ordered
 * cards (first is on the table) with remove; adding runs through a Sheet
 * over the host's remaining active listings. The order the host keeps here
 * is the pin order the session carries.
 */

import { useState } from 'react';
import type { Listing } from '@/lib/contracts/domain';
import { listingById } from '@/lib/data/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

interface HostPinnedRailProps {
  pinIds: string[];
  /** Active own listings available to pin. */
  candidates: Listing[];
  max: number;
  onChange: (pinIds: string[]) => void;
}

export function HostPinnedRail({ pinIds, candidates, max, onChange }: HostPinnedRailProps) {
  const [picking, setPicking] = useState(false);
  // Pinned rows resolve against the fixture listing index — a pin keeps
  // rendering even while the active pool is still loading.
  const pinned = pinIds
    .map((id) => listingById(id))
    .filter((l): l is Listing => l != null);
  const unpinned = candidates.filter((l) => !pinIds.includes(l.id));
  const atCap = pinIds.length >= max;

  return (
    <section aria-label="Pinned products">
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-section-title font-semibold text-text-primary">
          Pinned products <span className="tnum font-normal text-text-muted">· {pinIds.length}/{max}</span>
        </h2>
        <span className="text-meta text-text-muted">First pin is on the table</span>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="list">
        {pinned.map((listing, i) => (
          <div
            key={listing.id}
            role="listitem"
            className="flex w-[232px] shrink-0 items-center gap-2.5 rounded-lg border border-border bg-surface p-2"
          >
            <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-surface-alt">
              <AppImage
                src={getListingCoverUri(listing.images)}
                alt={listing.title}
                fill
                sizes="44px"
                className="h-full w-full"
              />
              <span
                className={`absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-bold ${
                  i === 0 ? 'bg-scrim-text-primary text-black' : 'bg-black/60 text-scrim-text-primary'
                }`}
                title={i === 0 ? 'On the table' : `Lot ${i + 1}`}
              >
                {i + 1}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="clamp-1 block text-caption font-medium text-text-primary">
                {listing.title}
              </span>
              <span className="tnum mt-0.5 block text-meta text-text-muted">
                {formatPrice(listing.price)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onChange(pinIds.filter((id) => id !== listing.id))}
              aria-label={`Remove ${listing.title} from pins`}
              className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-alt hover:text-text-primary"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}

        {!atCap && unpinned.length > 0 ? (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="pressable flex w-[104px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-text-muted transition-colors hover:border-text-muted hover:text-text-secondary"
          >
            <Icon name="plus" size={18} />
            <span className="text-caption font-medium">Add</span>
          </button>
        ) : null}
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Pin a product" maxWidth={440}>
        <div className="px-2 pb-4 pt-1">
          {unpinned.length === 0 ? (
            <p className="px-3 py-6 text-center text-body text-text-secondary">
              Everything active is already pinned.
            </p>
          ) : (
            unpinned.map((listing) => (
              <button
                key={listing.id}
                type="button"
                disabled={atCap}
                onClick={() => {
                  onChange([...pinIds, listing.id]);
                  setPicking(false);
                }}
                className="pressable flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-surface-alt disabled:opacity-40"
              >
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                  <AppImage
                    src={getListingCoverUri(listing.images)}
                    alt={listing.title}
                    fill
                    sizes="48px"
                    className="h-full w-full"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="clamp-1 block text-body font-medium text-text-primary">
                    {listing.title}
                  </span>
                  <span className="tnum mt-0.5 block text-meta text-text-muted">
                    {formatPrice(listing.price)}
                  </span>
                </span>
                <Icon name="plus" size={18} className="shrink-0 text-text-muted" />
              </button>
            ))
          )}
        </div>
      </Sheet>
    </section>
  );
}
