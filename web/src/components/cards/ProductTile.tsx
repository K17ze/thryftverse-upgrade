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
import { memo, useEffect, useRef, useState } from 'react';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { SustainabilityChip } from '@/components/ui/Badge';
import { useStore, useHydrated } from '@/lib/store/useStore';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { FeedItemMenu } from '@/components/feed/FeedItemMenu';
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

/**
 * Memoized — the grid's hottest leaf. A toast, a save elsewhere in the
 * feed, or a sibling's hover state re-renders the grid container; the
 * tile's props (item reference + primitives) don't change, so the tile
 * skips its media + metadata render. Requires callers to keep `item`
 * references stable (feed units are memoized upstream) and callbacks
 * already live in stores, not props.
 */
function ProductTileImpl({ item, aspectRatio, visualOnly, priority }: ProductTileProps) {
  const { show } = useToast();
  // The gate comes from the app-level SignupWallProvider — per-tile wall
  // state (and its sheet) lived here once; the provider owns it now.
  const { requireAuth } = useSignupWall();
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
  /** A video cover renders a real <video> — autoplay grammar lives in
   *  TileVideo; a non-cover video just earns the play badge. */
  const coverIsVideo = isVideoUri(cover);
  const hasVideo = usableImages.some(isVideoUri);
  const hasMultiple = usableImages.length > 1;
  const ratio =
    aspectRatio ??
    resolveListingMediaAspectRatio(item) ??
    DEFAULT_LISTING_MEDIA_ASPECT_RATIO;

  const sellerUsername = item.seller?.username ?? null;
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
    !item.isSold && !isPaused && (item.sustainabilityGrade === 'A' || item.sustainabilityGrade === 'B');

  const handleHeart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAuth('save_item')) return;
    const adding = !isFav;
    // The heart flips optimistically; the confirmation waits for the
    // write — a failed sync rolls the toggle back and says so.
    void toggleFav(item.id).then((ok) => {
      if (ok) {
        if (adding) show('Added to wishlist', 'success');
      } else {
        show('Couldn’t sync — your wishlist was restored', 'error');
      }
    });
  };

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAuth('save_item')) return;
    const removing = isSaved;
    void toggleSaved(item.id).then((ok) => {
      show(
        ok
          ? removing
            ? 'Removed from saved'
            : 'Added to saved'
          : 'Couldn’t sync — saved items restored',
        ok ? 'info' : 'error',
      );
    });
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
        {coverIsVideo ? (
          <TileVideo src={cover} label={item.title} aspectRatio={ratio} />
        ) : (
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
        )}

        {/* Sold — scrim + centered label. Paused — the same status
            grammar at badge weight: a small on-media chip, no scrim, so
            the tile stays browsable without reading as purchasable. */}
        {item.isSold ? (
          <>
            <div className="absolute inset-0 bg-overlay" />
            <span className="absolute inset-0 flex items-center justify-center text-body font-medium uppercase tracking-[1.2px] text-scrim-text-primary">
              Sold
            </span>
          </>
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

        {/* Quick actions — 44px hit areas, glyph scrim, no chrome circles.
            quick-actions reveals on hover/focus-within where hover exists;
            touch viewports keep the cluster always visible. Sold tiles
            suppress save/wishlist/share (native ClosetMediaMosaic ~219 —
            the item is gone; the tile stays navigable and the PDP gates
            purchase honestly), while feed tuning still applies. */}
        <div className="quick-actions absolute bottom-0 right-0 z-elevated flex items-center transition-opacity">
          {/* Feed controls — renders only inside a feed surface
              (FeedControlsProvider); null everywhere else. */}
          <FeedItemMenu item={item} />
          {item.isSold ? null : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Info — metadata budget: disclosure → brand → title → size·condition → price → seller */}
      {!visualOnly ? (
        <div className="flex flex-col gap-1 px-1 pt-2">
          {item.disclosure ? (
            <span className="text-meta font-medium text-text-muted">{item.disclosure}</span>
          ) : null}
          {item.brand ? (
            <span className="clamp-1 text-label text-text-secondary">
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
            /* Real link — middle-click/context-menu/Enter all work;
               z-elevated lifts it over the tile's stretched link. */
            <Link
              href={`/u/${sellerUsername}`}
              className="relative z-elevated mt-0.5 flex items-center gap-1.5 self-start rounded-sm text-text-secondary hover:text-text-primary"
            >
              <Avatar src={item.seller?.avatar} name={sellerUsername} size={20} />
              <span className="clamp-1 text-meta font-medium">@{sellerUsername}</span>
              {item.seller?.verified ? (
                <Icon name="verified" size={11} className="text-commerce-trust" />
              ) : null}
            </Link>
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
    </article>
  );
}

export const ProductTile = memo(ProductTileImpl);

/**
 * TileVideo — feed video grammar, mirrors the mobile feed's viewability
 * autoplay: muted, inline, looping, and only while at least half the
 * tile is on screen. Two honest gates keep it opt-out friendly —
 * prefers-reduced-motion and the network Save-Data hint both leave the
 * clip paused (the first frame still renders; the play badge stays so
 * the tile still reads as video). A paused clip on scroll-away resumes
 * on return; it never plays with sound.
 */
function TileVideo({
  src,
  label,
  aspectRatio,
}: {
  src: string;
  label: string;
  aspectRatio: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** False until mounted + permitted — SSR never claims autoplay. */
  const [autoplayAllowed, setAutoplayAllowed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    const update = () =>
      setAutoplayAllowed(!motion.matches && connection?.saveData !== true);
    update();
    motion.addEventListener('change', update);
    return () => motion.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!autoplayAllowed) {
      // Policy flipped mid-scroll — honour it immediately.
      video.pause();
      return;
    }
    if (!('IntersectionObserver' in window)) {
      // No observer (very old engine) — treat as always visible.
      void video.play().catch(() => undefined);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            void video.play().catch(() => undefined);
          } else if (!video.paused) {
            video.pause();
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [autoplayAllowed]);

  return (
    <div className="w-full" style={{ aspectRatio: String(aspectRatio) }}>
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        loop
        preload="metadata"
        aria-label={label}
        className="media-zoom h-full w-full object-cover"
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {/* Pause toggle — WCAG 2.2.2: an auto-playing loop needs a user
          stop. The badge becomes the control: paused shows play,
          playing surfaces pause on hover/focus. */}
      <button
        type="button"
        aria-label={playing ? 'Pause video' : 'Play video'}
        aria-pressed={playing}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) void video.play().catch(() => undefined);
          else video.pause();
        }}
        className={`absolute right-1.5 top-1.5 z-elevated inline-flex items-center rounded-md bg-overlay px-1.5 py-1 text-scrim-text-primary transition-opacity ${
          playing ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100' : ''
        }`}
      >
        <Icon name={playing ? 'pause' : 'play'} filled size={11} />
      </button>
    </div>
  );
}
