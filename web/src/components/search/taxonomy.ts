/**
 * Browse taxonomy — subcategory composition per top-level category.
 * Fixture-mode taxonomy: top categories come from CATEGORIES, children
 * mirror the subcategory values that actually exist on fixture listings
 * (mirrors CategoryTreeScreen's parent→children grouping).
 */

import { CATEGORIES, LISTINGS } from '@/lib/data/fixtures';

export const CATEGORY_TREE: Record<string, string[]> = {
  women: ['Dresses', 'Knitwear', 'Coats', 'Skirts', 'Trousers', 'Boots'],
  men: [
    'Shirts',
    'T-shirts',
    'Jackets',
    'Leather jackets',
    'Denim jackets',
    'Jeans',
    'Hoodies',
    'Trousers',
    'Blazers',
  ],
  sneakers: ['High tops', 'Low tops'],
  bags: ['Shoulder bags', 'Totes'],
  accessories: ['Watches', 'Sunglasses', 'Scarves'],
  vintage: [],
  designer: [],
  streetwear: [],
};

export function subcategoriesFor(slug: string): string[] {
  return CATEGORY_TREE[slug] ?? [];
}

/** Live listing count per top-level category slug — fixture truth. */
const CATEGORY_COUNTS = (() => {
  const counts = new Map<string, number>();
  for (const l of LISTINGS) {
    counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
  }
  return counts;
})();

/** Live listing count for a subcategory — case-insensitive match. */
const SUBCATEGORY_COUNTS = (() => {
  const counts = new Map<string, number>();
  for (const l of LISTINGS) {
    if (!l.subcategory) continue;
    const key = `${l.category}:${l.subcategory.toLowerCase()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
})();

export function subcategoryCount(slug: string, sub: string): number {
  return SUBCATEGORY_COUNTS.get(`${slug}:${sub.toLowerCase()}`) ?? 0;
}

/**
 * Category directory — every department with its live count and an
 * editorial cover borrowed from its most-liked listing (taxonomy image
 * as fallback for empty departments). Counts are fixture-truth: a
 * department with no listings simply carries no count.
 */
export interface CategoryDirectoryEntry {
  slug: string;
  name: string;
  image: string;
  count: number;
}

const CATEGORY_COVERS = (() => {
  const covers = new Map<string, string>();
  for (const l of [...LISTINGS].sort((a, b) => b.likes - a.likes)) {
    if (!covers.has(l.category) && l.images[0]) covers.set(l.category, l.images[0]);
  }
  return covers;
})();

export const CATEGORY_DIRECTORY: CategoryDirectoryEntry[] = CATEGORIES.map((c) => ({
  slug: c.slug,
  name: c.name,
  image: CATEGORY_COVERS.get(c.slug) ?? c.image ?? '',
  count: CATEGORY_COUNTS.get(c.slug) ?? 0,
}));

/** Busiest departments first — for recovery surfaces and rails. */
export const CATEGORY_DIRECTORY_BY_COUNT = [...CATEGORY_DIRECTORY].sort(
  (a, b) => b.count - a.count,
);

/** Queries that reliably match the fixture catalogue. */
export const TRENDING_SEARCHES = [
  'Adidas Samba',
  "Levi's",
  'Mohair cardigan',
  'Vintage tee',
  'Silk scarf',
  'Wool coat',
];

/** Top brands by fixture occurrence — real catalogue signal, not copy. */
export const POPULAR_BRANDS: string[] = (() => {
  const counts = new Map<string, number>();
  for (const l of LISTINGS) {
    if (l.brand) counts.set(l.brand, (counts.get(l.brand) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([brand]) => brand);
})();

/**
 * Zero-result recovery terms — top brands plus the busiest categories,
 * all derived from fixture data so every chip resolves.
 */
export const POPULAR_SEARCHES: string[] = (() => {
  const topCategories = CATEGORY_DIRECTORY_BY_COUNT.slice(0, 3).map((c) => c.name);
  return [...POPULAR_BRANDS.slice(0, 4), ...topCategories];
})();
