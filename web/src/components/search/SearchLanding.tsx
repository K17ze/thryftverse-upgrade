'use client';

/**
 * SearchLanding — the empty-query search surface: recent searches,
 * trending queries, popular brands, then the browse canvas — an
 * editorial banner, the week's most-liked pieces and a category grid.
 * Flat canvas, hairline-free — spacing + labels carry the hierarchy.
 */

import Link from 'next/link';
import { ProductTile } from '@/components/cards/ProductTile';
import { AppImage } from '@/components/ui/AppImage';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { LISTINGS } from '@/lib/data/fixtures';
import { GALLERIA_HERO } from '@/lib/data/fixtures-media';
import {
  CATEGORY_DIRECTORY,
  POPULAR_BRANDS,
  TRENDING_SEARCHES,
} from './taxonomy';

/** The week's most-liked live pieces — filter copies before sorting. */
const TRENDING_ITEMS = LISTINGS.filter((l) => !l.isSold)
  .sort((a, b) => b.likes - a.likes)
  .slice(0, 8)
  .map(mapListingToDiscoverySummary);

interface SearchLandingProps {
  recent: string[];
  onSelect: (term: string) => void;
  onClearRecent: () => void;
  onRemoveRecent: (term: string) => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-label font-semibold uppercase tracking-wide text-text-muted">
      {children}
    </h2>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-section-title font-semibold text-text-primary">
      {children}
    </h2>
  );
}

/** Slim editorial banner — media left, serif title, chevron right. */
function GalleriaBanner() {
  return (
    <Link
      href="/galleria"
      aria-label="The Galleria — Issue 04"
      className="pressable group mt-8 flex h-28 items-stretch overflow-hidden rounded-xl border border-border-subtle sm:h-[120px]"
    >
      <div className="relative h-full w-28 shrink-0 sm:w-44">
        <AppImage
          src={GALLERIA_HERO.mediaUri}
          alt=""
          fill
          focalPoint={GALLERIA_HERO.focalPoint}
          sizes="(max-width: 640px) 112px, 176px"
          className="h-full w-full"
          imgClassName="transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-4 pr-2 sm:pl-5">
        <div className="min-w-0 flex-1">
          <h3 className="clamp-1 text-editorial-title text-text-primary">
            The Galleria — Issue 04
          </h3>
          <p className="clamp-1 mt-0.5 text-caption text-text-secondary">
            Worn well, worn again — the seasonal edit.
          </p>
        </div>
        <Icon
          name="forward"
          size={18}
          className="shrink-0 text-text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-text-primary"
        />
      </div>
    </Link>
  );
}

/** Category grid card — media tile, then name + live count beneath. */
function CategoryCard({
  slug,
  name,
  image,
  count,
}: {
  slug: string;
  name: string;
  image?: string;
  count: number;
}) {
  return (
    <Link
      href={`/category/${slug}`}
      className="pressable group block"
      aria-label={
        count > 0 ? `${name} — ${count} item${count === 1 ? '' : 's'}` : name
      }
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={image}
          alt={name}
          fill
          sizes="(max-width: 640px) 50vw, 25vw"
          className="h-full w-full"
          imgClassName="transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="px-0.5 pt-2">
        <h3 className="text-body-emphasis font-medium text-text-primary">
          {name}
        </h3>
        {count > 0 ? (
          <p className="tnum mt-0.5 text-meta text-text-muted">
            {count} item{count === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function SearchLanding({
  recent,
  onSelect,
  onClearRecent,
  onRemoveRecent,
}: SearchLandingProps) {
  return (
    <div className="px-4 pb-10 sm:px-6">
      {/* Photo-driven discovery — the visual-search entry point. */}
      <Link
        href="/search/visual"
        className="pressable group mt-6 flex items-center gap-3 rounded-xl border border-border-subtle px-4 py-3 hover:bg-surface-alt"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-text-primary">
          <Icon name="camera" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body-emphasis font-medium text-text-primary">
            Search by photo
          </span>
          <span className="clamp-1 mt-0.5 block text-caption text-text-muted">
            Upload a photo to find similar pieces
          </span>
        </span>
        <Icon
          name="forward"
          size={16}
          className="shrink-0 text-text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-text-primary"
        />
      </Link>

      {recent.length > 0 ? (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <SectionLabel>Recent</SectionLabel>
            <button
              type="button"
              onClick={onClearRecent}
              className="pressable -mr-2 rounded-md px-2 py-1 text-caption font-medium text-text-secondary hover:text-text-primary"
            >
              Clear
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {recent.map((term) => (
              <span key={term} className="group relative inline-flex">
                <Chip icon="clock" onClick={() => onSelect(term)}>
                  {term}
                </Chip>
                <button
                  type="button"
                  aria-label={`Remove “${term}” from recent searches`}
                  onClick={() => onRemoveRecent(term)}
                  className="pressable absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-text-muted group-hover:flex hover:text-text-primary"
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <SectionLabel>Trending</SectionLabel>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {TRENDING_SEARCHES.map((term) => (
            <Chip key={term} icon="trending" onClick={() => onSelect(term)}>
              {term}
            </Chip>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <SectionLabel>Popular brands</SectionLabel>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {POPULAR_BRANDS.map((brand) => (
            <Chip key={brand} onClick={() => onSelect(brand)}>
              {brand}
            </Chip>
          ))}
        </div>
      </section>

      <GalleriaBanner />

      <section className="mt-9">
        <SectionTitle>Trending this week</SectionTitle>
        <div
          className="no-scrollbar -mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
          role="list"
          aria-label="Most-liked items this week"
        >
          {TRENDING_ITEMS.map((item, i) => (
            <div
              key={item.id}
              role="listitem"
              className="w-[150px] shrink-0 snap-start sm:w-[180px]"
            >
              <ProductTile item={item} priority={i < 2} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-9">
        <SectionTitle>Shop by category</SectionTitle>
        <div
          className="mt-3 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4"
          role="list"
          aria-label="Categories"
        >
          {CATEGORY_DIRECTORY.map((cat) => (
            <div key={cat.slug} role="listitem">
              <CategoryCard
                slug={cat.slug}
                name={cat.name}
                image={cat.image}
                count={cat.count}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
