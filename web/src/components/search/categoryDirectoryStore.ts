/**
 * Category directory store — the resolved browse vocabulary, shared by
 * the React hook (useCategoryDirectory) and module-level helpers
 * (categoryLabel) that can't call hooks. No 'use client' here: this is a
 * plain module so both server and client importers can read it.
 *
 * Fixture mode resolves synchronously to the authored tables. Live mode
 * starts on the same seed and swaps in GET /taxonomy/category-directory
 * once it lands — the swap is driven by useCategoryDirectory's effect.
 */

import { DATA_MODE } from '@/lib/api/client';
import {
  fetchCategoryDirectory,
  type CategoryDirectoryApiEntry,
} from '@/lib/api/services/taxonomy';
import { CATEGORY_DIRECTORY, subcategoriesFor, subcategoryCount } from './taxonomy';

/** Normalised browse-facing category — the same shape in both modes. */
export interface BrowseCategory {
  slug: string;
  name: string;
  image: string;
  count: number;
  subcategories: { id: string; name: string; count: number }[];
}

export const FIXTURE_CATEGORIES: BrowseCategory[] = CATEGORY_DIRECTORY.map((c) => ({
  slug: c.slug,
  name: c.name,
  image: c.image,
  count: c.count,
  subcategories: subcategoriesFor(c.slug).map((name) => ({
    id: name,
    name,
    count: subcategoryCount(c.slug, name),
  })),
}));

function toBrowseCategory(e: CategoryDirectoryApiEntry): BrowseCategory {
  return {
    // The route slug is the node id — the backend alias map resolves it
    // to stored rows whether they carry the id, display key or name.
    slug: e.id,
    name: e.name,
    image: e.cover ?? '',
    count: e.count,
    subcategories: e.children.map((c) => ({ id: c.id, name: c.name, count: c.count })),
  };
}

let resolved: BrowseCategory[] | null = null;
let inflight: Promise<BrowseCategory[]> | null = null;

/** Current best-known vocabulary — fixture seed until live resolves. */
export function currentCategories(): BrowseCategory[] {
  return resolved ?? FIXTURE_CATEGORIES;
}

/** True once the live directory has landed (always true in fixture mode —
 * the seed IS the directory there). */
export function isDirectoryResolved(): boolean {
  return DATA_MODE !== 'live' || resolved !== null;
}

/** Kick the live fetch (no-op in fixture mode or once resolved). */
export function ensureCategoryDirectory(): Promise<BrowseCategory[]> {
  if (DATA_MODE !== 'live' || resolved) {
    return Promise.resolve(resolved ?? FIXTURE_CATEGORIES);
  }
  inflight ??= fetchCategoryDirectory()
    .then((entries) => entries.map(toBrowseCategory))
    .then((cats) => {
      resolved = cats;
      return cats;
    })
    .catch(() => {
      // A failed directory read keeps the seed vocabulary — better than
      // an empty departments page.
      inflight = null;
      return resolved ?? FIXTURE_CATEGORIES;
    });
  return inflight;
}

/**
 * Synchronous slug/name → display-name resolver for module-level contexts
 * (facet tally helpers, breadcrumb labels). Matches the node id or the
 * display name — l.category is mixed-vocabulary. Unknown values render
 * capitalised rather than raw.
 */
/**
 * spelling → canonical directory slug (node id or display name in).
 * Used to merge mixed-vocabulary rows under one facet value. Unknown
 * values return the input lowercased — self-canonical.
 */
export function categoryCanonicalKey(value: string): string {
  const v = value.trim().toLowerCase();
  const cats = currentCategories();
  const top = cats.find((c) => c.slug === v || c.name.toLowerCase() === v);
  if (top) return top.slug;
  // A leaf-stored row (subcategory id/name in `category`) belongs to its
  // parent department — collapse to the top-level slug.
  const parent = cats.find((c) =>
    c.subcategories.some(
      (s) => s.id.toLowerCase() === v || s.name.toLowerCase() === v,
    ),
  );
  return parent?.slug ?? v;
}

/** True when a stored l.category spelling resolves to the given canonical
 *  key — the client-side predicate for mixed-vocabulary rows. */
export function categoryMatches(stored: string, canonicalKey: string): boolean {
  return categoryCanonicalKey(stored) === canonicalKey;
}

export function categoryLabel(value: string): string {
  const v = value.trim().toLowerCase();
  const cats = currentCategories();
  const found = cats.find((c) => c.slug === v || c.name.toLowerCase() === v);
  if (found) return found.name;
  // Leaf spellings resolve to the child name — a listing stored with a
  // subcategory id in `category` still gets a proper label.
  const leaf = cats
    .flatMap((c) => c.subcategories)
    .find((s) => s.id.toLowerCase() === v || s.name.toLowerCase() === v);
  return leaf?.name ?? value.charAt(0).toUpperCase() + value.slice(1);
}
