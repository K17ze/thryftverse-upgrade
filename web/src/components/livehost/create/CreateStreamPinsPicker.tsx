'use client';

import { AppImage } from '@/components/ui/AppImage';
import type { Listing } from '@/lib/contracts/domain';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import { MAX_PINS } from '../hostStreams';
import { FIELD_LABEL } from './CreateStreamPrimitives';

interface CreateStreamPinsPickerProps {
  available: Listing[];
  pinIds: string[];
  onTogglePin: (id: string) => void;
  error?: string;
}

export function CreateStreamPinsPicker({
  available,
  pinIds,
  onTogglePin,
  error,
}: CreateStreamPinsPickerProps) {
  return (
    <fieldset className="border-t border-border-subtle pt-6">
      <legend className={FIELD_LABEL}>
        Pinned products{pinIds.length > 0 ? ` · ${pinIds.length} of ${MAX_PINS}` : ''}
      </legend>
      <div className="mt-3" role="group" aria-label="Your active listings">
        {available.map((listing) => {
          const order = pinIds.indexOf(listing.id);
          const selected = order >= 0;
          const atCap = !selected && pinIds.length >= MAX_PINS;
          return (
            <button
              key={listing.id}
              type="button"
              role="checkbox"
              aria-checked={selected}
              disabled={atCap}
              onClick={() => onTogglePin(listing.id)}
              className="pressable flex w-full items-center gap-3 border-b border-border-subtle py-2.5 text-left last:border-b-0 disabled:opacity-40"
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
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  selected ? 'border-brand' : 'border-border'
                }`}
              >
                {selected ? (
                  <span className="tnum text-caption font-semibold text-text-primary">
                    {order + 1}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-caption text-danger-text">{error}</p>
      ) : (
        <p className="mt-1.5 text-meta text-text-muted">
          Order is the running order — the first pin is on the table when you open.
        </p>
      )}
    </fieldset>
  );
}
