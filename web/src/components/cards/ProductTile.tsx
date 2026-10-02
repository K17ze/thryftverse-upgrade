'use client';

/**
 * ProductTile — 1:1 port of ProductCard/ProductDiscoveryTile.
 * Media-first tile: reserved aspect ratio, sold scrim, price-drop badge,
 * sustainability chip, media indicators, save+heart glyph-scrim actions,
 * and the metadata budget: disclosure → brand → title → size·condition →
 * price → seller. Media gets a 3% hover zoom (media-zoom) on desktop.
 * Whole tile navigates via a stretched link; action controls sit above it.
 * Decomposed into modular domain components (< 400 LOC standard):
 *  - TileVideo
 *  - TileQuickActions
 *  - TileMetadata
 */

import Link from 'next/link';
import { memo } from 'react';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { SoldOverlay } from '@/components/ui/SoldOverlay';
import { SustainabilityChip } from '@/components/ui/Badge';
import { formatPrice } from '@/lib/utils/format';
import {
  getListingCoverUri,
  getPrimaryMedia,
  resolveListingMediaAspectRatio,
  DEFAULT_LISTING_MEDIA_ASPECT_RATIO,
  isVideoUri,
  isUsableUri,
  getCategoryFocalPoint,
} from '@/lib/utils/media';
import { TileVideo } from './TileVideo';
import { TileQuickActions } from './TileQuickActions';
import { TileMetadata } from './TileMetadata';

export interface ProductTileProps {
  item: DiscoveryListingSummary;
  /** Reserve the frame — from server media metadata or measured fallback. */
  aspectRatio?: number;
  visualOnly?: boolean;
  priority?: boolean;
}

/**
 * Memoized — the grid's hottest leaf. A toast, a save elsewhere in the
 * feed, or a sibling's hover state re-renders the grid container; the
 * tile's props (item reference + primitives) don't change, so the tile
 * skips its media + metadata render. Requires callers to keep `item`
 * references stable (feed units are memoized upstream) and callbacks
 * already live in stores, not props.
 */
function ProductTileImpl({
  item,
  aspectRatio,
  visualOnly,
  priority,
}: ProductTileProps) {
  const usableImages = item.images.filter(isUsableUri);
  const cover = getListingCoverUri(item.images);
  const primaryMedia = getPrimaryMedia(item);

  /** A video cover renders a real <video> — autoplay grammar lives in
   *  TileVideo; a non-cover video just earns the play badge. */
  const coverIsVideo = isVideoUri(cover);
  const hasVideo = usableImages.some(isVideoUri);
  const hasMultiple = usableImages.length > 1;
  const ratio =
    aspectRatio ??
    resolveListingMediaAspectRatio(item) ??
    DEFAULT_LISTING_MEDIA_ASPECT_RATIO;

  const isPaused = item.status === 'paused';
  // Same real-drop contract as components/closet/closetFilters
  // (listingHasPriceDrop): sold items never carry the signal; the badge
  // only renders when a genuine previous price exists.
  const hasPriceDrop =
    !item.isSold &&
    item.status !== 'sold' &&
    typeof item.originalPrice === 'number' &&
    item.price != null &&
    item.originalPrice > item.price;
  const priceDropPercent = hasPriceDrop
    ? Math.round(((item.originalPrice! - item.price!) / item.originalPrice!) * 100)
    : 0;
  const showSustainability =
    !item.isSold &&
    !isPaused &&
    (item.sustainabilityGrade === 'A' || item.sustainabilityGrade === 'B');

  return (
    <article
      className={`group relative pressable ${item.isSold ? 'opacity-70' : ''}`}
    >
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        {coverIsVideo ? (
          <TileVideo src={cover} label={item.title} aspectRatio={ratio} />
        ) : (
          <AppImage
            src={cover}
            alt={item.title}
            aspectRatio={ratio}
            focalPoint={
              primaryMedia?.focalPoint ?? getCategoryFocalPoint(item.category)
            }
            blurDataURL={primaryMedia?.lqip ?? null}
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="media-zoom"
          />
        )}

        {/* Sold — scrim + centered label. Paused — the same status
            grammar at badge weight: a small on-media chip, no scrim, so
            the tile stays browsable without reading as purchasable. */}
        {item.isSold ? (
          <SoldOverlay />
        ) : isPaused ? (
          <span className="absolute left-2 top-2 rounded-md bg-overlay px-2 py-1 text-meta font-semibold uppercase tracking-wide text-scrim-text-primary">
            Paused
          </span>
        ) : null}

        {/* Badge cascade — price drop wins over sustainability chip; both
            stay off paused items (a sale badge on an unpurchasable tile
            would overstate it). */}
        {!isPaused && hasPriceDrop ? (
          <span className="absolute left-2 top-2 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
            -{priceDropPercent}%
          </span>
        ) : !item.isSold && showSustainability && item.sustainabilityGrade ? (
          <span className="absolute left-2 top-2">
            <SustainabilityChip grade={item.sustainabilityGrade} onMedia />
          </span>
        ) : null}

        {/* Media indicator — video play or multi-image, one only.
            Small on-media pill (bg-overlay grammar), not a chrome circle.
            Video covers own their badge inside TileVideo — it's suppressed
            while the clip is actually playing. */}
        {!coverIsVideo && hasVideo ? (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center rounded-md bg-overlay px-1.5 py-1 text-scrim-text-primary">
            <Icon name="play" filled size={11} />
          </span>
        ) : !coverIsVideo && hasMultiple ? (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center rounded-md bg-overlay px-1.5 py-1 text-scrim-text-primary">
            <Icon name="images" size={12} />
          </span>
        ) : null}

        {/* Quick actions — 44px hit areas, glyph scrim, no chrome circles. */}
        <TileQuickActions item={item} />
      </div>

      {/* Info — metadata budget: disclosure → brand → title → size·condition → price → seller */}
      {!visualOnly ? <TileMetadata item={item} /> : null}

      {/* Stretched link — the whole tile navigates; actions sit above it */}
      <Link
        href={`/item/${item.id}`}
        className="absolute inset-0 z-[1] rounded-lg"
        aria-label={`${item.brand ? `${item.brand} — ` : ''}${item.title}${
          item.price != null ? `, ${formatPrice(item.price)}` : ''
        }${item.condition ? `, ${item.condition}` : ''}${item.isSold ? ', Sold' : ''}`}
      />
    </article>
  );
}

export const ProductTile = memo(ProductTileImpl);
