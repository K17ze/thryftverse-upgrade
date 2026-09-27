'use client';

/**
 * Galleria collection — the full route promoted from the collection
 * sheet, mirroring the mobile GalleriaCollectionDetailScreen: cover hero
 * with theme kicker + title + dek + curator row, then the pieces as a
 * shoppable grid. Honest states for unknown or empty edits.
 */

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { ProductTile } from '@/components/cards/ProductTile';
import { BackBar } from '@/components/profile/BackBar';
import { useShare } from '@/components/profile/useShare';
import { mapListingToDiscoverySummary, type Listing } from '@/lib/contracts/domain';
import { listingById } from '@/lib/data/fixtures';
import { GALLERIA_FEATURED_COLLECTIONS } from '@/lib/data/fixtures-media';

export default function GalleriaCollectionPage() {
  const params = useParams();
  const share = useShare();
  const id = String(params.id ?? '');
  const collection = GALLERIA_FEATURED_COLLECTIONS.find((c) => c.id === id);

  const items = useMemo(
    () =>
      (collection?.listingIds ?? [])
        .map(listingById)
        .filter((l): l is Listing => l != null)
        .map(mapListingToDiscoverySummary),
    [collection],
  );

  if (!collection) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <BackBar />
        <EmptyState
          icon="layers"
          title="Collection unavailable"
          subtitle="This edit isn't published in the current issue."
          actionLabel="Back to the Galleria"
          onAction={() => window.history.back()}
        />
      </div>
    );
  }

  return (
    <div className="pb-20">
      <BackBar
        actions={
          <IconButton
            name="share"
            aria-label="Share collection"
            onClick={() =>
              share({
                url: `${window.location.origin}/galleria/collection/${collection.id}`,
                title: collection.title,
                copiedLabel: 'Collection link copied',
              })
            }
          />
        }
      />

      {/* Cover hero — editorial media with theme kicker and title over a
          legibility scrim, same grammar as the moodboard cover header. */}
      <div className="relative mx-4 mt-1 overflow-hidden rounded-xl sm:mx-6 lg:mx-auto lg:max-w-[1200px]">
        <div className="relative h-72 sm:h-96">
          <AppImage
            src={collection.coverUri}
            alt={collection.title}
            fill
            sizes="(max-width: 1200px) 100vw, 1200px"
            className="h-full w-full"
            focalPoint={collection.focalPoint}
            priority
            fallbackIcon="layers"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <p className="text-meta font-semibold uppercase tracking-widest text-scrim-text-secondary">
              {collection.theme}
            </p>
            <h1 className="mt-1 text-screen-title font-bold text-scrim-text-primary sm:text-display">
              {collection.title}
            </h1>
            <p className="mt-1.5 max-w-lg text-body text-scrim-text-secondary">
              {collection.dek}
            </p>
            <div className="mt-3 flex items-center gap-2 text-meta text-scrim-text-secondary">
              <Avatar
                src={collection.curator.avatarUri}
                name={collection.curator.name}
                size={22}
              />
              <span>
                Curated by {collection.curator.name} · {collection.curator.role}
              </span>
              <span aria-hidden>·</span>
              <span className="tnum">
                {items.length} {items.length === 1 ? 'piece' : 'pieces'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Pieces — the shoppable grid */}
      <section aria-label={`Pieces in ${collection.title}`} className="mx-auto mt-8 w-full max-w-[1200px] px-4 sm:px-6">
        {items.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <ProductTile key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="pricetag"
            title="This edit is being restocked"
            subtitle="The curator is refreshing the rail — check back soon."
            compact
          />
        )}
      </section>
    </div>
  );
}
