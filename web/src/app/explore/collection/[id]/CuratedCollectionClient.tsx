'use client';

/**
 * Curated collection landing — /explore/collection/[id].
 *
 * The shareable destination behind the CuratedEdits rail (and any shared
 * link): a media hero carrying the collection's cover, theme kicker and
 * editorial title, the curator's identity and publish date as honest
 * provenance, the dek as the intro line, then the edit itself as a
 * masonry of live listings.
 *
 * Fixture truth: collections are member-authored records in
 * fixtures-collections; every item id resolves against the real
 * catalogue — a piece that no longer resolves drops out of the grid,
 * never renders a dead card.
 *
 * Existence: the server shell 404s fixture misses; live curated edits
 * are member-gated and the server carries no session, so the members
 * wall / not-found verdict below stays this view's own.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MasonryGrid, useMasonryColumns } from '@/components/feed/MasonryGrid';
import { BackBar } from '@/components/profile/BackBar';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { MasonrySkeleton } from '@/components/ui/Skeleton';
import { useShare } from '@/components/profile/useShare';
import { curatedById, curatorFor } from '@/lib/data/fixtures-collections';
import { listingById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { fetchGalleriaCollection } from '@/lib/api/services/galleria';
import { fetchListingById } from '@/lib/api/services/listings';
import { useSession } from '@/lib/session/SessionProvider';
import {
  mapListingToDiscoverySummary,
  type DiscoveryFeedUnit,
} from '@/lib/contracts/domain';
import { formatDate, timeAgo } from '@/lib/utils/format';

const LIVE = DATA_MODE === 'live';

/** Normalized page model — fixture curated edits and live Galleria
 *  collections share one render. */
interface CuratedPage {
  title: string;
  dek: string;
  theme: string;
  coverUri: string;
  curatorName: string | null;
  curatorUsername: string | null;
  curatorAvatar: string | null;
  curatorVerified: boolean;
  publishedAt: string | null;
  units: DiscoveryFeedUnit[];
}

export function CuratedCollectionClient() {
  const params = useParams();
  const router = useRouter();
  const share = useShare();
  const columns = useMasonryColumns();
  const { sessionLoading } = useSession();

  const id = String(params.id ?? '');
  // /galleria/* GETs are public server-side and native shows these to
  // guests — no member wall.
  const liveQuery = useQuery({
    queryKey: ['explore-collection', id],
    queryFn: async ({ signal }) => {
      const detail = await fetchGalleriaCollection(id, signal);
      if (!detail) return null;
      const listingIds = detail.items
        .map((i) => i.listingId)
        .filter((v): v is string => Boolean(v));
      const resolved = await Promise.all(
        listingIds.map((lid) => fetchListingById(lid, signal).catch(() => null)),
      );
      const units: DiscoveryFeedUnit[] = resolved
        .filter((l): l is NonNullable<typeof l> => l !== null)
        .map((l) => ({
          type: 'listing',
          id: `curated-${id}-${l.id}`,
          listing: mapListingToDiscoverySummary(l),
        }));
      const c = detail.collection;
      return {
        title: c.title,
        dek: c.dek,
        theme: c.theme,
        coverUri: c.coverUri,
        curatorName: c.curator.name === 'ThryftVerse' ? null : c.curator.name,
        curatorUsername: null,
        curatorAvatar: c.curator.avatarUri || null,
        curatorVerified: false,
        publishedAt: c.publishedAt ?? null,
        units,
      } satisfies CuratedPage;
    },
    enabled: LIVE,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const page = useMemo<CuratedPage | null>(() => {
    if (LIVE) return liveQuery.data ?? null;
    const collection = curatedById(id);
    if (!collection) return null;
    const curator = curatorFor(collection);
    return {
      title: collection.title,
      dek: collection.dek,
      theme: collection.theme,
      coverUri: collection.coverUri,
      curatorName: curator ? `@${curator.username}` : null,
      curatorUsername: curator?.username ?? null,
      curatorAvatar: curator?.avatar ?? null,
      curatorVerified: curator?.isVerified === true,
      publishedAt: collection.publishedAt,
      units: collection.itemIds
        .map(listingById)
        .filter((l): l is NonNullable<typeof l> => l != null)
        .map((l) => ({
          type: 'listing',
          id: `curated-${id}-${l.id}`,
          listing: mapListingToDiscoverySummary(l),
        })),
    };
  }, [id, liveQuery.data]);

  if (LIVE && (sessionLoading || liveQuery.isLoading)) {
    return (
      <div className="mx-auto max-w-[1440px]">
        <BackBar />
        <div className="mx-4 mt-1 h-52 rounded-xl bg-surface-alt sm:mx-6 sm:h-72" aria-hidden />
        <div className="mt-4">
          <MasonrySkeleton columns={columns} />
        </div>
      </div>
    );
  }

  if (LIVE && liveQuery.isError) {
    return (
      <div className="mx-auto max-w-[1440px]">
        <BackBar />
        <EmptyState
          icon="image"
          title="Couldn't load this collection"
          subtitle="The curated edit couldn't be reached. Try again in a moment."
          actionLabel="Retry"
          onAction={() => void liveQuery.refetch()}
        />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="mx-auto max-w-[1440px]">
        <BackBar />
        <EmptyState
          icon="layers"
          title="Collection not found"
          subtitle="This edit doesn't exist or may have been taken down."
          actionLabel="Back to explore"
          onAction={() => router.push('/explore')}
        />
      </div>
    );
  }

  const shareCollection = () =>
    share({
      url: `${window.location.origin}/explore/collection/${id}`,
      title: page.title,
      copiedLabel: 'Collection link copied',
    });

  return (
    <div className="mx-auto max-w-[1440px]">
      <BackBar
        actions={
          <IconButton name="share" aria-label="Share collection" onClick={shareCollection} />
        }
      />

      {/* Hero — the collection's own cover carries the title; the scrim
          is legibility-only. Theme kicker → editorial title → curator. */}
      <div className="relative mx-4 mt-1 overflow-hidden rounded-xl sm:mx-6">
        <div className="relative h-52 w-full sm:h-72">
          <AppImage
            src={page.coverUri}
            alt={page.title}
            fill
            sizes="(max-width: 1440px) 100vw, 1440px"
            priority
            className="h-full w-full"
            fallbackIcon="layers"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-media-overlay-scrim/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <p className="text-label text-scrim-text-secondary">
            {page.theme} · Curated edit
          </p>
          <h1 className="clamp-2 mt-1.5 max-w-xl text-editorial-display text-scrim-text-primary">
            {page.title}
          </h1>
          {page.curatorName ? (
            <p className="mt-2.5 flex items-center gap-2 text-caption text-scrim-text-secondary">
              <Avatar src={page.curatorAvatar} name={page.curatorName} size={22} />
              {page.curatorUsername ? (
                <Link
                  href={`/u/${page.curatorUsername}`}
                  className="font-semibold text-scrim-text-primary hover:opacity-80"
                >
                  {page.curatorName}
                </Link>
              ) : (
                <span className="font-semibold text-scrim-text-primary">
                  {page.curatorName}
                </span>
              )}
              {page.curatorVerified ? (
                <Icon name="verified" filled size={13} className="text-scrim-text-primary" />
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      {/* Editorial intro + provenance — the dek is the authored line;
          provenance stays factual: piece count and publish date. */}
      <div className="px-4 pb-2 pt-4 sm:px-6">
        <p className="max-w-2xl text-body-large text-text-primary">{page.dek}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-meta text-text-muted">
          <span className="tnum">
            {page.units.length} {page.units.length === 1 ? 'piece' : 'pieces'}
          </span>
          <span aria-hidden>·</span>
          <span>
            {page.curatorName
              ? `Picked by ${page.curatorName}`
              : 'Picked by the ThryftVerse team'}
          </span>
          {page.publishedAt ? (
            <>
              <span aria-hidden>·</span>
              <span>Published {formatDate(page.publishedAt)}</span>
            </>
          ) : null}
        </p>
        <p className="mt-1 text-meta text-text-muted">
          Every piece is a live listing — prices and availability are the sellers&apos; own.
        </p>
      </div>

      {/* The edit — the same masonry grammar as the feed it came from. */}
      <div className="mt-4">
        {page.units.length > 0 ? (
          <MasonryGrid units={page.units} columns={columns} />
        ) : (
          <EmptyState
            icon="layers"
            title="This edit is being restocked"
            subtitle={
              page.publishedAt
                ? `Curated ${timeAgo(page.publishedAt)} — pieces sell through fast. Check back soon.`
                : 'Pieces sell through fast — check back soon.'
            }
            actionLabel="Explore more"
            onAction={() => router.push('/explore')}
            compact
          />
        )}
      </div>
    </div>
  );
}
