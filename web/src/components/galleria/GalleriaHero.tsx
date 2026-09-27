'use client';

/**
 * GalleriaHero — the cover story. Same full-bleed 72dvh frame as before, now
 * with masthead chrome: masthead line up top, serif headline, byline with
 * read-time and date. A stretched button makes the whole panel open the
 * editorial reader Sheet.
 */

import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { formatDate } from '@/lib/utils/format';
import type { GalleriaEditorial } from '@/lib/data/fixtures-media';

interface GalleriaHeroProps {
  editorial: GalleriaEditorial;
  onOpen: (editorial: GalleriaEditorial) => void;
}

export function GalleriaHero({ editorial, onOpen }: GalleriaHeroProps) {
  return (
    <section aria-label="Featured editorial" className="relative">
      <div className="relative h-[72dvh] min-h-[440px] w-full overflow-hidden">
        <AppImage
          src={editorial.heroUri}
          alt={editorial.title.replace('\n', ' ')}
          fill
          priority
          focalPoint={editorial.focalPoint}
          className="h-full w-full"
          sizes="100vw"
        />
        {/* Media scrim — allowed gradient, keeps type legible */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />

        {/* Masthead chrome — issue line up top */}
        <div className="absolute inset-x-0 top-0 mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 pt-5 sm:px-6">
          <p className="text-label font-semibold uppercase tracking-[0.18em] text-scrim-text-primary">
            The Galleria
          </p>
          <p className="text-label font-medium uppercase tracking-[0.18em] text-scrim-text-secondary">
            {editorial.issueLabel}
          </p>
        </div>

        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[1440px] px-4 pb-10 sm:px-6 sm:pb-14">
          <p className="text-label font-semibold uppercase tracking-[0.14em] text-scrim-text-secondary">
            {editorial.kicker}
          </p>
          <h1 className="mt-3 max-w-2xl whitespace-pre-line font-serif text-display-large font-bold leading-[1.04] text-scrim-text-primary sm:text-[56px] sm:leading-[1.02]">
            {editorial.title}
          </h1>
          <p className="mt-4 max-w-md text-body-large text-scrim-text-secondary">{editorial.dek}</p>

          {/* Byline — author, read time, date. Hairline grammar, no chrome. */}
          <div className="mt-6 flex items-center gap-2.5">
            <Avatar src={editorial.author.avatarUri} name={editorial.author.name} size={24} />
            <span className="text-meta font-medium text-scrim-text-primary">
              {editorial.author.name}
            </span>
            <span className="text-scrim-text-tertiary" aria-hidden>
              ·
            </span>
            <span className="text-meta text-scrim-text-secondary">
              {editorial.readMinutes} min read
            </span>
            <span className="text-scrim-text-tertiary" aria-hidden>
              ·
            </span>
            <span className="text-meta text-scrim-text-secondary">
              {formatDate(editorial.publishedAt)}
            </span>
          </div>
        </div>

        {/* Stretched press target — the whole cover opens the story */}
        <button
          type="button"
          onClick={() => onOpen(editorial)}
          className="pressable absolute inset-0 z-[1]"
          aria-label={`Read ${editorial.title.replace('\n', ' ')} — ${editorial.readMinutes} min read`}
        />
      </div>
    </section>
  );
}
