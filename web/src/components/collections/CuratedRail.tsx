'use client';

/**
 * CuratedRail — the "Curated" section of the collections hub. Editorial
 * collections authored by members, rendered as large cover cards on a
 * snap rail (mobile DiscoveryCollectionRailCard grammar: scrim, theme
 * kicker, title, curator identity). Opening a card shows the edit in a
 * sheet — the same interaction the Galleria established on web.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { DATA_MODE } from '@/lib/api/client';
import { fetchGalleriaCollection, fetchGalleriaCollections } from '@/lib/api/services/galleria';
import { fetchListingById } from '@/lib/api/services/listings';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { timeAgo } from '@/lib/utils/format';

const LIVE = DATA_MODE === 'live';

/** Normalized card — fixture collections and live Galleria collections
 *  resolve to the same shape so the rail never branches mid-render. */
interface CuratedCardData {
  id: string;
  title: string;
  dek: string;
  theme: string;
  curatorName: string | null;
  curatorAvatar: string | null;
  curatorVerified: boolean;
  coverUri: string;
  pieceCount: number;
  publishedAt?: string;
}

const fixtureCard = (c: CuratedCollection): CuratedCardData => {
  const curator = curatorFor(c);
  return {
    id: c.id,
    title: c.title,
    dek: c.dek,
    theme: c.theme,
    curatorName: curator ? `@${curator.username}` : null,
    curatorAvatar: curator?.avatar ?? null,
    curatorVerified: curator?.isVerified === true,
    coverUri: c.coverUri,
    pieceCount: c.itemIds.length,
    publishedAt: c.publishedAt,
  };
};

function CuratedCard({
  collection,
  onOpen,
}: {
  collection: CuratedCardData;
  onOpen: (c: CuratedCardData) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(collection)}
      className="pressable group block w-[220px] shrink-0 snap-start text-left sm:w-[260px] lg:w-[300px]"
      aria-label={`${collection.title} — ${collection.pieceCount} pieces, curated by ${collection.curatorName ?? 'ThryftVerse'}`}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={collection.coverUri}
          alt={collection.title}
          fill
          sizes="(max-width: 640px) 220px, (max-width: 1024px) 260px, 300px"
          className="h-full w-full transition-transform duration-300 group-hover:scale-105"
          fallbackIcon="layers"
        />
        {/* Media scrim — legibility only */}
        <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="text-label text-scrim-text-secondary">
            {collection.theme}
          </p>
          <h3 className="clamp-1 mt-1 text-item-title font-semibold text-scrim-text-primary">
            {collection.title}
          </h3>
          {collection.curatorName ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-meta text-scrim-text-secondary">
              <Avatar src={collection.curatorAvatar} name={collection.curatorName} size={18} />
              <span className="clamp-1 font-medium">{collection.curatorName}</span>
              {collection.curatorVerified ? (
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
  collection: CuratedCardData | null;
  onClose: () => void;
}) {
  // Live: the card's count covers collection-item rows; the shoppable
  // sheet resolves the detail's real listingId values to real listings.
  const detailQuery = useQuery({
    queryKey: ['galleria', 'collection-sheet', collection?.id],
    queryFn: async ({ signal }) => {
      const detail = await fetchGalleriaCollection(collection!.id, signal);
      if (!detail) return [];
      const ids = detail.items
        .map((i) => i.listingId)
        .filter((v): v is string => Boolean(v));
      const resolved = await Promise.all(
        ids.map((id) => fetchListingById(id, signal).catch(() => null)),
      );
      return resolved.filter((l): l is NonNullable<typeof l> => l !== null);
    },
    enabled: LIVE && collection !== null,
    staleTime: 5 * 60_000,
  });

  const items = !collection
    ? []
    : LIVE
      ? (detailQuery.data ?? []).map(mapListingToDiscoverySummary)
      : (CURATED_COLLECTIONS.find((c) => c.id === collection.id)?.itemIds ?? [])
          .map(listingById)
          .filter((l): l is NonNullable<typeof l> => l != null)
          .map(mapListingToDiscoverySummary);

  return (
    <Sheet open={collection != null} onClose={onClose} title={collection?.title} ariaLabel="Collection" maxWidth={900}>
      {collection ? (
        <div className="px-5 py-5">
          {collection.curatorName ? (
            <div className="mb-3 flex items-center gap-2">
              <Avatar src={collection.curatorAvatar} name={collection.curatorName} size={24} />
              <span className="text-meta font-semibold text-text-secondary">
                {collection.curatorName}
              </span>
              {collection.curatorVerified ? (
                <Icon name="verified" filled size={12} className="text-commerce-trust" />
              ) : null}
              <span aria-hidden className="text-meta text-text-muted">
                ·
              </span>
              <span className="tnum text-meta text-text-muted">
                {collection.pieceCount}{' '}
                {collection.pieceCount === 1 ? 'piece' : 'pieces'}
              </span>
              {collection.publishedAt ? (
                <>
                  <span aria-hidden className="text-meta text-text-muted">
                    ·
                  </span>
                  <span className="text-meta text-text-muted">
                    {timeAgo(collection.publishedAt)}
                  </span>
                </>
              ) : null}
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
  const [open, setOpen] = useState<CuratedCardData | null>(null);
  const { isGuest } = useSession();
  const hydrated = useHydrated();

  // Live: the Curated section is the same server-authored content as
  // /galleria/collections (auth-gated — guests get no fabricated edit).
  const liveQuery = useQuery({
    queryKey: ['collections', 'curated-live'],
    queryFn: ({ signal }) => fetchGalleriaCollections(signal),
    enabled: LIVE && hydrated && !isGuest,
    staleTime: 10 * 60_000,
  });

  if (!LIVE && CURATED_COLLECTIONS.length === 0) return null;
  if (LIVE && (!hydrated || isGuest)) return null;

  const cards: CuratedCardData[] = LIVE
    ? (liveQuery.data ?? [])
        .filter((c) => c.coverUri)
        .map((c) => ({
          id: c.id,
          title: c.title,
          dek: c.dek,
          theme: c.theme,
          curatorName: c.curator.name === 'ThryftVerse' ? null : c.curator.name,
          curatorAvatar: c.curator.avatarUri || null,
          curatorVerified: false,
          coverUri: c.coverUri,
          pieceCount: c.listingIds.length,
        }))
    : CURATED_COLLECTIONS.map(fixtureCard);

  if (LIVE && !liveQuery.isLoading && cards.length === 0) return null;

  return (
    <section aria-label="Curated collections" className="mt-10">
      <div className="flex items-baseline justify-between border-b border-border-subtle px-4 pb-3 sm:px-6">
        <h2 className="text-section-title font-semibold text-text-primary">Curated</h2>
        <span className="text-meta text-text-muted">Picked by members</span>
      </div>

      <div className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:px-6">
        {LIVE && liveQuery.isLoading
          ? [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton aspect-[3/4] w-[220px] shrink-0 rounded-lg sm:w-[260px] lg:w-[300px]"
              />
            ))
          : cards.map((c) => <CuratedCard key={c.id} collection={c} onOpen={setOpen} />)}
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
            className="skeleton aspect-[3/4] w-[220px] shrink-0 rounded-lg sm:w-[260px] lg:w-[300px]"
          />
        ))}
      </div>
    </section>
  );
}
