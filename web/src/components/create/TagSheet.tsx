'use client';

/**
 * TagSheet — the look composer's listing picker. The signed-in user's own
 * listings (useMyListings, same source as the live-host pin picker) map to
 * look_tags rows — shoppable pins at normalised x/y positions on the media.
 */

import { useMemo } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { useMyListings } from '@/lib/hooks/queries';
import { getListingCoverUri } from '@/lib/utils/media';
import { formatPrice } from '@/lib/utils/format';
import type { Listing } from '@/lib/contracts/domain';

interface TagSheetProps {
  open: boolean;
  onClose: () => void;
  /** Currently tagged listing ids — toggles reflect this. */
  selectedIds: string[];
  onToggle: (listing: Listing) => void;
}

export function TagSheet({ open, onClose, selectedIds, onToggle }: TagSheetProps) {
  const { data: listings, isLoading, isError, refetch } = useMyListings({ enabled: open });
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const taggable = useMemo(
    () => (listings ?? []).filter((l) => !l.isSold && l.status !== 'sold'),
    [listings],
  );

  return (
    <Sheet open={open} onClose={onClose} title="Tag your pieces">
      <div className="px-4 pb-4 sm:px-6">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2" aria-busy aria-label="Loading your listings">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton aspect-[3/4] rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Icon name="warning" size={22} className="text-text-muted" />
            <p className="mt-3 text-body text-text-secondary">Your listings couldn’t be loaded.</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : taggable.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Icon name="inventory" size={22} className="text-text-muted" />
            <p className="mt-3 text-body text-text-secondary">
              No active listings yet — tag pieces you’re selling.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2" role="listbox" aria-label="Your listings" aria-multiselectable>
            {taggable.map((listing) => {
              const isPicked = selected.has(listing.id);
              return (
                <div key={listing.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isPicked}
                    onClick={() => onToggle(listing)}
                    className="pressable relative block w-full overflow-hidden rounded-md text-left"
                  >
                    <AppImage
                      src={getListingCoverUri(listing.images)}
                      alt={listing.title}
                      aspectRatio={0.75}
                      sizes="(max-width: 640px) 30vw, 160px"
                      className="rounded-md"
                    />
                    {isPicked ? (
                      <span className="absolute inset-0 flex items-center justify-center rounded-md bg-brand/35 ring-2 ring-inset ring-brand">
                        <Icon name="check" filled size={24} className="text-scrim-text-primary" />
                      </span>
                    ) : null}
                  </button>
                  <p className="clamp-1 mt-1 text-caption font-medium text-text-primary">{listing.title}</p>
                  <p className="tnum text-meta text-text-muted">{formatPrice(listing.price)}</p>
                </div>
              );
            })}
          </div>
        )}

        <div className="sticky bottom-0 -mx-4 mt-4 border-t border-border-subtle bg-surface-elevated px-4 py-3 sm:-mx-6 sm:px-6">
          <Button variant="primary" size="md" fullWidth onClick={onClose}>
            Done{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
