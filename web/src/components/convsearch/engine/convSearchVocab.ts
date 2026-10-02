import type { ListingCondition } from '@/lib/contracts/domain';
import { LISTINGS } from '@/lib/data/fixtures';
import { COLOR_VOCAB } from '@/components/visualsearch/visualSearchTypes';

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Lowercase, strip diacritics (hermès→hermes), collapse whitespace. */
export function normalize(text: string): string {
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
export function includesWord(text: string, phrase: string): boolean {
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
export function blank(scratch: string, start: number, length: number): string {
  return scratch.slice(0, start) + ' '.repeat(length) + scratch.slice(start + length);
}

/** Find + blank every bounded occurrence of `phrase` in `scratch`. */
export function consume(scratch: string, phrase: string): { scratch: string; found: boolean } {
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

export function dedupe<T extends string>(values: T[]): T[] {
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
// Dictionaries — every entry names something in the real fixture taxonomy
// ---------------------------------------------------------------------------

/** [alias → canonical fixture brand]. Aliases are matched on word boundaries
 *  against the normalized query, longest first. */
export const BRAND_ALIASES = ([
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
export const CATEGORY_SLUG_WORDS = ([
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
export const ITEM_TERMS: { keys: string[]; label: string; match: string[] }[] = [
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
export const STYLE_WORDS = [
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

export const SUSTAINABLE_WORDS = [
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
export const CONDITION_PHRASES = ([
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
export const STOPWORDS = new Set([
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

export const LISTING_COLOURS: Map<string, string[]> = (() => {
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

export const API_CATEGORY_SLUGS = new Set(['women', 'men', 'sneakers', 'bags', 'accessories']);
