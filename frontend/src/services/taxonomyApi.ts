import { fetchJson } from '../lib/apiClient';
import { TAXONOMY_SEED, type TaxonomyCollection, type TaxonomyNode } from '../contracts/taxonomy';

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

export async function fetchTaxonomy(): Promise<TaxonomyCollection> {
  try {
    const payload = await fetchJson<TaxonomyApiResponse>('/taxonomy');
    if (!payload || !Array.isArray(payload.nodes)) {
      return TAXONOMY_SEED;
    }
    return groupNodesByType(payload.nodes);
  } catch {
    return TAXONOMY_SEED;
  }
}
