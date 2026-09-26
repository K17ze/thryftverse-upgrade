'use client';

/**
 * GalleriaCollectionRail — the featured-collections band. Horizontally
 * snapping editorial cards (mobile GalleriaFeaturedCollectionCard grammar):
 * art-directed cover, theme kicker + serif title on a media scrim, curator
 * and piece count in the meta row beneath. Same snap-x / no-scrollbar rail
 * grammar as ListingRail elsewhere in the app.
 */

import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import type { GalleriaFeaturedCollection } from '@/lib/data/fixtures-media';

interface GalleriaCollectionRailProps {
  collections: GalleriaFeaturedCollection[];
  onOpen: (collection: GalleriaFeaturedCollection) => void;
}

function CollectionCard({
  collection,
  onOpen,
}: {
  collection: GalleriaFeaturedCollection;
  onOpen: () => void;
}) {
  return (
    <article className="w-[72vw] min-w-[240px] max-w-[320px] shrink-0 snap-start sm:w-[320px]">
      <button
        type="button"
        onClick={onOpen}
        className="pressable group block w-full text-left"
        aria-label={`Open ${collection.title} — ${collection.listingIds.length} pieces`}
      >
        <div className="relative w-full overflow-hidden rounded-lg">
          <AppImage
            src={collection.coverUri}
            alt={collection.title}
            fill
            aspectRatio={collection.aspectRatio}
            focalPoint={collection.focalPoint}
            className="h-full w-full"
            sizes="(max-width: 640px) 72vw, 320px"
          />
          {/* Media scrim */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="text-label font-semibold uppercase tracking-[0.14em] text-scrim-text-secondary">
              {collection.theme}
            </p>
            <h3 className="clamp-2 mt-1.5 text-editorial-title text-scrim-text-primary">
              {collection.title}
            </h3>
          </div>
        </div>

        {/* Curator meta — sits off the media, hairline-quiet */}
        <div className="mt-2.5 flex items-center justify-between gap-3 px-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar
              src={collection.curator.avatarUri}
              name={collection.curator.name}
              size={20}
            />
            <span className="clamp-1 text-meta text-text-secondary">
              Curated by {collection.curator.name}
            </span>
          </span>
          <span className="tnum shrink-0 text-meta text-text-muted">
            {collection.listingIds.length} pieces
          </span>
        </div>
      </button>
    </article>
  );
}

export function GalleriaCollectionRail({ collections, onOpen }: GalleriaCollectionRailProps) {
  if (collections.length === 0) return null;
  return (
    <div
      role="list"
      aria-label="Featured collections"
      className="no-scrollbar mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto"
    >
      {collections.map((collection) => (
        <CollectionCard
          key={collection.id}
          collection={collection}
          onOpen={() => onOpen(collection)}
        />
      ))}
    </div>
  );
}
