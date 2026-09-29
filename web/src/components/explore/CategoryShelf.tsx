'use client';

/**
 * CategoryShelf — the department shelf at the top of Explore. Media-first
 * tiles deep-link into /category/[slug]; the Rail carries the edge-fade
 * scroll affordance (a fade renders only while content is clipped).
 *
 * Counts are fixture-truth: in live mode the directory's borrowed
 * catalogue numbers don't apply, so the tile carries the name alone
 * rather than a count the backend didn't report.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Rail } from '@/components/home/modules/Rail';
import { CATEGORY_DIRECTORY } from '@/components/search/taxonomy';
import { DATA_MODE } from '@/lib/api/client';

const LIVE = DATA_MODE === 'live';

export function CategoryShelf() {
  return (
    <Rail label="Categories" className="pt-1">
      {CATEGORY_DIRECTORY.map((cat, i) => (
        <Link
          key={cat.slug}
          href={`/category/${cat.slug}`}
          role="listitem"
          aria-label={
            !LIVE && cat.count > 0
              ? `${cat.name} — ${cat.count} item${cat.count === 1 ? '' : 's'}`
              : `${cat.name} — browse the category`
          }
          className="pressable group relative h-24 w-40 shrink-0 snap-start overflow-hidden rounded-lg sm:h-28 sm:w-48 lg:h-32 lg:w-56"
        >
          <AppImage
            src={cat.image}
            alt={cat.name}
            fill
            sizes="(max-width: 640px) 160px, (max-width: 1024px) 192px, 224px"
            priority={i < 4}
            className="h-full w-full media-zoom"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
          <span className="absolute bottom-2 left-2.5 right-2.5">
            <span className="block text-body-emphasis font-semibold text-scrim-text-primary">
              {cat.name}
            </span>
            {!LIVE && cat.count > 0 ? (
              <span className="tnum mt-0.5 block text-caption font-medium text-scrim-text-secondary">
                {cat.count} item{cat.count === 1 ? '' : 's'}
              </span>
            ) : null}
          </span>
        </Link>
      ))}
    </Rail>
  );
}
