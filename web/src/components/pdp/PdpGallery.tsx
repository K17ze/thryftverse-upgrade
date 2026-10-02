'use client';

/**
 * PdpGallery — the media stage. Reserved aspect-ratio main image, thumbnail
 * column on desktop (rail below on mobile) that keeps the active thumb in
 * view, sold scrim, price-drop / sustainability badges, a hover expand
 * affordance that opens the fullscreen PdpLightbox, and an on-media auction
 * deadline chip that renders only when a real deadline exists.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { SustainabilityChip } from '@/components/ui/Badge';
import type { Listing } from '@/lib/contracts/domain';
import { useAuctionBoard } from '@/lib/hooks/auction-queries';
import { DATA_MODE } from '@/lib/api/client';
import {
  countdownLabel,
  countdownUrgency,
  formatDuration,
} from '@/lib/data/fixtures-auctions';
import {
  getCategoryFocalPoint,
  getPrimaryMedia,
  resolveListingMediaAspectRatio,
  DEFAULT_LISTING_MEDIA_ASPECT_RATIO,
  isUsableUri,
} from '@/lib/utils/media';

// Fullscreen viewer — mounts only behind the expand affordance, so its
// chunk fetches on first open instead of riding every PDP.
const PdpLightbox = dynamic(
  () => import('./PdpLightbox').then((m) => m.PdpLightbox),
  { ssr: false },
);

interface PdpGalleryProps {
  listing: Listing;
}

export function PdpGallery({ listing }: PdpGalleryProps) {
  const images = listing.images.filter(isUsableUri);
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const galleryRef = useRef<HTMLDivElement>(null);
  const desktopRailRef = useRef<HTMLDivElement>(null);
  const mobileRailRef = useRef<HTMLDivElement>(null);
  /** Pointer-over flag — ←/→ page the photos while the cursor rests on the
   *  gallery (eBay grammar) even before anything inside takes focus. */
  const hoverRef = useRef(false);

  const ratio =
    resolveListingMediaAspectRatio(listing) ?? DEFAULT_LISTING_MEDIA_ASPECT_RATIO;
  const primaryMedia = getPrimaryMedia(listing);
  const focalPoint = primaryMedia?.focalPoint ?? getCategoryFocalPoint(listing.category);
  const current = Math.min(active, Math.max(0, images.length - 1));

  const showSustainability =
    !listing.isSold &&
    (listing.sustainabilityGrade === 'A' || listing.sustainabilityGrade === 'B');

  // Rails scroll when they overflow — keep the active thumb visible.
  useEffect(() => {
    for (const rail of [desktopRailRef.current, mobileRailRef.current]) {
      rail
        ?.querySelector('[aria-pressed="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [current]);

  /** Page through photos — wraps at the ends, same as the lightbox. */
  const step = useCallback(
    (dir: 1 | -1) => {
      if (images.length < 2) return;
      setActive((a) => (Math.min(a, images.length - 1) + dir + images.length) % images.length);
    },
    [images.length],
  );

  // ←/→ page the photos while the gallery owns focus or the pointer rests
  // on it. Editable targets keep their arrow keys; once the lightbox is
  // open it owns the same keys (its own document listener), so the stage
  // never double-steps behind the overlay.
  useEffect(() => {
    if (images.length < 2 || lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const focused = galleryRef.current?.contains(target) ?? false;
      if (!focused && !hoverRef.current) return;
      e.preventDefault();
      step(e.key === 'ArrowRight' ? 1 : -1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [images.length, lightbox, step]);

  return (
    <div
      ref={galleryRef}
      className="flex flex-col gap-2 lg:flex-row lg:gap-3"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') hoverRef.current = true;
      }}
      onPointerLeave={() => {
        hoverRef.current = false;
      }}
    >
      {/* Thumbnail column — desktop */}
      {images.length > 1 ? (
        <div
          ref={desktopRailRef}
          className="no-scrollbar hidden w-[72px] shrink-0 flex-col gap-2 lg:flex lg:max-h-[75vh] lg:overflow-y-auto xl:w-[84px]"
          role="group"
          aria-label="Item photos"
        >
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              aria-pressed={i === current}
              aria-label={`Photo ${i + 1}`}
              onClick={() => setActive(i)}
              className={`pressable relative overflow-hidden rounded-md ${
                i === current ? 'ring-2 ring-brand' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <AppImage src={src} alt="" aspectRatio={0.8} sizes="(min-width: 1280px) 84px, 72px" className="w-full" />
            </button>
          ))}
        </div>
      ) : null}

      {/* Main stage */}
      <div className="min-w-0 flex-1">
        {/* Relative wrapper — the deadline chip and the prev/next arrows
            are real interactives, so they must sit outside the lightbox
            button (no nested interactives). The named group lets the
            arrows reveal on stage hover or focus-within. */}
        <div className="group/stage relative">
          <button
            type="button"
            onClick={() => setLightbox(true)}
            aria-label="View full size photo"
            className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl bg-surface-alt text-left"
          >
            <AppImage
              src={images[current]}
              alt={listing.title}
              aspectRatio={ratio}
              focalPoint={focalPoint}
              blurDataURL={primaryMedia?.lqip ?? null}
              priority
              sizes="(max-width: 1024px) 100vw, (max-width: 1440px) 62vw, 950px"
              className="w-full lg:max-h-[75vh]"
            />

            {listing.isSold ? (
              <>
                <span className="absolute inset-0 bg-overlay" aria-hidden />
                <span className="absolute inset-0 flex items-center justify-center text-item-title font-semibold uppercase tracking-[2px] text-scrim-text-primary">
                  Sold
                </span>
              </>
            ) : null}

            {/* Badge cascade — price drop wins over sustainability */}
            {/* The discount belongs to the price block — restating it on
                media would say the same fact twice in one viewport. */}
            {!listing.isSold && showSustainability && listing.sustainabilityGrade ? (
              <span className="absolute left-3 top-3">
                <SustainabilityChip grade={listing.sustainabilityGrade} onMedia />
              </span>
            ) : null}

            {/* Expand affordance — desktop hover/focus reveal (Vinted pattern) */}
            <span
              aria-hidden
              className="absolute right-3 top-3 hidden items-center justify-center rounded-md bg-overlay p-2 text-scrim-text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 lg:flex"
            >
              <Icon name="scan" size={16} />
            </span>

            {images.length > 1 ? (
              <span className="absolute bottom-3 right-3 rounded-md bg-overlay px-2 py-1 tnum text-meta font-medium text-scrim-text-primary">
                {current + 1} / {images.length}
              </span>
            ) : null}
          </button>

          {/* Prev/next — desktop on-media controls in the same bg-overlay
              chip grammar as the expand affordance and counter. Hidden
              until the stage is hovered or owns focus; pointer events are
              inert while invisible so they never swallow a lightbox click,
              and they re-arm on keyboard focus (focus-visible). */}
          {images.length > 1 ? (
            <>
              {[
                {
                  dir: -1 as const,
                  icon: 'back' as const,
                  label: 'Previous photo',
                  side: 'left-3',
                },
                {
                  dir: 1 as const,
                  icon: 'forward' as const,
                  label: 'Next photo',
                  side: 'right-3',
                },
              ].map(({ dir, icon, label, side }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  onClick={() => step(dir)}
                  className={`pressable absolute ${side} top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md bg-overlay text-scrim-text-primary opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/stage:pointer-events-auto group-hover/stage:opacity-100 group-focus-within/stage:pointer-events-auto group-focus-within/stage:opacity-100 lg:flex lg:pointer-events-none`}
                >
                  <Icon name={icon} size={18} />
                </button>
              ))}
            </>
          ) : null}

          {/* Time-bound urgency — only when a real auction window exists.
              Never rendered for ordinary listings: no deadline, no chip —
              and no board fetch or 1s tick for listings without linkage. */}
          {listing.auctionEndsAt != null || DATA_MODE !== 'live' ? (
            <AuctionDeadlineChip listing={listing} />
          ) : null}
        </div>

        {/* Thumbnail rail — mobile / tablet */}
        {images.length > 1 ? (
          <div
            ref={mobileRailRef}
            className="no-scrollbar mt-2 flex gap-2 overflow-x-auto lg:hidden"
            role="group"
            aria-label="Item photos"
          >
            {images.map((src, i) => (
              <button
                key={src + i}
                type="button"
                aria-pressed={i === current}
                aria-label={`Photo ${i + 1}`}
                onClick={() => setActive(i)}
                className={`pressable relative w-16 shrink-0 overflow-hidden rounded-md ${
                  i === current ? 'ring-2 ring-brand' : 'opacity-70'
                }`}
              >
                <AppImage src={src} alt="" aspectRatio={0.8} sizes="64px" className="w-full" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Fullscreen viewer — backdrop click / Escape / arrows / swipe */}
      {lightbox ? (
        <PdpLightbox
          images={images}
          index={current}
          onIndexChange={setActive}
          onClose={() => setLightbox(false)}
          title={listing.title}
          aspectRatio={ratio}
          focalPoint={focalPoint}
        />
      ) : null}
    </div>
  );
}

/**
 * AuctionDeadlineChip — the eBay "ending soon" beat, placed on-media like
 * the VI urgency banner. Renders only when a real deadline exists: the
 * listing is linked to a live/upcoming auction on the board (fixture or
 * live data), or the listing payload itself carries `auctionEndsAt`.
 * Everything else gets nothing — urgency is never fabricated.
 *
 * Mount is gated upstream (the media stage renders the chip only for
 * listings with payload linkage, or fixture mode where the linkage lives
 * only on the auction side) so the board query + 1s tick never run for
 * ordinary live PDPs.
 *
 * Isolated component so the board's 1s tick re-renders the chip, not the
 * media stage.
 */
function AuctionDeadlineChip({ listing }: { listing: Listing }) {
  const { auctions } = useAuctionBoard();
  const vm = auctions.find(
    (a) => a.listingId === listing.id && a.lifecycle !== 'ended',
  );

  if (vm) {
    const urgency = countdownUrgency(vm);
    const label = countdownLabel(vm); // "Ends in 2h 14m" / "Starts in 40m"
    return (
      <Link
        href={`/auctions/${vm.id}`}
        aria-label={`${vm.lifecycle === 'live' ? 'Live auction' : 'Auction'} — ${label}`}
        className={`pressable absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-caption font-semibold text-scrim-text-primary after:absolute after:-inset-2 after:content-[''] ${
          urgency === 'soon' || urgency === 'final' ? 'bg-danger' : 'bg-overlay'
        }`}
      >
        <Icon name="auction" size={13} />
        <span className="tnum">{label}</span>
      </Link>
    );
  }

  // Contract deadline with no board auction (live payloads can carry
  // auctionEndsAt alone) — informational chip, no invented destination.
  const endsAtMs = listing.auctionEndsAt ? Date.parse(listing.auctionEndsAt) : NaN;
  const remaining = Number.isFinite(endsAtMs) ? endsAtMs - Date.now() : 0;
  if (remaining <= 0) return null;
  return (
    <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-overlay px-2.5 py-1.5 text-caption font-semibold text-scrim-text-primary">
      <Icon name="auction" size={13} />
      <span className="tnum">Ends in {formatDuration(remaining)}</span>
    </span>
  );
}
