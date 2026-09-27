'use client';

/**
 * CuratedRail — the "Curated" section of the collections hub. Editorial
 * collections authored by members, rendered as large cover cards on a
 * snap rail (mobile DiscoveryCollectionRailCard grammar: scrim, theme
 * kicker, title, curator identity). Opening a card shows the edit in a
 * sheet — the same interaction the Galleria established on web.
 */

import { useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { ProductTile } from '@/components/cards/ProductTile';
import {
  CURATED_COLLECTIONS,
  curatorFor,
  type CuratedCollection,
} from '@/lib/data/fixtures-collections';
import { listingById } from '@/lib/data/fixtures';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { timeAgo } from '@/lib/utils/format';

function CuratedCard({
  collection,
  onOpen,
}: {
  collection: CuratedCollection;
  onOpen: (c: CuratedCollection) => void;
}) {
  const curator = curatorFor(collection);
  return (
    <button
      type="button"
      onClick={() => onOpen(collection)}
      className="pressable group block w-[220px] shrink-0 snap-start text-left sm:w-[260px]"
      aria-label={`${collection.title} — ${collection.itemIds.length} pieces, curated by ${curator ? `@${curator.username}` : 'ThryftVerse'}`}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={collection.coverUri}
          alt={collection.title}
          fill
          sizes="(max-width: 640px) 60vw, 260px"
          className="h-full w-full transition-transform duration-300 group-hover:scale-105"
          fallbackIcon="layers"
        />
        {/* Media scrim — legibility only */}
        <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="text-label font-semibold uppercase tracking-[0.12em] text-scrim-text-secondary">
            {collection.theme}
          </p>
          <h3 className="clamp-1 mt-1 text-item-title font-semibold text-scrim-text-primary">
            {collection.title}
          </h3>
          {curator ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-meta text-scrim-text-secondary">
              <Avatar src={curator.avatar} name={curator.username} size={18} />
              <span className="clamp-1 font-medium">@{curator.username}</span>
              {curator.isVerified ? (
                <Icon name="verified" filled size={11} className="text-scrim-text-primary" />
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function CuratedSheet({
  collection,
  onClose,
}: {
  collection: CuratedCollection | null;
  onClose: () => void;
}) {
  const curator = collection ? curatorFor(collection) : null;
  const items =
    collection?.itemIds
      .map(listingById)
      .filter((l): l is NonNullable<typeof l> => l != null)
      .map(mapListingToDiscoverySummary) ?? [];

  return (
    <Sheet open={collection != null} onClose={onClose} title={collection?.title} maxWidth={900}>
      {collection ? (
        <div className="px-5 py-5">
          {curator ? (
            <div className="mb-3 flex items-center gap-2">
              <Avatar src={curator.avatar} name={curator.username} size={24} />
              <span className="text-meta font-semibold text-text-secondary">
                @{curator.username}
              </span>
              {curator.isVerified ? (
                <Icon name="verified" filled size={12} className="text-commerce-trust" />
              ) : null}
              <span aria-hidden className="text-meta text-text-muted">
                ·
              </span>
              <span className="tnum text-meta text-text-muted">
                {collection.itemIds.length}{' '}
                {collection.itemIds.length === 1 ? 'piece' : 'pieces'}
              </span>
              <span aria-hidden className="text-meta text-text-muted">
                ·
              </span>
              <span className="text-meta text-text-muted">
                {timeAgo(collection.publishedAt)}
              </span>
            </div>
          ) : null}
          <p className="mb-5 max-w-lg text-body text-text-secondary">{collection.dek}</p>
          {items.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
              {items.map((item) => (
                <ProductTile key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-body text-text-secondary">
              This edit is being restocked — check back soon.
            </p>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}

export function CuratedRail() {
  const [open, setOpen] = useState<CuratedCollection | null>(null);

  return (
    <section aria-label="Curated collections" className="mt-10">
      <div className="flex items-baseline justify-between border-b border-border-subtle px-4 pb-3 sm:px-6">
        <h2 className="text-section-title font-semibold text-text-primary">Curated</h2>
        <span className="text-meta text-text-muted">Picked by members</span>
      </div>

      <div className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:px-6">
        {CURATED_COLLECTIONS.map((c) => (
          <CuratedCard key={c.id} collection={c} onOpen={setOpen} />
        ))}
      </div>

      <CuratedSheet collection={open} onClose={() => setOpen(null)} />
    </section>
  );
}

/** Rail skeleton — mirrors the card rhythm while curated data resolves. */
export function CuratedRailSkeleton() {
  return (
    <section aria-label="Curated collections" className="mt-10" aria-busy>
      <div className="px-4 sm:px-6">
        <div className="skeleton h-6 w-32 rounded-md" />
      </div>
      <div className="mt-5 flex gap-3 overflow-hidden px-4 sm:px-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="skeleton aspect-[3/4] w-[220px] shrink-0 rounded-lg sm:w-[260px]"
          />
        ))}
      </div>
    </section>
  );
}
