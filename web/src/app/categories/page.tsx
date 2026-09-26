'use client';

/**
 * /categories — the department directory. Media-first tiles for every
 * top-level department (editorial covers borrowed from each category's
 * most-liked listing, live fixture counts), then the expandable index
 * of subcategories (port of CategoryTreeScreen).
 */

import { CategoryIndex } from '@/components/search/CategoryIndex';
import { CategoryTile } from '@/components/search/CategoryTile';
import { CATEGORY_DIRECTORY } from '@/components/search/taxonomy';

export default function CategoriesPage() {
  const liveItems = CATEGORY_DIRECTORY.reduce((n, c) => n + c.count, 0);

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 sm:px-6">
      <h1 className="text-screen-title font-bold text-text-primary">
        Categories
      </h1>
      <p className="mt-1 text-caption text-text-muted">
        <span className="tnum">{liveItems.toLocaleString('en-GB')}</span> live
        {' '}item{liveItems === 1 ? '' : 's'} across{' '}
        {CATEGORY_DIRECTORY.length} departments
      </p>

      {/* Department tiles — media is the colour, counts are fixture-truth */}
      <div
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
        role="list"
        aria-label="Departments"
      >
        {CATEGORY_DIRECTORY.map((cat, i) => (
          <CategoryTile
            key={cat.slug}
            slug={cat.slug}
            name={cat.name}
            image={cat.image}
            count={cat.count}
            className="aspect-[4/3] w-full"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={i < 4}
          />
        ))}
      </div>

      {/* Expandable index — flat rows, hairline separators */}
      <div className="mt-8">
        <h2 className="text-label font-semibold uppercase tracking-wide text-text-muted">
          All categories
        </h2>
        <div className="mt-2.5">
          <CategoryIndex />
        </div>
      </div>
    </div>
  );
}
