'use client';

/**
 * GalleriaSheets — the two reader surfaces.
 * EditorialSheet: hero media + serif headline + byline + body copy + a
 * shoppable "Shop the story" grid (existing Sheet item-browser pattern).
 * CollectionSheet: unchanged grammar — dek + pieces grid.
 */

import { listingById } from '@/lib/data/fixtures';
import { mapListingToDiscoverySummary, type Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { ProductTile } from '@/components/cards/ProductTile';
import { formatDate } from '@/lib/utils/format';
import type {
  GalleriaEditorial,
  GalleriaFeaturedCollection,
} from '@/lib/data/fixtures-media';

function resolveListings(ids: string[]): Listing[] {
  return ids.map(listingById).filter((l): l is Listing => l != null);
}

export function EditorialSheet({
  editorial,
  onClose,
}: {
  editorial: GalleriaEditorial | null;
  onClose: () => void;
}) {
  const items = resolveListings(editorial?.listingIds ?? []).map(mapListingToDiscoverySummary);

  return (
    <Sheet
      open={editorial != null}
      onClose={onClose}
      title={editorial ? `${editorial.issueLabel} · ${editorial.kicker}` : undefined}
      maxWidth={900}
    >
      {editorial ? (
        <article>
          {/* Hero — article opener, scrim-free beneath the fold */}
          <div className="relative w-full overflow-hidden">
            <AppImage
              src={editorial.heroUri}
              alt={editorial.title.replace('\n', ' ')}
              fill
              aspectRatio={16 / 10}
              focalPoint={editorial.focalPoint}
              className="h-full w-full"
              sizes="(max-width: 900px) 100vw, 900px"
              priority
            />
          </div>

          <div className="px-5 py-6 sm:px-8">
            <h3 className="max-w-xl whitespace-pre-line text-editorial-display leading-[1.15] text-text-primary">
              {editorial.title}
            </h3>

            {/* Byline block */}
            <div className="mt-4 flex items-center gap-2.5 border-b border-border-subtle pb-5">
              <Avatar src={editorial.author.avatarUri} name={editorial.author.name} size={28} />
              <div className="min-w-0">
                <p className="text-body font-medium text-text-primary">
                  {editorial.author.name}
                  <span className="text-text-muted"> · {editorial.author.role}</span>
                </p>
                <p className="text-meta text-text-muted">
                  {formatDate(editorial.publishedAt)} · {editorial.readMinutes} min read
                </p>
              </div>
            </div>

            {/* Body copy */}
            <div className="mt-5 max-w-xl space-y-4">
              {editorial.body.map((paragraph, i) => (
                <p key={i} className="text-body-large leading-relaxed text-text-secondary">
                  {paragraph}
                </p>
              ))}
            </div>

            {/* Shop the story */}
            {items.length > 0 ? (
              <>
                <div className="mt-8 flex items-baseline justify-between border-b border-border-subtle pb-3">
                  <h4 className="text-section-title font-semibold text-text-primary">
                    Shop the story
                  </h4>
                  <span className="tnum text-meta text-text-muted">{items.length} pieces</span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
                  {items.map((item) => (
                    <ProductTile key={item.id} item={item} />
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-8 border-t border-border-subtle py-8 text-center text-body text-text-secondary">
                Every piece in this story has found a home — check the rail for the next edit.
              </p>
            )}
          </div>
        </article>
      ) : null}
    </Sheet>
  );
}

export function CollectionSheet({
  collection,
  onClose,
}: {
  collection: GalleriaFeaturedCollection | null;
  onClose: () => void;
}) {
  const items = resolveListings(collection?.listingIds ?? []).map(mapListingToDiscoverySummary);

  return (
    <Sheet open={collection != null} onClose={onClose} title={collection?.title} maxWidth={900}>
      {collection ? (
        <div className="px-5 py-5">
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
