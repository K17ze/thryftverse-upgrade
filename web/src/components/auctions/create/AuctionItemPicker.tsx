'use client';

import { AppImage } from '@/components/ui/AppImage';
import { formatPrice } from '@/lib/utils/format';
import type { Listing } from '@/lib/contracts/domain';
import { onRadioGroupKeyDown } from './CreateAuctionPrimitives';

interface AuctionItemPickerProps {
  available: Listing[];
  listingId: string | null;
  error?: string;
  onPick: (id: string) => void;
}

export function AuctionItemPicker({
  available,
  listingId,
  error,
  onPick,
}: AuctionItemPickerProps) {
  return (
    <fieldset>
      <legend className="text-label text-text-secondary">Item</legend>
      <div
        className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1"
        role="radiogroup"
        aria-label="Your listings"
        onKeyDown={onRadioGroupKeyDown}
      >
        {available.map((listing, i) => (
          <button
            key={listing.id}
            type="button"
            role="radio"
            aria-checked={listing.id === listingId}
            tabIndex={listing.id === listingId || (!listingId && i === 0) ? 0 : -1}
            onClick={() => onPick(listing.id)}
            className={`pressable w-40 shrink-0 overflow-hidden rounded-lg border text-left ${
              listing.id === listingId ? 'border-text-primary' : 'border-border'
            }`}
          >
            <AppImage
              src={listing.images[0]}
              alt={listing.title}
              aspectRatio={1}
              sizes="160px"
            />
            <span className="flex flex-col gap-0.5 px-2 py-2">
              <span className="clamp-1 text-caption font-medium text-text-primary">
                {listing.title}
              </span>
              <span className="tnum text-meta text-text-muted">
                {formatPrice(listing.price)}
              </span>
            </span>
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-caption text-danger-text">{error}</p>
      ) : null}
    </fieldset>
  );
}
