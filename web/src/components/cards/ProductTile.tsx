'use client';

/**
 * ProductTile — 1:1 port of ProductCard/ProductDiscoveryTile.
 * Media-first tile: reserved aspect ratio, sold scrim, price-drop badge,
 * sustainability chip, media indicators, save+heart glyph-scrim actions,
 * and the metadata budget: disclosure → brand → title → size·condition →
 * price → seller. Media gets a 3% hover zoom (media-zoom) on desktop.
 * Whole tile navigates via a stretched link; action controls sit above it.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { SustainabilityChip } from '@/components/ui/Badge';
import { useStore, useHydrated } from '@/lib/store/useStore';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
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

interface ProductTileProps {
  item: DiscoveryListingSummary;
  /** Reserve the frame — from server media metadata or measured fallback. */
  aspectRatio?: number;
  visualOnly?: boolean;
  priority?: boolean;
}

export function ProductTile({ item, aspectRatio, visualOnly, priority }: ProductTileProps) {
  const router = useRouter();
  const { show } = useToast();
  const { requireAuth, wall } = useSignupWall();
  const hydrated = useHydrated();
  const wishlisted = useStore((s) => s.wishlist.includes(item.id));
  const toggleFav = useStore((s) => s.toggleWishlist);
  const savedItem = useStore((s) => s.saved.includes(item.id));
  const toggleSaved = useStore((s) => s.toggleSaved);
  // Persisted store state differs between SSR and first client render —
  // gate it so hydration matches the server output.
  const isFav = hydrated && wishlisted;
  const isSaved = hydrated && savedItem;

  const usableImages = item.images.filter(isUsableUri);
  const cover = getListingCoverUri(item.images);
  const primaryMedia = getPrimaryMedia(item);
  const hasVideo = usableImages.some(isVideoUri);
  const hasMultiple = usableImages.length > 1;
  const ratio =
    aspectRatio ??
    resolveListingMediaAspectRatio(item) ??
    DEFAULT_LISTING_MEDIA_ASPECT_RATIO;

  const sellerUsername = item.seller?.username ?? null;
  const hasPriceDrop =
    typeof item.originalPrice === 'number' && item.price != null && item.originalPrice > item.price;
  const priceDropPercent = hasPriceDrop
    ? Math.round(((item.originalPrice! - item.price!) / item.originalPrice!) * 100)
    : 0;
  const showSustainability =
    !item.isSold && (item.sustainabilityGrade === 'A' || item.sustainabilityGrade === 'B');

  const handleHeart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAuth('save_item')) return;
    toggleFav(item.id);
    if (!isFav) show('Added to wishlist', 'success');
  };

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAuth('save_item')) return;
    toggleSaved(item.id);
    show(isSaved ? 'Removed from saved' : 'Added to saved', 'info');
  };

  const openSeller = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/u/${sellerUsername}`);
  };

  // Native share sheet → clipboard fallback — mirrors SellSuccess/ProfileHero.
  const shareListing = async () => {
    const url = `${window.location.origin}/item/${item.id}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `${item.title} on ThryftVerse`, url });
        return;
      } catch {
        // Dismissed or unsupported — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      show('Listing link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void shareListing();
  };

  return (
    <article className={`group relative ${item.isSold ? 'opacity-70' : ''}`}>
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={cover}
          alt={item.title}
          aspectRatio={ratio}
          focalPoint={primaryMedia?.focalPoint ?? getCategoryFocalPoint(item.category)}
          blurDataURL={primaryMedia?.lqip ?? null}
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="media-zoom"
        />

        {/* Sold — scrim + centered label */}
        {item.isSold ? (
          <>
            <div className="absolute inset-0 bg-overlay" />
            <span className="absolute inset-0 flex items-center justify-center text-body font-medium uppercase tracking-[1.2px] text-scrim-text-primary">
              Sold
            </span>
          </>
        ) : null}

        {/* Badge cascade — price drop wins over sustainability chip */}
        {!item.isSold && hasPriceDrop ? (
          <span className="absolute left-2 top-2 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
            -{priceDropPercent}%
          </span>
        ) : !item.isSold && showSustainability && item.sustainabilityGrade ? (
          <span className="absolute left-2 top-2">
            <SustainabilityChip grade={item.sustainabilityGrade} onMedia />
          </span>
        ) : null}

        {/* Media indicator — video play or multi-image, one only.
            Small on-media pill (bg-overlay grammar), not a chrome circle. */}
        {hasVideo ? (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center rounded-md bg-overlay px-1.5 py-1 text-scrim-text-primary">
            <Icon name="play" filled size={11} />
          </span>
        ) : hasMultiple ? (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center rounded-md bg-overlay px-1.5 py-1 text-scrim-text-primary">
            <Icon name="images" size={12} />
          </span>
        ) : null}

        {/* Quick actions — 44px hit areas, glyph scrim, no chrome circles.
            quick-actions reveals on hover/focus-within where hover exists;
            touch viewports keep the cluster always visible. */}
        <div className="quick-actions absolute bottom-0 right-0 z-10 flex items-center transition-opacity">
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share listing"
            className="pressable flex h-11 w-11 items-center justify-center"
          >
            <Icon name="share" size={19} className="text-scrim-text-primary drop-scrim" />
          </button>
          <button
            type="button"
            onClick={handleSave}
            aria-label={isSaved ? 'Remove from saved' : 'Save item'}
            aria-pressed={isSaved}
            className="pressable flex h-11 w-11 items-center justify-center"
          >
            <Icon
              name="bookmark"
              filled={isSaved}
              size={20}
              className={isSaved ? 'text-brand drop-scrim' : 'text-scrim-text-primary drop-scrim'}
            />
          </button>
          <button
            type="button"
            onClick={handleHeart}
            aria-label={isFav ? 'Remove from wishlist' : 'Add to wishlist'}
            aria-pressed={isFav}
            className="pressable flex h-11 w-11 items-center justify-center"
          >
            <Icon
              name="heart"
              filled={isFav}
              size={21}
              className={isFav ? 'text-danger-text drop-scrim' : 'text-scrim-text-primary drop-scrim'}
            />
          </button>
        </div>
      </div>

      {/* Info — metadata budget: disclosure → brand → title → size·condition → price → seller */}
      {!visualOnly ? (
        <div className="flex flex-col gap-1 px-1 pt-2">
          {item.disclosure ? (
            <span className="text-meta font-medium text-text-muted">{item.disclosure}</span>
          ) : null}
          {item.brand ? (
            <span className="clamp-1 text-label font-semibold uppercase tracking-wide text-text-secondary">
              {item.brand}
            </span>
          ) : null}
          <h3 className="clamp-2 text-body text-text-primary">{item.title}</h3>
          {item.size || item.condition ? (
            <span className="clamp-1 text-meta text-text-muted">
              {[item.size, item.condition].filter(Boolean).join(' · ')}
            </span>
          ) : null}
          {item.price != null ? (
            <span className="tnum text-body-large font-bold text-text-primary">
              {formatPrice(item.price)}
            </span>
          ) : null}
          {sellerUsername ? (
            <span
              role="link"
              tabIndex={0}
              onClick={openSeller}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openSeller(e);
              }}
              className="relative z-10 mt-0.5 flex cursor-pointer items-center gap-1.5 self-start rounded-sm text-text-secondary hover:text-text-primary"
            >
              <Avatar src={item.seller?.avatar} name={sellerUsername} size={20} />
              <span className="clamp-1 text-meta font-medium">@{sellerUsername}</span>
              {item.seller?.verified ? (
                <Icon name="verified" size={11} className="text-success-text" />
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Stretched link — the whole tile navigates; actions sit above it */}
      <Link
        href={`/item/${item.id}`}
        className="absolute inset-0 z-[1] rounded-lg"
        aria-label={`${item.brand ? `${item.brand} — ` : ''}${item.title}${
          item.price != null ? `, ${formatPrice(item.price)}` : ''
        }${item.condition ? `, ${item.condition}` : ''}${item.isSold ? ', Sold' : ''}`}
      />

      {wall}
    </article>
  );
}
