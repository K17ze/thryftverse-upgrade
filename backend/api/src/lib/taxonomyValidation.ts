import type { Pool } from 'pg';

// ── Taxonomy write-path normalisation ──────────────────────────────────────
//
// Closes the data-integrity leak identified in P2 #25: the listings write
// path accepted free-text category/brand/size/condition, so casing and
// synonym drift ('One Size' vs 'One size', 'sportswear' vs 'Sports',
// 'hm' vs 'H&M') produced split facets and broken filter joins.
//
// On every listing create/update, free-text values are normalised against
// the canonical `taxonomy_nodes` set (name + synonyms, case-insensitive).
// Unknown values pass through unchanged — this is intentionally lenient so
// legacy listings with values outside the canonical set (e.g. 'Vintage')
// remain editable until the backfill job maps them. Strict enum enforcement
// is a separate rollout step that requires the backfill to complete first.

interface TaxonomyNormaliser {
  category: Map<string, string>;
  condition: Map<string, string>;
  size: Map<string, string>;
  brand: Map<string, string>;
}

const EMPTY: TaxonomyNormaliser = {
  category: new Map(),
  condition: new Map(),
  size: new Map(),
  brand: new Map(),
};

let cache: { normaliser: TaxonomyNormaliser; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function loadNormaliser(db: Pool): Promise<TaxonomyNormaliser> {
  const result = await db.query<{ type: string; name: string; synonyms: string[] }>(
    `SELECT type, name, synonyms
     FROM taxonomy_nodes
     WHERE is_active = true`,
  );

  const normaliser: TaxonomyNormaliser = {
    category: new Map(),
    condition: new Map(),
    size: new Map(),
    brand: new Map(),
  };

  for (const row of result.rows) {
    const map = normaliser[row.type as keyof TaxonomyNormaliser];
    if (!map) continue;
    // Map the canonical name and every synonym (case-insensitive) to the
    // canonical display name so inbound free text collapses to one value.
    map.set(row.name.toLowerCase(), row.name);
    for (const synonym of row.synonyms) {
      map.set(synonym.toLowerCase(), row.name);
    }
  }

  return normaliser;
}

export async function getTaxonomyNormaliser(db: Pool): Promise<TaxonomyNormaliser> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.normaliser;
  }
  try {
    const normaliser = await loadNormaliser(db);
    cache = { normaliser, expiresAt: Date.now() + CACHE_TTL_MS };
    return normaliser;
  } catch {
    // Taxonomy table unavailable — lenient fallback, values pass through.
    return EMPTY;
  }
}

// Normalise a single free-text value to its canonical taxonomy name via the
// synonym map. Returns the original value when no match exists.
export function normaliseTaxonomyValue(
  map: Map<string, string>,
  value: string | undefined,
): string | undefined {
  if (!value) return value;
  return map.get(value.toLowerCase()) ?? value;
}
