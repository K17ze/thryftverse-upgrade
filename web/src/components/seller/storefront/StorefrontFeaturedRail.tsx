'use client';

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Skeleton } from '@/components/ui/Skeleton';
import { MAX_FEATURED } from '@/components/profile/shopRailData';
import type { Listing } from '@/lib/contracts/domain';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

interface StorefrontFeaturedRailProps {
  picked: string[];
  featureable: Listing[];
  isLoadingListings: boolean;
  busy: boolean;
  onTogglePick: (id: string) => void;
}

export function StorefrontFeaturedRail({
  picked,
  featureable,
  isLoadingListings,
  busy,
  onTogglePick,
}: StorefrontFeaturedRailProps) {
  return (
    <section aria-label="Featured listings" className="mt-10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-section-title font-semibold text-text-primary">
          Featured listings
        </h2>
        <span className="tnum text-meta text-text-muted">
          {picked.length}/{MAX_FEATURED}
        </span>
      </div>
      <p className="mt-1 text-meta text-text-muted">
        Pinned to the top of your shop in the order you pick them.
      </p>

      {isLoadingListings ? (
        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      ) : featureable.length === 0 ? (
        <p className="mt-4 text-body text-text-muted">
          Nothing to pin yet —{' '}
          <Link
            href="/sell"
            className="pressable font-medium text-text-primary underline-offset-4 hover:underline"
          >
            list an item
          </Link>{' '}
          first.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {featureable.map((listing) => {
            const rank = picked.indexOf(listing.id);
            const selected = rank >= 0;
            const capped = !selected && picked.length >= MAX_FEATURED;
            return (
              <li key={listing.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={
                    selected
                      ? `Unpin "${listing.title}" (position ${rank + 1})`
                      : `Pin "${listing.title}"`
                  }
                  disabled={busy || capped}
                  onClick={() => onTogglePick(listing.id)}
                  className={`pressable w-full overflow-hidden rounded-lg border text-left disabled:opacity-40 ${
                    selected ? 'border-text-primary' : 'border-border'
                  }`}
                >
                  <span className="relative block">
                    <AppImage
                      src={getListingCoverUri(listing.images)}
                      alt={listing.title}
                      aspectRatio={1}
                      sizes="(min-width: 640px) 160px, 33vw"
                    />
                    {selected ? (
                      <span className="tnum absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-text-primary text-meta font-semibold text-text-inverse">
                        {rank + 1}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-col gap-0.5 px-2 py-2">
                    <span className="clamp-1 text-caption font-medium text-text-primary">
                      {listing.title}
                    </span>
                    <span className="tnum text-meta text-text-muted">
                      {formatPrice(listing.price)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
