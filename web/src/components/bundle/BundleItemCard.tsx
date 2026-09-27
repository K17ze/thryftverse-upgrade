'use client';

/**
 * BundleItemCard — one selectable listing in the builder grid. Media is
 * the control: press toggles the pick, the check badge carries the state
 * (same grammar as the PDP bundle rail's thumbs), and the title stays a
 * link to the PDP for buyers who need the detail before committing.
 * In-bag items read as selected with an "In bag" marker — they are part
 * of the parcel either way, and deselecting removes them from the bag.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';

interface BundleItemCardProps {
  listing: Listing;
  selected: boolean;
  /** Already in the bag — counts toward the parcel; tapping removes it. */
  inBag: boolean;
  onToggle: () => void;
}

export function BundleItemCard({ listing, selected, inBag, onToggle }: BundleItemCardProps) {
  const meta = [listing.size ? `Size ${listing.size}` : null, listing.condition]
    .filter(Boolean)
    .join(' · ');

  return (
    <div role="listitem">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={`${selected ? 'Remove' : 'Add'} ${listing.title} ${selected ? 'from' : 'to'} bundle`}
        className="pressable relative block w-full text-left"
      >
        <span
          className={[
            'block overflow-hidden rounded-lg',
            selected ? 'ring-2 ring-brand ring-offset-2 ring-offset-background' : '',
          ].join(' ')}
        >
          <AppImage
            src={getListingCoverUri(listing.images)}
            alt={listing.title}
            aspectRatio={0.8}
            focalPoint={getCategoryFocalPoint(listing.category)}
            sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 46vw"
            className="w-full"
          />
        </span>
        <span
          aria-hidden
          className={[
            'absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full',
            selected
              ? 'bg-brand text-text-inverse'
              : 'bg-overlay text-scrim-text-primary',
          ].join(' ')}
        >
          <Icon name={selected ? 'check' : 'plus'} filled={selected} size={16} />
        </span>
        {inBag ? (
          <span className="absolute bottom-2 left-2 rounded-full bg-overlay px-2 py-0.5 text-meta font-medium text-scrim-text-primary">
            In bag
          </span>
        ) : null}
      </button>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <Link
          href={`/item/${listing.id}`}
          className="clamp-1 min-w-0 text-caption text-text-secondary hover:text-text-primary"
        >
          {listing.title}
        </Link>
        <span className="tnum shrink-0 text-caption font-semibold text-text-primary">
          {formatPrice(listing.price)}
        </span>
      </div>
      {meta ? <p className="clamp-1 mt-0.5 text-meta text-text-muted">{meta}</p> : null}
    </div>
  );
}
