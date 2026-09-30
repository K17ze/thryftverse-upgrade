'use client';

/**
 * useCategoryDirectory — the browse vocabulary every discovery surface
 * shares (categories index, department nav, category pills, filter
 * sheets, PDP breadcrumb).
 *
 * Fixture mode returns the authored CATEGORIES/CATEGORY_TREE tables —
 * the seed vocabulary is the taxonomy there. Live mode fetches
 * GET /taxonomy/category-directory (server-computed counts + covers +
 * real child nodes) so the web can never offer fixture-only departments
 * or hide live ones. Until the live directory resolves, the seed covers
 * the first paint — entries then swap in without layout break.
 *
 * The resolved directory lives in categoryDirectoryStore so every
 * consumer sees one vocabulary and the network is touched once.
 */

import { useEffect, useState } from 'react';
import {
  currentCategories,
  ensureCategoryDirectory,
  isDirectoryResolved,
  type BrowseCategory,
} from './categoryDirectoryStore';

export type { BrowseCategory };
export { categoryLabel } from './categoryDirectoryStore';

export interface CategoryDirectoryResult {
  categories: BrowseCategory[];
  /** True while the first live fetch is in flight — seed already applied. */
  isLoading: boolean;
  /** slug → category lookup. */
  bySlug: (slug: string) => BrowseCategory | undefined;
}

export function useCategoryDirectory(): CategoryDirectoryResult {
  const [categories, setCategories] = useState<BrowseCategory[]>(currentCategories());
  const [isLoading, setIsLoading] = useState(() => !isDirectoryResolved());

  useEffect(() => {
    if (isDirectoryResolved() && categories === currentCategories()) return;
    let mounted = true;
    void ensureCategoryDirectory().then((cats) => {
      if (!mounted) return;
      setCategories(cats);
      setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    categories,
    isLoading,
    bySlug: (slug) =>
      categories.find(
        (c) => c.slug === slug || c.name.toLowerCase() === slug.toLowerCase(),
      ),
  };
}
