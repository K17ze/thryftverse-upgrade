'use client';

/**
 * PdpGallery — the media stage. Reserved aspect-ratio main image, thumbnail
 * column on desktop (rail below on mobile) that keeps the active thumb in
 * view, sold scrim, price-drop / sustainability badges, a hover expand
 * affordance that opens the fullscreen PdpLightbox, and an on-media auction
 * deadline chip that renders only when a real deadline exists.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { SustainabilityChip } from '@/components/ui/Badge';
import { PdpLightbox } from './PdpLightbox';
import type { Listing } from '@/lib/contracts/domain';
import { useAuctionBoard } from '@/lib/hooks/auction-queries';
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

interface PdpGalleryProps {
  listing: Listing;
}

export function PdpGallery({ listing }: PdpGalleryProps) {
  const images = listing.images.filter(isUsableUri);
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const desktopRailRef = useRef<HTMLDivElement>(null);
  const mobileRailRef = useRef<HTMLDivElement>(null);

  const ratio =
    resolveListingMediaAspectRatio(listing) ?? DEFAULT_LISTING_MEDIA_ASPECT_RATIO;
  const primaryMedia = getPrimaryMedia(listing);
  const focalPoint = primaryMedia?.focalPoint ?? getCategoryFocalPoint(listing.category);
  const current = Math.min(active, Math.max(0, images.length - 1));

  const hasPriceDrop =
    typeof listing.originalPrice === 'number' && listing.originalPrice > listing.price;
  const discountPercent = hasPriceDrop
    ? Math.round(((listing.originalPrice! - listing.price) / listing.originalPrice!) * 100)
    : 0;
  const showSustainability =
    !listing.isSold &&
    (listing.sustainabilityGrade === 'A' || listing.sustainabilityGrade === 'B');

  // Rails scroll when they overflow — keep the active thumb visible.
  useEffect(() => {
    for (const rail of [desktopRailRef.current, mobileRailRef.current]) {
      rail
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [current]);

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:gap-3">
      {/* Thumbnail column — desktop */}
      {images.length > 1 ? (
        <div
          ref={desktopRailRef}
          className="no-scrollbar hidden w-[72px] shrink-0 flex-col gap-2 lg:flex lg:max-h-[75vh] lg:overflow-y-auto"
          role="tablist"
          aria-label="Item photos"
        >
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              role="tab"
              aria-selected={i === current}
              aria-label={`Photo ${i + 1}`}
              onClick={() => setActive(i)}
              className={`pressable relative overflow-hidden rounded-md ${
                i === current ? 'ring-2 ring-brand' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <AppImage src={src} alt="" aspectRatio={0.8} sizes="72px" className="w-full" />
            </button>
          ))}
        </div>
      ) : null}

      {/* Main stage */}
      <div className="min-w-0 flex-1">
        {/* Relative wrapper — the deadline chip is a real link, so it must
            sit outside the lightbox button (no nested interactives). */}
        <div className="relative">
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
              sizes="(max-width: 1024px) 100vw, 55vw"
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
            {!listing.isSold && hasPriceDrop ? (
              <span className="absolute left-3 top-3 rounded-md bg-overlay px-2.5 py-1 text-caption font-semibold text-scrim-text-primary">
                -{discountPercent}%
              </span>
            ) : !listing.isSold && showSustainability && listing.sustainabilityGrade ? (
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

          {/* Time-bound urgency — only when a real auction window exists.
              Never rendered for ordinary listings: no deadline, no chip. */}
          <AuctionDeadlineChip listing={listing} />
        </div>

        {/* Thumbnail rail — mobile / tablet */}
        {images.length > 1 ? (
          <div
            ref={mobileRailRef}
            className="no-scrollbar mt-2 flex gap-2 overflow-x-auto lg:hidden"
            role="tablist"
            aria-label="Item photos"
          >
            {images.map((src, i) => (
              <button
                key={src + i}
                type="button"
                role="tab"
                aria-selected={i === current}
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
