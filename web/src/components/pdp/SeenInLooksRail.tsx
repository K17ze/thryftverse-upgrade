'use client';

/**
 * SeenInLooksRail — community-styled looks featuring this item.
 * Membership is derived from each look's own itemIds (single source of
 * truth) — the rail renders nothing when no look references the listing.
 * Cards route to /look/[id]. Same no-scrollbar snap grammar as ListingRail.
 */

import Link from 'next/link';
import type { Listing, Look } from '@/lib/contracts/domain';
import { LOOKS, userById } from '@/lib/data/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';

interface SeenInLooksRailProps {
  listing: Listing;
}

function LookCard({ look }: { look: Look }) {
  const creator = userById(look.creatorId);
  return (
    <Link
      href={`/look/${look.id}`}
      role="listitem"
      aria-label={look.title ? `Look: ${look.title}` : 'Look'}
      className="pressable block w-[150px] shrink-0 snap-start sm:w-[170px]"
    >
      <AppImage
        src={look.coverImageUri}
        alt={look.title ?? `Look by @${creator?.username ?? 'creator'}`}
        aspectRatio={0.8}
        focalPoint={{ x: 0.5, y: 0.35 }}
        className="w-full rounded-lg"
        sizes="170px"
      />
      {look.title ? (
        <p className="clamp-1 mt-1.5 text-caption font-medium text-text-primary">
          {look.title}
        </p>
      ) : null}
      {creator ? (
        <p className="clamp-1 mt-0.5 text-meta text-text-muted">@{creator.username}</p>
      ) : null}
    </Link>
  );
}

export function SeenInLooksRail({ listing }: SeenInLooksRailProps) {
  const looks = LOOKS.filter((l) => l.itemIds.includes(listing.id));
  if (looks.length === 0) return null;

  return (
    <section className="border-t border-border-subtle py-6" aria-labelledby="pdp-seen-in-looks">
      <div className="flex items-center gap-1.5 px-4 sm:px-6">
        <Icon name="eye" size={16} className="text-text-muted" />
        <h2
          id="pdp-seen-in-looks"
          className="text-section-title font-semibold text-text-primary"
        >
          Seen in Looks
        </h2>
      </div>
      <p className="mb-3 mt-0.5 px-4 text-meta text-text-muted sm:px-6">
        Styled by the community
      </p>
      <div
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:px-6"
        role="list"
        aria-label="Looks featuring this item"
      >
        {looks.map((look) => (
          <LookCard key={look.id} look={look} />
        ))}
      </div>
    </section>
  );
}
