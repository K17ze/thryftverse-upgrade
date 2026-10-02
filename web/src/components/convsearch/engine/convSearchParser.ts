import type { ListingCondition } from '@/lib/contracts/domain';
import { CONDITION_OPTIONS } from '@/components/filters/filterTypes';
import { COLOR_VOCAB } from '@/components/visualsearch/visualSearchTypes';
import { type ApiParsedFilters, type ParsedIntent, newIntent } from './convSearchTypes';
import {
  API_CATEGORY_SLUGS,
  BRAND_ALIASES,
  CATEGORY_SLUG_WORDS,
  CONDITION_PHRASES,
  ITEM_TERMS,
  STOPWORDS,
  STYLE_WORDS,
  SUSTAINABLE_WORDS,
  blank,
  consume,
  dedupe,
  normalize,
} from './convSearchVocab';

/**
 * Backend parsedFilters → ParsedIntent. Wire `categories` are item-level
 * keywords (denim, sneakers…): a value matching a real department slug
 * scopes the search, anything else lands on itemTerms. Conditions keep
 * only values in the real condition vocabulary; colours resolve to their
 * canonical COLOR_VOCAB names (a name the facet system doesn't know is
 * kept as written — it narrows nothing but still shows what was caught).
 */
export function intentFromApiFilters(raw: ApiParsedFilters): ParsedIntent {
  const intent = newIntent();
  const pushUnique = (list: string[], value: string) => {
    const v = value.trim();
    if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
  };
  for (const b of raw.brands ?? []) pushUnique(intent.brands, b);
  for (const c of raw.categories ?? []) {
    const norm = normalize(c);
    if (!norm) continue;
    if (API_CATEGORY_SLUGS.has(norm)) {
      if (!intent.categorySlugs.includes(norm)) intent.categorySlugs.push(norm);
    } else {
      pushUnique(intent.itemTerms, c);
    }
  }
  for (const s of raw.sizes ?? []) pushUnique(intent.sizes, s);
  for (const c of raw.conditions ?? []) {
    if ((CONDITION_OPTIONS as string[]).includes(c)) {
      const cond = c as ListingCondition;
      if (!intent.conditions.includes(cond)) intent.conditions.push(cond);
    }
  }
  if (raw.priceRange) {
    if (typeof raw.priceRange.min === 'number') intent.priceMin = raw.priceRange.min;
    if (typeof raw.priceRange.max === 'number') intent.priceMax = raw.priceRange.max;
  }
  for (const c of raw.colors ?? []) {
    const norm = normalize(c);
    if (!norm) continue;
    const canonical =
      COLOR_VOCAB.find(
        (v) => v.name.toLowerCase() === norm || v.aliases.includes(norm),
      )?.name ?? c.trim();
    pushUnique(intent.colours, canonical);
  }
  for (const s of raw.styles ?? []) pushUnique(intent.styles, s);
  intent.sustainable = raw.sustainableOnly === true;
  return intent;
}

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
