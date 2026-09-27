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

export function GalleriaBanner() {
  return (
    <section aria-label="The Galleria" className="border-t border-border-subtle py-5 sm:py-6">
      <Link
        href="/galleria"
        className="group relative mx-4 block overflow-hidden rounded-xl sm:mx-6"
      >
        <div className="relative h-[168px] sm:h-[220px]">
          <AppImage
            src={GALLERIA_HERO.mediaUri}
            alt={GALLERIA_HERO.headline.replace('\n', ' ')}
            fill
            focalPoint={GALLERIA_HERO.focalPoint}
            sizes="(max-width: 1600px) 100vw, 1600px"
            className="h-full w-full"
          />
          {/* Media scrim — the one allowed gradient, keeps type legible */}
          <div className="absolute inset-0 bg-gradient-to-r from-media-overlay-scrim via-media-overlay-scrim/40 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-center px-5 sm:px-8">
            <p className="text-label font-semibold uppercase tracking-[0.14em] text-scrim-text-secondary">
              {GALLERIA_HERO.kicker}
            </p>
            <h3 className="mt-1.5 whitespace-pre-line text-editorial-display leading-[1.08] text-scrim-text-primary">
              {GALLERIA_HERO.headline}
            </h3>
            <span className="mt-3 flex items-center gap-1 text-caption font-semibold text-scrim-text-primary">
              Read the issue
              <Icon name="forward" size={13} />
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}
