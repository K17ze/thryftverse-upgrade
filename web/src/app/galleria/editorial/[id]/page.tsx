'use client';

/**
 * Galleria editorial — the full article route promoted from the reader
 * sheet, mirroring the mobile GalleriaEditorialScreen: kicker + issue
 * eyebrow, serif headline, standfirst dek, hero media, byline block,
 * authored body, and a shoppable "Shop the story" embed — closing with
 * more stories from the issue.
 */

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { ProductTile } from '@/components/cards/ProductTile';
import { BackBar } from '@/components/profile/BackBar';
import { useShare } from '@/components/profile/useShare';
import { IconButton } from '@/components/ui/IconButton';
import { mapListingToDiscoverySummary, type Listing } from '@/lib/contracts/domain';
import { listingById } from '@/lib/data/fixtures';
import { GALLERIA_EDITORIALS } from '@/lib/data/fixtures-media';
import { formatDate } from '@/lib/utils/format';

export default function GalleriaEditorialPage() {
  const params = useParams();
  const share = useShare();
  const id = String(params.id ?? '');
  const editorial = GALLERIA_EDITORIALS.find((e) => e.id === id);

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
      GALLERIA_EDITORIALS.filter(
        (e) => e.id !== id && e.issueLabel === editorial?.issueLabel,
      ).slice(0, 3),
    [id, editorial],
  );

  if (!editorial) {
    return (
      <div className="mx-auto max-w-[1200px]">
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
        <p className="pt-2 text-meta font-semibold uppercase tracking-widest text-text-muted">
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
      <div className="mx-auto mt-6 w-full max-w-[1200px] px-4 sm:px-6">
        <div className="relative w-full overflow-hidden rounded-xl bg-surface-alt">
          <AppImage
            src={editorial.heroUri}
            alt={editorial.title.replace('\n', ' ')}
            aspectRatio={16 / 10}
            focalPoint={editorial.focalPoint}
            className="w-full"
            sizes="(max-width: 1200px) 100vw, 1200px"
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
            <h2 className="text-meta font-semibold uppercase tracking-widest text-text-muted">
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
