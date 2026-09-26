/**
 * Conversational-search engine — deterministic, fully local.
 *
 * Port of mobile's extractFilters() (services/conversationalSearchApi.ts) to
 * the web fixture taxonomy. Every dictionary below is derived from the real
 * LISTINGS catalogue — brand names, subcategory terms, colour words — so a
 * matched chip always names a value the catalogue can actually satisfy.
 *
 * Nothing here is an LLM. Extraction is keyword rules + regex; the UI labels
 * the output "matched keywords" (AGENTS.md §11 — truthful UI).
 */

import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import { LISTINGS } from '@/lib/data/fixtures';
import { CONDITION_OPTIONS } from '@/components/filters/filterTypes';
import { COLOR_VOCAB } from '@/components/visualsearch/visualSearchTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structured intent extracted from one or more chat messages. */
export interface ParsedIntent {
  /** Canonical fixture brand names (e.g. "Levi's", "New Balance"). */
  brands: string[];
  /** Item/category terms — the object of the search (e.g. "denim jacket"). */
  itemTerms: string[];
  /** Top-level category slugs — women, men, sneakers, bags, accessories. */
  categorySlugs: string[];
  /** Size tokens as written in listings — "9", "M", "W32". */
  sizes: string[];
  conditions: ListingCondition[];
  priceMin: number | null;
  priceMax: number | null;
  /** Canonical colour names from COLOR_VOCAB. */
  colours: string[];
  /** Style words — vintage, streetwear, oversized… */
  styles: string[];
  sustainable: boolean;
  /** Leftover meaningful words — matched against listing text. */
  keywords: string[];
}

export interface ConstraintChip {
  /** `${kind}:${value}` — stable id for removal. */
  id: string;
  kind:
    | 'brand'
    | 'category'
    | 'item'
    | 'size'
    | 'condition'
    | 'price'
    | 'colour'
    | 'style'
    | 'sustainable'
    | 'keyword';
  /** The value to strip from the intent on removal. */
  value: string;
  label: string;
}

export const EMPTY_INTENT: ParsedIntent = {
  brands: [],
  itemTerms: [],
  categorySlugs: [],
  sizes: [],
  conditions: [],
  priceMin: null,
  priceMax: null,
  colours: [],
  styles: [],
  sustainable: false,
  keywords: [],
};

/** Fresh intent — never share EMPTY_INTENT's arrays (spreads reuse them). */
function newIntent(): ParsedIntent {
  return { ...EMPTY_INTENT, keywords: [], brands: [], itemTerms: [], categorySlugs: [], sizes: [], conditions: [], colours: [], styles: [] };
}

export function constraintCount(intent: ParsedIntent): number {
  return (
    intent.brands.length +
    intent.itemTerms.length +
    intent.categorySlugs.length +
    intent.sizes.length +
    intent.conditions.length +
    (intent.priceMin != null || intent.priceMax != null ? 1 : 0) +
    intent.colours.length +
    intent.styles.length +
    (intent.sustainable ? 1 : 0) +
    intent.keywords.length
  );
}

// ---------------------------------------------------------------------------
// Dictionaries — every entry names something in the real fixture taxonomy
// ---------------------------------------------------------------------------

/** [alias → canonical fixture brand]. Aliases are matched on word boundaries
 *  against the normalized query, longest first. */
const BRAND_ALIASES = ([
  ['yves saint laurent', 'Yves Saint Laurent'],
  ['saint laurent', 'Yves Saint Laurent'],
  ['ysl', 'Yves Saint Laurent'],
  ['polo ralph lauren', 'Ralph Lauren'],
  ['ralph lauren', 'Ralph Lauren'],
  ['polo', 'Ralph Lauren'],
  ['air jordan', 'Nike'],
  ['nike', 'Nike'],
  ["levi's", "Levi's"],
  ['levis', "Levi's"],
  ['levi', "Levi's"],
  ['realisation par', 'Réalisation Par'],
  ['realisation', 'Réalisation Par'],
  ['all saints', 'AllSaints'],
  ['allsaints', 'AllSaints'],
  ['chanel', 'Chanel'],
  ['max mara', 'Max Mara'],
  ['seiko', 'Seiko'],
  ['fear of god', 'Essentials'],
  ['essentials', 'Essentials'],
  ['new balance', 'New Balance'],
  ['johnstons of elgin', 'Johnstons of Elgin'],
  ['johnstons', 'Johnstons of Elgin'],
  ['theory', 'Theory'],
  ['celine', 'Celine'],
  ['carhartt wip', 'Carhartt WIP'],
  ['carhartt', 'Carhartt WIP'],
  ['isabel marant', 'Isabel Marant'],
  ['marant', 'Isabel Marant'],
  ['acne studios', 'Acne Studios'],
  ['acne', 'Acne Studios'],
  ['toteme', 'Toteme'],
  ['a.p.c.', 'A.P.C.'],
  ['a.p.c', 'A.P.C.'],
  ['apc', 'A.P.C.'],
  ['marni', 'Marni'],
  ['adidas', 'Adidas'],
  ['hermes', 'Hermès'],
  ['the row', 'The Row'],
  ['stussy', 'Stüssy'],
  ['ami', 'AMI'],
  ['cos', 'Cos'],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

/** Words that pin the search to a top-level listing.category slug. */
const CATEGORY_SLUG_WORDS = ([
  ['womenswear', 'women'],
  ['womens', 'women'],
  ["women's", 'women'],
  ['women', 'women'],
  ['ladies', 'women'],
  ['menswear', 'men'],
  ["men's", 'men'],
  ['mens', 'men'],
  ['men', 'men'],
  ['sneakers', 'sneakers'],
  ['sneaker', 'sneakers'],
  ['trainers', 'sneakers'],
  ['kicks', 'sneakers'],
  ['handbags', 'bags'],
  ['handbag', 'bags'],
  ['bags', 'bags'],
  ['purse', 'bags'],
  ['accessories', 'accessories'],
  ['accessory', 'accessories'],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

/** Item terms — the object of the search. `match` strings are OR-tested
 *  against listing category/subcategory/title. */
const ITEM_TERMS: { keys: string[]; label: string; match: string[] }[] = [
  { keys: ['denim jacket'], label: 'Denim jacket', match: ['denim jacket'] },
  { keys: ['leather jacket'], label: 'Leather jacket', match: ['leather jacket'] },
  { keys: ['denim'], label: 'Denim', match: ['denim', 'jeans'] },
  { keys: ['jeans', 'jean'], label: 'Jeans', match: ['jeans'] },
  { keys: ['harrington'], label: 'Harrington jacket', match: ['harrington'] },
  { keys: ['biker jacket'], label: 'Biker jacket', match: ['biker'] },
  { keys: ['jackets', 'jacket'], label: 'Jacket', match: ['jacket'] },
  { keys: ['coats', 'coat'], label: 'Coat', match: ['coat'] },
  { keys: ['slip dress'], label: 'Slip dress', match: ['slip dress'] },
  { keys: ['midi dress'], label: 'Midi dress', match: ['midi dress'] },
  { keys: ['dresses', 'dress'], label: 'Dress', match: ['dress'] },
  { keys: ['skirts', 'skirt'], label: 'Skirt', match: ['skirt'] },
  { keys: ['cardigans', 'cardigan'], label: 'Cardigan', match: ['cardigan'] },
  { keys: ['knitwear', 'knitted', 'knit'], label: 'Knitwear', match: ['knit'] },
  { keys: ['jumpers', 'jumper'], label: 'Jumper', match: ['jumper', 'knitwear'] },
  { keys: ['sweaters', 'sweater', 'crew neck'], label: 'Sweater', match: ['sweater', 'crew neck', 'knitwear'] },
  { keys: ['hoodies', 'hoodie'], label: 'Hoodie', match: ['hoodie', 'sweatshirt'] },
  { keys: ['sweatshirts', 'sweatshirt'], label: 'Sweatshirt', match: ['sweatshirt', 'hoodie'] },
  { keys: ['blazers', 'blazer'], label: 'Blazer', match: ['blazer'] },
  { keys: ['t-shirts', 't-shirt', 'tshirt', 'tees', 'tee'], label: 'T-shirt', match: ['t-shirt', 'tee'] },
  { keys: ['shirts', 'shirt'], label: 'Shirt', match: ['shirt'] },
  { keys: ['cargo trousers', 'cargo pants', 'cargos'], label: 'Cargo trousers', match: ['cargo'] },
  { keys: ['trousers', 'pants'], label: 'Trousers', match: ['trouser', 'pants', 'cargo'] },
  { keys: ['boots', 'boot'], label: 'Boots', match: ['boot'] },
  { keys: ['shoulder bag'], label: 'Shoulder bag', match: ['shoulder bag'] },
  { keys: ['crossbody', 'cross body'], label: 'Crossbody bag', match: ['crossbody'] },
  { keys: ['totes', 'tote'], label: 'Tote bag', match: ['tote'] },
  { keys: ['bags', 'bag'], label: 'Bag', match: ['bag', 'tote', 'crossbody'] },
  { keys: ['watches', 'watch'], label: 'Watch', match: ['watch'] },
  { keys: ['sunglasses', 'shades'], label: 'Sunglasses', match: ['sunglasses'] },
  { keys: ['scarves', 'scarf'], label: 'Scarf', match: ['scarf', 'scarves'] },
].sort((a, b) => Math.max(...b.keys.map((k) => k.length)) - Math.max(...a.keys.map((k) => k.length)));

/** Style words — matched against listing text (title/description). */
const STYLE_WORDS = [
  'vintage',
  'retro',
  'streetwear',
  'workwear',
  'minimalist',
  'oversized',
  'designer',
  'graphic',
  'y2k',
].sort((a, b) => b.length - a.length);

const SUSTAINABLE_WORDS = [
  'sustainable',
  'secondhand',
  'second-hand',
  'pre-loved',
  'preloved',
  'ethical',
  'recycled',
  'organic',
  'eco',
].sort((a, b) => b.length - a.length);

/** Phrase → fixture condition. Longest phrase first; first hit wins. */
const CONDITION_PHRASES = ([
  ['new with tags', 'New with tags'],
  ['brand new', 'New with tags'],
  ['nwt', 'New with tags'],
  ['new without tags', 'New without tags'],
  ['nwot', 'New without tags'],
  ['like new', 'Very good'],
  ['very good', 'Very good'],
  ['excellent', 'Very good'],
  ['good condition', 'Good'],
  ['used', 'Good'],
  ['well worn', 'Satisfactory'],
  ['worn', 'Good'],
  ['satisfactory', 'Satisfactory'],
  ['fair condition', 'Satisfactory'],
] as [string, ListingCondition][]).sort((a, b) => b[0].length - a[0].length);

/** Words that never describe the item — dropped from the residual pass. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'any', 'some',
  'want', 'need', 'like', 'love', 'looking', 'look', 'find', 'show',
  'something', 'anything', 'please', 'would', 'could', 'should', 'can',
  'you', 'your', 'yours', 'are', 'was', 'were', 'what', 'which', 'who',
  'how', 'much', 'got', 'get', 'give', 'gimme', 'buy', 'buying', 'see',
  'me', 'my', 'mine', 'our', 'us', 'they', 'them', 'their', 'its',
  'im', 'ive', 'ill', 'dont', 'does', 'did', 'doing', 'not', 'too',
  'really', 'just', 'also', 'maybe', 'perhaps', 'around', 'about',
  'cheap', 'cheaper', 'cheapest', 'nice', 'good', 'great', 'cool',
  'new', 'old', 'one', 'ones', 'piece', 'item', 'items', 'thing',
]);

// ---------------------------------------------------------------------------
// Precomputed listing colour table — which colour names each listing's own
// text mentions (same approach as the visual-search engine).
// ---------------------------------------------------------------------------

const LISTING_COLOURS: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const l of LISTINGS) {
    const text = normalize(`${l.title} ${l.description} ${l.subcategory ?? ''}`);
    const found: string[] = [];
    for (const c of COLOR_VOCAB) {
      if (c.aliases.some((a) => includesWord(text, a))) found.push(c.name);
    }
    map.set(l.id, found);
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Lowercase, strip diacritics (hermès→hermes), collapse whitespace. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Substring match that requires non-alphanumeric boundaries on both ends —
 *  so "cos" doesn't match inside "cost" and "9" doesn't match inside "49". */
function includesWord(text: string, phrase: string): boolean {
  let from = 0;
  for (;;) {
    const i = text.indexOf(phrase, from);
    if (i === -1) return false;
    const before = i === 0 ? ' ' : text[i - 1];
    const after = i + phrase.length >= text.length ? ' ' : text[i + phrase.length];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    from = i + 1;
  }
}

/** Blank a consumed span so the residual pass can't re-read it. */
function blank(scratch: string, start: number, length: number): string {
  return scratch.slice(0, start) + ' '.repeat(length) + scratch.slice(start + length);
}

/** Find + blank every bounded occurrence of `phrase` in `scratch`. */
function consume(scratch: string, phrase: string): { scratch: string; found: boolean } {
  let found = false;
  let out = scratch;
  let from = 0;
  for (;;) {
    const i = out.indexOf(phrase, from);
    if (i === -1) break;
    const before = i === 0 ? ' ' : out[i - 1];
    const after = i + phrase.length >= out.length ? ' ' : out[i + phrase.length];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
      out = blank(out, i, phrase.length);
      found = true;
      // don't advance — re-scan same index now that it's spaces
    }
    from = i + 1;
  }
  return { scratch: out, found };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Deterministic keyword extraction. Extraction order matters: price/size
 * phrases first, then dictionary terms longest-first, leftovers become
 * free-text keywords. Honest port of mobile extractFilters().
 */
export function parseIntent(query: string): ParsedIntent {
  const text = normalize(query);
  let scratch = text;

  const intent: ParsedIntent = newIntent();

  // ── Price ──
  const range = text.match(/between\s*£?\s*(\d+)\s*(?:and|&|–|-|—|to)\s*£?\s*(\d+)/);
  if (range && range.index !== undefined) {
    const lo = Math.min(Number(range[1]), Number(range[2]));
    const hi = Math.max(Number(range[1]), Number(range[2]));
    intent.priceMin = lo;
    intent.priceMax = hi;
    scratch = blank(scratch, range.index, range[0].length);
  } else {
    const spanRange = text.match(/£\s*(\d+)\s*(?:–|-|—)\s*£?\s*(\d+)/);
    if (spanRange && spanRange.index !== undefined) {
      intent.priceMin = Math.min(Number(spanRange[1]), Number(spanRange[2]));
      intent.priceMax = Math.max(Number(spanRange[1]), Number(spanRange[2]));
      scratch = blank(scratch, spanRange.index, spanRange[0].length);
    }
  }
  const maxMatch = text.match(/(?:under|below|less than|up to|no more than|max(?:imum)?|within|within a budget of)\s*£?\s*(\d+)/);
  if (maxMatch && maxMatch.index !== undefined && intent.priceMax == null) {
    intent.priceMax = Number(maxMatch[1]);
    scratch = blank(scratch, maxMatch.index, maxMatch[0].length);
  }
  const minMatch = text.match(/(?:over|above|more than|at least|min(?:imum)?|from)\s*£?\s*(\d+)/);
  if (minMatch && minMatch.index !== undefined && intent.priceMin == null) {
    intent.priceMin = Number(minMatch[1]);
    scratch = blank(scratch, minMatch.index, minMatch[0].length);
  }

  // ── Sizes ──
  for (const m of text.matchAll(/(?:size|uk|us|eu)\s*([0-9]{1,2})\b/g)) {
    const value = m[1];
    if (m.index !== undefined && !intent.sizes.includes(value)) {
      intent.sizes.push(value);
      scratch = blank(scratch, m.index, m[0].length);
    }
  }
  for (const m of text.matchAll(/\bsize\s+(xs|s|m|l|xl|xxl)\b/g)) {
    const value = m[1].toUpperCase();
    if (m.index !== undefined && !intent.sizes.includes(value)) {
      intent.sizes.push(value);
      scratch = blank(scratch, m.index, m[0].length);
    }
  }
  for (const m of text.matchAll(/\bw\s?([0-9]{2})\b/g)) {
    const value = `W${m[1]}`;
    if (m.index !== undefined && !intent.sizes.some((s) => s.toLowerCase() === value.toLowerCase())) {
      intent.sizes.push(value);
      scratch = blank(scratch, m.index, m[0].length);
    }
  }

  // ── Conditions ──
  for (const [phrase, condition] of CONDITION_PHRASES) {
    const hit = consume(scratch, phrase);
    if (hit.found) {
      scratch = hit.scratch;
      if (!intent.conditions.includes(condition)) intent.conditions.push(condition);
    }
  }

  // ── Sustainability ──
  for (const word of SUSTAINABLE_WORDS) {
    const hit = consume(scratch, word);
    if (hit.found) {
      scratch = hit.scratch;
      intent.sustainable = true;
    }
  }

  // ── Brands ──
  for (const [alias, canonical] of BRAND_ALIASES) {
    const hit = consume(scratch, alias);
    if (hit.found) {
      scratch = hit.scratch;
      if (!intent.brands.includes(canonical)) intent.brands.push(canonical);
    }
  }

  // ── Top-level category slugs ──
  for (const [word, slug] of CATEGORY_SLUG_WORDS) {
    const hit = consume(scratch, word);
    if (hit.found) {
      scratch = hit.scratch;
      if (!intent.categorySlugs.includes(slug)) intent.categorySlugs.push(slug);
    }
  }

  // ── Style words ──
  for (const word of STYLE_WORDS) {
    const hit = consume(scratch, word);
    if (hit.found) {
      scratch = hit.scratch;
      const label = word.charAt(0).toUpperCase() + word.slice(1);
      if (!intent.styles.includes(label)) intent.styles.push(label);
    }
  }

  // ── Item terms ──
  for (const term of ITEM_TERMS) {
    for (const key of term.keys) {
      const hit = consume(scratch, key);
      if (hit.found) {
        scratch = hit.scratch;
        if (!intent.itemTerms.includes(term.label)) intent.itemTerms.push(term.label);
        break;
      }
    }
  }

  // ── Colours (last dictionary — after item terms so "denim" is Denim, not
  //     Blue, when the user meant the fabric) ──
  const seenColours = new Set<string>();
  const colourAliases = COLOR_VOCAB.flatMap((c) =>
    c.aliases.map((a) => ({ alias: a, name: c.name })),
  ).sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, name } of colourAliases) {
    const hit = consume(scratch, alias);
    if (hit.found) {
      scratch = hit.scratch;
      if (!seenColours.has(name)) {
        seenColours.add(name);
        intent.colours.push(name);
      }
    }
  }

  // ── Residual keywords — what's left describes the item itself ──
  const residuals = scratch
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  intent.keywords = dedupe(residuals);

  return intent;
}

/**
 * Follow-up turns refine rather than replace — mobile merge semantics:
 * list fields union (deduped), price bounds overwrite only when set,
 * sustainable is sticky-on.
 */
export function mergeIntent(prior: ParsedIntent, next: ParsedIntent): ParsedIntent {
  return {
    brands: dedupe([...prior.brands, ...next.brands]),
    itemTerms: dedupe([...prior.itemTerms, ...next.itemTerms]),
    categorySlugs: dedupe([...prior.categorySlugs, ...next.categorySlugs]),
    sizes: dedupe([...prior.sizes, ...next.sizes]),
    conditions: dedupe([...prior.conditions, ...next.conditions]),
    priceMin: next.priceMin ?? prior.priceMin,
    priceMax: next.priceMax ?? prior.priceMax,
    colours: dedupe([...prior.colours, ...next.colours]),
    styles: dedupe([...prior.styles, ...next.styles]),
    sustainable: prior.sustainable || next.sustainable,
    keywords: dedupe([...prior.keywords, ...next.keywords]),
  };
}

function dedupe<T extends string>(values: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of values) {
    const k = v.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chips — parsed constraints shown under each assistant turn; removable.
// ---------------------------------------------------------------------------

export function buildChips(intent: ParsedIntent): ConstraintChip[] {
  const chips: ConstraintChip[] = [];
  for (const b of intent.brands) {
    chips.push({ id: `brand:${b.toLowerCase()}`, kind: 'brand', value: b, label: `Brand: ${b}` });
  }
  for (const slug of intent.categorySlugs) {
    const label = slug.charAt(0).toUpperCase() + slug.slice(1);
    chips.push({ id: `category:${slug}`, kind: 'category', value: slug, label: `Category: ${label}` });
  }
  for (const t of intent.itemTerms) {
    chips.push({ id: `item:${t.toLowerCase()}`, kind: 'item', value: t, label: t });
  }
  for (const s of intent.sizes) {
    chips.push({ id: `size:${s.toLowerCase()}`, kind: 'size', value: s, label: `Size: ${s.toUpperCase()}` });
  }
  for (const c of intent.conditions) {
    chips.push({ id: `condition:${c.toLowerCase()}`, kind: 'condition', value: c, label: `Condition: ${c}` });
  }
  for (const c of intent.colours) {
    chips.push({ id: `colour:${c.toLowerCase()}`, kind: 'colour', value: c, label: `Colour: ${c}` });
  }
  for (const s of intent.styles) {
    chips.push({ id: `style:${s.toLowerCase()}`, kind: 'style', value: s, label: `Style: ${s}` });
  }
  if (intent.priceMin != null || intent.priceMax != null) {
    const label =
      intent.priceMin != null && intent.priceMax != null
        ? `Price: £${intent.priceMin}–£${intent.priceMax}`
        : intent.priceMax != null
          ? `Price: under £${intent.priceMax}`
          : `Price: over £${intent.priceMin}`;
    chips.push({ id: 'price:range', kind: 'price', value: 'range', label });
  }
  if (intent.sustainable) {
    chips.push({ id: 'sustainable:only', kind: 'sustainable', value: 'only', label: 'Sustainable only' });
  }
  for (const k of intent.keywords) {
    chips.push({ id: `keyword:${k}`, kind: 'keyword', value: k, label: `“${k}”` });
  }
  return chips;
}

/** Strip one constraint and return a fresh intent for the re-run. */
export function removeConstraint(intent: ParsedIntent, chip: ConstraintChip): ParsedIntent {
  const drop = (list: string[], value: string) =>
    list.filter((v) => v.toLowerCase() !== value.toLowerCase());
  const next: ParsedIntent = { ...intent };
  switch (chip.kind) {
    case 'brand':
      next.brands = drop(intent.brands, chip.value);
      break;
    case 'category':
      next.categorySlugs = drop(intent.categorySlugs, chip.value);
      break;
    case 'item':
      next.itemTerms = drop(intent.itemTerms, chip.value);
      break;
    case 'size':
      next.sizes = drop(intent.sizes, chip.value);
      break;
    case 'condition':
      next.conditions = intent.conditions.filter(
        (c) => c.toLowerCase() !== chip.value.toLowerCase(),
      );
      break;
    case 'price':
      next.priceMin = null;
      next.priceMax = null;
      break;
    case 'colour':
      next.colours = drop(intent.colours, chip.value);
      break;
    case 'style':
      next.styles = drop(intent.styles, chip.value);
      break;
    case 'sustainable':
      next.sustainable = false;
      break;
    case 'keyword':
      next.keywords = drop(intent.keywords, chip.value);
      break;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Matching — deterministic filter of the fixture catalogue
// ---------------------------------------------------------------------------

function searchableText(l: Listing): string {
  return normalize(`${l.title} ${l.brand ?? ''} ${l.category} ${l.subcategory ?? ''} ${l.description}`);
}

/** Term match — category/subcategory/title with plural tolerance, mirroring
 *  the visual engine's categoryMatches. */
function itemTermMatches(l: Listing, matchValues: string[]): boolean {
  const hay = normalize(`${l.category} ${l.subcategory ?? ''} ${l.title}`);
  return matchValues.some((v) => {
    if (hay.includes(v)) return true;
    if (!v.endsWith('s') && hay.includes(`${v}s`)) return true;
    return false;
  });
}

function styleMatches(l: Listing, style: string): boolean {
  const s = style.toLowerCase();
  return searchableText(l).includes(s);
}

/**
 * Filter LISTINGS by the parsed intent. Field semantics:
 *  - brands / slugs / itemTerms / conditions / price / sizes: hard filters
 *    (sizes are OR'd — "size 7 or 9" reads naturally in a thread)
 *  - colours: hard only when the listing names a colour — listings that name
 *    none can't be disproved (same rule as visual search)
 *  - styles / sustainable / residual keywords: text + grade filters
 *  Results rank by likes — deterministic popularity order.
 */
export function matchIntent(intent: ParsedIntent): Listing[] {
  const out = LISTINGS.filter((l) => {
    if (
      intent.categorySlugs.length > 0 &&
      !intent.categorySlugs.includes(l.category.toLowerCase())
    ) {
      return false;
    }
    if (
      intent.brands.length > 0 &&
      !(l.brand && intent.brands.some((b) => l.brand!.toLowerCase() === b.toLowerCase()))
    ) {
      return false;
    }
    if (intent.itemTerms.length > 0) {
      const termDefs = intent.itemTerms.map((label) =>
        ITEM_TERMS.find((t) => t.label === label),
      );
      if (!termDefs.every((def) => def && itemTermMatches(l, def.match))) return false;
    }
    if (intent.conditions.length > 0 && !intent.conditions.includes(l.condition)) {
      return false;
    }
    if (intent.priceMin != null && l.price < intent.priceMin) return false;
    if (intent.priceMax != null && l.price > intent.priceMax) return false;
    if (
      intent.sizes.length > 0 &&
      !(l.size && intent.sizes.some((s) => l.size!.toLowerCase().includes(s.toLowerCase())))
    ) {
      return false;
    }
    if (intent.sustainable && !(l.sustainabilityGrade === 'A' || l.sustainabilityGrade === 'B')) {
      return false;
    }
    if (intent.styles.length > 0 && !intent.styles.every((s) => styleMatches(l, s))) {
      return false;
    }
    if (intent.colours.length > 0) {
      const named = LISTING_COLOURS.get(l.id) ?? [];
      if (named.length > 0 && !intent.colours.some((c) => named.includes(c))) return false;
    }
    if (intent.keywords.length > 0) {
      const hay = searchableText(l);
      if (!intent.keywords.every((k) => hay.includes(k))) return false;
    }
    return true;
  });

  return out.sort((a, b) => b.likes - a.likes);
}

// ---------------------------------------------------------------------------
// URL hand-off — same contract SearchClient.filtersFromParams parses:
//   ?q= &category= &condition=a|b &size= &brand= &min= &max=
// q carries the freest term so the surface's own text filter keeps the set.
// ---------------------------------------------------------------------------

export function searchHref(
  intent: ParsedIntent,
  results: Listing[],
  rawQuery: string,
): string {
  const params = new URLSearchParams();
  const slug = intent.categorySlugs[0];
  const q =
    intent.itemTerms[0]?.toLowerCase() ||
    intent.keywords.join(' ') ||
    slug ||
    intent.brands[0]?.toLowerCase() ||
    modalCategory(results) ||
    normalize(rawQuery) ||
    'browse';
  params.set('q', q);
  if (slug) params.set('category', slug);
  if (intent.brands[0]) params.set('brand', intent.brands[0]);
  if (intent.sizes[0]) params.set('size', intent.sizes[0].toUpperCase());
  if (intent.conditions.length > 0) params.set('condition', intent.conditions.join('|'));
  if (intent.priceMin != null) params.set('min', String(intent.priceMin));
  if (intent.priceMax != null) params.set('max', String(intent.priceMax));
  return `/search?${params.toString()}`;
}

/** Facet-only queries still need a q so /search renders the surface —
 *  the modal category of the matched set is the honest label for it. */
function modalCategory(results: Listing[]): string | null {
  const counts = new Map<string, number>();
  for (const l of results) counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Seed — rebuild an intent from the /search facet params so "Refine in chat"
// carries the user's live filters into the thread.
// ---------------------------------------------------------------------------

export function intentFromParams(
  params: Pick<URLSearchParams, 'get'>,
): { intent: ParsedIntent | null; queryText: string } {
  const q = (params.get('q') ?? '').trim();
  const intent = q ? parseIntent(q) : newIntent();

  const category = params.get('category');
  if (category && !intent.categorySlugs.includes(category)) {
    intent.categorySlugs.push(category);
  }
  const brand = params.get('brand');
  if (brand) {
    const canonical =
      BRAND_ALIASES.find(([, c]) => c.toLowerCase() === brand.toLowerCase())?.[1] ?? brand;
    if (!intent.brands.includes(canonical)) intent.brands.push(canonical);
  }
  const size = params.get('size');
  if (size && !intent.sizes.some((s) => s.toLowerCase() === size.toLowerCase())) {
    intent.sizes.push(size);
  }
  const rawConditions = params.get('condition');
  for (const c of rawConditions?.split('|') ?? []) {
    if ((CONDITION_OPTIONS as string[]).includes(c)) {
      const cond = c as ListingCondition;
      if (!intent.conditions.includes(cond)) intent.conditions.push(cond);
    }
  }
  const min = params.get('min');
  const max = params.get('max');
  if (min != null && !Number.isNaN(Number(min))) intent.priceMin = Number(min);
  if (max != null && !Number.isNaN(Number(max))) intent.priceMax = Number(max);

  return { intent: constraintCount(intent) > 0 || q ? intent : null, queryText: q };
}

// ---------------------------------------------------------------------------
// Turn content — honest reply copy, refinement prompts, starter queries
// ---------------------------------------------------------------------------

/** Starter prompts — natural-language forms of the trending terms; every
 *  one is verified to match the fixture catalogue. */
export const STARTER_PROMPTS: string[] = [
  "Vintage Levi's jeans under £50",
  'Adidas Samba size 7',
  'Black cat-eye sunglasses',
  'Wool coat in camel',
  'Carhartt trousers under £50',
  'Mohair cardigan',
];

/** The one-line assistant reply. Numbers and words only — the chips and the
 *  results rail carry the meaning. */
export function replyFor(intent: ParsedIntent, total: number): string {
  if (constraintCount(intent) === 0) {
    return "Didn't catch a constraint in that — try a brand, category, or a price like “denim jacket under £40”.";
  }
  if (total === 0) {
    return 'No listings match that combination — remove a chip or loosen the range.';
  }
  return `${total} listing${total === 1 ? '' : 's'} match${total === 1 ? 'es' : ''} what I caught.`;
}

/** Follow-up prompts — mobile buildRefinementSuggestions() logic, with the
 *  size suggestion grounded in the current result set. */
export function refinementsFor(intent: ParsedIntent, results: Listing[]): string[] {
  const out: string[] = [];
  if (intent.priceMax == null) {
    out.push('under £30', 'under £50');
  } else {
    out.push('over £100');
  }
  if (!intent.sustainable) out.push('sustainable only');
  if (intent.itemTerms.length > 0 && intent.colours.length === 0) out.push('in black');
  const wantsSize =
    intent.sizes.length === 0 &&
    (intent.categorySlugs.includes('sneakers') ||
      intent.itemTerms.some((t) => t === 'Boots'));
  if (wantsSize) {
    const modalSize = modalShoeSize(results);
    out.push(`size ${modalSize ?? '9'}`);
  }
  return out.slice(0, 4);
}

/** Most common whole-digit size in the result set — the honest "size N"
 *  suggestion for footwear turns. */
function modalShoeSize(results: Listing[]): string | null {
  const counts = new Map<string, number>();
  for (const l of results) {
    const digits = (l.size ?? '').match(/\d{1,2}/)?.[0];
    if (digits) counts.set(digits, (counts.get(digits) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}
