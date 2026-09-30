'use client';

/**
 * SearchLanding — the empty-query search surface: recent searches,
 * trending queries, popular brands, then the browse canvas — an
 * editorial banner, the week's most-liked pieces and a category grid.
 * Flat canvas, hairline-free — spacing + labels carry the hierarchy.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { ProductTile } from '@/components/cards/ProductTile';
import { AppImage } from '@/components/ui/AppImage';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import {
  mapListingToDiscoverySummary,
  type DiscoveryListingSummary,
} from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import { LISTINGS } from '@/lib/data/fixtures';
import { GALLERIA_HERO } from '@/lib/data/fixtures-media';
import { useGalleriaCover } from '@/lib/hooks/galleria-queries';
import {
  rankBrands,
  useTrendingListings,
  useTrendingSearches,
} from '@/lib/hooks/search-queries';
import { useCategoryDirectory } from './useCategoryDirectory';
import {
  CATEGORY_DIRECTORY,
  POPULAR_BRANDS,
  TRENDING_SEARCHES,
  type CategoryDirectoryEntry,
} from './taxonomy';

const LIVE = DATA_MODE === 'live';

/** Fixture-mode: the week's most-liked live pieces — filter copies before sorting. */
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
    <h2 className="text-label text-text-muted">
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

/** Slim editorial banner — media left, serif title, chevron right.
 *  Live mode renders only when a real published editorial exists;
 *  nothing is shown while it loads or when the Galleria has no issues. */
function GalleriaBanner() {
  const { cover } = useGalleriaCover();
  // Fixture mode renders the bundled hero; live renders only a real
  // editorial — guests, errors and empty issues show nothing.
  if (LIVE && !cover) return null;
  const mediaUri = cover?.heroUri ?? GALLERIA_HERO.mediaUri;
  const focalPoint = cover?.focalPoint ?? GALLERIA_HERO.focalPoint;
  const label = cover
    ? `The Galleria — ${cover.issueLabel}`
    : GALLERIA_HERO.kicker;
  const subline = cover?.dek ?? GALLERIA_HERO.subline;
  return (
    <Link
      href="/galleria"
      aria-label={label}
      className="pressable group mt-8 flex h-28 items-stretch overflow-hidden rounded-xl border border-border-subtle sm:h-[120px]"
    >
      <div className="relative h-full w-28 shrink-0 sm:w-44">
        <AppImage
          src={mediaUri}
          alt=""
          fill
          focalPoint={focalPoint}
          sizes="(max-width: 640px) 112px, 176px"
          className="h-full w-full"
          imgClassName="media-zoom"
        />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-4 pr-2 sm:pl-5">
        <div className="min-w-0 flex-1">
          <h3 className="clamp-1 text-editorial-title text-text-primary">
            {label}
          </h3>
          <p className="clamp-1 mt-0.5 text-caption text-text-secondary">
            {subline}
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
          sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 12.5vw"
          className="h-full w-full"
          imgClassName="media-zoom"
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
  const trending = useTrendingListings();
  const searches = useTrendingSearches();

  const trendingItems: DiscoveryListingSummary[] = useMemo(
    () => (LIVE ? trending.items.slice(0, 8) : TRENDING_ITEMS),
    [trending.items],
  );
  const trendingSearches = LIVE ? searches.terms : TRENDING_SEARCHES;
  const brands = useMemo(
    () => (LIVE ? rankBrands(trending.listings) : POPULAR_BRANDS),
    [trending.listings],
  );
  const { categories: directoryCategories } = useCategoryDirectory();
  const directory: CategoryDirectoryEntry[] = useMemo(() => {
    if (!LIVE) return CATEGORY_DIRECTORY;
    // Live: departments without inventory get no tile — a department with
    // no active listings is a dead end, not a discovery surface.
    return directoryCategories
      .filter((c) => c.count > 0 || c.image)
      .map((c) => ({ slug: c.slug, name: c.name, image: c.image, count: c.count }));
  }, [directoryCategories]);

  return (
    <div className="px-4 pb-10 sm:px-6">
      {/* Photo-driven discovery — the visual-search entry point. */}
      <Link
        href="/search/visual"
        className="pressable group mt-6 flex min-h-14 items-center gap-3.5 rounded-xl border border-border-subtle px-4 py-3 hover:bg-surface-alt"
      >
        <Icon
          name="camera"
          size={20}
          className="shrink-0 text-text-primary"
        />
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
                {/* 44px target, small glyph — reveals on hover AND on
                    focus/focus-within so keyboard users can reach it. */}
                <button
                  type="button"
                  aria-label={`Remove “${term}” from recent searches`}
                  onClick={() => onRemoveRecent(term)}
                  className="pressable absolute -right-2 -top-2 flex h-11 w-11 items-start justify-end rounded-full text-text-muted transition-opacity hover:text-text-primary focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:outline-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated">
                    <Icon name="close" size={12} />
                  </span>
                </button>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {trendingSearches.length > 0 ? (
        <section className="mt-6">
          <SectionLabel>Trending</SectionLabel>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {trendingSearches.map((term) => (
              <Chip key={term} icon="trending" onClick={() => onSelect(term)}>
                {term}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}

      {brands.length > 0 ? (
        <section className="mt-6">
          <SectionLabel>Popular brands</SectionLabel>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {brands.map((brand) => (
              <Chip key={brand} onClick={() => onSelect(brand)}>
                {brand}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}

      <GalleriaBanner />

      {trendingItems.length > 0 ? (
        <section className="mt-9">
          <SectionTitle>Trending this week</SectionTitle>
          <div
            className="no-scrollbar -mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:gap-4"
            role="list"
            aria-label="Most-liked items this week"
          >
            {trendingItems.map((item, i) => (
            <div
              key={item.id}
              role="listitem"
              className="w-[150px] shrink-0 snap-start sm:w-[180px] lg:w-[200px]"
            >
              <ProductTile item={item} priority={i < 2} />
            </div>
          ))}
          </div>
        </section>
      ) : null}

      {directory.length > 0 ? (
        <section className="mt-9">
          <SectionTitle>Shop by category</SectionTitle>
          <div
            className="mt-3 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 xl:grid-cols-8"
            role="list"
            aria-label="Categories"
          >
            {directory.map((cat) => (
              <div key={cat.slug} role="listitem">
                <CategoryCard
                  slug={cat.slug}
                  name={cat.name}
                  image={cat.image || undefined}
                  count={cat.count}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
