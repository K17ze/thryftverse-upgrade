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
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { MasonryGrid, useMasonryColumns } from '@/components/feed/MasonryGrid';
import { BackBar } from '@/components/profile/BackBar';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useShare } from '@/components/profile/useShare';
import { curatedById, curatorFor } from '@/lib/data/fixtures-collections';
import { listingById } from '@/lib/data/fixtures';
import {
  mapListingToDiscoverySummary,
  type DiscoveryFeedUnit,
} from '@/lib/contracts/domain';
import { formatDate, timeAgo } from '@/lib/utils/format';

export default function CuratedCollectionPage() {
  const params = useParams();
  const router = useRouter();
  const share = useShare();
  const columns = useMasonryColumns();

  const id = String(params.id ?? '');
  const collection = curatedById(id);
  const curator = collection ? curatorFor(collection) : null;

  const units = useMemo<DiscoveryFeedUnit[]>(
    () =>
      (collection?.itemIds ?? [])
        .map(listingById)
        .filter((l): l is NonNullable<typeof l> => l != null)
        .map((l) => ({
          type: 'listing',
          id: `curated-${id}-${l.id}`,
          listing: mapListingToDiscoverySummary(l),
        })),
    [collection, id],
  );

  if (!collection) {
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
      url: `${window.location.origin}/explore/collection/${collection.id}`,
      title: collection.title,
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
            src={collection.coverUri}
            alt={collection.title}
            fill
            sizes="(max-width: 1440px) 100vw, 1440px"
            priority
            className="h-full w-full"
            fallbackIcon="layers"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-media-overlay-scrim/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <p className="text-label font-semibold uppercase tracking-[0.14em] text-scrim-text-secondary">
            {collection.theme} · Curated edit
          </p>
          <h1 className="clamp-2 mt-1.5 max-w-xl text-editorial-display text-scrim-text-primary">
            {collection.title}
          </h1>
          {curator ? (
            <p className="mt-2.5 flex items-center gap-2 text-caption text-scrim-text-secondary">
              <Avatar src={curator.avatar} name={curator.username} size={22} />
              <Link
                href={`/u/${curator.username}`}
                className="font-semibold text-scrim-text-primary hover:opacity-80"
              >
                @{curator.username}
              </Link>
              {curator.isVerified ? (
                <Icon name="verified" filled size={13} className="text-scrim-text-primary" />
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      {/* Editorial intro + provenance — the dek is the authored line;
          provenance stays factual: piece count and publish date. */}
      <div className="px-4 pb-2 pt-4 sm:px-6">
        <p className="max-w-2xl text-body-large text-text-primary">{collection.dek}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-meta text-text-muted">
          <span className="tnum">
            {units.length} {units.length === 1 ? 'piece' : 'pieces'}
          </span>
          <span aria-hidden>·</span>
          <span>
            {curator ? `Picked by @${curator.username}` : 'Picked by the ThryftVerse team'}
          </span>
          <span aria-hidden>·</span>
          <span>Published {formatDate(collection.publishedAt)}</span>
        </p>
        <p className="mt-1 text-meta text-text-muted">
          Every piece is a live listing — prices and availability are the sellers&apos; own.
        </p>
      </div>

      {/* The edit — the same masonry grammar as the feed it came from. */}
      <div className="mt-4">
        {units.length > 0 ? (
          <MasonryGrid units={units} columns={columns} />
        ) : (
          <EmptyState
            icon="layers"
            title="This edit is being restocked"
            subtitle={`Curated ${timeAgo(collection.publishedAt)} — pieces sell through fast. Check back soon.`}
            actionLabel="Explore more"
            onAction={() => router.push('/explore')}
            compact
          />
        )}
      </div>
    </div>
  );
}
