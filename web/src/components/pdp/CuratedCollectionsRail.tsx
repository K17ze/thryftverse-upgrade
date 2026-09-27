'use client';

/**
 * CuratedCollectionsRail — collections featuring this item.
 * Membership is derived from each collection's own itemIds; editorial
 * chrome (subtitle + cover) comes from CURATED_COLLECTION_META, joined by
 * collection id. Cards route to /collection/[id]. Nothing renders when the
 * item sits in no collection.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { CURATED_COLLECTION_META } from '@/lib/data/fixtures';
import { COLLECTIONS } from '@/components/profile/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';

interface CuratedCollectionsRailProps {
  listing: Listing;
}

export function CuratedCollectionsRail({ listing }: CuratedCollectionsRailProps) {
  const featured = COLLECTIONS.filter((c) => c.itemIds.includes(listing.id)).map(
    (c) => ({
      id: c.id,
      title: c.title,
      itemCount: c.itemIds.length,
      meta: CURATED_COLLECTION_META.find((m) => m.id === c.id),
    }),
  );
  if (featured.length === 0) return null;

  return (
    <section
      className="border-t border-border-subtle py-6"
      aria-labelledby="pdp-collections"
    >
      <div className="px-4 sm:px-6">
        <p className="text-meta uppercase tracking-wide text-text-muted">
          Curated by ThryftVerse
        </p>
        <h2
          id="pdp-collections"
          className="mt-1 text-section-title font-semibold text-text-primary"
        >
          Featured in collections
        </h2>
      </div>
      <div
        className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:px-6"
        role="list"
        aria-label="Collections featuring this item"
      >
        {featured.map((c) => (
          <Link
            key={c.id}
            href={`/collection/${c.id}`}
            role="listitem"
            aria-label={`${c.title}. ${c.itemCount} pieces`}
            className="pressable flex min-h-[118px] w-[300px] shrink-0 snap-start overflow-hidden rounded-lg border border-border-subtle bg-surface-alt sm:w-[320px]"
          >
            {/* Media — cover with a quiet pieces-count badge */}
            <div className="relative w-[104px] shrink-0">
              <AppImage
                src={c.meta?.coverImageUri}
                alt={c.title}
                fill
                className="h-full w-full"
                sizes="104px"
                fallbackIcon="layers"
              />
              <span className="tnum absolute bottom-2 left-2 rounded-full bg-overlay px-1.5 py-0.5 text-meta text-scrim-text-primary">
                {c.itemCount} {c.itemCount === 1 ? 'piece' : 'pieces'}
              </span>
            </div>
            {/* Copy — kicker, title, subtitle, open affordance */}
            <div className="flex min-w-0 flex-1 items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-meta uppercase tracking-wide text-text-muted">
                  Collection
                </p>
                <p className="clamp-1 mt-0.5 text-body-emphasis font-semibold text-text-primary">
                  {c.title}
                </p>
                {c.meta?.subtitle ? (
                  <p className="clamp-2 mt-0.5 text-meta text-text-muted">
                    {c.meta.subtitle}
                  </p>
                ) : null}
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface text-text-primary">
                <Icon name="forward" size={15} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
