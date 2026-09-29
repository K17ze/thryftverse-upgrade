'use client';

/**
 * GalleriaBanner — slim editorial module band linking to /galleria.
 * Image-backed panel, media scrim, serif (Playfair) headline — the one
 * place in the feed where the editorial voice interrupts the catalogue.
 */

import Link from 'next/link';
import { GALLERIA_HERO } from '@/lib/data/fixtures-media';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';
import { useGalleriaCover } from '@/lib/hooks/galleria-queries';
import { useModuleFatigue } from './ModuleSection';

const isLive = DATA_MODE === 'live';

export function GalleriaBanner() {
  const { cover } = useGalleriaCover();
  // Same module-fatigue channel as the rail bands — the banner has no
  // ModuleSection chrome, so the dismiss control sits on the media.
  const fatigue = useModuleFatigue('galleria');

  // Live mode shows the real cover story — none published means no banner,
  // not a fixture promo for content that doesn't exist.
  const kicker = isLive ? (cover?.issueLabel ?? '') : GALLERIA_HERO.kicker;
  const headline = isLive ? (cover?.title ?? '') : GALLERIA_HERO.headline;
  const mediaUri = isLive ? (cover?.heroUri ?? '') : GALLERIA_HERO.mediaUri;
  const focalPoint = isLive ? cover?.focalPoint : GALLERIA_HERO.focalPoint;
  if (!mediaUri || fatigue.suppressed) return null;

  return (
    <section
      ref={fatigue.sectionRef}
      aria-label="The Galleria"
      className="border-t border-border-subtle py-5 sm:py-6"
      onClickCapture={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-module-dismiss]')) return;
        if (target.closest('a[href],button')) fatigue.noteEngagement();
      }}
    >
      <div className="relative mx-4 sm:mx-6">
        <Link
          href="/galleria"
          className="group relative block overflow-hidden rounded-xl"
        >
        <div className="relative h-[168px] sm:h-[220px]">
          <AppImage
            src={mediaUri}
            alt={headline.replace('\n', ' ')}
            fill
            focalPoint={focalPoint}
            sizes="(max-width: 1600px) 100vw, 1600px"
            className="h-full w-full"
          />
          {/* Media scrim — the one allowed gradient, keeps type legible */}
          <div className="absolute inset-0 bg-gradient-to-r from-media-overlay-scrim via-media-overlay-scrim/40 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-center px-5 sm:px-8">
            <p className="text-label text-scrim-text-secondary">
              {isLive ? `The Galleria · ${kicker}` : kicker}
            </p>
            <h3 className="mt-1.5 whitespace-pre-line text-editorial-display leading-[1.08] text-scrim-text-primary">
              {headline}
            </h3>
            <span className="mt-3 flex items-center gap-1 text-caption font-semibold text-scrim-text-primary">
              Read the issue
              <Icon name="forward" size={13} />
            </span>
          </div>
        </div>
        </Link>
        {/* Dismiss — on-media grammar: 44px transparent target, glyph
            scrim for legibility, no chrome circle. */}
        <button
          type="button"
          data-module-dismiss
          onClick={() => fatigue.dismiss('The Galleria')}
          aria-label="Hide The Galleria"
          className="pressable absolute right-1.5 top-1.5 z-elevated flex h-11 w-11 items-center justify-center rounded-full text-scrim-text-primary drop-scrim"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </section>
  );
}
