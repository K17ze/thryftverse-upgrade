'use client';

/**
 * SellPreviewCard — the listing as it will appear in the feed.
 * ProductTile's visual grammar (media → brand → title → price → seller)
 * as a non-interactive preview.
 */

import type { User } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { parsePriceInput, type SellDraft } from './constants';

interface SellPreviewCardProps {
  draft: SellDraft;
  seller: User;
  /** Staged-media lookup — a video slot's tile shows its poster still. */
  mediaOf?: (src: string) => { kind?: 'image' | 'video'; poster?: string | null } | undefined;
}

export function SellPreviewCard({ draft, seller, mediaOf }: SellPreviewCardProps) {
  const price = parsePriceInput(draft.price);
  // Cover = the first image-kind slot (the publish contract's rule — a
  // leading video never serves as the still cover); an all-video draft
  // falls back to the first video's poster still, never a raw video uri
  // into an <img>.
  const coverSrc = (() => {
    let firstPoster: string | null = null;
    for (const src of draft.photos) {
      const m = mediaOf?.(src);
      if (m?.kind === 'video') {
        firstPoster = firstPoster ?? m.poster ?? null;
        continue;
      }
      return src;
    }
    return firstPoster ?? draft.photos[0] ?? null;
  })();

  return (
    <article className="w-full max-w-[300px]">
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={coverSrc}
          alt={draft.title.trim() || 'Listing photo'}
          aspectRatio={0.8}
          sizes="300px"
          fallbackIcon="image"
        />
        {draft.photos.length > 1 ? (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-overlay text-scrim-text-primary">
            <Icon name="images" size={14} />
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 px-1 pt-2">
        {draft.brand.trim() ? (
          <span className="clamp-1 text-label text-text-secondary">
            {draft.brand.trim()}
          </span>
        ) : null}
        <h3 className="clamp-2 text-body text-text-primary">
          {draft.title.trim() || 'Untitled listing'}
        </h3>
        {price != null ? (
          <span className="tnum text-body-large font-bold text-text-primary">
            {formatPrice(price)}
          </span>
        ) : null}
        <span className="mt-0.5 flex items-center gap-1.5 text-text-secondary">
          <Avatar src={seller.avatar} name={seller.username} size={20} />
          <span className="clamp-1 text-meta font-medium">@{seller.username}</span>
          {seller.isVerified ? (
            <Icon name="verified" size={11} className="text-commerce-trust" />
          ) : null}
        </span>
      </div>
    </article>
  );
}
