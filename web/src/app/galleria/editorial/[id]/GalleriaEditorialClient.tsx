'use client';

/**
 * Galleria editorial — the full article route promoted from the reader
 * sheet, mirroring the mobile GalleriaEditorialScreen: kicker + issue
 * eyebrow, serif headline, standfirst dek, hero media, byline block,
 * authored body, and a shoppable "Shop the story" embed — closing with
 * more stories from the issue.
 *
 * Existence is decided upstream by the server shell (galleria editorial
 * resolver in lib/api/server.ts → notFound()); the empty state below is
 * the client-side net for paths the server deferred.
 */

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { ProductTile } from '@/components/cards/ProductTile';
import { BackBar } from '@/components/profile/BackBar';
import { useShare } from '@/components/profile/useShare';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { mapListingToDiscoverySummary, type Listing } from '@/lib/contracts/domain';
import { listingById } from '@/lib/data/fixtures';
import {
  GALLERIA_EDITORIALS,
  type GalleriaEditorial,
} from '@/lib/data/fixtures-media';
import { DATA_MODE } from '@/lib/api/client';
import * as galleriaService from '@/lib/api/services/galleria';
import { formatDate } from '@/lib/utils/format';

const isLive = DATA_MODE === 'live';

export function GalleriaEditorialClient({
  initialEditorial,
}: {
  /** Server-resolved story — paints the article immediately while the
   *  detail query (story + same-issue siblings) is in flight. Never
   *  written into the query cache: its {editorial, siblings} composite
   *  is a different shape than the server's payload. */
  initialEditorial?: GalleriaEditorial;
}) {
  const params = useParams();
  const share = useShare();
  const id = String(params.id ?? '');

  const live = useQuery({
    queryKey: ['galleria', 'editorial', id],
    enabled: isLive && !!id,
    queryFn: async ({ signal }) => {
      const editorial = await galleriaService.fetchGalleriaEditorial(id, signal);
      if (!editorial) return { editorial: null, siblings: [] };
      // Siblings share the issue label — the mapper derives it from the
      // piece's own publish month, so this groups real contemporaries.
      const all = await galleriaService.fetchGalleriaEditorials(signal).catch(() => []);
      return {
        editorial,
        siblings: all
          .filter((e) => e.id !== id && e.issueLabel === editorial.issueLabel)
          .slice(0, 3),
      };
    },
    retry: false,
  });

  // The seed only stands in while the query is in flight — a resolved
  // null (unpublished/moved piece) must win over it, so the fallback
  // applies solely until data exists.
  const editorial = isLive
    ? (live.data === undefined ? initialEditorial : live.data.editorial)
    : GALLERIA_EDITORIALS.find((e) => e.id === id);

  const items = useMemo(
    () =>
      (editorial?.listingIds ?? [])
        .map(listingById)
        .filter((l): l is Listing => l != null)
        .map(mapListingToDiscoverySummary),
    [editorial],
  );
  const siblings = useMemo(
    () =>
      isLive
        ? (live.data?.siblings ?? [])
        : GALLERIA_EDITORIALS.filter(
            (e) => e.id !== id && e.issueLabel === editorial?.issueLabel,
          ).slice(0, 3),
    [id, editorial, live.data],
  );

  // A seeded story skips the skeleton — the server already resolved it;
  // only the sibling rail is still in flight.
  if (isLive && live.isLoading && !editorial) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6" aria-busy aria-label="Loading story">
        <Skeleton className="mt-4 h-4 w-40" />
        <Skeleton className="mt-4 h-10 w-3/4" />
        <Skeleton className="mt-3 h-5 w-1/2" />
        <Skeleton className="mt-8 aspect-[16/10] w-full rounded-xl" />
      </div>
    );
  }

  if (!editorial) {
    return (
      <div className="mx-auto max-w-[1440px]">
        <BackBar />
        <EmptyState
          icon="document"
          title="Story not found"
          subtitle="This piece may be unpublished or moved to the archive."
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
            aria-label="Share story"
            onClick={() =>
              share({
                url: `${window.location.origin}/galleria/editorial/${editorial.id}`,
                title: editorial.title.replace('\n', ' '),
                copiedLabel: 'Story link copied',
              })
            }
          />
        }
      />

      <article className="mx-auto w-full max-w-[860px] px-4 sm:px-6">
        {/* Eyebrow — issue + kicker, one quiet line */}
        <p className="pt-2 text-meta font-semibold uppercase tracking-wide text-text-muted">
          {editorial.issueLabel} · {editorial.kicker}
        </p>

        <h1 className="mt-3 max-w-2xl whitespace-pre-line text-editorial-display leading-[1.12] text-text-primary">
          {editorial.title}
        </h1>
        <p className="mt-3 max-w-xl text-body-large leading-relaxed text-text-secondary">
          {editorial.dek}
        </p>

        {/* Byline block */}
        <div className="mt-5 flex items-center gap-2.5 border-b border-border-subtle pb-5">
          <Avatar src={editorial.author.avatarUri} name={editorial.author.name} size={30} />
          <div className="min-w-0">
            <p className="text-body font-medium text-text-primary">
              {editorial.author.name}
              <span className="text-text-muted"> · {editorial.author.role}</span>
            </p>
            <p className="tnum text-meta text-text-muted">
              {formatDate(editorial.publishedAt)} · {editorial.readMinutes} min read
            </p>
          </div>
        </div>
      </article>

      {/* Hero media — article opener, full-bleed inside the page well */}
      <div className="mx-auto mt-6 w-full max-w-[1440px] px-4 sm:px-6">
        <div className="relative w-full overflow-hidden rounded-xl bg-surface-alt">
          <AppImage
            src={editorial.heroUri}
            alt={editorial.title.replace('\n', ' ')}
            aspectRatio={16 / 10}
            focalPoint={editorial.focalPoint}
            className="w-full"
            sizes="(min-width: 1440px) 1392px, 100vw"
            priority
          />
        </div>
      </div>

      <article className="mx-auto w-full max-w-[860px] px-4 sm:px-6">
        {/* Body copy */}
        <div className="mt-7 max-w-2xl space-y-5">
          {editorial.body.map((paragraph, i) => (
            <p key={i} className="text-body-large leading-relaxed text-text-secondary">
              {paragraph}
            </p>
          ))}
        </div>

        {/* Shop the story — shoppable embed */}
        <section aria-label="Shop the story" className="mt-10">
          <div className="flex items-baseline justify-between border-b border-border-subtle pb-3">
            <h2 className="text-section-title font-semibold text-text-primary">
              Shop the story
            </h2>
            {items.length > 0 ? (
              <span className="tnum text-meta text-text-muted">
                {items.length} {items.length === 1 ? 'piece' : 'pieces'}
              </span>
            ) : null}
          </div>
          {items.length > 0 ? (
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
              {items.map((item) => (
                <ProductTile key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-body text-text-secondary">
              Every piece in this story has found a home — check the rail for
              the next edit.
            </p>
          )}
        </section>

        {/* More from the issue */}
        {siblings.length > 0 ? (
          <nav aria-label={`More from ${editorial.issueLabel}`} className="mt-12 border-t border-border-subtle pt-5">
            <h2 className="text-meta font-semibold uppercase tracking-wide text-text-muted">
              More from {editorial.issueLabel}
            </h2>
            <ul className="mt-3 divide-y divide-border-subtle">
              {siblings.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/galleria/editorial/${e.id}`}
                    className="pressable group flex items-center gap-4 py-3"
                  >
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                      <AppImage
                        src={e.heroUri}
                        alt=""
                        fill
                        sizes="56px"
                        focalPoint={e.focalPoint}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-meta text-text-muted">{e.kicker}</span>
                      <span className="clamp-1 block text-body font-medium text-text-primary group-hover:underline">
                        {e.title.replace('\n', ' ')}
                      </span>
                    </span>
                    <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </article>
    </div>
  );
}
