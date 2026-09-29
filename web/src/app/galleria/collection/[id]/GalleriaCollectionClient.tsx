'use client';

/**
 * Galleria collection — the full route promoted from the collection
 * sheet, mirroring the mobile GalleriaCollectionDetailScreen: cover hero
 * with theme kicker + title + dek + curator row, then the pieces as a
 * shoppable grid. Honest states for unknown or empty edits.
 *
 * Existence is decided upstream by the server shell (galleria collection
 * resolver in lib/api/server.ts → notFound()); the empty state below is
 * the client-side net for paths the server deferred.
 */

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { ProductTile } from '@/components/cards/ProductTile';
import { BackBar } from '@/components/profile/BackBar';
import { useShare } from '@/components/profile/useShare';
import { Skeleton } from '@/components/ui/Skeleton';
import { mapListingToDiscoverySummary, type Listing } from '@/lib/contracts/domain';
import { listingById } from '@/lib/data/fixtures';
import { GALLERIA_FEATURED_COLLECTIONS } from '@/lib/data/fixtures-media';
import { DATA_MODE } from '@/lib/api/client';
import * as galleriaService from '@/lib/api/services/galleria';
import * as listingsService from '@/lib/api/services/listings';

const isLive = DATA_MODE === 'live';

export function GalleriaCollectionClient() {
  const params = useParams();
  const share = useShare();
  const id = String(params.id ?? '');

  const live = useQuery({
    queryKey: ['galleria', 'collection', id],
    enabled: isLive && !!id,
    queryFn: async ({ signal }) => {
      const detail = await galleriaService.fetchGalleriaCollection(id, signal);
      if (!detail) return null;
      // Items link to real listings through listingId — resolve only
      // those; media-only items have no PDP to route to, so they render
      // as non-linkable editorial cards below.
      const resolved = await Promise.all(
        detail.items.map(async (item) => ({
          item,
          listing: item.listingId
            ? await listingsService.fetchListingById(item.listingId, signal).catch(() => null)
            : null,
        })),
      );
      return { ...detail, resolved };
    },
    retry: false,
  });

  const fixtureCollection = isLive
    ? undefined
    : GALLERIA_FEATURED_COLLECTIONS.find((c) => c.id === id);
  const collection = isLive ? live.data?.collection : fixtureCollection;

  const items = useMemo(() => {
    if (isLive) {
      return (live.data?.resolved ?? [])
        .filter((r): r is { item: galleriaService.ApiGalleriaItem; listing: Listing } => r.listing != null)
        .map((r) => mapListingToDiscoverySummary(r.listing));
    }
    return (collection?.listingIds ?? [])
      .map(listingById)
      .filter((l): l is Listing => l != null)
      .map(mapListingToDiscoverySummary);
  }, [collection, live.data]);

  // Media-only pieces — real collection items with no listing link. They
  // still belong in the edit; they just don't route to a PDP.
  const mediaOnly = useMemo(
    () => (isLive ? (live.data?.resolved ?? []).filter((r) => r.listing == null).map((r) => r.item) : []),
    [live.data],
  );

  if (isLive && live.isLoading) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6" aria-busy aria-label="Loading collection">
        <Skeleton className="mt-1 h-72 w-full rounded-xl sm:h-96" />
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="mx-auto max-w-[1440px]">
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
      <div className="relative mx-4 mt-1 overflow-hidden rounded-xl sm:mx-6 2xl:mx-auto 2xl:max-w-[1392px]">
        <div className="relative h-72 sm:h-96">
          <AppImage
            src={collection.coverUri}
            alt={collection.title}
            fill
            sizes="(min-width: 1536px) 1392px, 100vw"
            className="h-full w-full"
            focalPoint={collection.focalPoint}
            priority
            fallbackIcon="layers"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <p className="text-meta font-semibold uppercase tracking-wide text-scrim-text-secondary">
              {collection.theme}
            </p>
            <h1 className="mt-1 text-screen-title text-scrim-text-primary sm:text-display">
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
      <section aria-label={`Pieces in ${collection.title}`} className="mx-auto mt-8 w-full max-w-[1440px] px-4 sm:px-6">
        {items.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <ProductTile key={item.id} item={item} />
            ))}
          </div>
        ) : null}
        {mediaOnly.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {mediaOnly.map((item) => (
              <figure key={item.id}>
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-surface-alt">
                  <AppImage
                    src={item.image}
                    alt={item.title}
                    fill
                    aspectRatio={item.aspectRatio || 4 / 5}
                    className="h-full w-full"
                    sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 20vw"
                  />
                </div>
                <figcaption className="mt-2 px-0.5">
                  <p className="clamp-1 text-body text-text-primary">{item.title}</p>
                  {item.story ? (
                    <p className="clamp-2 mt-0.5 text-meta text-text-secondary">{item.story}</p>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
        {items.length === 0 && mediaOnly.length === 0 ? (
          <EmptyState
            icon="pricetag"
            title="This edit is being restocked"
            subtitle="The curator is refreshing the rail — check back soon."
            compact
          />
        ) : null}
      </section>
    </div>
  );
}
