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

// ── Browse/read-path category aliasing ────────────────────────────────────
//
// l.category / l.subcategory are mixed-vocabulary columns: native writes the
// canonical display name ('Hobbies & collectables'), the web composer writes
// the node id ('hobbies'), and legacy rows predate both. A browse filter that
// compares a route slug against only one form silently misses rows stored in
// the other.
//
// categoryAliasTerms resolves any inbound form (node id, display_key, name,
// or synonym — case-insensitive) to the full set of storable spellings for
// that node, so `LOWER(l.category) = ANY(terms)` matches every row regardless
// of which client wrote it. Unresolvable params pass through verbatim so
// legacy free-text categories keep working.

interface CategoryNodeAlias {
  /** Every lowercase spelling a stored column may carry for this node. */
  storables: string[];
}

let aliasCache: { map: Map<string, CategoryNodeAlias>; expiresAt: number } | null = null;

async function loadCategoryAliases(db: Pool): Promise<Map<string, CategoryNodeAlias>> {
  const result = await db.query<{
    id: string;
    display_key: string;
    name: string;
    synonyms: string[];
  }>(
    `SELECT id, display_key, name, synonyms
     FROM taxonomy_nodes
     WHERE is_active = true AND type = 'category'`,
  );

  const map = new Map<string, CategoryNodeAlias>();
  for (const row of result.rows) {
    const storables = [
      ...new Set(
        [row.id, row.display_key, row.name]
          .map((v) => v.toLowerCase())
          .filter(Boolean),
      ),
    ];
    const alias: CategoryNodeAlias = { storables };
    // Every inbound spelling resolves to the same storable set.
    for (const key of [row.id, row.display_key, row.name, ...row.synonyms]) {
      const k = key.toLowerCase();
      if (k && !map.has(k)) map.set(k, alias);
    }
  }
  return map;
}

async function getCategoryAliases(db: Pool): Promise<Map<string, CategoryNodeAlias>> {
  if (aliasCache && Date.now() < aliasCache.expiresAt) {
    return aliasCache.map;
  }
  try {
    const map = await loadCategoryAliases(db);
    aliasCache = { map, expiresAt: Date.now() + CACHE_TTL_MS };
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Resolve one inbound category filter term to every lowercase spelling the
 * stored column may carry. Unknown terms return [term.toLowerCase()].
 */
export async function categoryAliasTerms(db: Pool, term: string): Promise<string[]> {
  const alias = (await getCategoryAliases(db)).get(term.toLowerCase());
  return alias?.storables ?? [term.toLowerCase()];
}

/**
 * Resolve a list of inbound terms — union of each term's storable set.
 */
export async function categoryAliasTermsMany(db: Pool, terms: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const t of terms) {
    for (const s of await categoryAliasTerms(db, t)) out.add(s);
  }
  return [...out];
}
