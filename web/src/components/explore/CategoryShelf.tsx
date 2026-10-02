'use client';

/**
 * CategoryShelf — the department shelf at the top of Explore. Media-first
 * tiles deep-link into /category/[slug]; the Rail carries the edge-fade
 * scroll affordance (a fade renders only while content is clipped).
 *
 * Counts and covers come from useCategoryDirectory — fixture truth in
 * fixture mode, GET /taxonomy/category-directory in live mode (server
 * counts over active listings, cover = newest active listing's image).
 * A tile with no cover renders the name over the quiet surface, not a
 * fabricated photo.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { ModuleSection } from '@/components/home/modules/ModuleSection';
import { Rail } from '@/components/home/modules/Rail';
import { useCategoryDirectory } from '@/components/search/useCategoryDirectory';

export function CategoryShelf() {
  const { categories } = useCategoryDirectory();
  return (
    // First module on the surface — unbordered like the home feed's lead
    // modules; the rail below scrolls while "See all" lands on the real
    // department directory.
    <ModuleSection title="Categories" href="/categories" bordered={false}>
      <Rail label="Categories">
        {categories.map((cat, i) => (
          <Link
            key={cat.slug}
            href={`/category/${cat.slug}`}
            role="listitem"
            aria-label={
              cat.count > 0
                ? `${cat.name} — ${cat.count} item${cat.count === 1 ? '' : 's'}`
                : `${cat.name} — browse the category`
            }
            className="pressable group relative h-24 w-40 shrink-0 snap-start overflow-hidden rounded-lg bg-surface-alt sm:h-28 sm:w-48 lg:h-32 lg:w-56"
          >
            {cat.image ? (
              <AppImage
                src={cat.image}
                alt=""
                fill
                sizes="(max-width: 640px) 160px, (max-width: 1024px) 192px, 224px"
                priority={i < 4}
                className="h-full w-full media-zoom"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
            <span className="absolute bottom-2 left-2.5 right-2.5">
              <span className="block text-body-emphasis font-semibold text-scrim-text-primary">
                {cat.name}
              </span>
              {cat.count > 0 ? (
                <span className="tnum mt-0.5 block text-caption font-medium text-scrim-text-secondary">
                  {cat.count} item{cat.count === 1 ? '' : 's'}
                </span>
              ) : null}
            </span>
          </Link>
        ))}
      </Rail>
    </ModuleSection>
  );
}
