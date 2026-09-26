'use client';

/**
 * OutfitTray — the pick-list of saved/favourited items the builder pulls
 * from. Slot filter chips (mobile's activeSlot → slotItems section) over a
 * tile grid; a tile toggles its listing in/out of its inferred slot.
 * Honest states: no saved items at all, and none in the filtered slot.
 */

import { useRouter } from 'next/navigation';
import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { getListingCoverUri } from '@/lib/utils/media';
import { formatPrice } from '@/lib/utils/format';
import { OUTFIT_SLOTS, type OutfitSlot } from '@/lib/store/outfits';
import { SLOT_PLURAL, inferListingSlot } from './outfitItems';

export type TrayFilter = OutfitSlot | 'all';

interface OutfitTrayProps {
  /** Saved + favourited listings, resolved and deduped by the caller. */
  items: Listing[];
  filter: TrayFilter;
  onFilterChange: (f: TrayFilter) => void;
  /** Listing ids currently placed in the outfit. */
  selectedIds: ReadonlySet<string>;
  onToggleItem: (listing: Listing) => void;
}

const FILTERS: { value: TrayFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...OUTFIT_SLOTS.map((s) => ({ value: s as TrayFilter, label: SLOT_PLURAL[s] })),
];

export function OutfitTray({
  items,
  filter,
  onFilterChange,
  selectedIds,
  onToggleItem,
}: OutfitTrayProps) {
  const router = useRouter();
  const visible =
    filter === 'all' ? items : items.filter((l) => inferListingSlot(l) === filter);

  return (
    <section aria-label="Your saved items" className="flex min-h-0 flex-col">
      <div className="flex items-baseline justify-between">
        <h2 className="text-section-title font-semibold text-text-primary">
          Your items
        </h2>
        <span className="tnum text-meta text-text-muted">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="bookmark"
          title="No saved items yet"
          subtitle="Save some items first — favourite or bookmark pieces and they'll wait here to build outfits."
          actionLabel="Explore"
          onAction={() => router.push('/explore')}
          compact
        />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Filter by slot"
            className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0"
          >
            {FILTERS.map((f) => (
              <Chip
                key={f.value}
                role="tab"
                aria-selected={filter === f.value}
                selected={filter === f.value}
                onClick={() => onFilterChange(f.value)}
              >
                {f.label}
              </Chip>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="py-10 text-center text-body text-text-muted">
              No {SLOT_PLURAL[filter as OutfitSlot].toLowerCase()} saved yet.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
              {visible.map((listing) => {
                const selected = selectedIds.has(listing.id);
                const slot = inferListingSlot(listing);
                return (
                  <button
                    key={listing.id}
                    type="button"
                    onClick={() => onToggleItem(listing)}
                    aria-pressed={selected}
                    aria-label={`${listing.title} — ${selected ? 'remove from' : 'add to'} ${SLOT_PLURAL[slot].toLowerCase()}`}
                    className="group min-w-0 text-left"
                  >
                    <div
                      className={`relative overflow-hidden rounded-lg bg-surface-alt transition-shadow ${
                        selected ? 'ring-2 ring-brand' : ''
                      }`}
                    >
                      <AppImage
                        src={getListingCoverUri(listing.images)}
                        alt={listing.title}
                        aspectRatio={0.8}
                        sizes="(max-width: 640px) 33vw, 140px"
                        className="w-full"
                      />
                      {selected ? (
                        <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-text-inverse">
                          <Icon name="check" size={13} />
                        </span>
                      ) : null}
                    </div>
                    <span className="clamp-1 mt-1.5 block text-caption font-medium text-text-primary">
                      {listing.title}
                    </span>
                    <span className="tnum block text-meta text-text-muted">
                      {formatPrice(listing.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
