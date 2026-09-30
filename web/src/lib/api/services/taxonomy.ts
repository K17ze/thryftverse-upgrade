/**
 * Taxonomy service — web port of frontend/src/services/taxonomyApi.ts.
 * GET /taxonomy returns every active taxonomy_node; the response is
 * grouped into the TaxonomyCollection shape the composer reads. Any
 * failure (offline, table missing, malformed payload) falls back to
 * TAXONOMY_SEED so the sell flow always has a valid vocabulary.
 */

import { fetchJson } from '../http';
import {
  TAXONOMY_SEED,
  type TaxonomyCollection,
  type TaxonomyNode,
} from '@/lib/contracts/taxonomy';

interface TaxonomyApiResponse {
  ok: true;
  nodes: TaxonomyNode[];
}

function groupNodesByType(nodes: TaxonomyNode[]): TaxonomyCollection {
  const collection: TaxonomyCollection = {
    categories: [],
    conditions: [],
    sizes: [],
    brands: [],
    colours: [],
    materials: [],
  };

  for (const node of nodes) {
    switch (node.type) {
      case 'category':
        collection.categories.push(node);
        break;
      case 'condition':
        collection.conditions.push(node);
        break;
      case 'size':
        collection.sizes.push(node);
        break;
      case 'brand':
        collection.brands.push(node);
        break;
      case 'colour':
        collection.colours.push(node);
        break;
      case 'material':
        collection.materials.push(node);
        break;
    }
  }

  return collection;
}

/** Live browse directory — GET /taxonomy/category-directory. Counts and
 *  covers are computed server-side over active listings (mixed-vocabulary
 *  columns resolved through the alias map). */
export interface CategoryDirectoryApiEntry {
  id: string;
  name: string;
  displayKey: string;
  sortOrder: number;
  count: number;
  cover: string | null;
  children: { id: string; name: string; displayKey: string; count: number }[];
}

export async function fetchCategoryDirectory(
  signal?: AbortSignal,
): Promise<CategoryDirectoryApiEntry[]> {
  const payload = await fetchJson<{ ok?: boolean; directory?: CategoryDirectoryApiEntry[] }>(
    '/taxonomy/category-directory',
    undefined,
    { signal },
  );
  if (!payload || !Array.isArray(payload.directory)) {
    throw new Error('Category directory unavailable');
  }
  return payload.directory;
}

export async function fetchTaxonomy(signal?: AbortSignal): Promise<TaxonomyCollection> {
  try {
    const payload = await fetchJson<TaxonomyApiResponse>('/taxonomy', undefined, {
      signal,
    });
    if (!payload || !Array.isArray(payload.nodes)) {
      return TAXONOMY_SEED;
    }
    return groupNodesByType(payload.nodes);
  } catch {
    return TAXONOMY_SEED;
  }
}
