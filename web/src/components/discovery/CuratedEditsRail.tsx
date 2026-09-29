'use client';

/**
 * CuratedEditsRail — the "Curated edits" band on Explore. Member-authored
 * collections rendered as cover cards that deep-link to the shareable
 * landing at /explore/collection/[id] — the same mobile mechanic
 * (ExploreCollection opens a real destination, not a sheet).
 *
 * Live mode reads the real curated content — GET /galleria/collections,
 * the same server-authored source the collections hub's CuratedRail uses
 * (auth-gated, so guests get no rail rather than a fabricated edit). An
 * empty or failed serve hides the rail entirely — fixture collections
 * never stand in for live content. Fixture mode keeps the bundled
 * CURATED_COLLECTIONS, whose ids the landing resolves locally.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ModuleSection } from '@/components/home/modules/ModuleSection';
import { Rail } from '@/components/home/modules/Rail';
import {
  CURATED_COLLECTIONS,
  curatorFor,
  type CuratedCollection,
} from '@/lib/data/fixtures-collections';
import { DATA_MODE } from '@/lib/api/client';
import { fetchGalleriaCollections } from '@/lib/api/services/galleria';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';

const LIVE = DATA_MODE === 'live';

/** Normalized card — fixture curated edits and live Galleria collections
 *  resolve to the same shape so the rail never branches mid-render. */
interface CuratedEditCardData {
  id: string;
  title: string;
  theme: string;
  coverUri: string;
  pieceCount: number;
  curatorName: string | null;
  curatorAvatar: string | null;
  curatorVerified: boolean;
}

const fixtureCard = (c: CuratedCollection): CuratedEditCardData => {
  const curator = curatorFor(c);
  return {
    id: c.id,
    title: c.title,
    theme: c.theme,
    coverUri: c.coverUri,
    pieceCount: c.itemIds.length,
    curatorName: curator ? `@${curator.username}` : null,
    curatorAvatar: curator?.avatar ?? null,
    curatorVerified: curator?.isVerified === true,
  };
};

function CuratedEditCard({ collection }: { collection: CuratedEditCardData }) {
  return (
    <Link
      href={`/explore/collection/${collection.id}`}
      role="listitem"
      aria-label={`${collection.title} — ${collection.pieceCount} pieces, curated by ${
        collection.curatorName ?? 'ThryftVerse'
      }`}
      className="pressable group relative block aspect-[3/4] w-[200px] shrink-0 snap-start overflow-hidden rounded-lg bg-surface-alt sm:w-[230px]"
    >
      <AppImage
        src={collection.coverUri}
        alt={collection.title}
        fill
        sizes="(max-width: 640px) 200px, 230px"
        className="h-full w-full media-zoom"
        fallbackIcon="layers"
      />
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
    </Link>
  );
}

export function CuratedEditsRail() {
  const { isGuest } = useSession();
  const hydrated = useHydrated();

  // Live: the rail is the same server-authored content as
  // /galleria/collections (auth-gated — guests get no fabricated edit).
  const liveQuery = useQuery({
    queryKey: ['explore', 'curated-live'],
    queryFn: ({ signal }) => fetchGalleriaCollections(signal),
    enabled: LIVE && hydrated && !isGuest,
    staleTime: 10 * 60_000,
  });

  if (!LIVE && CURATED_COLLECTIONS.length === 0) return null;
  if (LIVE && (!hydrated || isGuest)) return null;

  const cards: CuratedEditCardData[] = LIVE
    ? (liveQuery.data ?? [])
        .filter((c) => c.coverUri)
        .map((c) => ({
          id: c.id,
          title: c.title,
          theme: c.theme,
          coverUri: c.coverUri,
          pieceCount: c.listingIds.length,
          curatorName: c.curator.name === 'ThryftVerse' ? null : c.curator.name,
          curatorAvatar: c.curator.avatarUri || null,
          curatorVerified: false,
        }))
    : CURATED_COLLECTIONS.map(fixtureCard);

  // Live empty or failed serve — hide the rail rather than render
  // fixture stand-ins that would link to unresolvable ids.
  if (LIVE && (liveQuery.isError || (!liveQuery.isLoading && cards.length === 0))) {
    return null;
  }

  return (
    <ModuleSection title="Curated edits" href="/collections">
      <Rail label="Curated collections by members">
        {LIVE && liveQuery.isLoading
          ? [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton aspect-[3/4] w-[200px] shrink-0 rounded-lg sm:w-[230px]"
                aria-hidden
              />
            ))
          : cards.map((c) => <CuratedEditCard key={c.id} collection={c} />)}
      </Rail>
    </ModuleSection>
  );
}
